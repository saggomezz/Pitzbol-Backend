import { Request, Response } from 'express';
import { db, auth } from '../config/firebase';

export const getSolicitudesPendientes = async (req: any, res: any) => {
    try {
        console.log("🔍 Consultando colección: usuarios/guias/pendientes");
        
        const snapshot = await db.collection('usuarios')
            .doc('guias')
            .collection('pendientes')
            .get();

        if (snapshot.empty) {
            console.log("No hay solicitudes en la colección 'pendientes'");
            return res.status(200).json({ solicitudes: [] });
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
        const pendienteRef = db.collection('usuarios').doc('guias').collection('pendientes').doc(uid);
        const docPendiente = await pendienteRef.get();

        if (!docPendiente.exists) {
            return res.status(404).json({ message: "La solicitud ya no existe o fue procesada" });
        }
        
        const data = docPendiente.data();

        if (accion === 'aprobar') {
            const nombre = data?.["01_nombre"] || "Sin";
            const apellido = data?.["02_apellido"] || "Nombre";
            const customId = `${nombre}_${apellido}`.replace(/\s+/g, '_');

            await db.collection('usuarios')
                .doc('guias')
                .collection('lista')
                .doc(customId) 
                .set({
                    ...data,
                    "03_rol": "guia", 
                    status: 'activo',
                    guide_status: 'aprobado',
                    approvedAt: new Date().toISOString()
                });

            await auth.setCustomUserClaims(uid, { role: 'guia' });

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
                const docTurista = turistaQuery.docs[0];
                if (docTurista && docTurista.exists) {   
                    await docTurista.ref.update({ 
                        role: accion === 'aprobar' ? "guia" : "turista",
                        guide_status: accion === 'aprobar' ? "aprobado" : "ninguno",
                        updatedAt: new Date().toISOString()
                    });
                }
            }
            await pendienteRef.delete(); 
            return res.json({ success: true, message: "Solicitud rechazada. El usuario vuelve a ser Turista." });
        }
    } catch (error: any) {
        console.error("❌ Error en gestión admin:", error);
        res.status(500).json({ error: error.message });
    }
};