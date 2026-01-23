import admin from 'firebase-admin';

export async function sendNotificationToUser(userId: string, notification: any) {
  const db = admin.firestore();
  const notifRef = db.collection('notificaciones').doc(userId);
  await notifRef.set({
    notificaciones: admin.firestore.FieldValue.arrayUnion(notification)
  }, { merge: true });
}

export async function getUserNotifications(userId: string) {
  const db = admin.firestore();
  const notifRef = db.collection('notificaciones').doc(userId);
  const doc = await notifRef.get();
  return doc.exists ? doc.data()?.notificaciones || [] : [];
}

export async function sendNotificationToAdmins(notification: any) {
  const db = admin.firestore();
  const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
  for (const adminDoc of adminsSnap.docs) {
    await sendNotificationToUser(adminDoc.id, notification);
  }
}
