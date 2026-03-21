import { Request, Response } from 'express';
import { db } from '../config/firebase';

interface AuthRequest extends Request {
  user?: { uid: string; email: string };
}

const getUserDocRef = async (uid: string) => {
  const categorias = ['turistas', 'guias', 'admins', 'negocios'];
  for (const cat of categorias) {
    const snap = await db.collection('usuarios').doc(cat).collection('lista')
      .where('uid', '==', uid).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref;
  }
  return null;
};

export const obtenerItinerarios = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const userRef = await getUserDocRef(uid);
    if (!userRef) return res.status(404).json({ error: 'Usuario no encontrado' });

    const snap = await userRef.collection('itinerarios').orderBy('fecha').get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener itinerarios' });
  }
};

export const guardarEntrada = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const { tipo, fecha, meta, stops, texto } = req.body;
    if (!tipo || !fecha) return res.status(400).json({ error: 'Faltan campos requeridos' });

    const userRef = await getUserDocRef(uid);
    if (!userRef) return res.status(404).json({ error: 'Usuario no encontrado' });

    const data: any = { tipo, fecha, creadoEn: new Date().toISOString() };
    if (tipo === 'itinerario') { data.meta = meta; data.stops = stops || []; }
    if (tipo === 'nota') { data.texto = texto; }

    const ref = await userRef.collection('itinerarios').add(data);
    res.json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar' });
  }
};

export const eliminarEntrada = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const { docId } = req.params;
    const userRef = await getUserDocRef(uid);
    if (!userRef) return res.status(404).json({ error: 'Usuario no encontrado' });

    await userRef.collection('itinerarios').doc(docId).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
};
