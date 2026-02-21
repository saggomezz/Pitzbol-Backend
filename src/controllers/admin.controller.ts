import { Request, Response } from 'express';
import { db, auth } from '../config/firebase';
import { sendNotificationToUser } from '../services/notification.service';

// Obtener negocios archivados (solo admin)
export const obtenerNegociosArchivados = async (req: Request, res: Response) => {
    try {
        // Buscar todos los negocios en la colección 'negocios_archivados'
        const negociosSnap = await db.collection("negocios_archivados").get();
        const negocios = negociosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, negocios });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Obtener negocios pendientes (solo admin)
export const obtenerNegociosPendientes = async (req: Request, res: Response) => {
    try {
        // Buscar negocios pendientes en la subcolección 'negocios/Pendientes/items'
        const negociosSnap = await db.collection("negocios").doc("Pendientes").collection("items").get();
        const negocios = negociosSnap.docs.map(doc => {
            const data = doc.data();
            // Aplanar los datos del negocio para facilitar el frontend
            const business = data.business || {};
            // Formatear fecha de entrada si existe
            let createdAt = business.createdAt;
            if (createdAt && createdAt._seconds) {
                createdAt = new Date(createdAt._seconds * 1000).toISOString();
            } else if (createdAt && createdAt.seconds) {
                createdAt = new Date(createdAt.seconds * 1000).toISOString();
            }
            return {
                id: doc.id,
                email: data.email || business.email || '',
                name: business.name || '',
                logo: business.logo || '',
                createdAt: createdAt || '',
                ...data,
                business: {
                    ...business,
                    createdAt: createdAt || '',
                }
            };
        });
        return res.json({ success: true, negocios });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
// Obtener todos los negocios (solo admin)
export const obtenerNegocios = async (req: Request, res: Response) => {
    try {
        const negociosSnap = await db.collection("negocios").get();
        const negocios = negociosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, negocios });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
// Editar un negocio manualmente por el admin
export const editarNegocio = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    if (!negocioId) negocioId = "";
    const { adminUid, ...data } = req.body;
    if (!adminUid) {
        return res.status(400).json({ success: false, message: "adminUid requerido" });
    }
    try {
        const negocioRef = db.collection("negocios").doc(negocioId);
        const negocioSnap = await negocioRef.get();
        if (!negocioSnap.exists) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado" });
        }
        const negocioData = negocioSnap.data();
        // Actualizar campos permitidos
        const camposEditables = ["name", "description", "category", "phone", "location", "website", "rfc", "cp", "images"];
        const updateData: any = { updatedAt: new Date().toISOString() };
        for (const campo of camposEditables) {
            if (data[campo] !== undefined) updateData[campo] = data[campo];
        }
        updateData.history = [
            ...(negocioData?.history || []),
            { action: "editado_admin", date: new Date().toISOString(), by: adminUid, changes: updateData }
        ];
        await negocioRef.update(updateData);
        // Notificar al dueño
        if (negocioData?.owner) {
            await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                tipo: 'negocio_editado',
                titulo: 'Negocio editado por el admin',
                mensaje: `Tu negocio "${negocioData.name}" ha sido editado por el administrador. Revisa los cambios realizados en tu panel.`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus'
            });
        }
        return res.json({ success: true, message: "Negocio editado y notificado" });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
// Aprobar o rechazar un negocio pendiente
export const gestionarNegocioPendiente = async (req: Request, res: Response) => {
    const { negocioId, accion, adminUid } = req.body;
    if (!negocioId || !accion || !adminUid) {
        return res.status(400).json({ success: false, message: "Faltan datos obligatorios" });
    }
    try {
        const negocioRef = db.collection("negocios").doc(negocioId);
        const negocioSnap = await negocioRef.get();
        if (!negocioSnap.exists) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado" });
        }
        const negocioData = negocioSnap.data();
        if (accion === "aprobar") {
            await negocioRef.update({
                status: "aprobado",
                updatedAt: new Date().toISOString(),
                history: [
                    ...(negocioData?.history || []),
                    { action: "aprobado", date: new Date().toISOString(), by: adminUid }
                ]
            });
            // Notificar al dueño
            if (negocioData?.owner) {
                await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                    tipo: 'negocio_aprobado',
                    titulo: 'Negocio aprobado',
                    mensaje: `Tu negocio "${negocioData.name}" ha sido aprobado y ya es visible para los usuarios.`,
                    fecha: new Date().toISOString(),
                    leido: false,
                    enlace: '/negocio/estatus'
                });
            }
            return res.json({ success: true, message: "Negocio aprobado y notificado" });
        } else if (accion === "rechazar") {
            await negocioRef.update({
                status: "rechazado",
                updatedAt: new Date().toISOString(),
                history: [
                    ...(negocioData?.history || []),
                    { action: "rechazado", date: new Date().toISOString(), by: adminUid }
                ]
            });
            // Notificar al dueño
            if (negocioData?.owner) {
                await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                    tipo: 'negocio_rechazado',
                    titulo: 'Negocio rechazado',
                    mensaje: `Tu negocio "${negocioData.name}" ha sido rechazado. Puedes editarlo y volver a enviarlo para revisión.`,
                    fecha: new Date().toISOString(),
                    leido: false,
                    enlace: '/negocio/estatus'
                });
            }
            return res.json({ success: true, message: "Negocio rechazado y notificado" });
        } else {
            return res.status(400).json({ success: false, message: "Acción no válida" });
        }
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
// Archivar (eliminar) un negocio, guardar motivo y notificar al dueño
export const archivarNegocio = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    if (!negocioId) negocioId = "";
    const { motivo, adminUid } = req.body;
    if (!motivo || !adminUid) {
        return res.status(400).json({ success: false, message: "Motivo y adminUid requeridos" });
    }
    try {
        // Buscar el negocio
        const negocioRef = db.collection("negocios").doc(negocioId);
        const negocioSnap = await negocioRef.get();
        if (!negocioSnap.exists) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado" });
        }
        const negocioData = negocioSnap.data();
        // Mover a colección archivados
        await db.collection("negocios_archivados").doc(negocioId).set({
            ...negocioData,
            status: "archivado",
            archivedReason: motivo,
            archivedAt: new Date().toISOString(),
            archivedBy: adminUid,
            history: [
                ...(negocioData?.history || []),
                { action: "archivado", date: new Date().toISOString(), by: adminUid, reason: motivo }
            ]
        });
        // Eliminar de negocios activos
        await negocioRef.delete();
        // Notificar al dueño
        if (negocioData?.owner) {
            await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                tipo: 'negocio_archivado',
                titulo: 'Negocio eliminado',
                mensaje: `Tu negocio "${negocioData.name}" ha sido eliminado por el administrador. Motivo: ${motivo}`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus'
            });
        }
        return res.json({ success: true, message: "Negocio archivado y notificado" });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
// Recibir notificación desde frontend y guardarla para el usuario
export const recibirNotificacion = async (req: any, res: any) => {
    let { userId } = req.params;
    if (Array.isArray(userId)) userId = userId[0];
    if (!userId) userId = "";
    const notificacion = req.body;
    try {
        await sendNotificationToUser(String(userId), notificacion);
        return res.json({ success: true });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

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

export const obtenerUsuariosGestionables = async (req: Request, res: Response) => {
    try {
        const [guiasSnapshot, negociantesSnapshot, negociosBusinessSnapshot] = await Promise.all([
            db.collection('usuarios').doc('guias').collection('lista').get(),
            db.collection('usuarios').doc('negocios').collection('lista').get(),
            db.collection('negocios').doc('Business').collection('items').get(),
        ]);

        const guias = guiasSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                uid: data.uid || doc.id,
                nombre: data["01_nombre"] || data.nombre || '',
                apellido: data["02_apellido"] || data.apellido || '',
                correo: data["04_correo"] || data.email || '',
                telefono: data["06_telefono"] || data.telefono || '',
                role: 'guia',
            };
        });

        const negociantesMap = new Map<string, any>();

        negociantesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const uid = data.uid || doc.id;
            if (!uid) return;

            negociantesMap.set(uid, {
                uid,
                nombre: data["01_nombre"] || data.nombre || data.businessName || '',
                apellido: data["02_apellido"] || data.apellido || '',
                correo: data["04_correo"] || data.email || '',
                telefono: data["06_telefono"] || data.telefono || '',
                role: 'negociante',
            });
        });

        negociosBusinessSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const uid = data.uid || data.business?.owner || doc.id;
            if (!uid || negociantesMap.has(uid)) return;

            negociantesMap.set(uid, {
                uid,
                nombre: data.business?.name || data.name || 'Negocio',
                apellido: '',
                correo: data.email || data.business?.email || '',
                telefono: data.business?.phone || '',
                role: 'negociante',
            });
        });

        const negociantes = Array.from(negociantesMap.values());

        return res.json({
            success: true,
            guias,
            negociantes,
        });
    } catch (error: any) {
        console.error('❌ Error al obtener usuarios gestionables:', error);
        return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
    }
};

export const eliminarUsuarioGestionable = async (req: Request, res: Response) => {
    const { uid } = req.params;
    const role = (req.body?.role || req.query?.role || '').toString().toLowerCase();

    if (!uid) {
        return res.status(400).json({ success: false, message: 'UID requerido' });
    }

    if (!['guia', 'negociante'].includes(role)) {
        return res.status(400).json({ success: false, message: "Rol inválido. Usa 'guia' o 'negociante'" });
    }

    try {
        let eliminados = 0;

        const eliminarDocs = async (snapshot: any) => {
            for (const doc of snapshot.docs) {
                await doc.ref.delete();
                eliminados += 1;
            }
        };

        const [guiaLista, guiaPendiente, turistas, negociosUsuarios] = await Promise.all([
            db.collection('usuarios').doc('guias').collection('lista').where('uid', '==', uid).get(),
            db.collection('usuarios').doc('guias').collection('pendientes').where('uid', '==', uid).get(),
            db.collection('usuarios').doc('turistas').collection('lista').where('uid', '==', uid).get(),
            db.collection('usuarios').doc('negocios').collection('lista').where('uid', '==', uid).get(),
        ]);

        await eliminarDocs(guiaLista);
        await eliminarDocs(guiaPendiente);
        await eliminarDocs(turistas);
        await eliminarDocs(negociosUsuarios);

        const [negociosPendientesUid, negociosPendientesOwner, negociosBusinessUid, negociosBusinessOwner] = await Promise.all([
            db.collection('negocios').doc('Pendientes').collection('items').where('uid', '==', uid).get(),
            db.collection('negocios').doc('Pendientes').collection('items').where('business.owner', '==', uid).get(),
            db.collection('negocios').doc('Business').collection('items').where('uid', '==', uid).get(),
            db.collection('negocios').doc('Business').collection('items').where('business.owner', '==', uid).get(),
        ]);

        await eliminarDocs(negociosPendientesUid);
        await eliminarDocs(negociosPendientesOwner);
        await eliminarDocs(negociosBusinessUid);
        await eliminarDocs(negociosBusinessOwner);

        const notificacionesSnapshot = await db.collection('usuarios').doc('notificaciones').collection(uid).get();
        await eliminarDocs(notificacionesSnapshot);

        try {
            await auth.deleteUser(uid);
        } catch (authError: any) {
            if (authError?.code !== 'auth/user-not-found') {
                throw authError;
            }
        }

        return res.json({
            success: true,
            message: `Usuario ${role} eliminado correctamente`,
            eliminados,
        });
    } catch (error: any) {
        console.error('❌ Error al eliminar usuario gestionable:', error);
        return res.status(500).json({ success: false, message: 'Error al eliminar usuario', error: error.message });
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
                .doc(String(customId)) 
                .set({
                    ...data,
                    uid: String(uid),
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
                .where("uid", "==", String(uid))
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

            // Notificar al usuario de aprobación de negocio
            await sendNotificationToUser(uid, {
                tipo: 'aprobado',
                titulo: '¡Felicidades! 🎉',
                mensaje: 'Tu solicitud de negocio ha sido aprobada. Pronto estará publicada.',
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus'
            });
            
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

            // Notificar al usuario de rechazo de negocio
            await sendNotificationToUser(uid, {
                tipo: 'rechazado',
                titulo: 'Solicitud Rechazada',
                mensaje: 'Lamentablemente, tu solicitud de negocio no fue aprobada esta vez. Puedes volver a intentar más adelante.',
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus'
            });
            
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

        // Si no está en guías aprobados, buscar en guías pendientes
        const pendientesSnapshot = await db.collection("usuarios")
            .doc("guias")
            .collection("pendientes")
            .get();

        for (const doc of pendientesSnapshot.docs) {
            const data = doc.data();
            if (data && data.uid === uid) {
                console.log(`✅ Usuario encontrado en guías/pendientes:`, data);
                
                return res.json({
                    success: true,
                    rol: "guia_pendiente",
                    guide_status: "en_revision",
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
    let { id, uid } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (Array.isArray(uid)) uid = uid[0];

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
    let { id, uid } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (Array.isArray(uid)) uid = uid[0];

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
    let { uid } = req.params;
    if (Array.isArray(uid)) uid = uid[0];

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
    let { uid } = req.params;
    if (Array.isArray(uid)) uid = uid[0];

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