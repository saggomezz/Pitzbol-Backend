import { Request, Response } from 'express';
import { db } from '../config/firebase';

interface AuthRequest extends Request {
  user?: { uid: string; email: string };
}

export const obtenerItinerarios = async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const snap = await db.collection('turistas').doc(uid).collection('itinerarios').orderBy('fecha').get();
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

    const data: any = { tipo, fecha, creadoEn: new Date().toISOString() };
    if (tipo === 'itinerario') { data.meta = meta; data.stops = stops || []; }
    if (tipo === 'nota') { data.texto = texto; }

    const ref = await db.collection('turistas').doc(uid).collection('itinerarios').add(data);
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
    await db.collection('turistas').doc(uid).collection('itinerarios').doc(docId).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
};
