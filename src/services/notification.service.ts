import admin from 'firebase-admin';
import { emitNotificationToUser } from '../socket';

type CachedNotificationEntry = {
  expiresAt: number;
  data: any[];
  inFlight?: Promise<any[]>;
};

const NOTIFICATION_CACHE_TTL_MS = 15000;
/**
 * How long to serve stale/empty data after a Firestore failure before retrying.
 * Prevents hammering an unreachable Firestore on every polling request.
 */
const NOTIFICATION_ERROR_COOLDOWN_MS = 12000;
/**
 * Hard timeout for Firestore queries. gRPC connections to a firewalled host can
 * hang silently for 30-60 s before failing, which causes the Express response to
 * arrive AFTER the Next.js proxy has already given up and returned a 500 to the
 * browser. Failing fast (< 8 s) ensures the handler always responds in time.
 */
const FIRESTORE_QUERY_TIMEOUT_MS = 8000;

const withQueryTimeout = <T>(promise: Promise<T>): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('Firestore query timed out — host unreachable or firewalled')),
      FIRESTORE_QUERY_TIMEOUT_MS,
    ),
  );
  return Promise.race([promise, timeout]);
};
const notificationCache = new Map<string, CachedNotificationEntry>();

const getCacheKey = (bucketId: string) => bucketId.trim();

export const invalidateNotificationCache = (bucketId: string) => {
  const key = getCacheKey(bucketId);
  if (!key) return;
  notificationCache.delete(key);
};

const getNotificationsRoot = (db: FirebaseFirestore.Firestore) =>
  db.collection('usuarios').doc('notificaciones');

const getNotifItemsCol = (db: FirebaseFirestore.Firestore, bucketId: string) =>
  getNotificationsRoot(db).collection(bucketId);

const getLegacyNotifCol = (db: FirebaseFirestore.Firestore, bucketId: string) =>
  getNotificationsRoot(db).collection(bucketId);

const getLegacyNestedNotifCol = (db: FirebaseFirestore.Firestore, bucketId: string) =>
  getNotificationsRoot(db).collection(bucketId).doc('items').collection('items');

const getNotificationCollections = (db: FirebaseFirestore.Firestore, bucketId: string) => {
  const refs = [
    getNotifItemsCol(db, bucketId),
    getLegacyNotifCol(db, bucketId),
    getLegacyNestedNotifCol(db, bucketId),
  ];

  const deduped = new Map<string, FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>>();
  refs.forEach((ref) => deduped.set(ref.path, ref));
  return Array.from(deduped.values());
};

export async function sendNotificationToUser(userId: string, notification: any) {
  const db = admin.firestore();
  const targetBucket = (userId || '').trim();
  if (!targetBucket) return;

  const normalized = {
    ...notification,
    fecha: notification?.fecha || new Date().toISOString(),
    leido: notification?.leido ?? false
  };

  const dedupeKey =
    (typeof notification?.dedupeKey === 'string' && notification.dedupeKey.trim())
      ? notification.dedupeKey.trim()
      : null;

  const payload = dedupeKey ? { ...normalized, dedupeKey } : { ...normalized };

  const col = getNotifItemsCol(db, targetBucket);
  let docRef = col.doc();
  if (dedupeKey) {
    const existing = await col.where('dedupeKey', '==', dedupeKey).limit(1).get();
    const firstExisting = existing.docs[0];
    if (firstExisting) {
      docRef = firstExisting.ref;
    }
  }

  await docRef.set(payload, { merge: true });
  invalidateNotificationCache(targetBucket);

  try {
    emitNotificationToUser(targetBucket, { id: docRef.id, ...payload });
  } catch (err) {
    // emit errors are non-fatal; client will fetch updated notifications from backend
  }
}

export async function getUserNotifications(userId: string) {
  const db = admin.firestore();
  const targetBucket = (userId || '').trim();
  if (!targetBucket) return [];

  const cacheKey = getCacheKey(targetBucket);
  const cached = notificationCache.get(cacheKey);
  const now = Date.now();

  if (cached?.data && cached.expiresAt > now) {
    return [...cached.data];
  }

  if (cached?.inFlight) {
    return cached.inFlight.then((data) => [...data]);
  }

  const inFlight = (async () => {
    try {
      const collections = getNotificationCollections(db, targetBucket);
      // withQueryTimeout ensures we fail fast (< 8 s) when Firestore is
      // unreachable, so the Express response always arrives before the
      // Next.js proxy timeout (which would otherwise return a 500 to the browser).
      const snapshots = await withQueryTimeout(
        Promise.all(collections.map((col) => col.orderBy('fecha', 'desc').limit(50).get()))
      );

      const merged = snapshots.flatMap((snap) =>
        snap.docs
          .filter((doc) => doc.id !== 'items')
          .map((doc) => ({ id: doc.id, ...doc.data() }))
      );

      const seen = new Set<string>();
      const result = merged
        .filter((item: any) => {
          const key = `${item?.id || ''}|${item?.tipo || ''}|${item?.negocioId || ''}|${item?.fecha || ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a: any, b: any) => new Date(b?.fecha || 0).getTime() - new Date(a?.fecha || 0).getTime())
        .slice(0, 50);

      notificationCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + NOTIFICATION_CACHE_TTL_MS,
      });

      return result;
    } catch (err) {
      // Keep a short-lived cache entry with empty data so the next request
      // (e.g. the 10 s frontend polling interval) doesn't immediately retry
      // and hang again — it will serve [] until the cooldown expires.
      notificationCache.set(cacheKey, {
        data: cached?.data || [],
        expiresAt: Date.now() + NOTIFICATION_ERROR_COOLDOWN_MS,
      });
      throw err;
    }
  })();

  notificationCache.set(cacheKey, {
    data: cached?.data || [],
    expiresAt: cached?.expiresAt || 0,
    inFlight,
  });

  return inFlight;
}

export async function sendNotificationToAdmins(notification: any) {
  const db = admin.firestore();

  // Persistir en un bucket único de admin para evitar notificaciones duplicadas por cada admin
  const dedupeSuffix = notification?.negocioId || notification?.solicitudId || notification?.uidSolicitante || Date.now();
  const dedupeKey = `${notification?.tipo || 'admin'}_${dedupeSuffix}`;
  await sendNotificationToUser('admin', { ...notification, dedupeKey });

  // Emitir por socket a admins reales conectados (sin persistir por admin UID)
  const adminsSnap = await db.collection('usuarios').doc('admins').collection('lista').get();
  for (const adminDoc of adminsSnap.docs) {
    const adminUid = (adminDoc.data().uid || adminDoc.id || '').toString().trim();
    if (!adminUid) continue;
    // Ignorar placeholders de testing
    if (/^testadminuid$/i.test(adminUid) || /test/i.test(adminUid)) continue;
    try {
      emitNotificationToUser(adminUid, {
        ...notification,
        fecha: notification?.fecha || new Date().toISOString(),
        leido: notification?.leido ?? false,
      });
    } catch (_) {
      // non-fatal
    }
  }
}

export async function updateBusinessNameInNotifications(negocioId: string, newName: string, ownerUid?: string, previousNames?: string[]) {
  const db = admin.firestore();
  // Update stored notification messages that reference a business name and emit updates
  const updateForDoc = async (userId: string, docRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>, data: any) => {
    const tipo = data?.tipo || '';
    let newMessage = data?.mensaje || '';

    const motivoMsg = data?.rejectionReason ? ` Motivo compartido por el equipo: ${data.rejectionReason}` : '';

    switch (tipo) {
      case 'nueva_solicitud_negocio':
        newMessage = `Se ha recibido una nueva solicitud de negocio: ${newName}`;
        break;
      case 'solicitud_negocio_enviada':
        newMessage = `Tu negocio "${newName}" fue enviado a revision.`;
        break;
      case 'negocio_aprobado':
        newMessage = `Tu negocio "${newName}" ha sido aprobado y ya es visible para los usuarios.`;
        break;
      case 'negocio_rechazado':
      case 'rechazado':
        newMessage = `Gracias por enviar tu solicitud para "${newName}". En esta ocasión no fue aprobada.${motivoMsg} Puedes actualizar la información y volver a intentarlo.`;
        break;
      case 'negocio_pendiente':
        newMessage = `Tu negocio "${newName}" ha sido regresado a revisión por el administrador.`;
        break;
      case 'negocio_archivado':
        newMessage = `Tu negocio "${newName}" ha sido archivado por el administrador.${data?.archivedReason || ''}`;
        break;
      case 'negocio_eliminado':
        newMessage = `Tu negocio "${newName}" ha sido eliminado por el administrador.${data?.reason ? ` Motivo: ${data.reason}` : ''}`;
        break;
      case 'negocio_desarchivado':
        newMessage = `Tu negocio "${newName}" ha sido desarchivado y está en revisión nuevamente.`;
        break;
      case 'negocio_editado':
      case 'editado_admin':
        newMessage = `Tu negocio "${newName}" ha sido editado por el administrador. Revisa los cambios realizados en tu panel.`;
        break;
      default:
        // Try a generic replace if possible
        if (typeof newMessage === 'string' && newMessage.length > 0) {
          // Replace any quoted name or previous occurrences between quotes
          newMessage = newMessage.replace(/".*?"/, `"${newName}"`);
        } else {
          newMessage = newMessage || `Actualización: ${newName}`;
        }
    }

    try {
      await docRef.update({ mensaje: newMessage });
      // Emit updated notif to the user via socket
      try {
        const updatedSnap = await docRef.get();
        const updatedData = updatedSnap.exists ? updatedSnap.data() : { mensaje: newMessage };
        try { emitNotificationToUser(userId, { id: docRef.id, ...updatedData }); } catch (_) { /* ignore */ }
      } catch (emitErr) {
        console.error('[updateBusinessNameInNotifications] Error reading updated notif', emitErr);
      }
    } catch (err) {
      console.error('[updateBusinessNameInNotifications] Error updating notif', err);
    }
  };

  // Update owner notifications (if provided)
  if (ownerUid) {
    try {
      const ownerCol = getNotifItemsCol(db, ownerUid);

      // By explicit negocioId field
      const byId = await ownerCol.where('negocioId', '==', negocioId).get();
      for (const d of byId.docs) await updateForDoc(ownerUid, d.ref, d.data());

      // By common enlaces used in code
      const enlaces = [
        `/negocio/mis-solicitudes/${negocioId}`,
        `/negocio/preview?id=${negocioId}`,
        `/negocio/preview`,
        `/negocio/estatus`
      ];
      for (const enlace of enlaces) {
        const snap = await ownerCol.where('enlace', '==', enlace).get();
        for (const d of snap.docs) await updateForDoc(ownerUid, d.ref, d.data());
      }

      // Additionally, if previousNames provided, scan all owner's notifications
      // and update those whose mensaje contains any previous name (case-insensitive)
      if (previousNames && previousNames.length > 0) {
        try {
          const allOwner = await ownerCol.get();
          for (const d of allOwner.docs) {
            const data = d.data();
            const mensaje = (data?.mensaje || '').toString();
            const lowerMensaje = mensaje.toLowerCase();
            const alreadyHasNew = lowerMensaje.includes((newName || '').toLowerCase());
            if (alreadyHasNew) continue;
            for (const prev of previousNames) {
              if (!prev) continue;
              if (lowerMensaje.includes(prev.toLowerCase())) {
                await updateForDoc(ownerUid, d.ref, data);
                break;
              }
            }
          }
        } catch (scanErr) {
          console.error('[updateBusinessNameInNotifications] Error scanning owner notifications for previous names', scanErr);
        }
      }
    } catch (err) {
      console.error('[updateBusinessNameInNotifications] Error updating owner notifications', err);
    }
  }

  // Update admin bucket notifications
  try {
    const adminBucketId = 'admin';
    const adminCol = getNotifItemsCol(db, adminBucketId);

    const byId = await adminCol.where('negocioId', '==', negocioId).get();
    for (const d of byId.docs) await updateForDoc(adminBucketId, d.ref, d.data());

    const adminEnlace = `/admin/negocios/${negocioId}`;
    const snapEnlace = await adminCol.where('enlace', '==', adminEnlace).get();
    for (const d of snapEnlace.docs) await updateForDoc(adminBucketId, d.ref, d.data());

    // Also scan admin notifications for previousNames matches
    if (previousNames && previousNames.length > 0) {
      try {
        const allAdmin = await adminCol.get();
        for (const d of allAdmin.docs) {
          const data = d.data();
          const mensaje = (data?.mensaje || '').toString();
          const lowerMensaje = mensaje.toLowerCase();
          const alreadyHasNew = lowerMensaje.includes((newName || '').toLowerCase());
          if (alreadyHasNew) continue;
          for (const prev of previousNames) {
            if (!prev) continue;
            if (lowerMensaje.includes(prev.toLowerCase())) {
              await updateForDoc(adminBucketId, d.ref, data);
              break;
            }
          }
        }
      } catch (scanErr) {
        console.error('[updateBusinessNameInNotifications] Error scanning admin notifications for previous names', scanErr);
      }
    }
  } catch (err) {
    console.error('[updateBusinessNameInNotifications] Error updating admin notifications', err);
  }
}