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

// NUEVA FUNCIÓN PARA LOS TOURS DEL CATÁLOGO
export const addTourToGuide = async (req: Request, res: Response) => {
    try {
        const { guideId, titulo, duracion, precio, maxPersonas } = req.body;

        // Validación de campos obligatorios en el servidor
        if (!titulo || !duracion || !precio || !maxPersonas) {
            return res.status(400).json({ message: 'Todos los campos son obligatorios' });
        }

        const tourRef = db.collection('usuarios')
                          .doc('guias')
                          .collection('lista')
                          .doc(guideId)
                          .collection('tours_publicados');

        await tourRef.add({
            titulo,
            duracion,
            // Guardamos el precio como número para facilitar cálculos futuros
            precio: parseFloat(precio.replace(/[^0-9.]/g, '')), 
            maxPersonas: parseInt(maxPersonas),
            createdAt: new Date().toISOString()
        });

        res.status(201).json({ message: 'Tour añadido al catálogo' });
    } catch (error) {
        res.status(500).json({ message: 'Error al guardar tour', error });
    }
};