import { Request, Response } from 'express';
import { db, auth } from '../config/firebase';

export const registerGuide = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        // 1. Extraemos con valores por defecto inmediatos para evitar el "undefined"
        const { uid, nombre, apellido, email } = data;

        if (!uid) return res.status(400).json({ message: 'El UID es obligatorio.' });

        // 2. Normalización del ID (minúsculas y guiones bajos)
        const safeApellido = apellido ? `_${apellido}` : "";
        const customId = `${nombre}${safeApellido}`.replace(/\s+/g, '_').toLowerCase();

        // 3. Construcción del objeto "Limpio"
        // Usamos el operador ?? (nullish coalescing) para que si es undefined, use ""
        const datosSeguros = {
            "01_nombre": nombre ?? "",
            "02_apellido": apellido ?? "",
            "03_rol": "guia_pendiente",
            "04_correo": email ?? data.correo ?? "",
            "05_rfc": data.rfc ?? "",
            "06_telefono": data.telefono ?? "",
            "07_especialidades": data.categorias ?? [], 
            "10_cp": data.codigoPostal ?? "",
            "11_foto_frente": data.ineFrente ?? "",
            "12_foto_reverso": data.ineReverso ?? "",
            // Blindaje total para el campo del error
            "13_foto_rostro": data.facePhoto ?? data.fotoRostro ?? "",
            "tarifa_mxn": data.precioMXN ?? 0,
            "validacion_biometrica": {
                coincide: data.validacion_biometrica?.coincide ?? false,
                porcentaje: data.validacion_biometrica?.porcentaje ?? 0,
                mensaje: data.validacion_biometrica?.mensaje ?? "No validado"
            },
            status: "en_revision",
            uid: uid, 
            createdAt: new Date().toISOString()
        };

        // 4. Guardar en carpeta de PENDIENTES
        await db.collection('usuarios')
            .doc('guias')
            .collection('pendientes')
            .doc(customId)
            .set(datosSeguros);

        // 5. Borrar de la carpeta de TURISTAS
        await db.collection("usuarios")
            .doc("turistas")
            .collection("lista")
            .doc(customId)
            .delete();

        res.status(201).json({ 
            message: 'Solicitud enviada a revisión con éxito', 
            status: "pendiente"
        });

    } catch (error: any) {
        console.error("Error detallado en registerGuide:", error);
        res.status(500).json({ 
            message: 'Error interno al procesar la solicitud', 
            error: error.message 
        });
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

export const updateGuideProfile = async (req: Request, res: Response) => {
    try {
        const { uid, categorias } = req.body;
        if (!uid) return res.status(400).json({ message: "UID obligatorio" });

        const paths = [
            db.collection('usuarios').doc('guias').collection('lista'),
            db.collection('usuarios').doc('guias').collection('pendientes'),
            db.collection('usuarios').doc('turistas').collection('lista')
        ];

        for (const ref of paths) {
            const snap = await ref.where('uid', '==', uid).limit(1).get();
            if (!snap.empty) {
                const doc = snap.docs[0];
                if (doc) {
                    await doc.ref.update({
                        "07_especialidades": categorias, // UNIFICADO: Solo este campo
                        "updatedAt": new Date().toISOString()
                    });
                    return res.status(200).json({ message: "Sincronizado" });
                }
            }
        }
        res.status(404).json({ message: "No encontrado" });
    } catch (error: any) {
        res.status(500).json({ message: "Error interno" });
    }
};