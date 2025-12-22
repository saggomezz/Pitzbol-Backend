// src/config/firebase.ts
import * as admin from 'firebase-admin';
import * as path from 'path';

// Opción A: Usando require si tienes el JSON (tienes que habilitar "resolveJsonModule": true en tsconfig)
const serviceAccount = require('../../serviceAccountKey.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export const db = admin.firestore();
export const auth = admin.auth();
console.log("Firebase Admin conectado");