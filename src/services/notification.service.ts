import admin from 'firebase-admin';

export async function sendNotificationToUser(userId: string, notification: any) {
  const db = admin.firestore();
  console.log(`[NotificationService] Enviando notificaci\u00f3n a usuario ${userId}`);
  console.log(`[NotificationService] Contenido:`, JSON.stringify(notification, null, 2));
  
  const normalized = {
    ...notification,
    fecha: notification?.fecha || new Date().toISOString(),
    leido: notification?.leido ?? false
  };

  console.log(`[NotificationService] Datos normalizados:`, JSON.stringify(normalized, null, 2));

  const docRef = await db
    .collection('usuarios')
    .doc('notificaciones')
    .collection(userId)
    .add(normalized);

  console.log(`[NotificationService] \u2705 Notificaci\u00f3n guardada con ID: ${docRef.id}`);
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
