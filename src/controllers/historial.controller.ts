import { Request, Response } from 'express';
import { db } from '../config/firebase';

// POST /api/admin/historial-solicitudes
export const registrarHistorialSolicitud = async (req: Request, res: Response) => {
  try {
    const { uid_usuario, nombre_usuario, accion, admin_uid, admin_nombre, mensaje } = req.body;
    if (!uid_usuario || !accion || !admin_uid || !admin_nombre) {
      return res.status(400).json({ msg: 'Faltan campos obligatorios.' });
    }
    const fecha = new Date().toISOString();
    const doc = await db.collection('historial_solicitudes').add({
      uid_usuario,
      nombre_usuario,
      accion,
      admin_uid,
      admin_nombre,
      fecha,
      mensaje: mensaje || ''
    });
    res.status(201).json({ success: true, id: doc.id });
  } catch (err) {
    res.status(500).json({ msg: 'Error al guardar historial', error: err });
  }
};

// GET /api/admin/historial-solicitudes
export const obtenerHistorialSolicitudes = async (req: Request, res: Response) => {
  try {
    const snap = await db.collection('historial_solicitudes').orderBy('fecha', 'desc').limit(100).get();
    const historial = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, historial });
  } catch (err) {
    res.status(500).json({ msg: 'Error al consultar historial', error: err });
  }
};
