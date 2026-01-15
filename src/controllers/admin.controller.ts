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
            uid: doc.data().uid || doc.id,
            ...doc.data()
        }));

        console.log(`✅ Se encontraron ${solicitudes.length} solicitudes pendientes`);
        return res.status(200).json({ solicitudes });
    } catch (error: any) {
        console.error("❌ Error de Firebase:", error);
        return res.status(500).json({ message: "Error interno", error: error.message });
    }
};

export const gestionarSolicitudGuia = async (req: Request, res: Response) => {
    const { uid, accion } = req.body;

    try {
        console.log(`🔍 Buscando solicitud con uid: ${uid}, acción: ${accion}`);

        // Buscar el documento que contenga ese uid en la colección pendientes
        const pendientesSnapshot = await db.collection('usuarios')
            .doc('guias')
            .collection('pendientes')
            .where('uid', '==', uid)
            .limit(1)
            .get();

        if (pendientesSnapshot.empty) {
            console.error(`❌ No se encontró solicitud pendiente para uid: ${uid}`);
            return res.status(404).json({ 
                success: false,
                message: "La solicitud ya no existe o fue procesada previamente" 
            });
        }

        const docPendiente = pendientesSnapshot.docs[0];
        if (!docPendiente) {
            return res.status(404).json({ 
                success: false,
                message: "La solicitud ya no existe o fue procesada previamente" 
            });
        }

        const data = docPendiente.data();

        console.log(`📄 Documento encontrado: ${docPendiente.id}`, data);

        if (accion === 'aprobar') {
            // Mover a guías/lista
            const nombre = data?.["01_nombre"] || "Sin";
            const apellido = data?.["02_apellido"] || "Nombre";
            const customId = `${nombre}_${apellido}`.replace(/\s+/g, '_');

            console.log(`✅ Aprobando guía con customId: ${customId}`);

            // Crear documento en guías/lista
            await db.collection('usuarios')
                .doc('guias')
                .collection('lista')
                .doc(customId) 
                .set({
                    ...data,
                    uid: uid,
                    "03_rol": "guia", 
                    status: 'activo',
                    guide_status: 'aprobado',
                    approvedAt: new Date().toISOString()
                });

            console.log(`✅ Documento movido a guías/lista`);

            // Actualizar custom claims en Auth
            try {
                await auth.setCustomUserClaims(uid, { role: 'guia' });
                console.log(`✅ Custom claims actualizados para uid: ${uid}`);
            } catch (authError) {
                console.error(`⚠️ Error al actualizar custom claims: ${authError}`);
            }

            // Actualizar en turistas/lista
            const turistaQuery = await db.collection("usuarios")
                .doc("turistas")
                .collection("lista")
                .where("uid", "==", uid)
                .limit(1)
                .get();

            if (!turistaQuery.empty) {
                const userDoc = turistaQuery.docs[0];
                if (userDoc && userDoc.exists) {
                    console.log(`📝 Actualizando turista documento: ${userDoc.id}`);
                    
                    await userDoc.ref.update({ 
                        "03_rol": "guia",
                        role: "guia",
                        guide_status: "aprobado",
                        updatedAt: new Date().toISOString()
                    });
                    
                    console.log(`✅ Turista actualizado a guía`);
                }
            } else {
                console.warn(`⚠️ No se encontró usuario en turistas/lista con uid: ${uid}`);
            }

            // Guardar notificación en Firestore
            try {
                await db.collection('usuarios')
                    .doc('notificaciones')
                    .collection(uid)
                    .add({
                        tipo: 'aprobado',
                        titulo: '¡Felicidades! 🎉',
                        mensaje: 'Tu solicitud para ser Guía Oficial Pitzbol ha sido aprobada. Ahora puedes crear experiencias y comenzar a guiar turistas.',
                        fecha: new Date().toISOString(),
                        leido: false,
                        enlace: '/perfil'
                    });
                console.log(`📬 Notificación de aprobación guardada`);
            } catch (notifError) {
                console.warn(`⚠️ Error al guardar notificación: ${notifError}`);
            }

            // Eliminar de pendientes
            await docPendiente.ref.delete();
            console.log(`🗑️ Solicitud eliminada de pendientes`);
            
            return res.json({ 
                success: true, 
                message: "Guía aprobado y movido a la lista oficial",
                newRole: "guia",
                guide_status: "aprobado"
            });

        } else if (accion === 'rechazar') {
            console.log(`❌ Rechazando solicitud para uid: ${uid}`);

            // Actualizar en turistas/lista para marcar que fue rechazado
            const turistaQuery = await db.collection("usuarios")
                .doc("turistas")
                .collection("lista")
                .where("uid", "==", uid)
                .limit(1)
                .get();

            if (!turistaQuery.empty) {
                const docTurista = turistaQuery.docs[0];
                if (docTurista && docTurista.exists) {
                    console.log(`📝 Actualizando turista documento: ${docTurista.id}`);
                    
                    await docTurista.ref.update({ 
                        "03_rol": "turista",
                        role: "turista",
                        guide_status: "rechazado",
                        rejectedAt: new Date().toISOString()
                    });
                    
                    console.log(`✅ Turista marcado como rechazado`);
                }
            } else {
                console.warn(`⚠️ No se encontró usuario en turistas/lista con uid: ${uid}`);
            }

            // Guardar notificación en Firestore
            try {
                await db.collection('usuarios')
                    .doc('notificaciones')
                    .collection(uid)
                    .add({
                        tipo: 'rechazado',
                        titulo: 'Solicitud Rechazada',
                        mensaje: 'Lamentablemente, tu solicitud para ser Guía Pitzbol no fue aprobada esta vez. Puedes volver a intentar más adelante.',
                        fecha: new Date().toISOString(),
                        leido: false,
                        enlace: '/perfil'
                    });
                console.log(`📬 Notificación de rechazo guardada`);
            } catch (notifError) {
                console.warn(`⚠️ Error al guardar notificación: ${notifError}`);
            }

            // Eliminar de pendientes
            await docPendiente.ref.delete();
            console.log(`🗑️ Solicitud eliminada de pendientes`);
            
            return res.json({ 
                success: true, 
                message: "Solicitud rechazada. El usuario vuelve a ser Turista.",
                newRole: "turista",
                guide_status: "rechazado"
            });
        }

        return res.status(400).json({ 
            success: false,
            message: "Acción no válida. Usa 'aprobar' o 'rechazar'" 
        });

    } catch (error: any) {
        console.error("❌ Error en gestión admin:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

export const verificarEstadoUsuario = async (req: Request, res: Response) => {
    const { uid } = req.params;

    try {
        console.log(`🔍 Verificando estado del usuario: ${uid}`);

        // Buscar en turistas
        const turistaQuery = await db.collection("usuarios")
            .doc("turistas")
            .collection("lista")
            .where("uid", "==", uid)
            .limit(1)
            .get();

        if (!turistaQuery.empty) {
            const doc = turistaQuery.docs[0];
            if (doc && doc.exists) {
                const userData = doc.data();
                console.log(`✅ Usuario encontrado en turistas:`, userData);
                
                return res.json({
                    success: true,
                    rol: userData["03_rol"] || userData.role || "turista",
                    guide_status: userData.guide_status || "ninguno",
                    userData: userData
                });
            }
        }

        // Si no está en turistas, buscar en guías aprobados
        const guiasSnapshot = await db.collection("usuarios")
            .doc("guias")
            .collection("lista")
            .get();

        for (const doc of guiasSnapshot.docs) {
            const data = doc.data();
            if (data && data.uid === uid) {
                console.log(`✅ Usuario encontrado en guías/lista:`, data);
                
                return res.json({
                    success: true,
                    rol: "guia",
                    guide_status: "aprobado",
                    userData: data
                });
            }
        }

        console.warn(`⚠️ Usuario no encontrado en ninguna colección: ${uid}`);
        return res.status(404).json({ 
            success: false,
            message: "Usuario no encontrado" 
        });

    } catch (error: any) {
        console.error("❌ Error al verificar estado:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

export const marcarNotificacionComoLeida = async (req: Request, res: Response) => {
    const { id, uid } = req.params;

    try {
        if (!uid || !id) {
            return res.status(400).json({ success: false, message: "UID e ID requeridos" });
        }

        console.log(`📝 Marcando notificación como leída: ${id}`);

        const docRef = db.collection('usuarios')
            .doc('notificaciones')
            .collection(uid)
            .doc(id);
        
        const docSnapshot = await docRef.get();
        
        if (!docSnapshot.exists) {
            return res.status(404).json({ success: false, message: "Notificación no encontrada" });
        }

        await docRef.update({ leido: true });
        console.log(`✅ Notificación marcada como leída`);
        return res.json({ success: true, message: "Notificación marcada como leída" });

    } catch (error: any) {
        console.error("❌ Error al marcar notificación:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const eliminarNotificacion = async (req: Request, res: Response) => {
    const { id, uid } = req.params;

    try {
        if (!uid || !id) {
            return res.status(400).json({ success: false, message: "UID e ID requeridos" });
        }

        console.log(`🗑️ Eliminando notificación: ${id}`);

        const docRef = db.collection('usuarios')
            .doc('notificaciones')
            .collection(uid)
            .doc(id);
        
        const docSnapshot = await docRef.get();
        
        if (!docSnapshot.exists) {
            return res.status(404).json({ success: false, message: "Notificación no encontrada" });
        }

        await docRef.delete();
        console.log(`✅ Notificación eliminada`);
        return res.json({ success: true, message: "Notificación eliminada" });

    } catch (error: any) {
        console.error("❌ Error al eliminar notificación:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const limpiarNotificacionesUsuario = async (req: Request, res: Response) => {
    const { uid } = req.params;

    try {
        if (!uid) {
            return res.status(400).json({ success: false, message: "UID requerido" });
        }

        console.log(`🗑️ Limpiando todas las notificaciones del usuario: ${uid}`);

        const notificacionesRef = db.collection('usuarios')
            .doc('notificaciones')
            .collection(uid);

        const snapshot = await notificacionesRef.get();
        const batch = db.batch();

        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`✅ Notificaciones del usuario limpiadas`);
        
        return res.json({ success: true, message: "Todas las notificaciones han sido eliminadas" });

    } catch (error: any) {
        console.error("❌ Error al limpiar notificaciones:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const obtenerNotificacionesUsuario = async (req: Request, res: Response) => {
    const { uid } = req.params;

    try {
        if (!uid) {
            return res.status(400).json({ success: false, message: "UID requerido" });
        }

        console.log(`🔍 Obteniendo notificaciones para uid: ${uid}`);

        const notificacionesSnapshot = await db.collection('usuarios')
            .doc('notificaciones')
            .collection(uid)
            .orderBy('fecha', 'desc')
            .limit(50)
            .get();

        const notificaciones = notificacionesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ Se obtuvieron ${notificaciones.length} notificaciones`);
        return res.json({ success: true, notificaciones });

    } catch (error: any) {
        console.error("❌ Error al obtener notificaciones:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};