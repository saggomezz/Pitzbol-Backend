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

export const obtenerNotas = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const userRef = await getUserDocRef(uid);
    if (!userRef) return res.status(404).json({ error: 'Usuario no encontrado' });

    const snap = await userRef.collection('notas').orderBy('fecha').get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener notas' });
  }
};

export const guardarItinerario = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const { fecha, meta, stops } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Falta la fecha' });

    const userRef = await getUserDocRef(uid);
    if (!userRef) return res.status(404).json({ error: 'Usuario no encontrado' });

    const data = { fecha, meta, stops: stops || [], creadoEn: new Date().toISOString() };
    const ref = await userRef.collection('itinerarios').add(data);
    res.json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar itinerario' });
  }
};

export const guardarNota = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const { fecha, texto } = req.body;
    if (!fecha || !texto) return res.status(400).json({ error: 'Faltan campos requeridos' });

    const userRef = await getUserDocRef(uid);
    if (!userRef) return res.status(404).json({ error: 'Usuario no encontrado' });

    const data = { fecha, texto, creadoEn: new Date().toISOString() };
    const ref = await userRef.collection('notas').add(data);
    res.json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar nota' });
  }
};

export const eliminarItinerario = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const userRef = await getUserDocRef(uid);
    if (!userRef) return res.status(404).json({ error: 'Usuario no encontrado' });

    await userRef.collection('itinerarios').doc(req.params.docId).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar itinerario' });
  }
};

export const eliminarNota = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const userRef = await getUserDocRef(uid);
    if (!userRef) return res.status(404).json({ error: 'Usuario no encontrado' });

    await userRef.collection('notas').doc(req.params.docId).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar nota' });
  }
};
