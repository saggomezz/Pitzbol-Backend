require('dotenv').config();
const admin = require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\n/g,'\n')})});
const db = admin.firestore();
const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const h24 = {};
DIAS.forEach(d => { h24[d] = { apertura: '00:00', cierre: '23:59' }; });
const HORARIO_JSON = JSON.stringify(h24);
const LUGARES = ['Casa de Cambio Patria','Centro Cambiario Remus'];
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
async function run(){
  const snap = await db.collection('lugares').get();
  let actualizados = 0;
  for(const doc of snap.docs){
    const nombre = doc.data().nombre || '';
    if(LUGARES.some(l => norm(nombre).includes(norm(l)))){
      await doc.ref.update({ horariosJson: HORARIO_JSON, ultimaActualizacion: new Date().toISOString() });
      console.log('✓ Actualizado:', nombre);
      actualizados++;
    }
  }
  if(actualizados === 0) console.log('⚠ No se encontraron los lugares. Verifica los nombres exactos en Firestore.');
  else console.log(`\nListo: ${actualizados} lugar(es) con horario 24h.`);
  process.exit(0);
}
run().catch(e=>{ console.error(e); process.exit(1); });
