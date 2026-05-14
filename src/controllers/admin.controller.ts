import { Request, Response } from 'express';
import { db, auth } from '../config/firebase';
import { getUserNotifications, sendNotificationToUser, updateBusinessNameInNotifications, invalidateNotificationCache } from '../services/notification.service';
import { reorganizeBusinessImages, deleteBusinessFromCloudinary } from '../utils/cloudinaryHelper';
import { emitBusinessStatusChange } from '../socket';

const firstNonEmpty = (...values: any[]): string => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
};

const getCategoryRoute = (category: string): string => {
    const normalized = category.toLowerCase().trim();
    if (normalized.includes('restaurante') || normalized.includes('cafeter') || normalized.includes('gastronom')) return '/gastronomia';
    if (normalized.includes('clubs') || normalized.includes('bar') || normalized.includes('cantina') || normalized.includes('nocturna')) return '/clubs';
    if (normalized.includes('transporte') || normalized.includes('traslado') || normalized.includes('tour')) return '/tours';
    if (normalized.includes('artesanía') || normalized.includes('artesania') || normalized.includes('souvenir')) return '/explora';
    if (normalized.includes('casas de cambio') || normalized.includes('cambio')) return '/casas-cambio';
    if (normalized.includes('cultura') || normalized.includes('museo') || normalized.includes('arte')) return '/cultura';
    if (normalized.includes('fútbol') || normalized.includes('futbol')) return '/futbol';
    if (normalized.includes('evento')) return '/eventos';
    return '/explora';
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

const registrarMovimientoNegocioAdmin = async (payload: {
    negocioId: string;
    accion: string;
    adminUid: string;
    negocioData?: any;
    source?: string;
    reason?: string | null;
    mensaje?: string;
}) => {
    try {
        const negocioData = payload.negocioData || {};
        const business = negocioData?.business || {};
        const nombreNegocio = firstNonEmpty(business?.name, negocioData?.name, "Negocio sin nombre");
        const ownerUid = firstNonEmpty(negocioData?.ownerUid, negocioData?.owner, business?.ownerUid, business?.owner);
        const ownerEmail = firstNonEmpty(negocioData?.ownerEmail, negocioData?.email, business?.email);
        const movementDoc = {
            negocioId: payload.negocioId,
            accion: payload.accion,
            adminUid: payload.adminUid,
            nombreNegocio,
            ownerUid: ownerUid || null,
            ownerEmail: ownerEmail || null,
            source: payload.source || null,
            reason: payload.reason || null,
            mensaje: payload.mensaje || null,
            fecha: new Date().toISOString(),
            tipo: "negocio_movimiento",
        };

        // Nueva estructura modular: negocios/movimientos/items/{id}
        await db
            .collection("negocios")
            .doc("movimientos")
            .collection("items")
            .add(movementDoc);
    } catch (error) {
        console.error("[registrarMovimientoNegocioAdmin] Error:", error);
    }
};

export const obtenerMovimientosNegocios = async (req: Request, res: Response) => {
    try {
        const [nestedSnap, legacySnap] = await Promise.all([
            db
                .collection("negocios")
                .doc("movimientos")
                .collection("items")
                .orderBy("fecha", "desc")
                .limit(500)
                .get(),
            db
                .collection("negocios_movimientos")
                .orderBy("fecha", "desc")
                .limit(500)
                .get(),
        ]);

        const nestedMovimientos = nestedSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const legacyMovimientos = legacySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        const movimientos = [...nestedMovimientos, ...legacyMovimientos]
            .sort((a: any, b: any) => new Date(b?.fecha || 0).getTime() - new Date(a?.fecha || 0).getTime())
            .slice(0, 500);

        return res.json({ success: true, movimientos });
    } catch (error: any) {
        console.error("[obtenerMovimientosNegocios] Error:", error);
        return res.status(500).json({ success: false });
    }
};

export const eliminarMovimientoNegocio = async (req: Request, res: Response) => {
    try {
        const movimientoIdRaw = req.params.movimientoId;
        const movimientoId = typeof movimientoIdRaw === 'string' ? movimientoIdRaw.trim() : '';
        if (!movimientoId) {
            return res.status(400).json({ success: false, message: 'movimientoId requerido' });
        }

        // Frontend may send prefixed IDs like "movlog-<id>".
        const normalizedId = movimientoId.startsWith('movlog-') ? movimientoId.slice('movlog-'.length) : movimientoId;

        const nestedRef = db.collection('negocios').doc('movimientos').collection('items').doc(normalizedId);
        const legacyRef = db.collection('negocios_movimientos').doc(normalizedId);

        const [nestedSnap, legacySnap] = await Promise.all([nestedRef.get(), legacyRef.get()]);

        let deleted = false;
        if (nestedSnap.exists) {
            await nestedRef.delete();
            deleted = true;
        }
        if (legacySnap.exists) {
            await legacyRef.delete();
            deleted = true;
        }

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Movimiento no encontrado' });
        }

        return res.json({ success: true, message: 'Movimiento eliminado' });
    } catch (error: any) {
        console.error('[eliminarMovimientoNegocio] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Obtener negocios archivados Y rechazados (solo admin)
export const obtenerNegociosArchivados = async (req: Request, res: Response) => {
    try {
        // Buscar todos los negocios en la colección 'negocios/Archivados/items'
        const negociosSnap = await db.collection("negocios").doc("Archivados").collection("items").get();
        // Buscar negocios rechazados
        const rechazadosSnap = await db.collection("negocios").doc("Rechazados").collection("items").get();
        
        // Combinar ambas colecciones
        const allDocs = [...negociosSnap.docs, ...rechazadosSnap.docs];
        
        const negocios: Array<Record<string, any>> = await Promise.all(allDocs.map(async (doc) => {
            const data = doc.data();
            const { ownerName, ownerPhoto } = await resolveOwnerInfo(data);
            
            return {
                id: doc.id,
                ...data,
                ownerName: ownerName,
                ownerPhoto: ownerPhoto
            };
        }));
        // Ordenar por fecha de archivo/rechazo más reciente primero
        negocios.sort((a, b) => {
            const dateA = new Date(a.archivedAt || a.rejectedAt || 0).getTime();
            const dateB = new Date(b.archivedAt || b.rejectedAt || 0).getTime();
            return dateB - dateA;
        });
        
        return res.json({ success: true, negocios });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

export const obtenerNegociosRechazados = async (req: Request, res: Response) => {
    try {
        const rechazadosSnap = await db.collection("negocios").doc("Rechazados").collection("items").get();
        const rechazadosLegacySnap = await db.collection("negocios").doc("Archivados").collection("items").get();

        const fromLegacy = rechazadosLegacySnap.docs.filter((doc) => {
            const data = doc.data() || {};
            return Boolean(data?.rejectedAt) || data?.status === "rechazado";
        });

        const merged = [...rechazadosSnap.docs, ...fromLegacy];
        const seen = new Set<string>();

        const negocios = await Promise.all(
            merged
                .filter((doc) => {
                    if (seen.has(doc.id)) return false;
                    seen.add(doc.id);
                    return true;
                })
                .map(async (doc) => {
                    const data = doc.data();
                    const { ownerName, ownerPhoto } = await resolveOwnerInfo(data);
                    return {
                        id: doc.id,
                        ...data,
                        status: "rechazado",
                        ownerName,
                        ownerPhoto,
                    };
                })
        );

        return res.json({ success: true, negocios });
    } catch (error: any) {
        return res.status(500).json({ success: false });
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
        return res.status(500).json({ success: false });
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
        return res.status(500).json({ success: false });
    }
};
// Helper function to find a business in Activos, Pendientes, Archivados or Rechazados
const findBusiness = async (negocioId: string): Promise<{ ref: FirebaseFirestore.DocumentReference, data: any, location: 'Activos' | 'Pendientes' | 'Archivados' | 'Rechazados' } | null> => {
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

    const archivedRef = db.collection("negocios").doc("Archivados").collection("items").doc(negocioId);
    const archivedSnap = await archivedRef.get();
    if (archivedSnap.exists) {
        return { ref: archivedRef as any, data: archivedSnap.data(), location: 'Archivados' };
    }

    const rejectedRef = db.collection("negocios").doc("Rechazados").collection("items").doc(negocioId);
    const rejectedSnap = await rejectedRef.get();
    if (rejectedSnap.exists) {
        return { ref: rejectedRef as any, data: rejectedSnap.data(), location: 'Rechazados' };
    }
    
    return null;
};

// Editar un negocio manualmente por el admin
export const editarNegocio = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    if (!negocioId) negocioId = "";
    const { ...data } = req.body;
    // Compatibilidad: aceptar aliases en español y normalizar a llaves canónicas en inglés.
    if (data.horario !== undefined && data.schedule === undefined) {
        data.schedule = data.horario;
    }
    if (data.costoEstimado !== undefined && data.estimatedCost === undefined) {
        data.estimatedCost = data.costoEstimado;
    }
    if (data.tiempoSugerido !== undefined && data.suggestedStayTime === undefined) {
        data.suggestedStayTime = data.tiempoSugerido;
    }
    if (data.subcategorias !== undefined && data.subcategories === undefined) {
        data.subcategories = data.subcategorias;
    }
    const adminUid = (req as any).user?.uid;

    try {
        const businessResult = await findBusiness(negocioId);
        if (!businessResult) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado" });
        }
        
        const { ref: negocioRef, data: negocioData } = businessResult;
        
        // Actualizar campos permitidos
        const camposEditables = [
            "name",
            "description",
            "category",
            "phone",
            "location",
            "website",
            "rfc",
            "cp",
            "images",
            "schedule",
            "estimatedCost",
            "suggestedStayTime",
            "subcategories"
        ];
        const updateData: any = { updatedAt: new Date().toISOString() };
        for (const campo of camposEditables) {
            if (data[campo] !== undefined) updateData[campo] = data[campo];
        }
        // Propagar también al objeto `business.*` para mantener consistencia
        // con el formato consumido por frontend y por los mapeos de lugares.
        try {
            const existingBusiness = negocioData?.business || {};
            if (typeof existingBusiness === 'object') {
                const businessPatch: any = { ...(existingBusiness || {}) };
                const businessFields = [
                    "name",
                    "description",
                    "category",
                    "phone",
                    "location",
                    "website",
                    "rfc",
                    "cp",
                    "images",
                    "schedule",
                    "estimatedCost",
                    "suggestedStayTime",
                    "subcategories"
                ];

                let touched = false;
                for (const field of businessFields) {
                    if (data[field] !== undefined) {
                        businessPatch[field] = data[field];
                        touched = true;
                    }
                }

                if (touched) {
                    updateData.business = businessPatch;
                }
            }
        } catch (err) {
            console.warn('[editarNegocio] No se pudo propagar business.*', err);
        }
        // Build a safe snapshot of changes to avoid cycles (don't include history itself)
        const changesSnapshot: any = {};
        for (const key of Object.keys(updateData)) {
            if (key === 'history') continue;
            changesSnapshot[key] = updateData[key];
        }
        updateData.history = [
            ...(negocioData?.history || []),
            { action: "editado_admin", date: new Date().toISOString(), by: adminUid, changes: changesSnapshot }
        ];
        await negocioRef.update(updateData);

        // Determinar nuevo nombre y ownerUid actualizados
        const updatedSnap = await negocioRef.get();
        const updatedDoc = updatedSnap.exists ? updatedSnap.data() : negocioData;
        const updatedBusiness = updatedDoc?.business || {};
        const nuevoNombre = updateData.name || updatedBusiness?.name || updatedDoc?.name || "Negocio sin nombre";
        const ownerUid = firstNonEmpty(negocioData?.owner, negocioData?.ownerUid, updatedBusiness?.owner, updatedDoc?.owner);

        // Actualizar notificaciones existentes (owner y admins) para reflejar el nuevo nombre
        try {
            const previousNames: string[] = [];
            const prev1 = negocioData?.business?.name || negocioData?.name || '';
            if (prev1 && typeof prev1 === 'string') previousNames.push(prev1);
            // also include any name present in updatedBusiness before applying updateData
            if (updatedBusiness && updatedBusiness?.name && updatedBusiness?.name !== prev1) {
                previousNames.push(updatedBusiness.name);
            }
            // dedupe
            const uniquePrevNames = Array.from(new Set(previousNames.filter(n => !!n)));
            await updateBusinessNameInNotifications(negocioId, nuevoNombre, ownerUid || undefined, uniquePrevNames);
        } catch (err) {
            console.warn('[editarNegocio] Error actualizando notificaciones con nuevo nombre', err);
        }

        // Notificar al dueño (mensaje con nombre actualizado)
        if (ownerUid) {
            await sendNotificationToUser(ownerUid, {
                tipo: 'negocio_editado',
                titulo: 'Negocio editado por el admin',
                mensaje: `Tu negocio "${nuevoNombre}" ha sido editado por el administrador. Revisa los cambios realizados en tu panel.`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus',
                negocioId
            });
        }
        return res.json({ success: true, message: "Negocio editado y notificado" });
    } catch (error: any) {
        console.error("[editarNegocio] Error:", error);
        return res.status(500).json({ success: false });
    }
};

// Helper function to normalize legacy Cloudinary URLs to the flat negocios/{id} structure
const updateCloudinaryUrls = (data: any): any => {
    const updateData = { ...data };
    const normalizeBusinessUrl = (value: string) => {
        const uploadMatch = value.match(/^(.*\/upload\/(?:v\d+\/)?)(.*)$/);
        if (!uploadMatch) return value;

        const prefix = uploadMatch[1];
        const rest = uploadMatch[2] || "";
        const normalizedRest = rest
            .replace(/^pitzbol\/negocios\/(pendientes|activos|archivados)\//, "pitzbol/negocios/")
            .replace(/^negocios\/(pendientes|activos|archivados)\//, "pitzbol/negocios/")
            .replace(/^negocios\//, "pitzbol/negocios/")
            .replace(/^(pendientes|activos|archivados)\//, "");

        return `${prefix}${normalizedRest}`;
    };
    
    // Update logo URL if it exists
    if (updateData?.logo && typeof updateData.logo === 'string') {
        updateData.logo = normalizeBusinessUrl(updateData.logo);
    }
    
    // Update business logo if it exists
    if (updateData?.business?.logo && typeof updateData.business.logo === 'string') {
        updateData.business.logo = normalizeBusinessUrl(updateData.business.logo);
    }
    
    // Update images array if it exists
    if (Array.isArray(updateData?.images)) {
        updateData.images = updateData.images.map((img: string) => 
            typeof img === 'string' ? normalizeBusinessUrl(img) : img
        );
    }
    
    // Update business images if it exists
    if (Array.isArray(updateData?.business?.images)) {
        updateData.business.images = updateData.business.images.map((img: string) => 
            typeof img === 'string' ? normalizeBusinessUrl(img) : img
        );
    }
    
    return updateData;
};

// Aprobar o rechazar un negocio pendiente
export const gestionarNegocioPendiente = async (req: Request, res: Response) => {
    const { negocioId, accion, motivoRechazo, categoriaEspecial } = req.body;
    const adminUid = (req as any).user?.uid;
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
            const ownerUid = firstNonEmpty(negocioData?.owner, negocioData?.ownerUid, negocioData?.business?.owner);
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
            // Si el admin asignó una categoría especial, sobreescribir la categoría del negocio
            if (categoriaEspecial && ["Fútbol", "Cultura", "Eventos"].includes(categoriaEspecial)) {
                if (updatedData.business) updatedData.business.category = categoriaEspecial;
                else updatedData.category = categoriaEspecial;
            }
            updatedData.history = [
                ...(negocioData?.history || []),
                { action: "aprobado", date: new Date().toISOString(), by: adminUid, approvedAt: new Date().toISOString() }
            ];
            
            // Move from Pendientes to Activos
            await db.collection("negocios").doc("Activos").collection("items").doc(negocioId).set(updatedData);

            // Delete from Pendientes
            await negocioRef.delete();

            // Sync schedule to lugares collection so informacion page can display it
            const businessSchedule = updatedData?.business?.schedule ?? updatedData?.schedule ?? null;
            const businessName = updatedData?.business?.name || updatedData?.name || '';
            if (businessSchedule && businessName) {
                const placeId = businessName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
                try {
                    await db.collection('lugares').doc(placeId).set(
                        { nombre: businessName, horariosJson: JSON.stringify(businessSchedule) },
                        { merge: true }
                    );
                } catch (err) {
                    console.warn('[gestionarNegocioPendiente] No se pudo sincronizar horario a lugares:', err);
                }
            }

            // Asegurar que las notificaciones existentes reflejen el nombre final en caso de que haya cambiado al aprobar
            try {
                const nuevoNombreAprobado = updatedData?.business?.name || updatedData?.name || (negocioData?.business?.name || negocioData?.name || '');
                const prevName = negocioData?.business?.name || negocioData?.name || undefined;
                await updateBusinessNameInNotifications(negocioId, nuevoNombreAprobado, ownerUid || undefined, prevName ? [prevName] : undefined);
            } catch (err) {
                console.warn('[gestionarNegocioPendiente] Error actualizando notificaciones tras aprobación', err);
            }

            await registrarMovimientoNegocioAdmin({
                negocioId,
                accion: "aprobado",
                adminUid,
                negocioData: updatedData,
                source: "pendientes",
                mensaje: `Negocio ${negocioId} aprobado por admin`,
            });
            
            console.log(`[gestionarNegocioPendiente] ✅ Negocio ${negocioId} movido de Pendientes a Activos`);
            
            // Notify owner
            if (ownerUid) {
                const businessName = negocioData?.business?.name || negocioData?.name || '';
                const businessCategory = updatedData?.business?.category || updatedData?.category || negocioData?.business?.category || negocioData?.category || '';
                const isTours = businessCategory === "Transporte / Traslados / Tours";
                const categoryRoute = getCategoryRoute(businessCategory);

                if (isTours) {
                    await sendNotificationToUser(ownerUid, {
                        tipo: 'negocio_aprobado',
                        titulo: 'Empresa verificada',
                        mensaje: `Tu empresa "${businessName}" ha sido verificada por Pitzbol.`,
                        fecha: new Date().toISOString(),
                        leido: false,
                        enlace: `/negocio/transportes/${negocioId}`,
                        negocioId,
                    });
                    await sendNotificationToUser(ownerUid, {
                        tipo: 'tours_empresa_verificada',
                        titulo: 'Ya puedes subir tus tours',
                        mensaje: `Tu empresa de transportes fue verificada. Configura tu perfil y empieza a publicar tours en Pitzbol.`,
                        fecha: new Date().toISOString(),
                        leido: false,
                        enlace: `/negocio/transportes/${negocioId}`,
                        negocioId,
                    });
                } else {
                    await sendNotificationToUser(ownerUid, {
                        tipo: 'negocio_aprobado',
                        titulo: 'Negocio aprobado',
                        mensaje: `Tu negocio "${businessName}" ha sido aprobado y ya es visible para los usuarios.`,
                        fecha: new Date().toISOString(),
                        leido: false,
                        enlace: `/negocio/mis-solicitudes/${negocioId}`,
                        negocioId,
                    });
                    await sendNotificationToUser(ownerUid, {
                        tipo: 'ver_negocio_publicado',
                        titulo: '¿Quieres verlo en vivo?',
                        mensaje: `¿Quieres ver tu negocio @${businessName} publicado?`,
                        fecha: new Date().toISOString(),
                        leido: false,
                        enlace: `${categoryRoute}?highlight=${encodeURIComponent(businessName)}`,
                        negocioId,
                    });
                }

                emitBusinessStatusChange(ownerUid, negocioId, 'aprobado', {
                    businessName: negocioData?.business?.name || negocioData?.name,
                });
            }
            return res.json({
                success: true,
                message: "Negocio aprobado y movido a Activos",
                cloudinary: moveResult,
            });
        } else if (accion === "rechazar") {
            console.log(`[gestionarNegocioPendiente] 🔄 Iniciando rechazo de negocio ${negocioId}`);
            let ownerUid = firstNonEmpty(negocioData?.ownerUid, negocioData?.owner, negocioData?.business?.owner);
            const ownerEmailFromDoc = negocioData?.ownerEmail || negocioData?.email || null;

            // Si ownerUid no está disponible, intentar resolverlo desde Firebase Auth por email
            if (!ownerUid && ownerEmailFromDoc) {
                try {
                    const authUser = await auth.getUserByEmail(ownerEmailFromDoc);
                    ownerUid = authUser.uid;
                    console.log(`[gestionarNegocioPendiente] ✅ ownerUid resuelto desde Auth por email: ${ownerUid}`);
                } catch {
                    console.warn(`[gestionarNegocioPendiente] ⚠️ No se pudo resolver ownerUid desde email: ${ownerEmailFromDoc}`);
                }
            }
            
            const rejectedAt = new Date().toISOString();
            const rechazoMotivo = typeof motivoRechazo === "string" ? motivoRechazo.trim() : "";
            const rejectedData = {
                ...negocioData,
                ownerUid: ownerUid || negocioData?.ownerUid || null, // Asegurar que ownerUid quede guardado
                ownerEmail: ownerEmailFromDoc,                         // Guardar email del dueño para búsquedas
                status: "rechazado",
                rejectedAt,
                rejectedBy: adminUid,
                rejectionReason: rechazoMotivo || null,
                updatedAt: rejectedAt,
                history: [
                    ...(negocioData?.history || []),
                    { action: "rechazado", date: rejectedAt, by: adminUid, reason: rechazoMotivo || null }
                ]
            };

            console.log(`[gestionarNegocioPendiente] 📁 Guardando en negocios/Rechazados/items...`);
            // Move from Pendientes to Rechazados
            await db.collection("negocios").doc("Rechazados").collection("items").doc(negocioId).set(rejectedData);
            console.log(`[gestionarNegocioPendiente] ✅ Guardado en negocios/Rechazados/items`);

            console.log(`[gestionarNegocioPendiente] 🗑️ Eliminando de Pendientes...`);
            // Delete from Pendientes
            await negocioRef.delete();
            console.log(`[gestionarNegocioPendiente] ✅ Eliminado de Pendientes`);

            await registrarMovimientoNegocioAdmin({
                negocioId,
                accion: "rechazado",
                adminUid,
                negocioData: rejectedData,
                source: "pendientes",
                reason: rechazoMotivo || null,
                mensaje: `Negocio ${negocioId} rechazado por admin`,
            });

            console.log(`[gestionarNegocioPendiente] ✅ Negocio ${negocioId} rechazado y movido a Rechazados`);
            
            // Notify owner
            if (ownerUid) {
                const motivoMsg = rechazoMotivo
                    ? ` Motivo compartido por el equipo: ${rechazoMotivo}`
                    : '';
                await sendNotificationToUser(ownerUid, {
                    tipo: 'negocio_rechazado',
                    titulo: 'Actualización de tu solicitud de negocio',
                    mensaje: `Gracias por enviar tu solicitud para "${negocioData?.business?.name || negocioData?.name}". En esta ocasión no fue aprobada.${motivoMsg} Puedes actualizar la información y volver a intentarlo.`,
                    fecha: rejectedAt,
                    leido: false,
                    enlace: `/negocio/mis-solicitudes/${negocioId}`,
                    negocioId,
                    rejectionReason: rechazoMotivo || undefined,
                    rejectedAt,
                });
                
                // Emit explicit business status change event
                emitBusinessStatusChange(ownerUid, negocioId, 'rechazado', {
                    businessName: negocioData?.business?.name || negocioData?.name,
                    rejectionReason: rechazoMotivo || undefined,
                });
            }
            return res.json({ success: true, message: "Negocio rechazado y movido a Rechazados" });
        } else {
            return res.status(400).json({ success: false, message: "Acción no válida" });
        }
    } catch (error: any) {
        console.error("[gestionarNegocioPendiente] Error:", error);
        return res.status(500).json({ success: false });
    }
};
// Archivar (eliminar) un negocio, guardar motivo y notificar al dueño
export const archivarNegocio = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    if (!negocioId) negocioId = "";
    const { motivo } = req.body;
    const adminUid = (req as any).user?.uid;

    try {
        const motivoFinal = typeof motivo === "string" && motivo.trim()
            ? motivo.trim()
            : "Archivado por administrador";

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
            archivedReason: motivoFinal,
            archivedAt: new Date().toISOString(),
            archivedBy: adminUid,
            history: [
                ...(negocioData?.history || []),
                { action: "archivado", date: new Date().toISOString(), by: adminUid, reason: motivoFinal }
            ]
        });
        
        // Delete from current location
        await negocioRef.delete();

        await registrarMovimientoNegocioAdmin({
            negocioId,
            accion: "archivado",
            adminUid,
            negocioData: { ...archiveData, business: archiveData?.business || negocioData?.business, owner: negocioData?.owner },
            source: location,
            reason: motivoFinal,
            mensaje: `Negocio ${negocioId} archivado desde ${location}`,
        });
        
        console.log(`[archivarNegocio] ✅ Negocio ${negocioId} archivado (estaba en ${location})`);
        
        // Notify owner
        const ownerUidArch = firstNonEmpty(negocioData?.owner, negocioData?.ownerUid, negocioData?.business?.owner);
        if (ownerUidArch) {
            const motivoMsg = motivoFinal ? ` Motivo: ${motivoFinal}` : "";
            await sendNotificationToUser(ownerUidArch, {
                tipo: 'negocio_archivado',
                titulo: 'Negocio Archivado',
                mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" ha sido archivado por el administrador.${motivoMsg}`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: `/negocio/mis-solicitudes/${negocioId}`,
                negocioId
            });
            
            // Emit explicit business status change event
            emitBusinessStatusChange(ownerUidArch, negocioId, 'archivado', {
                businessName: negocioData?.business?.name || negocioData?.name,
                reason: motivoFinal,
            });
        }
        return res.json({ success: true, message: "Negocio archivado y notificado" });
    } catch (error: any) {
        console.error("[archivarNegocio] Error:", error);
        return res.status(500).json({ success: false });
    }
};

// Regresar negocio activo a pendientes
export const regresarAPendientes = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    const adminUid = (req as any).user?.uid;
    
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

        await registrarMovimientoNegocioAdmin({
            negocioId,
            accion: "regresado_a_pendientes",
            adminUid,
            negocioData: updatedData,
            source: "activos",
            mensaje: `Negocio ${negocioId} regresado a pendientes`,
        });
        
        console.log(`[regresarAPendientes] ✅ Negocio ${negocioId} movido de Activos a Pendientes`);
        
        // Notify owner
        const ownerUidPend = firstNonEmpty(negocioData?.owner, negocioData?.ownerUid, negocioData?.business?.owner);
        if (ownerUidPend) {
            await sendNotificationToUser(ownerUidPend, {
                tipo: 'negocio_pendiente',
                titulo: 'Negocio en revisión',
                mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" ha sido regresado a revisión por el administrador.`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus',
                negocioId,
            });
            
            // Emit explicit business status change event
            emitBusinessStatusChange(ownerUidPend, negocioId, 'pendiente', {
                businessName: negocioData?.business?.name || negocioData?.name,
            });
        }
        
        return res.json({ success: true, message: "Negocio regresado a pendientes" });
    } catch (error: any) {
        console.error("[regresarAPendientes] Error:", error);
        return res.status(500).json({ success: false });
    }
};

// Desarchivar negocio (mover de archivados a pendientes)
export const desarchivarNegocio = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    const adminUid = (req as any).user?.uid;
    
    if (!negocioId || !adminUid) {
        return res.status(400).json({ success: false, message: "negocioId y adminUid requeridos" });
    }
    
    try {
        const businessResult = await findBusiness(negocioId);
        if (!businessResult || (businessResult.location !== 'Archivados' && businessResult.location !== 'Rechazados')) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado en archivados o rechazados" });
        }

        const { ref: sourceRef, data: negocioData, location } = businessResult;
        
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
        delete pendientesData.rejectionReason;
        delete pendientesData.rejectedAt;
        delete pendientesData.rejectedBy;
        
        // Move to Pendientes
        await db.collection("negocios").doc("Pendientes").collection("items").doc(negocioId).set(pendientesData);
        
        // Delete from original collection
        await sourceRef.delete();

        await registrarMovimientoNegocioAdmin({
            negocioId,
            accion: "desarchivado",
            adminUid,
            negocioData: pendientesData,
            source: location.toLowerCase(),
            mensaje: `Negocio ${negocioId} desarchivado y enviado a pendientes`,
        });
        
        console.log(`[desarchivarNegocio] ✅ Negocio ${negocioId} desarchivado y movido a Pendientes`);
        
        // Notify owner
        const ownerUidDes = firstNonEmpty(negocioData?.owner, negocioData?.ownerUid, negocioData?.business?.owner);
        if (ownerUidDes) {
            await sendNotificationToUser(ownerUidDes, {
                tipo: 'negocio_desarchivado',
                titulo: 'Negocio desarchivado',
                mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" ha sido desarchivado y está en revisión nuevamente.`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/negocio/estatus',
                negocioId,
            });
            
            // Emit explicit business status change event
            emitBusinessStatusChange(ownerUidDes, negocioId, 'pendiente', {
                businessName: negocioData?.business?.name || negocioData?.name,
            });
        }
        
        return res.json({ success: true, message: "Negocio desarchivado exitosamente" });
    } catch (error: any) {
        console.error("[desarchivarNegocio] Error:", error);
        return res.status(500).json({ success: false });
    }
};

// Eliminar permanentemente negocio archivado (Firestore + Cloudinary)
export const eliminarNegocioPermanente = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    const { motivo, reason } = req.body || {};
    const adminUid = (req as any).user?.uid;
    
    if (!negocioId || !adminUid) {
        return res.status(400).json({ success: false, message: "negocioId y adminUid requeridos" });
    }
    
    try {
        const motivoFinal = typeof motivo === 'string' && motivo.trim()
            ? motivo.trim()
            : typeof reason === 'string' && reason.trim()
                ? reason.trim()
                : '';

        const businessResult = await findBusiness(negocioId);
        if (!businessResult || (businessResult.location !== 'Archivados' && businessResult.location !== 'Rechazados')) {
            return res.status(404).json({ success: false, message: "Negocio no encontrado en archivados o rechazados" });
        }

        const { ref: sourceRef, data: negocioData, location } = businessResult;
        
        console.log(`[eliminarNegocioPermanente] 🗑️ Iniciando eliminación permanente de negocio ${negocioId}`);
        
        // Delete from Firestore
        await sourceRef.delete();

        await registrarMovimientoNegocioAdmin({
            negocioId,
            accion: "eliminado_permanente",
            adminUid,
            negocioData,
            source: location.toLowerCase(),
            reason: motivoFinal || null,
            mensaje: `Negocio ${negocioId} eliminado permanentemente de Firestore${motivoFinal ? `. Motivo: ${motivoFinal}` : ''}`,
        });

        // Limpiar Cloudinary en segundo plano para no bloquear el resto de eliminaciones del panel
        void (async () => {
            try {
                const cloudinaryResult = await deleteBusinessFromCloudinary(negocioId);
                console.log(`[eliminarNegocioPermanente] ✅ Cloudinary: ${cloudinaryResult.deleted} eliminados, ${cloudinaryResult.failed} fallidos`);
                if (cloudinaryResult.failed > 0) {
                    console.warn(`[eliminarNegocioPermanente] ⚠️ Algunos archivos de Cloudinary no se pudieron eliminar:`, cloudinaryResult.errors);
                }
            } catch (cloudinaryError) {
                console.error(`[eliminarNegocioPermanente] Error eliminando de Cloudinary:`, cloudinaryError);
            }
        })();

        // Notify owner about permanent deletion (modal flow in frontend)
        let ownerUidDel = firstNonEmpty(
            negocioData?.ownerUid,
            negocioData?.owner,
            negocioData?.business?.ownerUid,
            negocioData?.business?.owner,
            negocioData?.ownerId,
            negocioData?.userId,
            negocioData?.createdBy,
        );

        if (!ownerUidDel) {
            const ownerEmail = firstNonEmpty(
                negocioData?.ownerEmail,
                negocioData?.email,
                negocioData?.business?.ownerEmail,
                negocioData?.business?.email,
            );

            if (ownerEmail) {
                try {
                    const authUser = await auth.getUserByEmail(ownerEmail);
                    ownerUidDel = authUser.uid;
                    console.log(`[eliminarNegocioPermanente] ✅ ownerUid resuelto desde Auth por email: ${ownerUidDel}`);
                } catch (authError) {
                    try {
                        const ownerFromCollections = await getUserFromRoleCollectionsByEmail(ownerEmail);
                        ownerUidDel = firstNonEmpty(
                            ownerFromCollections?.uid,
                            ownerFromCollections?.ownerUid,
                            ownerFromCollections?.userId,
                        );
                        if (ownerUidDel) {
                            console.log(`[eliminarNegocioPermanente] ✅ ownerUid resuelto desde colecciones por email: ${ownerUidDel}`);
                        }
                    } catch (collectionError) {
                        console.warn(`[eliminarNegocioPermanente] ⚠️ No se pudo resolver ownerUid desde email: ${ownerEmail}`);
                    }
                }
            }
        }

        if (ownerUidDel) {
            const motivoMsg = motivoFinal ? ` Motivo: ${motivoFinal}` : '';
            await sendNotificationToUser(ownerUidDel, {
                tipo: 'negocio_eliminado',
                titulo: 'Negocio Eliminado',
                mensaje: `Tu negocio "${negocioData?.business?.name || negocioData?.name}" ha sido eliminado definitivamente por el administrador.${motivoMsg}`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: null,
                negocioId,
                reason: motivoFinal || undefined,
            });

            emitBusinessStatusChange(ownerUidDel, negocioId, 'eliminado', {
                businessName: negocioData?.business?.name || negocioData?.name,
                reason: motivoFinal || undefined,
            });
        } else {
            console.warn(`[eliminarNegocioPermanente] ⚠️ No se pudo resolver el ownerUid para notificar el negocio ${negocioId}`);
        }
        
        console.log(`[eliminarNegocioPermanente] ✅ Negocio ${negocioId} eliminado permanentemente de Firestore`);
        
        return res.json({ 
            success: true, 
            message: "Negocio eliminado permanentemente. La limpieza de Cloudinary continúa en segundo plano.",
            cloudinary: { pending: true }
        });
    } catch (error: any) {
        console.error("[eliminarNegocioPermanente] Error:", error);
        return res.status(500).json({ success: false });
    }
};

// Recibir notificación desde frontend y guardarla para el usuario
export const recibirNotificacion = async (req: any, res: any) => {
    let { userId } = req.params;
    if (Array.isArray(userId)) userId = userId[0];
    if (!userId) userId = "";
    const notificacion = req.body;
    try {
        const tipo = (notificacion?.tipo || '').toString();
        const targetRaw = String(userId || '').trim();

        const adminTypes = new Set([
            'nueva_solicitud_negocio',
            'solicitud_guia_pendiente',
            'soporte_nuevo',
            'contacto',
        ]);

        let targetBucket = targetRaw;

        if (!targetBucket) {
            targetBucket = 'admin';
        } else if (adminTypes.has(tipo) || /^admin$/i.test(targetBucket) || /testadminuid/i.test(targetBucket)) {
            targetBucket = 'admin';
        } else {
            // Si el userId pertenece a un admin real, enrutar al bucket admin
            const adminDoc = await db.collection('usuarios').doc('admins').collection('lista').doc(targetBucket).get();
            if (adminDoc.exists) {
                targetBucket = 'admin';
            }
        }

        await sendNotificationToUser(targetBucket, notificacion);
        return res.json({ success: true });
    } catch (error: any) {
        return res.status(500).json({ success: false });
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
        return res.status(500).json({ message: "Error interno" });
    }
};

const mapGuiaDoc = (doc: FirebaseFirestore.DocumentSnapshot) => {
    const d = doc.data() || {};
    return {
        id: doc.id,
        uid: d.uid || doc.id,
        nombre: d["01_nombre"] || d.nombre || "",
        apellido: d["02_apellido"] || d.apellido || "",
        correo: d["04_correo"] || d.email || "",
        telefono: d["06_telefono"] || d.telefono || "",
        nacionalidad: d["05_nacionalidad"] || "",
        especialidades: d["07_especialidades"] || [],
        rfc: d["08_rfc"] || "",
        idiomas: d["09_idiomas"] || [],
        codigoPostal: d["10_cp"] || "",
        fotoFrente: d["11_foto_frente"] || "",
        fotoReverso: d["12_foto_reverso"] || "",
        fotoRostro: d["13_foto_rostro"] || "",
        fotoPerfil: d["14_foto_perfil"]?.url || "",
        descripcion: d["15_descripcion"] || "",
        status: d["16_status"] || d.status || "pendiente",
        tarifaMxn: d["17_tarifa_mxn"] || 0,
        tarifaDiaCompleto: d["18_tarifa_dia_completo"] || null,
        validacionBiometrica: d["18_validacion_biometrica"] || null,
        biografia: d["19_biografia"] || "",
        calificacion: d.calificacion || 0,
        resenas: d.numeroResenas || 0,
        tours: [],
        createdAt: d.createdAt || "",
        approvedAt: d.approvedAt || "",
    };
};

export const getGuiasAprobados = async (req: any, res: any) => {
    try {
        const snapshot = await db.collection('usuarios').doc('guias').collection('lista').get();
        const guias = snapshot.docs.map(mapGuiaDoc);
        return res.status(200).json({ success: true, guias });
    } catch (error: any) {
        console.error("❌ Error al obtener guías aprobados:", error);
        return res.status(500).json({ success: false, message: "Error interno" });
    }
};

export const getGuiasPendientes = async (req: any, res: any) => {
    try {
        const snapshot = await db.collection('usuarios').doc('guias').collection('pendientes').get();
        const guias = snapshot.docs.map(doc => ({ ...mapGuiaDoc(doc), status: "pendiente" }));
        return res.status(200).json({ success: true, guias });
    } catch (error: any) {
        console.error("❌ Error al obtener guías pendientes:", error);
        return res.status(500).json({ success: false, message: "Error interno" });
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
        return res.status(500).json({ success: false, message: 'Error interno' });
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

        const [newNotifs, legacyNotifs] = await Promise.all([
            getNotifItemsCol(uid as string).get(),
            getLegacyNotifCol(uid as string).get(),
        ]);
        const legacyNestedNotifs = await getLegacyNestedNotifCol(uid as string).get();
        await eliminarDocs(newNotifs);
        await eliminarDocs(legacyNestedNotifs);
        await eliminarDocs(legacyNotifs);

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
        return res.status(500).json({ success: false, message: 'Error al eliminar usuario' });
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
                    perfilPublico: true,
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

            // Notificar al usuario de aprobación
            await sendNotificationToUser(uid, {
                tipo: 'aprobado',
                titulo: '¡Felicidades! 🎉',
                mensaje: 'Tu solicitud para ser Guía Oficial Pitzbol ha sido aprobada.',
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/perfil'
            });

            // Notificar que ya puede subir tours
            const tipoGuia = data?.tipo || "persona";
            const enlaceTours = tipoGuia === "empresa" ? `/negocio/transportes/${uid}` : '/perfil';
            await sendNotificationToUser(uid, {
                tipo: 'tours_guia_verificado',
                titulo: 'Ya puedes subir tus tours',
                mensaje: tipoGuia === "empresa"
                    ? `Tu empresa "${data?.empresaNombre || ''}" ha sido verificada. Accede a tu perfil para publicar tus primeros tours.`
                    : 'Tu perfil ha sido verificado. Ahora puedes publicar tus experiencias desde tu perfil.',
                fecha: new Date().toISOString(),
                leido: false,
                enlace: enlaceTours
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
            success: false
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
            success: false
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
        return res.status(500).json({ success: false });
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

        const notifId = typeof id === 'string' ? id : '';
        const userUid = typeof uid === 'string' ? uid : '';

        const bucketId = resolveNotificationBucket(req, userUid);
        console.log(`📝 Marcando notificación como leída: ${notifId} en bucket ${bucketId}`);

        const docRefs = getNotifCollections(bucketId).map((col) => col.doc(notifId));
        const snaps = await Promise.all(docRefs.map((ref) => ref.get()));

        if (!snaps.some((snap) => snap.exists)) {
            // Notificación solo en localStorage (no en Firestore), ignorar silenciosamente
            console.log(`ℹ️ Notificación ${id} no encontrada en Firestore (puede ser local)`);
            return res.json({ success: true, message: "Notificación no encontrada en Firestore" });
        }

        await Promise.all(
            docRefs.map(async (ref, idx) => {
                const snap = snaps[idx];
                if (snap?.exists) {
                    await ref.update({ leido: true });
                }
            })
        );
        invalidateNotificationCache(bucketId);
        console.log(`✅ Notificación marcada como leída`);
        return res.json({ success: true, message: "Notificación marcada como leída" });

    } catch (error: any) {
        console.error("❌ Error al marcar notificación:", error);
        res.status(500).json({ success: false });
    }
};

export const eliminarNotificacion = async (req: Request, res: Response) => {
    let { id, uid } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (Array.isArray(uid)) uid = uid[0];

    if (!uid) {
        const bodyUid = (req.body?.uid || req.query?.uid || '').toString();
        uid = bodyUid || uid;
    }

    try {
        if (!id) {
            return res.status(400).json({ success: false, message: "ID requerido" });
        }

        if (!uid) {
            return res.status(400).json({ success: false, message: "UID e ID requeridos" });
        }

        const notifId = typeof id === 'string' ? id : '';
        const userUid = typeof uid === 'string' ? uid : '';

        const bucketId = resolveNotificationBucket(req, userUid);
        console.log(`🗑️ Eliminando notificación: ${notifId} en bucket ${bucketId}`);

        const docRefs = getNotifCollections(bucketId).map((col) => col.doc(notifId));
        const snaps = await Promise.all(docRefs.map((ref) => ref.get()));

        if (!snaps.some((snap) => snap.exists)) {
            return res.status(404).json({ success: false, message: "Notificación no encontrada" });
        }

        await Promise.all(
            docRefs.map(async (ref, idx) => {
                const snap = snaps[idx];
                if (snap?.exists) {
                    await ref.delete();
                }
            })
        );
        invalidateNotificationCache(bucketId);
        console.log(`✅ Notificación eliminada`);
        return res.json({ success: true, message: "Notificación eliminada" });

    } catch (error: any) {
        console.error("❌ Error al eliminar notificación:", error);
        res.status(500).json({ success: false });
    }
};

export const limpiarNotificacionesUsuario = async (req: Request, res: Response) => {
    let { uid } = req.params;
    if (Array.isArray(uid)) uid = uid[0];

    try {
        if (!uid) {
            return res.status(400).json({ success: false, message: "UID requerido" });
        }

        const bucketId = resolveNotificationBucket(req, uid);
        console.log(`🗑️ Limpiando todas las notificaciones del bucket: ${bucketId}`);

        const [newSnapshot, legacySnapshot, legacyNestedSnapshot] = await Promise.all([
            getNotifItemsCol(bucketId).get(),
            getLegacyNotifCol(bucketId).get(),
            getLegacyNestedNotifCol(bucketId).get(),
        ]);
        const batch = db.batch();

        newSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        legacySnapshot.docs
            .filter((doc) => doc.id !== 'items')
            .forEach(doc => {
            batch.delete(doc.ref);
        });

        legacyNestedSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        invalidateNotificationCache(bucketId);
        console.log(`✅ Notificaciones del usuario limpiadas`);
        
        return res.json({ success: true, message: "Todas las notificaciones han sido eliminadas" });

    } catch (error: any) {
        console.error("❌ Error al limpiar notificaciones:", error);
        res.status(500).json({ success: false });
    }
};

export const obtenerNotificacionesUsuario = async (req: Request, res: Response) => {
    let { uid } = req.params;
    if (Array.isArray(uid)) uid = uid[0];

    try {
        if (!uid) {
            return res.status(400).json({ success: false, message: "UID requerido" });
        }

        const bucketId = resolveNotificationBucket(req, uid);
        console.log(`🔍 Obteniendo notificaciones para bucket: ${bucketId}`);

        const notificaciones = await getUserNotifications(bucketId);

        console.log(`✅ Se obtuvieron ${notificaciones.length} notificaciones`);
        return res.json({ success: true, notificaciones });

    } catch (error: any) {
        console.error("❌ Error al obtener notificaciones:", error);

        if (error?.code === 8 || /quota exceeded/i.test(error?.message || "")) {
            return res.status(200).json({
                success: true,
                notificaciones: [],
            });
        }

        res.status(500).json({ 
            success: false
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
        return res.status(500).json({ success: false });
    }
};

// Endpoint auxiliar: Forzar actualización de notificaciones relacionadas a un negocio
export const actualizarNotificacionesNegocio = async (req: Request, res: Response) => {
    let { negocioId } = req.params;
    if (Array.isArray(negocioId)) negocioId = negocioId[0];
    if (!negocioId) return res.status(400).json({ success: false, message: 'negocioId requerido' });

    try {
        // Intentar obtener nombre del negocio si no se proporciona en body
        const providedName = req.body?.newName;
        let nameToUse = providedName;

        if (!nameToUse) {
            const found = await findBusiness(negocioId);
            if (found && found.data) {
                nameToUse = found.data?.business?.name || found.data?.name || '';
            }
        }

        if (!nameToUse) {
            return res.status(400).json({ success: false, message: 'No se pudo determinar el nombre del negocio. Proporciona newName en el body.' });
        }

        const ownerUid = req.body?.ownerUid || undefined;
        await updateBusinessNameInNotifications(negocioId, nameToUse, ownerUid);

        return res.json({ success: true, message: 'Notificaciones actualizadas' });
    } catch (err: any) {
        console.error('[actualizarNotificacionesNegocio] Error:', err);
        return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
};

const getNotifItemsCol = (bucketId: string) =>
    db.collection('usuarios').doc('notificaciones').collection(bucketId);

const getLegacyNotifCol = (bucketId: string) =>
    db.collection('usuarios').doc('notificaciones').collection(bucketId);

const getLegacyNestedNotifCol = (bucketId: string) =>
    db.collection('usuarios').doc('notificaciones').collection(bucketId).doc('items').collection('items');

const getNotifCollections = (bucketId: string) => {
    const refs = [
        getNotifItemsCol(bucketId),
        getLegacyNotifCol(bucketId),
        getLegacyNestedNotifCol(bucketId),
    ];

    const deduped = new Map<string, FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>>();
    refs.forEach((ref) => deduped.set(ref.path, ref));
    return Array.from(deduped.values());
};

const resolveNotificationBucket = (req: Request, uid: string) => {
    const requestUser = (req as any)?.user || {};
    const requestUid = (requestUser?.uid || '').toString();
    const role = (requestUser?.role || '').toString().toLowerCase();
    if (uid === 'admin') return 'admin';
    if (role === 'admin' && (!uid || uid === requestUid)) return 'admin';
    return uid;
};