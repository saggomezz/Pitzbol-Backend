import { Request, Response } from 'express';
import { db } from "../config/firebase";
import admin from "firebase-admin";

const FieldValue = admin.firestore.FieldValue; 

export const registerGuide = async (req: Request, res: Response) => {
    try {
        console.log("📥 Datos recibidos en registerGuide:", JSON.stringify(req.body, null, 2));
        
        const data = req.body;
        const { uid, nombre, apellido, email } = data;

        if (!uid) {
            console.error("❌ Error: UID no proporcionado");
            return res.status(400).json({ message: 'El UID es obligatorio.' });
        }

        const safeApellido = apellido ? `_${apellido}` : "";
        const customId = `${nombre}${safeApellido}`.replace(/\s+/g, '_').toLowerCase();

        console.log("🔑 UID recibido:", uid);
        console.log("📝 Custom ID generado:", customId);
       
        const datosSeguros = {
            "01_nombre": nombre ?? "",
            "02_apellido": apellido ?? "",
            "03_rol": "guia_pendiente",
            "04_correo": email ?? "",
            "05_nacionalidad": data.nacionalidad ?? "",
            "06_telefono": data.telefono ?? "",
            "07_especialidades": data.categorias ?? [], 
            "08_rfc": data.rfc ?? "",
            "10_cp": data.codigoPostal ?? "",
            "11_foto_frente": data.ineFrente ?? "",
            "12_foto_reverso": data.ineReverso ?? "",
            "13_foto_rostro": data.facePhoto ?? "",
            "14_foto_perfil": { url: "", cloudinary_id: "", subida_en: "" },
            "15_descripcion": "",
            "16_status": "en_revision",
            "17_tarifa_mxn": data.precioMXN ?? 0,
            "18_validacion_biometrica": {
                porcentaje: data.validacion_biometrica?.porcentaje ?? 0,
                mensaje: data.validacion_biometrica?.mensaje ?? "No validado"
            },
            uid: uid, 
            createdAt: new Date().toISOString()
        };

        console.log("💾 Guardando en Firebase...");
        
        await db.collection('usuarios')
            .doc('guias')
            .collection('pendientes')
            .doc(customId)
            .set(datosSeguros);

        console.log("✅ Documento guardado en pendientes:", customId);

        // Intentar eliminar de turistas
        try {
            await db.collection("usuarios")
                .doc("turistas")
                .collection("lista")
                .doc(customId)
                .delete();
            console.log("🗑️ Eliminado de turistas:", customId);
        } catch (deleteError) {
            console.log("ℹ️ No se encontró en turistas o ya fue eliminado");
        }

        console.log("✅ Registro de guía completado exitosamente");
        
        res.status(201).json({ 
            message: 'Solicitud enviada a revisión con éxito', 
            status: "pendiente"
        });

    } catch (error: any) {
        console.error("❌ Error detallado en registerGuide:", error);
        console.error("Stack trace:", error.stack);
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
        const uid = req.body.uid as string;
        const categorias = req.body.categorias as string[];

        if (!uid) return res.status(400).json({ message: "UID obligatorio" });

        const config = [
            { ref: db.collection('usuarios').doc('guias').collection('lista'), field: "07_especialidades" },
            { ref: db.collection('usuarios').doc('guias').collection('pendientes'), field: "07_especialidades" },
            { ref: db.collection('usuarios').doc('turistas').collection('lista'), field: "especialidades" }
        ];

        for (const item of config) {
            const snap = await item.ref.where('uid', '==', uid).limit(1).get();
            
            if (!snap.empty) {
                const docSnapshot = snap.docs[0];
                
                if (docSnapshot && docSnapshot.exists) {
                    // Preparamos el objeto de actualización
                    const updateData: { [key: string]: any } = {
                        [item.field]: categorias,
                        "updatedAt": new Date().toISOString()
                    };

                    if (item.field === "07_especialidades") {
                        updateData["especialidades"] = admin.firestore.FieldValue.delete();
                    }

                    await docSnapshot.ref.update(updateData);
                    
                    return res.status(200).json({ 
                        message: "Sincronizado", 
                        ubicacion: item.ref.path,
                        campoActualizado: item.field
                    });
                }
            }
        }

        return res.status(404).json({ message: "No se encontró el documento en ninguna colección" });
        
    } catch (error: any) {
        console.error("Error en updateGuideProfile:", error);
        return res.status(500).json({ message: "Error interno al actualizar" });
    }
};