// src/controllers/guide.controller.ts
import { Request, Response } from 'express';
import { db } from '../config/firebase';

export const registerGuide = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        const customId = `${data.nombre}_${data.apellido}`.replace(/\s+/g, '_');

        const docRef = db.collection('usuarios')
                         .doc('guias')
                         .collection('lista')
                         .doc(customId);

        await docRef.set({
            "01_nombre": data.nombre,
            "02_apellido": data.apellido,
            "03_rol": "guia",
            "04_correo": data.correo,
            "05_rfc": data.rfc,
            "06_telefono": data.telefono,
            "07_especialidades": data.categorias || [], 
            "08_propuesta": data.propuestaTour,
            "09_clabe": data.clabe,
            "10_cp": data.codigoPostal,
            createdAt: new Date().toISOString()
        });

        res.status(201).json({ message: 'Registro exitoso', id: customId });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar', error });
    }
};

export const addTourToGuide = async (req: Request, res: Response) => {
    try {
        const { guideId, titulo, duracion, precio, maxPersonas } = req.body;

        if (!guideId || !titulo || !duracion || !precio || !maxPersonas) {
            return res.status(400).json({ message: 'Todos los campos son obligatorios' });
        }

        const tourRef = db.collection('usuarios')
                          .doc('guias')
                          .collection('lista')
                          .doc(guideId)
                          .collection('tours_publicados');

        const nuevoTour = {
            titulo,
            duracion: Number(duracion),
            precio: typeof precio === 'string' ? parseFloat(precio.replace(/[^0-9.]/g, '')) : precio,
            maxPersonas: Number(maxPersonas),
            createdAt: new Date().toISOString()
        };

        const docAdded = await tourRef.add(nuevoTour);

        return res.status(201).json({ 
            message: 'Tour publicado con éxito', 
            id: docAdded.id,
            tour: nuevoTour 
        });
    } catch (error) {
        console.error("Error al añadir tour:", error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};