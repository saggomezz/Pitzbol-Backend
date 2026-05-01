import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID!,
      clientEmail: FIREBASE_CLIENT_EMAIL!,
      privateKey: FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });
}

const EMAIL = 'cua@hotmail.com';

async function setAdminRole() {
  const db = admin.firestore();
  const auth = admin.auth();

  const user = await auth.getUserByEmail(EMAIL);
  console.log(`Usuario encontrado: ${user.uid}`);

  await auth.setCustomUserClaims(user.uid, { role: 'admin' });
  console.log('Custom claims actualizados: role = admin');

  await db.collection('usuarios').doc('admins').collection('lista').doc(user.uid).set({
    uid: user.uid,
    email: EMAIL,
    role: 'admin',
    actualizadoEn: new Date().toISOString(),
  }, { merge: true });

  console.log('Firestore actualizado. Listo.');
  process.exit(0);
}

setAdminRole().catch(err => {
  console.error(err);
  process.exit(1);
});
