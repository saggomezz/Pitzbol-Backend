import { Request as ExpressRequest, Response } from "express";

// Extender la interfaz Request para incluir user
interface RequestWithUser extends ExpressRequest {
  user?: {
    uid: string;
    email?: string;
    [key: string]: any;
  };
}
import { auth, db } from "../config/firebase";
import admin from "firebase-admin";
import { sendNotificationToAdmins, sendNotificationToUser } from "../services/notification.service";
import { emitNewPendingBusiness } from "../socket";
import { v2 as cloudinary } from 'cloudinary';
// Configuración de Cloudinary (puedes mover esto a un archivo de config si lo prefieres)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

const parseOptionalJson = <T>(value: unknown): T | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const parseSubcategories = (value: unknown): string[] => {
  const parsed = parseOptionalJson<unknown>(value);
  const baseArray = Array.isArray(parsed)
    ? parsed
    : typeof value === "string"
    ? value.split(",")
    : [];

  const normalized = baseArray
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 10);

  return Array.from(new Set(normalized));
};
// Nuevo endpoint para registro de negocio con imágenes
// Endpoint para validar unicidad de datos del negocio
export const validateBusinessUniqueness = async (req: RequestWithUser, res: Response) => {
  try {
    const { businessName, email, phone, website, location, rfc, cp, excludeBusinessId } = req.body;
    const excludedId = typeof excludeBusinessId === "string" ? excludeBusinessId.trim() : "";
    const isExcludedDoc = (docId: string) => excludedId !== "" && docId === excludedId;
    
    const errors: { [key: string]: string } = {};

    // Verificar nombre del negocio en negocios aprobados
    if (businessName) {
      const negociosSnapshot = await db.collection("negocios").doc("Activos").collection("items").get();
      const nombreExiste = negociosSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.name?.toLowerCase() === businessName.toLowerCase()
      );
      
      if (nombreExiste) {
        errors.businessName = "Este nombre de negocio ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const nombrePendiente = pendientesSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.name?.toLowerCase() === businessName.toLowerCase()
      );
      
      if (nombrePendiente) {
        errors.businessName = "Este nombre de negocio ya tiene una solicitud pendiente";
      }
    }

    // Verificar correo electrónico
    if (email) {
      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const emailPendiente = pendientesSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().email?.toLowerCase() === email.toLowerCase()
      );
      
      if (emailPendiente) {
        errors.email = "Este correo ya tiene una solicitud pendiente";
      }
    }

    // Verificar teléfono
    if (phone) {
      const negociosSnapshot = await db.collection("negocios").doc("Activos").collection("items").get();
      const telefonoExiste = negociosSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.phone === phone
      );
      
      if (telefonoExiste) {
        errors.phone = "Este teléfono ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const telefonoPendiente = pendientesSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.phone === phone
      );
      
      if (telefonoPendiente) {
        errors.phone = "Este teléfono ya tiene una solicitud pendiente";
      }
    }

    // Verificar sitio web
    if (website) {
      const negociosSnapshot = await db.collection("negocios").doc("Activos").collection("items").get();
      const sitioWebExiste = negociosSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.website?.toLowerCase() === website.toLowerCase()
      );
      
      if (sitioWebExiste) {
        errors.website = "Este sitio web ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const sitioWebPendiente = pendientesSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.website?.toLowerCase() === website.toLowerCase()
      );
      
      if (sitioWebPendiente) {
        errors.website = "Este sitio web ya tiene una solicitud pendiente";
      }
    }

    // Verificar ubicación
    if (location) {
      const negociosSnapshot = await db.collection("negocios").doc("Activos").collection("items").get();
      const ubicacionExiste = negociosSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.location?.toLowerCase() === location.toLowerCase()
      );
      
      if (ubicacionExiste) {
        errors.location = "Esta ubicación ya está registrada";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const ubicacionPendiente = pendientesSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.location?.toLowerCase() === location.toLowerCase()
      );
      
      if (ubicacionPendiente) {
        errors.location = "Esta ubicación ya tiene una solicitud pendiente";
      }
    }

    // Verificar RFC
    if (rfc) {
      const negociosSnapshot = await db.collection("negocios").doc("Activos").collection("items").get();
      const rfcExiste = negociosSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.rfc?.toUpperCase() === rfc.toUpperCase()
      );
      
      if (rfcExiste) {
        errors.rfc = "Este RFC ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const rfcPendiente = pendientesSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.rfc?.toUpperCase() === rfc.toUpperCase()
      );
      
      if (rfcPendiente) {
        errors.rfc = "Este RFC ya tiene una solicitud pendiente";
      }
    }

    // Verificar Código Postal
    if (cp) {
      const negociosSnapshot = await db.collection("negocios").doc("Activos").collection("items").get();
      const cpExiste = negociosSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.cp === cp
      );
      
      if (cpExiste) {
        errors.cp = "Este código postal ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const cpPendiente = pendientesSnapshot.docs.some(doc =>
        !isExcludedDoc(doc.id) &&
        doc.data().business?.cp === cp
      );
      
      if (cpPendiente) {
        errors.cp = "Este código postal ya tiene una solicitud pendiente";
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ valid: false, errors });
    }

    return res.status(200).json({ valid: true, message: "Datos disponibles" });
  } catch (error: any) {
    console.error("Error validateBusinessUniqueness:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const registerBusinessWithImages = async (req: RequestWithUser, res: Response) => {
  try {
    const {
      businessName,
      category,
      phone,
      location,
      website,
      rfc,
      cp,
      description,
      email,
      latitud,
      longitud,
      schedule,
      estimatedCost,
      suggestedStayTime,
      subcategories,
      solicitaRevisionAdmin
    } = req.body;

    console.log("[registerBusinessWithImages] Body recibido:", req.body);
    console.log("[registerBusinessWithImages] 📍 Coordenadas recibidas:", { latitud, longitud });
    console.log("[registerBusinessWithImages] Files recibidos:", req.files);

    // Validar que los campos obligatorios estén presentes
    if (!businessName || !email || !rfc || !cp || !category || !phone || !location || !website || !description) {
      const missingFields = [];
      if (!businessName) missingFields.push("businessName");
      if (!email) missingFields.push("email");
      if (!rfc) missingFields.push("rfc");
      if (!cp) missingFields.push("cp");
      if (!category) missingFields.push("category");
      if (!phone) missingFields.push("phone");
      if (!location) missingFields.push("location");
      if (!website) missingFields.push("website");
      if (!description) missingFields.push("description");
      console.log("[registerBusinessWithImages] Campos faltantes:", missingFields);
      return res.status(400).json({ 
        message: "Datos incompletos. Verifica todos los campos obligatorios.",
        missingFields 
      });
    }

    const parsedSchedule = parseOptionalJson<Record<string, any>>(schedule);
    const parsedSubcategories = parseSubcategories(subcategories);
    const parsedSuggestedStayTime = Number(suggestedStayTime);

    // Generar un UID para el negocio (sin crear usuario en Firebase Auth)
    // El email de contacto se guarda como campo del negocio, no como credencial de usuario
    const uid = db.collection("negocios").doc().id;

    console.log("[registerBusinessWithImages] UID generado para negocio:", uid);

    // Procesar logo y otras imágenes
    let imageUrls: string[] = [];
    let logoUrl = "";
    // req.files es un objeto: { logo: [File], images: [File, ...] }
    let logoFile = null;
    // Tipar req.files como un objeto con campos string: File[]
    const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    
    console.log("[registerBusinessWithImages] Contenido detallado de req.files:");
    if (filesObj) {
      console.log("[registerBusinessWithImages] Keys de filesObj:", Object.keys(filesObj));
      console.log("[registerBusinessWithImages] Logo files:", filesObj['logo']);
      console.log("[registerBusinessWithImages] Images files:", filesObj['images']);
    } else {
      console.log("[registerBusinessWithImages] filesObj es undefined");
    }
    
    if (filesObj && Array.isArray(filesObj['logo']) && filesObj['logo'][0]) {
      logoFile = filesObj['logo'][0];
    }
    if (!logoFile) {
      return res.status(400).json({ message: "El logo del negocio es obligatorio." });
    }
    // Subir logo a Cloudinary con estructura plana: pitzbol/negocios/{uid}/logo
    logoUrl = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: `pitzbol/negocios/${uid}/logo`,
        resource_type: 'image',
      }, (error, result) => {
        if (error) return reject(error);
        if (result && result.secure_url) return resolve(result.secure_url);
        return reject(new Error('No se pudo obtener la URL del logo desde Cloudinary.'));
      });
      stream.end(logoFile.buffer);
    });
    // Subir imágenes (campo 'images') con estructura plana: pitzbol/negocios/{uid}/galeria
    if (filesObj && Array.isArray(filesObj['images'])) {
      for (const file of filesObj['images']) {
        const url = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({
            folder: `pitzbol/negocios/${uid}/galeria`,
            resource_type: 'image',
          }, (error, result) => {
            if (error) return reject(error);
            if (result && result.secure_url) return resolve(result.secure_url);
            return reject(new Error('No se pudo obtener la URL de la imagen desde Cloudinary.'));
          });
          stream.end(file.buffer);
        });
        imageUrls.push(url as string);
      }
    }

    // Guardar negocio en Firestore
    const ownerUid = req.body?.ownerUid as string | undefined;
    console.log(`[registerBusinessWithImages] ownerUid recibido: ${ownerUid}`);
    
    const businessData = {
      uid,
      email: email || '',
      role: "BUSINESS",
      status: "PENDING",
      ownerUid: ownerUid || null, // Guardar el UID del dueño
      business: {
        name: businessName,
        category,
        phone,
        location,
        website,
        rfc,
        cp,
        description: description || "",
        schedule: parsedSchedule || null,
        estimatedCost: typeof estimatedCost === "string" ? estimatedCost.trim() : "",
        suggestedStayTime: Number.isFinite(parsedSuggestedStayTime) ? parsedSuggestedStayTime : null,
        subcategories: parsedSubcategories,
        images: imageUrls,
        logo: logoUrl,
        owner: ownerUid || uid,
        latitud: latitud || null,
        longitud: longitud || null,
        solicitaRevisionAdmin: solicitaRevisionAdmin === "true" || solicitaRevisionAdmin === true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    };
    
    console.log(`[registerBusinessWithImages] 💾 Guardando en Firestore con coordenadas:`, {
      latitud: businessData.business.latitud,
      longitud: businessData.business.longitud
    });
    
    await db.collection("negocios").doc("Pendientes").collection("items").doc(uid).set(businessData);

    // Emitir evento Socket.io a todos los clientes para notificar nuevo negocio pendiente
    emitNewPendingBusiness(uid, businessName);

    // Notificar a los administradores de nueva solicitud de negocio
    await sendNotificationToAdmins({
      tipo: 'nueva_solicitud_negocio',
      titulo: 'Nueva solicitud de negocio',
      mensaje: `Se ha recibido una nueva solicitud de negocio: ${businessName}`,
      fecha: new Date().toISOString(),
      leido: false,
      enlace: `/admin/negocios/${uid}`,
      negocioId: uid,
    });

    // Notificar al usuario si tiene ownerUid
    if (ownerUid) {
      console.log(`[registerBusinessWithImages] Enviando notificación a usuario ${ownerUid}`);
      const notificacion = {
        tipo: 'solicitud_negocio_enviada',
        titulo: 'Solicitud enviada',
        mensaje: `Tu negocio "${businessName}" fue enviado a revision.`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: `/negocio/mis-solicitudes/${uid}`,
        negocioId: uid,
      };
      console.log(`[registerBusinessWithImages] Contenido de notificación:`, JSON.stringify(notificacion, null, 2));
      await sendNotificationToUser(ownerUid, notificacion);
      console.log(`[registerBusinessWithImages] ✅ Notificación enviada exitosamente`);
    } else {
      console.log(`[registerBusinessWithImages] ⚠️ No se envió notificación porque no se proporcionó ownerUid`);
    }

    return res.status(201).json({
      message: "Negocio registrado correctamente. Por favor, inicia sesión con tus credenciales.",
      uid: uid,
    });
  } catch (error: any) {
    console.error("Error registerBusinessWithImages:", error);
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ message: "Correo ya registrado" });
    }
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};


export const registerBusiness = async (req: RequestWithUser, res: Response) => {
  try {
    const {
      businessName,
      category,
      phone,
      location,
      website,
      rfc,
      cp,
      email,
      password,
      images,
      description
    } = req.body;

    // Validar que los campos obligatorios estén presentes
    if (!businessName || !email || !password || !rfc || !cp || !category || !phone) {
      return res.status(400).json({ message: "Datos incompletos. Verifica todos los campos obligatorios." });
    }

    try {
      // Crear usuario en Firebase Auth
      const userRecord = await auth.createUser({
        email: email,
        password: password,
      });

      const uid = userRecord.uid;

      // Crear claims personalizados para el rol de negocio
      await auth.setCustomUserClaims(uid, { role: "BUSINESS" });

      // Guardar negocio en Firestore en colección Pendientes
      await db.collection("negocios").doc("Pendientes").collection("items").doc(uid).set({
        uid: uid,
        email: email,
        role: "BUSINESS",
        status: "PENDING",
        business: {
          name: businessName,
          category,
          phone,
          location,
          website,
          rfc,
          cp,
          description: description || "",
          images: images || [],
          owner: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });

      // Emitir evento Socket.io a todos los clientes para notificar nuevo negocio pendiente
      emitNewPendingBusiness(uid, businessName);

      // Notificar a los administradores de nueva solicitud de negocio
      await sendNotificationToAdmins({
        tipo: 'nueva_solicitud_negocio',
        titulo: 'Nueva solicitud de negocio',
        mensaje: `Se ha recibido una nueva solicitud de negocio: ${businessName}`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: `/admin/negocios/${uid}`,
        negocioId: uid,
      });

      // Notificar al usuario dueño de la solicitud
      await sendNotificationToUser(uid, {
        tipo: 'solicitud_negocio_enviada',
        titulo: 'Solicitud enviada',
        mensaje: `Tu negocio "${businessName}" fue enviado a revision.`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: `/negocio/mis-solicitudes/${uid}`,
        negocioId: uid,
      });

      return res.status(201).json({
        message: "Negocio registrado correctamente. Por favor, inicia sesión con tus credenciales.",
        uid: uid,
      });
    } catch (authError: any) {
      console.error("Error en Firebase Auth:", authError);
      if (authError.code === "auth/email-already-exists") {
        return res.status(400).json({ message: "Este correo electrónico ya está registrado." });
      }
      if (authError.code === "auth/invalid-password") {
        return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
      }
      throw authError;
    }
  } catch (error: any) {
    console.error("Error registerBusiness:", error);
    return res.status(500).json({ message: "Error al registrar el negocio. Intenta de nuevo más tarde." });
  }
};

// Obtener datos del negocio del usuario autenticado
export const getMyBusiness = async (req: RequestWithUser, res: Response) => {
  try {
    const userEmail = req.user?.email as string | undefined;
    const userUid = req.user?.uid as string | undefined;
    
    if (!userEmail && !userUid) {
      return res.status(400).json({ success: false, message: "No se encontró información del usuario" });
    }

    console.log(`[getMyBusiness] Buscando negocio para uid: ${userUid}, email: ${userEmail}`);

    // PRIORIDAD 1: Buscar por ownerUid en Pendientes
    if (userUid) {
      const pendientesSnapByUid = await db
        .collection("negocios")
        .doc("Pendientes")
        .collection("items")
        .where("ownerUid", "==", userUid)
        .limit(1)
        .get();

      if (!pendientesSnapByUid.empty) {
        const docSnap = pendientesSnapByUid.docs[0];
        if (docSnap) {
          const data = docSnap.data();
          const createdAt = data.business?.createdAt
            ? new Date((data.business.createdAt?.seconds || 0) * 1000).toISOString()
            : new Date().toISOString();

          console.log(`[getMyBusiness] ✅ Negocio encontrado en Pendientes por ownerUid`);
          console.log(`[getMyBusiness] 📍 Coordenadas en documento:`, {
            latitud: data.business?.latitud,
            longitud: data.business?.longitud
          });
          
          return res.json({
            success: true,
            business: {
              id: docSnap.id,
              ...data,
              business: {
                ...data.business,
                createdAt
              }
            }
          });
        }
      }
    }

    // PRIORIDAD 2: Buscar por email en Pendientes (fallback)
    const pendientesSnap = await db
      .collection("negocios")
      .doc("Pendientes")
      .collection("items")
      .where("email", "==", userEmail)
      .limit(1)
      .get();

    if (!pendientesSnap.empty) {
      const docSnap = pendientesSnap.docs[0];
      if (!docSnap) {
        return res.status(500).json({ success: false, message: "Documento de negocio pendiente no encontrado" });
      }
      const data = docSnap.data();
      const createdAt = data.business?.createdAt
        ? new Date((data.business.createdAt?.seconds || 0) * 1000).toISOString()
        : new Date().toISOString();

      console.log(`[getMyBusiness] ✅ Negocio encontrado en Pendientes por email`);
      return res.json({
        success: true,
        business: {
          id: docSnap.id,
          ...data,
          business: {
            ...data.business,
            createdAt
          }
        }
      });
    }

    // PRIORIDAD 3: Buscar por ownerUid en Activos (aprobados)
    if (userUid) {
      const businessSnapByUid = await db
        .collection("negocios")
        .doc("Activos")
        .collection("items")
        .where("ownerUid", "==", userUid)
        .limit(1)
        .get();

      if (!businessSnapByUid.empty) {
        const docSnap = businessSnapByUid.docs[0];
        if (docSnap) {
          const data = docSnap.data();
          const createdAt = data.business?.createdAt
            ? new Date((data.business.createdAt?.seconds || 0) * 1000).toISOString()
            : new Date().toISOString();

          console.log(`[getMyBusiness] ✅ Negocio encontrado en Business por ownerUid`);
          return res.json({
            success: true,
            business: {
              id: docSnap.id,
              ...data,
              business: {
                ...data.business,
                createdAt
              }
            }
          });
        }
      }
    }

    // PRIORIDAD 4: Buscar por email en Activos (aprobados)
    const businessSnap = await db
      .collection("negocios")
      .doc("Activos")
      .collection("items")
      .where("email", "==", userEmail)
      .limit(1)
      .get();

    if (!businessSnap.empty) {
      const docSnap = businessSnap.docs[0];
      if (!docSnap) {
        return res.status(500).json({ success: false, message: "Documento de negocio aprobado no encontrado" });
      }
      const data = docSnap.data();
      const createdAt = data.business?.createdAt
        ? new Date((data.business.createdAt?.seconds || 0) * 1000).toISOString()
        : new Date().toISOString();

      return res.json({
        success: true,
        business: {
          id: docSnap.id,
          ...data,
          business: {
            ...data.business,
            createdAt
          }
        }
      });
    }

    // PRIORIDAD 5: Buscar por ownerUid en archivados
    if (userUid) {
      const archivedSnapByUid = await db
        .collection("negocios")
        .doc("Archivados")
        .collection("items")
        .where("ownerUid", "==", userUid)
        .limit(1)
        .get();

      if (!archivedSnapByUid.empty) {
        const docSnap = archivedSnapByUid.docs[0];
        if (docSnap) {
          const data = docSnap.data();
          const createdAt = data.business?.createdAt
            ? new Date((data.business.createdAt?.seconds || 0) * 1000).toISOString()
            : new Date().toISOString();

          console.log(`[getMyBusiness] ✅ Negocio encontrado en archivados por ownerUid`);
          return res.json({
            success: true,
            business: {
              id: docSnap.id,
              ...data,
              business: {
                ...data.business,
                createdAt
              }
            }
          });
        }
      }
    }

    // PRIORIDAD 6: Buscar por email en archivados (fallback)
    const archivedSnap = await db
      .collection("negocios")
      .doc("Archivados")
      .collection("items")
      .where("email", "==", userEmail)
      .limit(1)
      .get();

    if (!archivedSnap.empty) {
      const docSnap = archivedSnap.docs[0];
      if (!docSnap) {
        return res.status(500).json({ success: false, message: "Documento de negocio archivado no encontrado" });
      }
      const data = docSnap.data();
      const createdAt = data.business?.createdAt
        ? new Date((data.business.createdAt?.seconds || 0) * 1000).toISOString()
        : new Date().toISOString();

      return res.json({
        success: true,
        business: {
          id: docSnap.id,
          ...data,
          business: {
            ...data.business,
            createdAt
          }
        }
      });
    }

    console.log(`[getMyBusiness] ❌ No se encontró ningún negocio para uid: ${userUid}, email: ${userEmail}`);
    return res.status(404).json({ success: false, message: "No tienes un negocio registrado" });

  } catch (error: any) {
    console.error("Error getMyBusiness:", error);
    return res.status(500).json({ success: false });
  }
};

// Repara docs huérfanos (ownerUid == null) asociándoles el UID del usuario autenticado
const repairOrphanedDocs = async (docs: admin.firestore.QueryDocumentSnapshot[], ownerUid: string) => {
  for (const doc of docs) {
    const data = doc.data();
    if (!data.ownerUid && ownerUid) {
      try {
        await doc.ref.update({ ownerUid });
        console.log(`[repairOrphanedDocs] ✅ Reparado doc ${doc.id} con ownerUid: ${ownerUid}`);
      } catch (e) {
        console.warn(`[repairOrphanedDocs] ⚠️ No se pudo reparar doc ${doc.id}:`, e);
      }
    }
  }
};

// Helper para mapear doc de cualquier colección
const mapSolicitudDoc = (
  doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot,
  estado: string
) => {
  const data = doc.data() || {};
  const createdAt = data?.business?.createdAt
    ? new Date((data.business.createdAt?.seconds || 0) * 1000).toISOString()
    : data?.createdAt
    ? new Date((data.createdAt?.seconds || 0) * 1000).toISOString()
    : null;
  return {
    id: doc.id,
    estado,
    email: data.email || data.ownerEmail || data.business?.email || null,
    ownerUid: data.ownerUid || data.owner || null,
    business: {
      ...data.business,
      createdAt,
      // campos planos como fallback para negocios registrados con registerBusiness
      name: data.business?.name || data.businessName || null,
      category: data.business?.category || data.category || null,
      phone: data.business?.phone || data.phone || null,
      location: data.business?.location || data.location || null,
      description: data.business?.description || data.description || null,
      logo: data.business?.logo || data.logo || null,
      images: data.business?.images || data.images || [],
    },
    rejectedAt: data.rejectedAt || null,
    rejectionReason: data.rejectionReason || null,
    archivedAt: data.archivedAt || null,
  };
};

export const getMyBusinessRequests = async (req: RequestWithUser, res: Response) => {
  try {
    const userUid = req.user?.uid;
    const userEmail = req.user?.email;

    if (!userUid) {
      return res.status(401).json({ success: false, message: "No autenticado" });
    }

    console.log(`[getMyBusinessRequests] uid: ${userUid}, email: ${userEmail}`);

    const collectionsMap: { ref: admin.firestore.CollectionReference; estado: string }[] = [
      { ref: db.collection("negocios").doc("Pendientes").collection("items"), estado: "pendiente" },
      { ref: db.collection("negocios").doc("Activos").collection("items"),    estado: "aprobado"  },
      { ref: db.collection("negocios").doc("Archivados").collection("items"), estado: "archivado" },
      { ref: db.collection("negocios").doc("Rechazados").collection("items"), estado: "rechazado" },
    ];

    const results: any[] = [];
    const seen = new Set<string>();

    for (const { ref, estado } of collectionsMap) {
      // 1. Buscar por ownerUid
      const byUid = await ref.where("ownerUid", "==", userUid).get();
      for (const doc of byUid.docs) {
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          const mapped = mapSolicitudDoc(doc, estado);
          results.push(mapped);
        }
      }

      // 2. Buscar por owner (campo alternativo)
      const byOwner = await ref.where("owner", "==", userUid).get();
      for (const doc of byOwner.docs) {
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          const mapped = mapSolicitudDoc(doc, estado);
          results.push(mapped);
        }
      }

      // 3. Buscar por ownerEmail
      if (userEmail) {
        const byEmail = await ref.where("ownerEmail", "==", userEmail).get();
        const orphans: admin.firestore.QueryDocumentSnapshot[] = [];
        for (const doc of byEmail.docs) {
          if (!seen.has(doc.id)) {
            seen.add(doc.id);
            orphans.push(doc);
            const mapped = mapSolicitudDoc(doc, estado);
            results.push(mapped);
          }
        }
        await repairOrphanedDocs(orphans, userUid);

        // 4. Buscar por email plano
        const byEmailPlain = await ref.where("email", "==", userEmail).get();
        const orphans2: admin.firestore.QueryDocumentSnapshot[] = [];
        for (const doc of byEmailPlain.docs) {
          if (!seen.has(doc.id)) {
            seen.add(doc.id);
            orphans2.push(doc);
            const mapped = mapSolicitudDoc(doc, estado);
            results.push(mapped);
          }
        }
        await repairOrphanedDocs(orphans2, userUid);
      }
    }

    console.log(`[getMyBusinessRequests] ✅ ${results.length} solicitudes encontradas`);
    return res.json({ success: true, solicitudes: results });

  } catch (error: any) {
    console.error("Error getMyBusinessRequests:", error);
    return res.status(500).json({ success: false });
  }
};

const mapBusinessDoc = (docSnap: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot) => {
  const data = docSnap.data();
  const createdAt = data?.business?.createdAt
    ? new Date((data.business.createdAt?.seconds || 0) * 1000).toISOString()
    : new Date().toISOString();

  return {
    id: docSnap.id,
    ...data,
    business: {
      ...data?.business,
      createdAt,
    },
  };
};

// Helper function para obtener datos del propietario
const getOwnerData = async (ownerUid: string | undefined) => {
  if (!ownerUid) return null;

  try {
    // Buscar en turistas
    const turistasQuery = await db.collection("usuarios")
      .doc("turistas")
      .collection("lista")
      .where("uid", "==", ownerUid)
      .limit(1)
      .get();

    if (!turistasQuery.empty) {
      const userData = turistasQuery.docs[0]?.data();
      return {
        uid: ownerUid,
        nombre: userData?.["01_nombre"] || userData?.nombre || "",
        apellido: userData?.["02_apellido"] || userData?.apellido || "",
        email: userData?.["04_correo"] || userData?.email || "",
        fotoPerfil: userData?.["14_foto_perfil"]?.url || userData?.fotoPerfil || null,
        telefono: userData?.["06_telefono"] || userData?.telefono || ""
      };
    }

    // Buscar en guías
    const guiasQuery = await db.collection("usuarios")
      .doc("guias")
      .collection("lista")
      .where("uid", "==", ownerUid)
      .limit(1)
      .get();

    if (!guiasQuery.empty) {
      const userData = guiasQuery.docs[0]?.data();
      return {
        uid: ownerUid,
        nombre: userData?.["01_nombre"] || userData?.nombre || "",
        apellido: userData?.["02_apellido"] || userData?.apellido || "",
        email: userData?.["04_correo"] || userData?.email || "",
        fotoPerfil: userData?.["14_foto_perfil"]?.url || userData?.fotoPerfil || null,
        telefono: userData?.["06_telefono"] || userData?.telefono || ""
      };
    }

    return null;
  } catch (error) {
    console.error("Error obteniendo datos del propietario:", error);
    return null;
  }
};

export const getBusinessById = async (req: RequestWithUser, res: Response) => {
  try {
    const businessId = req.params.id as string;
    const userEmail = req.user?.email as string | undefined;
    const userUid = req.user?.uid as string | undefined;
    const userRole = req.user?.role as string | undefined;

    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ success: false, message: "ID de negocio requerido" });
    }

    if (!userEmail && !userUid) {
      return res.status(400).json({ success: false, message: "No se encontró información del usuario" });
    }

    const isAdmin = (userRole || "").toLowerCase() === "admin";

    const canAccessBusiness = (data: any) => {
      return (
        data?.ownerUid === userUid ||
        data?.owner === userUid ||
        data?.business?.owner === userUid ||
        data?.uid === userUid ||
        (userEmail && data?.email === userEmail) ||
        isAdmin
      );
    };

    const mapAndRespond = async (docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>) => {
      const data = docSnap.data();
      if (!data) {
        return res.status(404).json({ success: false, message: "Negocio no encontrado" });
      }

      if (!canAccessBusiness(data)) {
        return res.status(403).json({ success: false, message: "No autorizado" });
      }

      const businessData = mapBusinessDoc(docSnap as any);
      const ownerData = await getOwnerData(data?.ownerUid || data?.owner || data?.business?.owner);

      return res.json({
        success: true,
        business: businessData,
        owner: ownerData,
      });
    };

    const pendientesDoc = await db
      .collection("negocios")
      .doc("Pendientes")
      .collection("items")
      .doc(businessId)
      .get();

    if (pendientesDoc.exists) {
      return mapAndRespond(pendientesDoc as any);
    }

    const approvedDoc = await db
      .collection("negocios")
      .doc("Activos")
      .collection("items")
      .doc(businessId)
      .get();

    if (approvedDoc.exists) {
      return mapAndRespond(approvedDoc as any);
    }

    const archivedDoc = await db
      .collection("negocios")
      .doc("Archivados")
      .collection("items")
      .doc(businessId)
      .get();

    if (archivedDoc.exists) {
      return mapAndRespond(archivedDoc as any);
    }

    const rejectedDoc = await db
      .collection("negocios")
      .doc("Rechazados")
      .collection("items")
      .doc(businessId)
      .get();

    if (rejectedDoc.exists) {
      return mapAndRespond(rejectedDoc as any);
    }

    // Fallback robusto: buscar por identificadores alternos cuando la notificación no trae el docId exacto
    const collections = ["Pendientes", "Activos", "Archivados", "Rechazados"];
    const candidateFields = ["uid", "ownerUid", "owner", "business.owner"];

    for (const collectionName of collections) {
      for (const field of candidateFields) {
        const snap = await db
          .collection("negocios")
          .doc(collectionName)
          .collection("items")
          .where(field, "==", businessId)
          .limit(1)
          .get();

        if (!snap.empty) {
          const firstDoc = snap.docs[0];
          if (firstDoc) {
            return mapAndRespond(firstDoc as any);
          }
        }
      }
    }

    return res.status(404).json({ success: false, message: "Negocio no encontrado" });
  } catch (error: any) {
    console.error("Error getBusinessById:", error);
    return res.status(500).json({ success: false });
  }
};

export const getBusinessStatus = async (req: RequestWithUser, res: Response) => {
  try {
    const businessIdRaw = typeof req.query.businessId === "string" ? req.query.businessId : "";
    const businessNameRaw = typeof req.query.businessName === "string" ? req.query.businessName : "";
    const businessId = businessIdRaw.trim();
    const businessName = decodeURIComponent(businessNameRaw).trim();

    if (!businessId && !businessName) {
      return res.status(400).json({ success: false, message: "businessId o businessName requerido" });
    }

    const userEmail = req.user?.email as string | undefined;
    const userUid = req.user?.uid as string | undefined;
    const userRole = req.user?.role as string | undefined;
    const isAdmin = (userRole || "").toLowerCase() === "admin";

    const normalize = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const normalizedBusinessName = businessName ? normalize(businessName) : "";

    const canAccessBusiness = (data: any) => {
      if (isAdmin) return true;
      return (
        data?.ownerUid === userUid ||
        data?.owner === userUid ||
        data?.business?.owner === userUid ||
        data?.uid === userUid ||
        (userEmail && data?.email === userEmail)
      );
    };

    const collections = ["Pendientes", "Activos", "Archivados", "Rechazados"];
    for (const collectionName of collections) {
      const bucketRef = db.collection("negocios").doc(collectionName).collection("items");

      if (businessId) {
        const byDocId = await bucketRef.doc(businessId).get();
        if (byDocId.exists) {
          const data = byDocId.data();
          if (data && canAccessBusiness(data)) {
            return res.json({
              success: true,
              exists: true,
              deleted: false,
              source: collectionName,
              business: {
                id: byDocId.id,
                name: data?.business?.name || data?.name || null,
              },
            });
          }
        }

        const candidateFields = ["uid", "ownerUid", "owner", "business.owner"];
        for (const field of candidateFields) {
          const byField = await bucketRef.where(field, "==", businessId).limit(1).get();
          if (!byField.empty) {
            const doc = byField.docs[0];
            const data = doc?.data();
            if (doc && data && canAccessBusiness(data)) {
              return res.json({
                success: true,
                exists: true,
                deleted: false,
                source: collectionName,
                business: {
                  id: doc.id,
                  name: data?.business?.name || data?.name || null,
                },
              });
            }
          }
        }
      }

      if (normalizedBusinessName) {
        const byName = await bucketRef.where("business.name", "==", businessName).limit(1).get();
        if (!byName.empty) {
          const doc = byName.docs[0];
          const data = doc?.data();
          if (doc && data && canAccessBusiness(data)) {
            return res.json({
              success: true,
              exists: true,
              deleted: false,
              source: collectionName,
              business: {
                id: doc.id,
                name: data?.business?.name || data?.name || null,
              },
            });
          }
        }
      }
    }

    const [nestedSnap, legacySnap] = await Promise.all([
      db.collection("negocios").doc("movimientos").collection("items").orderBy("fecha", "desc").limit(1000).get(),
      db.collection("negocios_movimientos").orderBy("fecha", "desc").limit(1000).get(),
    ]);

    const movimientos = [...nestedSnap.docs, ...legacySnap.docs]
      .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      .sort((a, b) => new Date(b?.fecha || 0).getTime() - new Date(a?.fecha || 0).getTime());

    const deletionMovement = movimientos.find((mov: any) => {
      if (mov?.accion !== "eliminado_permanente") return false;

      const sameId = businessId && mov?.negocioId === businessId;
      if (sameId) return true;

      if (!normalizedBusinessName) return false;
      const movementName = typeof mov?.nombreNegocio === "string" ? mov.nombreNegocio : "";
      return movementName ? normalize(movementName) === normalizedBusinessName : false;
    });

    if (deletionMovement) {
      return res.json({
        success: true,
        exists: false,
        deleted: true,
        deletion: {
          businessId: deletionMovement?.negocioId || businessId || null,
          businessName: deletionMovement?.nombreNegocio || businessName || null,
          reason: deletionMovement?.reason || null,
          message: deletionMovement?.reason
            ? `Tu negocio "${deletionMovement?.nombreNegocio || businessName || "Negocio"}" ha sido eliminado por el administrador. Motivo: ${deletionMovement.reason}`
            : `Tu negocio "${deletionMovement?.nombreNegocio || businessName || "Negocio"}" ha sido eliminado por el administrador.`,
          deletedAt: deletionMovement?.fecha || null,
        },
      });
    }

    return res.json({
      success: true,
      exists: false,
      deleted: false,
      deletion: null,
    });
  } catch (error: any) {
    console.error("Error getBusinessStatus:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Función auxiliar para obtener la colección de un negocio
const getBusinessCollectionPath = async (businessId: string): Promise<{ collection: string; docPath: string } | null> => {
  const businessIdStr = Array.isArray(businessId) ? businessId[0] : businessId;
  
  const pendientesDoc = await db
    .collection("negocios")
    .doc("Pendientes")
    .collection("items")
    .doc(businessIdStr)
    .get();

  if (pendientesDoc.exists) {
    return {
      collection: "negocios/Pendientes/items",
      docPath: businessIdStr
    };
  }

  const approvedDoc = await db
    .collection("negocios")
    .doc("Activos")
    .collection("items")
    .doc(businessIdStr)
    .get();

  if (approvedDoc.exists) {
    return {
      collection: "negocios/Activos/items",
      docPath: businessIdStr
    };
  }

  const archivedDoc = await db
    .collection("negocios")
    .doc("Archivados")
    .collection("items")
    .doc(businessIdStr)
    .get();

  if (archivedDoc.exists) {
    return {
      collection: "negocios/Archivados/items",
      docPath: businessIdStr
    };
  }

  const rejectedDoc = await db
    .collection("negocios")
    .doc("Rechazados")
    .collection("items")
    .doc(businessIdStr)
    .get();

  if (rejectedDoc.exists) {
    return {
      collection: "negocios/Rechazados/items",
      docPath: businessIdStr
    };
  }

  return null;
};

// Función para eliminar imágenes de Cloudinary
const deleteCloudinaryImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extraer el public_id completo respetando carpetas anidadas de Cloudinary
    const uploadSegment = imageUrl.split('/upload/')[1];
    if (!uploadSegment) return;

    const withoutVersion = uploadSegment.replace(/^v\d+\//, '');
    const withoutQuery = withoutVersion.split('?')[0] || withoutVersion;
    const publicId = withoutQuery.replace(/\.[a-zA-Z0-9]+$/, '');

    if (!publicId) return;
    
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.warn("Error eliminando imagen de Cloudinary:", error);
    // No fallar si hay error al eliminar
  }
};

// Endpoint para actualizar información del negocio
export const updateBusiness = async (req: RequestWithUser, res: Response) => {
  try {
    const businessId = Array.isArray(req.params.businessId) ? req.params.businessId[0] : req.params.businessId;
    const userRole = req.user?.role as string | undefined;
    const {
      phone,
      location,
      website,
      latitud,
      longitud,
      calle,
      numero,
      colonia,
      codigoPostal,
      ciudad,
      estado,
      local,
      referencias,
      description,
      category,
      rfc,
      email,
      businessName,
      schedule,
      estimatedCost,
      suggestedStayTime,
      subcategories,
      horario,
      costoEstimado,
      tiempoSugerido,
      subcategorias,
    } = req.body;

    const normalizedSchedule = schedule ?? horario;
    const normalizedEstimatedCost = estimatedCost ?? costoEstimado;
    const normalizedSuggestedStayTime = suggestedStayTime ?? tiempoSugerido;
    const normalizedSubcategories = subcategories ?? subcategorias;

    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ success: false, message: "ID de negocio requerido" });
    }

    // Solo permite admin
    const isAdmin = (userRole || "").toLowerCase() === "admin";
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Solo administradores pueden actualizar negocios" });
    }

    // Buscar la colección del negocio
    const collectionPath = await getBusinessCollectionPath(businessId);
    if (!collectionPath) {
      return res.status(404).json({ success: false, message: "Negocio no encontrado" });
    }

    // Construir los datos a actualizar
    const updateData: any = {};
    if (businessName !== undefined) updateData["business.name"] = businessName;
    if (phone !== undefined) updateData["business.phone"] = phone;
    if (location !== undefined) updateData["business.location"] = location;
    if (website !== undefined) updateData["business.website"] = website;
    if (latitud !== undefined) updateData["business.latitud"] = latitud;
    if (longitud !== undefined) updateData["business.longitud"] = longitud;
    if (calle !== undefined) updateData["business.calle"] = calle;
    if (numero !== undefined) updateData["business.numero"] = numero;
    if (colonia !== undefined) updateData["business.colonia"] = colonia;
    if (codigoPostal !== undefined) updateData["business.codigoPostal"] = codigoPostal;
    if (ciudad !== undefined) updateData["business.ciudad"] = ciudad;
    if (estado !== undefined) updateData["business.estado"] = estado;
    if (local !== undefined) updateData["business.local"] = local;
    if (referencias !== undefined) updateData["business.referencias"] = referencias;
    if (description !== undefined) updateData["business.description"] = description;
    if (category !== undefined) updateData["business.category"] = category;
    if (rfc !== undefined) updateData["business.rfc"] = rfc;
    if (normalizedEstimatedCost !== undefined) {
      updateData["business.estimatedCost"] = typeof normalizedEstimatedCost === "string"
        ? normalizedEstimatedCost.trim()
        : normalizedEstimatedCost;
    }
    if (normalizedSuggestedStayTime !== undefined) {
      if (normalizedSuggestedStayTime === null || normalizedSuggestedStayTime === "") {
        updateData["business.suggestedStayTime"] = null;
      } else {
        const parsedSuggestedStayTime = Number(normalizedSuggestedStayTime);
        updateData["business.suggestedStayTime"] = Number.isFinite(parsedSuggestedStayTime) ? parsedSuggestedStayTime : null;
      }
    }
    if (normalizedSchedule !== undefined) {
      updateData["business.schedule"] = parseOptionalJson<Record<string, any>>(normalizedSchedule) || null;
    }
    if (normalizedSubcategories !== undefined) {
      updateData["business.subcategories"] = parseSubcategories(normalizedSubcategories);
    }
    if (email !== undefined) updateData["email"] = email; // Email se guarda a nivel raíz del documento

    // Obtener referencia del documento
    const parts = collectionPath.collection.split('/');
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      return res.status(500).json({ success: false, message: "Error en la ruta de colección" });
    }
    const docRef = db.collection(parts[0]!).doc(parts[1]!).collection(parts[2]!).doc(collectionPath.docPath);

    // Actualizar el documento
    await docRef.update(updateData);

    return res.json({ 
      success: true, 
      message: "Negocio actualizado exitosamente"
    });
  } catch (error: any) {
    console.error("Error updateBusiness:", error);
    return res.status(500).json({ success: false });
  }
};

// Endpoint para actualizar imágenes del negocio
export const updateBusinessImages = async (req: RequestWithUser, res: Response) => {
  try {
    const businessId = Array.isArray(req.params.businessId) ? req.params.businessId[0] : req.params.businessId;
    const userRole = req.user?.role as string | undefined;
    const { deleteLogoUrl, deleteImageUrls } = req.body;

    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ success: false, message: "ID de negocio requerido" });
    }

    // Solo permite admin
    const isAdmin = (userRole || "").toLowerCase() === "admin";
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Solo administradores pueden actualizar imágenes" });
    }

    // Buscar la colección del negocio
    const collectionPath = await getBusinessCollectionPath(businessId);
    if (!collectionPath) {
      return res.status(404).json({ success: false, message: "Negocio no encontrado" });
    }

    // Procesar archivos
    const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const updateData: any = {};
    let newLogoUrl: string | undefined;
    let newImageUrls: string[] = [];

    // Subir nuevo logo si se proporcionó
    if (filesObj && Array.isArray(filesObj['logo']) && filesObj['logo'][0]) {
      // Eliminar logo anterior
      if (deleteLogoUrl) {
        await deleteCloudinaryImage(deleteLogoUrl);
      }

      const logoFile = filesObj['logo'][0];
      newLogoUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder: `pitzbol/negocios/${businessId}/logo`,
          resource_type: 'image',
        }, (error, result) => {
          if (error) return reject(error);
          if (result && result.secure_url) return resolve(result.secure_url);
          return reject(new Error('No se pudo obtener la URL del logo desde Cloudinary.'));
        });
        stream.end(logoFile.buffer);
      });
      updateData["business.logo"] = newLogoUrl;
    }

    // Subir nuevas imágenes de galería si se proporcionaron
    if (filesObj && Array.isArray(filesObj['images']) && filesObj['images'].length > 0) {
      for (const file of filesObj['images']) {
        const url = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({
            folder: `pitzbol/negocios/${businessId}/galeria`,
            resource_type: 'image',
          }, (error, result) => {
            if (error) return reject(error);
            if (result && result.secure_url) return resolve(result.secure_url);
            return reject(new Error('No se pudo obtener la URL de la imagen desde Cloudinary.'));
          });
          stream.end(file.buffer);
        });
        newImageUrls.push(url as string);
      }
      updateData["business.images"] = newImageUrls;

      // Eliminar imágenes anteriores
      if (deleteImageUrls && Array.isArray(deleteImageUrls)) {
        for (const imageUrl of deleteImageUrls) {
          await deleteCloudinaryImage(imageUrl);
        }
      }
    }

    // Si no hay nada que actualizar
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: "No se proporcionaron imágenes para actualizar" });
    }

    // Obtener referencia del documento
    const parts = collectionPath.collection.split('/');
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      return res.status(500).json({ success: false, message: "Error en la ruta de colección" });
    }
    const docRef = db.collection(parts[0]!).doc(parts[1]!).collection(parts[2]!).doc(collectionPath.docPath);

    // Actualizar el documento
    await docRef.update(updateData);

    return res.json({ 
      success: true, 
      message: "Imágenes actualizadas exitosamente",
      data: {
        logo: newLogoUrl,
        images: newImageUrls
      }
    });
  } catch (error: any) {
    console.error("Error updateBusinessImages:", error);
    return res.status(500).json({ success: false });
  }
};