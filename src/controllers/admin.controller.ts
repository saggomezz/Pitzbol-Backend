import { Request, Response } from 'express';
import { db, auth } from '../config/firebase';
import { sendNotificationToUser } from '../services/notification.service';
import { sendProfileApprovalEmail, sendBookingConfirmationEmail } from '../services/email.service';
import { reorganizeBusinessImages, deleteBusinessFromCloudinary } from '../utils/cloudinaryHelper';
import { BookingService } from '../services/booking.service';
import { AuthRequest } from '../middlewares/auth.middleware';

const notifyGuideApprovalByEmail = async (params: { uid: string; fullName: string; email?: string }) => {
    try {
        let destination = params.email;

        if (!destination) {
            try {
                const userRecord = await auth.getUser(params.uid);
                destination = userRecord.email || undefined;
            } catch (authError) {
                console.warn('No se pudo obtener el correo del guía desde Firebase Auth:', authError);
            }
        }

        if (!destination) {
            console.warn(`No se envió correo: guía ${params.uid} sin email registrado`);
            return;
        }

        await sendProfileApprovalEmail({
            to: destination,
            fullName: params.fullName,
            ...(process.env.GUIDE_DASHBOARD_URL ? { dashboardUrl: process.env.GUIDE_DASHBOARD_URL } : {}),
        });
    } catch (emailError) {
        console.warn('No se pudo enviar correo de aprobación de perfil:', emailError);
    }
};

const firstNonEmpty = (...values: any[]): string => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
};

const getUserFromRoleCollectionsByUid = async (uid: string) => {
    const collectionRefs = [
        db.collection('usuarios').doc('turistas').collection('lista'),
        db.collection('usuarios').doc('guias').collection('lista'),
        db.collection('usuarios').doc('guias').collection('pendientes'),
        db.collection('usuarios').doc('admins').collection('lista'),
        db.collection('usuarios').doc('negocios').collection('lista'),
    ];

    for (const ref of collectionRefs) {
        const snap = await ref.where('uid', '==', uid).limit(1).get();
        if (!snap.empty) {
            return snap.docs[0]?.data() || null;
        }
    }

    return null;
};

const getUserFromRoleCollectionsByEmail = async (email: string) => {
    const collectionRefs = [
        db.collection('usuarios').doc('turistas').collection('lista'),
        db.collection('usuarios').doc('guias').collection('lista'),
        db.collection('usuarios').doc('guias').collection('pendientes'),
        db.collection('usuarios').doc('admins').collection('lista'),
        db.collection('usuarios').doc('negocios').collection('lista'),
    ];

    const emailFields = ['email', 'correo', '04_correo'];

    for (const ref of collectionRefs) {
        for (const field of emailFields) {
            const snap = await ref.where(field, '==', email).limit(1).get();
            if (!snap.empty) {
                return snap.docs[0]?.data() || null;
            }
        }
    }

    return null;
};

const resolveOwnerInfo = async (data: any, business: any = {}) => {
    const ownerUid = firstNonEmpty(
        data?.ownerUid,
        data?.owner,
        data?.ownerId,
        data?.uid,
        data?.userId,
        data?.createdBy,
        business?.ownerUid,
        business?.owner,
        business?.ownerId,
        business?.uid,
        business?.userId,
        business?.createdBy
    );

    let userData: any = null;

    if (ownerUid) {
        try {
            const userDoc = await db.collection('usuarios').doc(ownerUid).get();
            if (userDoc.exists) {
                userData = userDoc.data();
            }
        } catch (err) {
            console.error('Error fetching user by uid from usuarios:', ownerUid, err);
        }

        if (!userData) {
            try {
                userData = await getUserFromRoleCollectionsByUid(ownerUid);
            } catch (err) {
                console.error('Error fetching user by uid from role collections:', ownerUid, err);
            }
        }
    }

    const possibleEmails = [
        firstNonEmpty(data?.email),
        firstNonEmpty(data?.ownerEmail),
        firstNonEmpty(data?.userEmail),
        firstNonEmpty(business?.email),
        firstNonEmpty(business?.ownerEmail),
        firstNonEmpty(business?.userEmail),
    ].filter(Boolean);

    if (!userData && possibleEmails.length > 0) {
        for (const email of possibleEmails) {
            try {
                const byEmail = await db.collection('usuarios').where('email', '==', email).limit(1).get();
                if (!byEmail.empty) {
                    const firstDoc = byEmail.docs[0];
                    if (firstDoc) {
                        userData = firstDoc.data();
                    }
                    break;
                }

                const byCorreo = await db.collection('usuarios').where('correo', '==', email).limit(1).get();
                if (!byCorreo.empty) {
                    const firstDoc = byCorreo.docs[0];
                    if (firstDoc) {
                        userData = firstDoc.data();
                    }
                    break;
                }

                if (!userData) {
                    userData = await getUserFromRoleCollectionsByEmail(email);
                }

                if (userData) {
                    break;
                }
            } catch (err) {
                console.error('Error fetching user by email from usuarios:', email, err);
            }
        }
    }

    let authUser: any = null;
    if (!userData && ownerUid) {
        try {
            authUser = await auth.getUser(ownerUid);
        } catch (err) {
            // Ignorar si el uid no existe en Auth
        }
    }

    const ownerName = firstNonEmpty(
        userData?.['01_nombre'] && userData?.['02_apellido']
            ? `${userData['01_nombre']} ${userData['02_apellido']}`
            : '',
        userData?.['01_nombre'],
        userData?.nombre,
        userData?.name,
        userData?.fullName,
        userData?.displayName,
        userData?.nombreCompleto,
        userData?.usuario,
        userData?.username,
        authUser?.displayName,
        data?.ownerName,
        business?.ownerName,
        'Usuario'
    );

    const ownerPhoto = firstNonEmpty(
        userData?.['14_foto_perfil']?.url,
        userData?.fotoUrl,
        userData?.photoUrl,
        userData?.foto,
        userData?.photo,
        userData?.fotoPerfil,
        userData?.profilePhoto,
        userData?.avatar,
        authUser?.photoURL,
        data?.ownerPhoto,
        business?.ownerPhoto
    );

    return { ownerName, ownerPhoto };
};

// Obtener negocios archivados (solo admin)
export const obtenerNegociosArchivados = async (req: Request, res: Response) => {
    try {
        // Buscar todos los negocios en la colección 'negocios/Archivados/items'
        const negociosSnap = await db.collection("negocios").doc("Archivados").collection("items").get();
        const negocios = await Promise.all(negociosSnap.docs.map(async (doc) => {
            const data = doc.data();
            const { ownerName, ownerPhoto } = await resolveOwnerInfo(data);
            
            return {
                id: doc.id,
                ...data,
                ownerName: ownerName,
                ownerPhoto: ownerPhoto
            };
        }));
        return res.json({ success: true, negocios });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

export const obtenerNegociosPendientes = async (req: Request, res: Response) => {
    try {
        // Buscar negocios pendientes en la subcolección 'negocios/Pendientes/items'
        const negociosSnap = await db.collection("negocios").doc("Pendientes").collection("items").get();
        const negocios = await Promise.all(negociosSnap.docs.map(async (doc) => {
            const data = doc.data();
            // Aplanar los datos del negocio para facilitar el frontend
            const business = data.business || {};
            const { ownerName, ownerPhoto } = await resolveOwnerInfo(data, business);
            
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
                },
                ownerName: ownerName,
                ownerPhoto: ownerPhoto
            };
        }));
        return res.json({ success: true, negocios });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
// Obtener todos los negocios activos (solo admin)
export const obtenerNegocios = async (req: Request, res: Response) => {
    try {
        const negociosSnap = await db.collection("negocios").doc("Activos").collection("items").get();
        const negocios = await Promise.all(negociosSnap.docs.map(async (doc) => {
            const data = doc.data();
            // Flatten business data for easier frontend access
            const business = data.business || {};
            const { ownerName, ownerPhoto } = await resolveOwnerInfo(data, business);
            
            // Format createdAt if it exists
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
                status: data.status || 'aprobado',
                ...data,
                business: {
                    ...business,
                    createdAt: createdAt || '',
                },
                ownerName: ownerName,
                ownerPhoto: ownerPhoto
            };
        }));
        return res.json({ success: true, negocios });
    } catch (error: any) {
        console.error("[obtenerNegocios] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
// Helper function to find a business in either Activos or Pendientes collection
const findBusiness = async (negocioId: string): Promise<{ ref: FirebaseFirestore.DocumentReference, data: any, location: 'Activos' | 'Pendientes' } | null> => {
    // First try Activos
    const activosRef = db.collection("negocios").doc("Activos").collection("items").doc(negocioId);
    const activosSnap = await activosRef.get();
    if (activosSnap.exists) {
        return { ref: activosRef as any, data: activosSnap.data(), location: 'Activos' };
    }
    
    // Then try Pendientes
    const pendientesRef = db.collection("negocios").doc("Pendientes").collection("items").doc(negocioId);
    const pendientesSnap = await pendientesRef.get();
    if (pendientesSnap.exists) {
        return { ref: pendientesRef as any, data: pendientesSnap.data(), location: 'Pendientes' };
    }
    
    return null;
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
        const businessResult = await findBusiness(negocioId);
        if (!businessResult) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado" });
        }
        
        const { ref: negocioRef, data: negocioData } = businessResult;
        
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
        console.error("[editarNegocio] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Helper function to update Cloudinary URLs from pendientes to activos
const updateCloudinaryUrls = (data: any): any => {
    const updateData = { ...data };
    
    // Update logo URL if it exists
    if (updateData?.logo && typeof updateData.logo === 'string') {
        updateData.logo = updateData.logo.replace('/pendientes/', '/activos/');
    }
    
    // Update business logo if it exists
    if (updateData?.business?.logo && typeof updateData.business.logo === 'string') {
        updateData.business.logo = updateData.business.logo.replace('/pendientes/', '/activos/');
    }
    
    // Update images array if it exists
    if (Array.isArray(updateData?.images)) {
        updateData.images = updateData.images.map((img: string) => 
            typeof img === 'string' ? img.replace('/pendientes/', '/activos/') : img
        );
    }
    
    // Update business images if it exists
    if (Array.isArray(updateData?.business?.images)) {
        updateData.business.images = updateData.business.images.map((img: string) => 
            typeof img === 'string' ? img.replace('/pendientes/', '/activos/') : img
        );
    }
    
    return updateData;
};

// Aprobar o rechazar un negocio pendiente
export const gestionarNegocioPendiente = async (req: Request, res: Response) => {
    const { negocioId, accion, adminUid } = req.body;
    if (!negocioId || !accion || !adminUid) {
        return res.status(400).json({ success: false, message: "Faltan datos obligatorios" });
    }
    try {
        // Get negocio from Pendientes collection
        const negocioRef = db.collection("negocios").doc("Pendientes").collection("items").doc(negocioId);
        const negocioSnap = await negocioRef.get();
        if (!negocioSnap.exists) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado en pendientes" });
        }
        const negocioData = negocioSnap.data();
        
        if (accion === "aprobar") {
            // Reorganizar imágenes en Cloudinary (de pendientes a activos) y validar resultado
            const moveResult = await reorganizeBusinessImages(negocioId);
            const hadMoveErrors = moveResult.failed > 0;
            const movedSomething = moveResult.moved > 0;

            // Si hubo intentos y ninguno pudo moverse, detener el proceso para evitar inconsistencias.
            if (moveResult.attempted > 0 && !movedSomething && hadMoveErrors) {
                return res.status(500).json({
                    success: false,
                    message: "No se pudieron mover las imágenes del negocio en Cloudinary",
                    cloudinary: moveResult,
                });
            }
            
            // Update Cloudinary URLs from pendientes to activos
            const updatedData = updateCloudinaryUrls(negocioData);
            updatedData.status = "aprobado";
            updatedData.updatedAt = new Date().toISOString();
            updatedData.history = [
                ...(negocioData?.history || []),
                { action: "aprobado", date: new Date().toISOString(), by: adminUid, approvedAt: new Date().toISOString() }
            ];
            
            // Move from Pendientes to Activos
            await db.collection("negocios").doc("Activos").collection("items").doc(negocioId).set(updatedData);
            
            // Delete from Pendientes
            await negocioRef.delete();
            
            console.log(`[gestionarNegocioPendiente] ✅ Negocio ${negocioId} movido de Pendientes a Activos`);
            
            // Notify owner
            if (negocioData?.owner) {
                await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                    tipo: 'negocio_aprobado',
                    titulo: 'Negocio aprobado',
                    mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" ha sido aprobado y ya es visible para los usuarios.`,
                    fecha: new Date().toISOString(),
                    leido: false,
                    enlace: '/negocio/estatus'
                });
            }
            return res.json({
                success: true,
                message: "Negocio aprobado y movido a Activos",
                cloudinary: moveResult,
            });
        } else if (accion === "rechazar") {
            console.log(`[gestionarNegocioPendiente] 🔄 Iniciando rechazo de negocio ${negocioId}`);
            
            const rejectedAt = new Date().toISOString();
            const archivedData = {
                ...negocioData,
                status: "archivado",
                archivedReason: "Solicitud rechazada por administrador",
                archivedAt: rejectedAt,
                archivedBy: adminUid,
                updatedAt: rejectedAt,
                history: [
                    ...(negocioData?.history || []),
                    { action: "rechazado", date: rejectedAt, by: adminUid },
                    { action: "archivado", date: rejectedAt, by: adminUid, reason: "Solicitud rechazada por administrador" }
                ]
            };

            console.log(`[gestionarNegocioPendiente] 📁 Guardando en negocios/Archivados/items...`);
            // Move from Pendientes to Archivados
            await db.collection("negocios").doc("Archivados").collection("items").doc(negocioId).set(archivedData);
            console.log(`[gestionarNegocioPendiente] ✅ Guardado en negocios/Archivados/items`);

            console.log(`[gestionarNegocioPendiente] 🗑️ Eliminando de Pendientes...`);
            // Delete from Pendientes
            await negocioRef.delete();
            console.log(`[gestionarNegocioPendiente] ✅ Eliminado de Pendientes`);

            console.log(`[gestionarNegocioPendiente] ✅ Negocio ${negocioId} rechazado y movido a Archivados`);
            
            // Notify owner
            if (negocioData?.owner) {
                await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                    tipo: 'negocio_rechazado',
                    titulo: 'Negocio rechazado',
                    mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" fue rechazado y archivado por el administrador.`,
                    fecha: rejectedAt,
                    leido: false,
                    enlace: '/negocio/estatus'
                });
            }
            return res.json({ success: true, message: "Negocio rechazado y movido a Archivados" });
        } else {
            return res.status(400).json({ success: false, message: "Acción no válida" });
        }
    } catch (error: any) {
        console.error("[gestionarNegocioPendiente] Error:", error);
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
        // Find the business in either Activos or Pendientes
        const businessResult = await findBusiness(negocioId);
        if (!businessResult) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado" });
        }
        
        const { ref: negocioRef, data: negocioData, location } = businessResult;
        
        // Reorganizar imágenes en Cloudinary si viene de Pendientes
        if (location === 'Pendientes') {
            reorganizeBusinessImages(negocioId).catch((err) => {
                console.error(`[archivarNegocio] Error reorganizando imágenes para ${negocioId}:`, err);
            });
        }
        
        // Update Cloudinary URLs if moving from Pendientes
        let archiveData = { ...negocioData };
        if (location === 'Pendientes') {
            archiveData = updateCloudinaryUrls(archiveData);
        }
        
        // Move to archived collection
        await db.collection("negocios").doc("Archivados").collection("items").doc(negocioId).set({
            ...archiveData,
            status: "archivado",
            archivedReason: motivo,
            archivedAt: new Date().toISOString(),
            archivedBy: adminUid,
            history: [
                ...(negocioData?.history || []),
                { action: "archivado", date: new Date().toISOString(), by: adminUid, reason: motivo }
            ]
        });
        
        // Delete from current location
        await negocioRef.delete();
        
        console.log(`[archivarNegocio] ✅ Negocio ${negocioId} archivado (estaba en ${location})`);
        
        // Notify owner
        if (negocioData?.owner) {
            await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                tipo: 'negocio_archivado',
                titulo: 'Negocio eliminado',
                mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" ha sido eliminado por el administrador. Motivo: ${motivo}`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus'
            });
        }
        return res.json({ success: true, message: "Negocio archivado y notificado" });
    } catch (error: any) {
        console.error("[archivarNegocio] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Regresar negocio activo a pendientes
export const regresarAPendientes = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    const { adminUid } = req.body;
    
    if (!negocioId || !adminUid) {
        return res.status(400).json({ success: false, message: "negocioId y adminUid requeridos" });
    }
    
    try {
        // Get business from Activos
        const activosRef = db.collection("negocios").doc("Activos").collection("items").doc(negocioId);
        const activosSnap = await activosRef.get();
        
        if (!activosSnap.exists) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado en Activos" });
        }
        
        const negocioData = activosSnap.data();
        
        // Update URLs from activos to pendientes
        const revertCloudinaryUrls = (data: any) => {
            const updatedData = { ...data };
            if (updatedData.business?.logo && typeof updatedData.business.logo === 'string') {
                updatedData.business.logo = updatedData.business.logo.replace('/activos/', '/pendientes/');
            }
            if (Array.isArray(updatedData.business?.images)) {
                updatedData.business.images = updatedData.business.images.map((img: any) =>
                    typeof img === 'string' ? img.replace('/activos/', '/pendientes/') : img
                );
            }
            return updatedData;
        };
        
        const updatedData = revertCloudinaryUrls(negocioData);
        updatedData.status = "PENDING";
        updatedData.updatedAt = new Date().toISOString();
        updatedData.history = [
            ...(negocioData?.history || []),
            { action: "regresado_a_pendientes", date: new Date().toISOString(), by: adminUid }
        ];
        
        // Move to Pendientes
        await db.collection("negocios").doc("Pendientes").collection("items").doc(negocioId).set(updatedData);
        
        // Delete from Activos
        await activosRef.delete();
        
        console.log(`[regresarAPendientes] ✅ Negocio ${negocioId} movido de Activos a Pendientes`);
        
        // Notify owner
        if (negocioData?.owner) {
            await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                tipo: 'negocio_pendiente',
                titulo: 'Negocio en revisión',
                mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" ha sido regresado a revisión por el administrador.`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus'
            });
        }
        
        return res.json({ success: true, message: "Negocio regresado a pendientes" });
    } catch (error: any) {
        console.error("[regresarAPendientes] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Desarchivar negocio (mover de archivados a pendientes)
export const desarchivarNegocio = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    const { adminUid } = req.body;
    
    if (!negocioId || !adminUid) {
        return res.status(400).json({ success: false, message: "negocioId y adminUid requeridos" });
    }
    
    try {
        // Get business from archived
        const archivedRef = db.collection("negocios").doc("Archivados").collection("items").doc(negocioId);
        const archivedSnap = await archivedRef.get();
        
        if (!archivedSnap.exists) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado en archivados" });
        }
        
        const negocioData = archivedSnap.data();
        
        // Prepare data for pendientes
        const pendientesData: any = {
            ...negocioData,
            status: "PENDING",
            updatedAt: new Date().toISOString(),
            history: [
                ...(negocioData?.history || []),
                { action: "desarchivado", date: new Date().toISOString(), by: adminUid }
            ]
        };
        
        // Remove archived-specific fields
        delete pendientesData.archivedReason;
        delete pendientesData.archivedAt;
        delete pendientesData.archivedBy;
        
        // Move to Pendientes
        await db.collection("negocios").doc("Pendientes").collection("items").doc(negocioId).set(pendientesData);
        
        // Delete from archived
        await archivedRef.delete();
        
        console.log(`[desarchivarNegocio] ✅ Negocio ${negocioId} desarchivado y movido a Pendientes`);
        
        // Notify owner
        if (negocioData?.owner) {
            await db.collection('usuarios').doc('notificaciones').collection(negocioData.owner).add({
                tipo: 'negocio_desarchivado',
                titulo: 'Negocio desarchivado',
                mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" ha sido desarchivado y está en revisión nuevamente.`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus'
            });
        }
        
        return res.json({ success: true, message: "Negocio desarchivado exitosamente" });
    } catch (error: any) {
        console.error("[desarchivarNegocio] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Eliminar permanentemente negocio archivado (Firestore + Cloudinary)
export const eliminarNegocioPermanente = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    const { adminUid } = req.body;
    
    if (!negocioId || !adminUid) {
        return res.status(400).json({ success: false, message: "negocioId y adminUid requeridos" });
    }
    
    try {
        // Get business from archived
        const archivedRef = db.collection("negocios").doc("Archivados").collection("items").doc(negocioId);
        const archivedSnap = await archivedRef.get();
        
        if (!archivedSnap.exists) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado en archivados" });
        }
        
        const negocioData = archivedSnap.data();
        
        console.log(`[eliminarNegocioPermanente] 🗑️ Iniciando eliminación permanente de negocio ${negocioId}`);
        
        // Eliminar todas las imágenes de Cloudinary
        let cloudinaryResult;
        try {
            cloudinaryResult = await deleteBusinessFromCloudinary(negocioId);
            console.log(`[eliminarNegocioPermanente] ✅ Cloudinary: ${cloudinaryResult.deleted} eliminados, ${cloudinaryResult.failed} fallidos`);
            
            if (cloudinaryResult.failed > 0) {
                console.warn(`[eliminarNegocioPermanente] ⚠️ Algunos archivos de Cloudinary no se pudieron eliminar:`, cloudinaryResult.errors);
            }
        } catch (cloudinaryError) {
            console.error(`[eliminarNegocioPermanente] Error eliminando de Cloudinary:`, cloudinaryError);
            // Continue with Firestore deletion even if Cloudinary fails partially
        }
        
        // Delete from Firestore
        await archivedRef.delete();
        
        console.log(`[eliminarNegocioPermanente] ✅ Negocio ${negocioId} eliminado permanentemente de Firestore`);
        
        return res.json({ 
            success: true, 
            message: "Negocio eliminado permanentemente",
            cloudinary: cloudinaryResult || { deleted: 0, failed: 0, errors: [] }
        });
    } catch (error: any) {
        console.error("[eliminarNegocioPermanente] Error:", error);
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
            db.collection('negocios').doc('Activos').collection('items').get(),
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
    const uid = req.params.uid as string;
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
            db.collection('negocios').doc('Activos').collection('items').where('uid', '==', uid).get(),
            db.collection('negocios').doc('Activos').collection('items').where('business.owner', '==', uid).get(),
        ]);

        await eliminarDocs(negociosPendientesUid);
        await eliminarDocs(negociosPendientesOwner);
        await eliminarDocs(negociosBusinessUid);
        await eliminarDocs(negociosBusinessOwner);

        const notificacionesSnapshot = await db.collection('usuarios').doc('notificaciones').collection(uid as string).get();
        await eliminarDocs(notificacionesSnapshot);

        try {
            await auth.deleteUser(uid as string);
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

            const fullName = `${nombre} ${apellido}`.trim() || nombre || 'Guía Pitzbol';
            void notifyGuideApprovalByEmail({
                uid,
                fullName,
                email: data?.['04_correo'] || data?.email,
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
    const uid = req.params.uid as string;

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

export const obtenerDetalleUsuarioAdmin = async (req: Request, res: Response) => {
    const uid = req.params.uid as string;

    if (!uid) {
        return res.status(400).json({ success: false, message: 'UID requerido' });
    }

    try {
        const collections = [
            { role: 'turista', path: 'usuarios/turistas/lista', ref: db.collection('usuarios').doc('turistas').collection('lista') },
            { role: 'guia', path: 'usuarios/guias/lista', ref: db.collection('usuarios').doc('guias').collection('lista') },
            { role: 'guia-pendiente', path: 'usuarios/guias/pendientes', ref: db.collection('usuarios').doc('guias').collection('pendientes') },
            { role: 'admin', path: 'usuarios/admins/lista', ref: db.collection('usuarios').doc('admins').collection('lista') },
            { role: 'negociante', path: 'usuarios/negocios/lista', ref: db.collection('usuarios').doc('negocios').collection('lista') },
        ];

        for (const collection of collections) {
            const byUid = await collection.ref.where('uid', '==', uid).limit(1).get();
            if (!byUid.empty) {
                const doc = byUid.docs[0];
                const data = doc?.data() || {};
                const resolvedUid = typeof data.uid === 'string' && data.uid.trim() ? data.uid : uid;
                return res.status(200).json({
                    success: true,
                    user: {
                        uid: resolvedUid,
                        role: collection.role,
                        path: collection.path,
                        docId: doc?.id || null,
                        data,
                    }
                });
            }

            const byDocId = await collection.ref.doc(uid as string).get();
            if (byDocId.exists) {
                const data = byDocId.data() || {};
                const resolvedUid = typeof data.uid === 'string' && data.uid.trim() ? data.uid : uid;
                return res.status(200).json({
                    success: true,
                    user: {
                        uid: resolvedUid,
                        role: collection.role,
                        path: collection.path,
                        docId: byDocId.id,
                        data,
                    }
                });
            }
        }

        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    } catch (error: any) {
        console.error('❌ Error al obtener detalle admin de usuario:', error);
        return res.status(500).json({ success: false, error: error.message });
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

        const notificaciones = notificacionesSnapshot.docs.map(doc => {
            const data = doc.data();
            const notif = {
                id: doc.id,
                ...data
            };
            console.log(`📧 Notificación ${doc.id}:`, JSON.stringify(notif, null, 2));
            return notif;
        });

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

// Reservar un tour como admin (en nombre de un turista)
export const adminCreateBooking = async (req: AuthRequest, res: Response) => {
    try {
        const {
            guideId,
            guideName,
            touristId,
            touristName,
            fecha,
            horaInicio,
            duracion,
            numPersonas,
            notas,
            total,
        } = req.body;

        // Validaciones de campos requeridos
        if (!guideId || !touristId || !fecha || !horaInicio || !duracion || !numPersonas || total == null) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos requeridos: guideId, touristId, fecha, horaInicio, duracion, numPersonas y total son obligatorios',
            });
        }

        // Verificar que el guía exista en la colección de guías aprobados
        const guideSnapshot = await db
            .collection('guias')
            .doc('lista')
            .collection('usuarios')
            .where('uid', '==', guideId)
            .limit(1)
            .get();

        if (guideSnapshot.empty) {
            return res.status(404).json({
                success: false,
                message: 'El guía especificado no existe o no está aprobado',
            });
        }

        // Verificar que el turista exista
        const touristSnapshot = await db
            .collection('usuarios')
            .doc('turistas')
            .collection('lista')
            .where('uid', '==', touristId)
            .limit(1)
            .get();

        if (touristSnapshot.empty) {
            return res.status(404).json({
                success: false,
                message: 'El turista especificado no existe',
            });
        }

        // Verificar disponibilidad del guía
        const isAvailable = await BookingService.checkGuideAvailability(guideId, fecha, horaInicio);

        if (!isAvailable) {
            return res.status(409).json({
                success: false,
                message: 'El guía no está disponible en esa fecha y hora',
            });
        }

        // Crear la reserva con estado confirmado (el admin la respalda)
        const booking = await BookingService.createBooking({
            guideId,
            guideName: guideName || '',
            touristId,
            touristName: touristName || '',
            fecha,
            horaInicio,
            duracion,
            numPersonas,
            notas: notas || '',
            total,
            status: 'confirmado',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Intentar enviar correo de confirmación al turista
        const touristData = touristSnapshot.docs[0]?.data();
        const touristEmail = touristData?.['04_correo'] || touristData?.email;
        const touristFullName = touristName
            || `${touristData?.['01_nombre'] || ''} ${touristData?.['02_apellido'] || ''}`.trim()
            || 'Turista';

        if (touristEmail) {
            sendBookingConfirmationEmail({
                to: touristEmail,
                touristName: touristFullName,
                guideName: guideName || 'Guía',
                fecha,
                horaInicio,
                duracion,
                numPersonas,
                total,
            }).catch((err: any) => console.warn('No se pudo enviar correo de confirmación (admin booking):', err));
        }

        console.log(`✅ [Admin] Reserva creada por admin ${req.user?.uid} → booking ${booking.id}`);

        return res.status(201).json({
            success: true,
            message: 'Reserva creada exitosamente por el administrador',
            bookingId: booking.id,
            booking,
        });
    } catch (error: any) {
        console.error('❌ Error al crear reserva como admin:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al crear reserva como administrador',
            error: error.message,
        });
    }
};

// Forzar movimiento de imágenes en Cloudinary para un negocio ya aprobado
export const forzarMoverImagenesNegocio = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    if (!negocioId) negocioId = "";

    if (!negocioId) {
        return res.status(400).json({ success: false, message: "negocioId requerido" });
    }

    try {
        const activoRef = db.collection("negocios").doc("Activos").collection("items").doc(negocioId);
        const activoSnap = await activoRef.get();

        if (!activoSnap.exists) {
            return res.status(404).json({ success: false, message: "Negocio activo no encontrado" });
        }

        const moveResult = await reorganizeBusinessImages(negocioId);

        // Asegurar que las URLs guardadas apunten a /activos/
        const activeData = activoSnap.data() || {};
        const normalizedData = updateCloudinaryUrls(activeData);
        await activoRef.update({
            ...normalizedData,
            updatedAt: new Date().toISOString(),
        });

        return res.json({
            success: true,
            message: "Movimiento de imágenes ejecutado",
            cloudinary: moveResult,
        });
    } catch (error: any) {
        console.error("[forzarMoverImagenesNegocio] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ====== GESTIÓN DE GUÍAS ======

// Obtener todos los guías aprobados con detalle completo
export const obtenerGuiasAprobados = async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection('usuarios').doc('guias').collection('lista').get();
        const guias = await Promise.all(snapshot.docs.map(async (doc) => {
            const data = doc.data();
            // Obtener tours publicados
            let tours: any[] = [];
            try {
                const toursSnap = await db.collection('usuarios').doc('guias')
                    .collection('lista').doc(doc.id).collection('tours_publicados').get();
                tours = toursSnap.docs.map(t => ({ id: t.id, ...t.data() }));
            } catch (_) { /* sin tours */ }

            return {
                id: doc.id,
                uid: data.uid || doc.id,
                nombre: data["01_nombre"] || data.nombre || '',
                apellido: data["02_apellido"] || data.apellido || '',
                correo: data["04_correo"] || data.email || '',
                telefono: data["06_telefono"] || data.telefono || '',
                nacionalidad: data["05_nacionalidad"] || '',
                especialidades: data["07_especialidades"] || [],
                rfc: data["08_rfc"] || '',
                idiomas: data["09_idiomas"] || [],
                codigoPostal: data["10_cp"] || '',
                fotoFrente: data["11_foto_frente"] || '',
                fotoReverso: data["12_foto_reverso"] || '',
                fotoRostro: data["13_foto_rostro"] || '',
                fotoPerfil: data["14_foto_perfil"]?.url || '',
                descripcion: data["15_descripcion"] || '',
                status: data["16_status"] || data.status || 'activo',
                tarifaMxn: data["17_tarifa_mxn"] || 0,
                tarifaDiaCompleto: data["18_tarifa_dia_completo"] || null,
                validacionBiometrica: data["18_validacion_biometrica"] || null,
                biografia: data["19_biografia"] || '',
                calificacion: data.calificacion || 0,
                resenas: data.numeroResenas || 0,
                tours,
                createdAt: data.createdAt || '',
                approvedAt: data.approvedAt || '',
            };
        }));
        return res.json({ success: true, guias });
    } catch (error: any) {
        console.error("[obtenerGuiasAprobados] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Obtener guías pendientes de aprobación con detalle completo
export const obtenerGuiasPendientes = async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection('usuarios').doc('guias').collection('pendientes').get();
        const guias = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                uid: data.uid || doc.id,
                nombre: data["01_nombre"] || data.nombre || '',
                apellido: data["02_apellido"] || data.apellido || '',
                correo: data["04_correo"] || data.email || '',
                telefono: data["06_telefono"] || data.telefono || '',
                nacionalidad: data["05_nacionalidad"] || '',
                especialidades: data["07_especialidades"] || [],
                rfc: data["08_rfc"] || '',
                codigoPostal: data["10_cp"] || '',
                fotoFrente: data["11_foto_frente"] || '',
                fotoReverso: data["12_foto_reverso"] || '',
                fotoRostro: data["13_foto_rostro"] || '',
                fotoPerfil: data["14_foto_perfil"]?.url || '',
                descripcion: data["15_descripcion"] || '',
                status: data["16_status"] || 'en_revision',
                tarifaMxn: data["17_tarifa_mxn"] || 0,
                validacionBiometrica: data["18_validacion_biometrica"] || null,
                createdAt: data.createdAt || '',
            };
        });
        return res.json({ success: true, guias });
    } catch (error: any) {
        console.error("[obtenerGuiasPendientes] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Editar campos de un guía aprobado
export const editarGuia = async (req: Request, res: Response) => {
    const uid = req.params.uid as string;
    if (!uid) {
        return res.status(400).json({ success: false, message: 'UID del guía requerido' });
    }

    try {
        // Buscar el documento del guía por uid
        const snapshot = await db.collection('usuarios').doc('guias')
            .collection('lista').where('uid', '==', uid).limit(1).get();

        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: 'Guía no encontrado' });
        }

        const docRef = snapshot.docs[0]!.ref;
        const { adminUid, ...campos } = req.body;

        // Mapear campos editables a los campos de Firestore
        const fieldMap: Record<string, string> = {
            nombre: '01_nombre',
            apellido: '02_apellido',
            correo: '04_correo',
            telefono: '06_telefono',
            nacionalidad: '05_nacionalidad',
            especialidades: '07_especialidades',
            rfc: '08_rfc',
            idiomas: '09_idiomas',
            codigoPostal: '10_cp',
            descripcion: '15_descripcion',
            tarifaMxn: '17_tarifa_mxn',
            tarifaDiaCompleto: '18_tarifa_dia_completo',
            biografia: '19_biografia',
        };

        const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };

        for (const [key, value] of Object.entries(campos)) {
            const firestoreKey = fieldMap[key];
            if (firestoreKey && value !== undefined) {
                updateData[firestoreKey] = value;
            }
        }

        if (Object.keys(updateData).length <= 1) {
            return res.status(400).json({ success: false, message: 'No se proporcionaron campos válidos para editar' });
        }

        await docRef.update(updateData);

        return res.json({ success: true, message: 'Guía actualizado correctamente' });
    } catch (error: any) {
        console.error("[editarGuia] Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};