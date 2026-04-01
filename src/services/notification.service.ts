import admin from 'firebase-admin';
import { emitNotificationToUser } from '../socket';

export async function sendNotificationToUser(userId: string, notification: any) {
  const db = admin.firestore();
  const normalized = {
    ...notification,
    fecha: notification?.fecha || new Date().toISOString(),
    leido: notification?.leido ?? false
  };
  const docRef = await db
    .collection('usuarios')
    .doc('notificaciones')
    .collection(userId)
    .add(normalized);
  try {
    emitNotificationToUser(userId, { id: docRef.id, ...normalized });
  } catch (err) {
    // emit errors are non-fatal; client will fetch updated notifications from backend
  }
}

export async function getUserNotifications(userId: string) {
  const db = admin.firestore();
  const snapshot = await db
    .collection('usuarios')
    .doc('notificaciones')
    .collection(userId)
    .orderBy('fecha', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function sendNotificationToAdmins(notification: any) {
  const db = admin.firestore();
  const adminsSnap = await db
    .collection('usuarios')
    .doc('admins')
    .collection('lista')
    .get();

  for (const adminDoc of adminsSnap.docs) {
    const adminUid = adminDoc.data().uid || adminDoc.id;
    if (adminUid) {
      await sendNotificationToUser(adminUid, notification);
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
      case 'negocio_eliminado':
        newMessage = `Tu negocio "${newName}" ha sido eliminado por el administrador.${data?.archivedReason || ''}`;
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
      }
    } catch (err) {
      console.error('[updateBusinessNameInNotifications] Error updating notif', err);
    }
  };

  // Update owner notifications (if provided)
  if (ownerUid) {
    try {
      const ownerCol = db.collection('usuarios').doc('notificaciones').collection(ownerUid);

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

  // Update admins notifications (iterate admins list)
  try {
    const adminsSnap = await db.collection('usuarios').doc('admins').collection('lista').get();
    for (const adminDoc of adminsSnap.docs) {
      const adminUid = adminDoc.data().uid || adminDoc.id;
      if (!adminUid) continue;
      const adminCol = db.collection('usuarios').doc('notificaciones').collection(adminUid);

      const byId = await adminCol.where('negocioId', '==', negocioId).get();
      for (const d of byId.docs) await updateForDoc(adminUid, d.ref, d.data());

      const adminEnlace = `/admin/negocios/${negocioId}`;
      const snapEnlace = await adminCol.where('enlace', '==', adminEnlace).get();
      for (const d of snapEnlace.docs) await updateForDoc(adminUid, d.ref, d.data());

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
                await updateForDoc(adminUid, d.ref, data);
                break;
              }
            }
          }
        } catch (scanErr) {
          console.error('[updateBusinessNameInNotifications] Error scanning admin notifications for previous names', scanErr);
        }
      }
    }
  } catch (err) {
    console.error('[updateBusinessNameInNotifications] Error updating admin notifications', err);
  }
}