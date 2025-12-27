import { Request, Response } from 'express';
import { db } from '../config/firebase';

export const registerGuide = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        
        // Creamos un ID legible: "Nombre_Apellido"
        const customId = `${data.nombre}_${data.apellido}`.replace(/\s+/g, '_');

        // Organizamos por: usuarios (colección) -> guias (documento) -> lista (sub-colección)
        const docRef = db.collection('usuarios')
                         .doc('guias')
                         .collection('lista')
                         .doc(customId); // Aquí el ID será el nombre

        await docRef.set({
            // Usamos prefijos numéricos si quieres forzar orden visual en la consola
            "01_nombre": data.nombre,
            "02_apellido": data.apellido,
            "03_rol": "guia",
            "04_correo": data.correo,
            "05_rfc": data.rfc,
            "06_telefono": data.telefono,
            "07_categorias": data.categorias,
            "08_propuesta": data.propuestaTour,
            "09_clabe": data.clabe,
            "10_cp": data.codigoPostal,
            createdAt: new Date().toISOString()
        });

        console.log(`✅ Guía registrado: ${customId}`);
        res.status(201).json({ message: 'Registro exitoso', id: customId });
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ message: 'Error al registrar', error });
    }
};