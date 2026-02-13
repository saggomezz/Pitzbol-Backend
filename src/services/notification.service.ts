import admin from 'firebase-admin';

export async function sendNotificationToUser(userId: string, notification: any) {
  const db = admin.firestore();
  const normalized = {
    ...notification,
    fecha: notification?.fecha || new Date().toISOString(),
    leido: notification?.leido ?? false
  };

  await db
    .collection('usuarios')
    .doc('notificaciones')
    .collection(userId)
    .add(normalized);
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
