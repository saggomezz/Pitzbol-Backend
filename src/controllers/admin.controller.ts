import { Request, Response } from 'express';
import { db, auth } from '../config/firebase';

export const getSolicitudesPendientes = async (req: any, res: any) => {
    try {
        console.log("🔍 Consultando colección: usuarios/guias/pendientes");
        
        const snapshot = await db.collection('usuarios')
            .doc('guias')
            .collection('pendientes')
            .where('03_rol', '==', 'guia_pendiente') 
            .get();

        if (snapshot.empty) {
            console.log("ℹ️ No hay documentos que coincidan con 03_rol == guia_pendiente");
            return res.status(200).json({ solicitudes: [] }); // Devolvemos 200, no 404
        }

        const solicitudes = snapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
        }));

        return res.status(200).json({ solicitudes });
    } catch (error: any) {
        console.error("❌ Error de Firebase:", error);
        return res.status(500).json({ message: "Error interno", error: error.message });
    }
};

export const gestionarSolicitudGuia = async (req: Request, res: Response) => {
    const { uid, accion, motivoRechazo } = req.body;

    try {
        // Referencia a la carpeta de pendientes
        const pendienteRef = db.collection('usuarios').doc('guias').collection('pendientes').doc(uid);
        const docPendiente = await pendienteRef.get();

        if (!docPendiente.exists) {
            return res.status(404).json({ message: "La solicitud ya no existe o fue procesada" });
        }
        
        const data = docPendiente.data();

        if (accion === 'aprobar') {
            // 1. Extraemos los nombres correctos de los campos con prefijo
            const nombre = data?.["01_nombre"] || "Sin";
            const apellido = data?.["02_apellido"] || "Nombre";
            
            // 2. Creamos el ID amigable
            const customId = `${nombre}_${apellido}`.replace(/\s+/g, '_');

            // 3. Guardamos en 'lista' con el nuevo ID
            await db.collection('usuarios')
                .doc('guias')
                .collection('lista')
                .doc(customId) // <-- Aquí se asigna el nombre_apellido como ID del doc
                .set({
                    ...data,
                    "03_rol": "guia", // Actualizamos el rol
                    status: 'activo',
                    guide_status: 'aprobado',
                    approvedAt: new Date().toISOString()
                });

            // B. Actualizar claims de Firebase Auth (para seguridad de rutas)
            await auth.setCustomUserClaims(uid, { role: 'guia' });

            // C. Actualizar perfil de turista original
            const turistaQuery = await db.collection("usuarios")
                .doc("turistas")
                .collection("lista")
                .where("uid", "==", uid)
                .limit(1)
                .get();

            if (!turistaQuery.empty) {
                const userDoc = turistaQuery.docs[0];
                if (userDoc && userDoc.exists) {
                    await userDoc.ref.update({ 
                        role: "guia",
                        guide_status: "aprobado",
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            // D. Borrar de la carpeta de pendientes
            await pendienteRef.delete();
            
            return res.json({ success: true, message: "Guía aprobado y movido a la lista oficial" });

        } else {
            const turistaQuery = await db.collection("usuarios")
                .doc("turistas")
                .collection("lista")
                .where("uid", "==", uid)
                .limit(1)
                .get();

            if (!turistaQuery.empty) {
                const docTurista = turistaQuery.docs[0]; // Obtenemos el primer documento
                if (docTurista && docTurista.exists) {   // Verificamos que realmente exista
                    await docTurista.ref.update({ 
                        role: accion === 'aprobar' ? "guia" : "turista",
                        guide_status: accion === 'aprobar' ? "aprobado" : "ninguno",
                        updatedAt: new Date().toISOString()
                    });
                }
            }
            await pendienteRef.delete(); // Limpiamos la solicitud rechazada
            return res.json({ success: true, message: "Solicitud rechazada. El usuario vuelve a ser Turista." });
        }
    } catch (error: any) {
        console.error("❌ Error en gestión admin:", error);
        res.status(500).json({ error: error.message });
    }
};