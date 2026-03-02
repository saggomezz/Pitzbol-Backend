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
import { v2 as cloudinary } from 'cloudinary';
// Configuración de Cloudinary (puedes mover esto a un archivo de config si lo prefieres)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});
// Nuevo endpoint para registro de negocio con imágenes
// Endpoint para validar unicidad de datos del negocio
export const validateBusinessUniqueness = async (req: RequestWithUser, res: Response) => {
  try {
    const { businessName, email, phone, website, location, rfc, cp } = req.body;
    
    const errors: { [key: string]: string } = {};

    // Verificar nombre del negocio en negocios aprobados
    if (businessName) {
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
      const nombreExiste = negociosSnapshot.docs.some(doc => 
        doc.data().business?.name?.toLowerCase() === businessName.toLowerCase()
      );
      
      if (nombreExiste) {
        errors.businessName = "Este nombre de negocio ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const nombrePendiente = pendientesSnapshot.docs.some(doc => 
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
        doc.data().email?.toLowerCase() === email.toLowerCase()
      );
      
      if (emailPendiente) {
        errors.email = "Este correo ya tiene una solicitud pendiente";
      }
    }

    // Verificar teléfono
    if (phone) {
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
      const telefonoExiste = negociosSnapshot.docs.some(doc => 
        doc.data().business?.phone === phone
      );
      
      if (telefonoExiste) {
        errors.phone = "Este teléfono ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const telefonoPendiente = pendientesSnapshot.docs.some(doc => 
        doc.data().business?.phone === phone
      );
      
      if (telefonoPendiente) {
        errors.phone = "Este teléfono ya tiene una solicitud pendiente";
      }
    }

    // Verificar sitio web
    if (website) {
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
      const sitioWebExiste = negociosSnapshot.docs.some(doc => 
        doc.data().business?.website?.toLowerCase() === website.toLowerCase()
      );
      
      if (sitioWebExiste) {
        errors.website = "Este sitio web ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const sitioWebPendiente = pendientesSnapshot.docs.some(doc => 
        doc.data().business?.website?.toLowerCase() === website.toLowerCase()
      );
      
      if (sitioWebPendiente) {
        errors.website = "Este sitio web ya tiene una solicitud pendiente";
      }
    }

    // Verificar ubicación
    if (location) {
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
      const ubicacionExiste = negociosSnapshot.docs.some(doc => 
        doc.data().business?.location?.toLowerCase() === location.toLowerCase()
      );
      
      if (ubicacionExiste) {
        errors.location = "Esta ubicación ya está registrada";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const ubicacionPendiente = pendientesSnapshot.docs.some(doc => 
        doc.data().business?.location?.toLowerCase() === location.toLowerCase()
      );
      
      if (ubicacionPendiente) {
        errors.location = "Esta ubicación ya tiene una solicitud pendiente";
      }
    }

    // Verificar RFC
    if (rfc) {
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
      const rfcExiste = negociosSnapshot.docs.some(doc => 
        doc.data().business?.rfc?.toUpperCase() === rfc.toUpperCase()
      );
      
      if (rfcExiste) {
        errors.rfc = "Este RFC ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const rfcPendiente = pendientesSnapshot.docs.some(doc => 
        doc.data().business?.rfc?.toUpperCase() === rfc.toUpperCase()
      );
      
      if (rfcPendiente) {
        errors.rfc = "Este RFC ya tiene una solicitud pendiente";
      }
    }

    // Verificar Código Postal
    if (cp) {
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
      const cpExiste = negociosSnapshot.docs.some(doc => 
        doc.data().business?.cp === cp
      );
      
      if (cpExiste) {
        errors.cp = "Este código postal ya está registrado";
      }

      // Verificar en negocios pendientes
      const pendientesSnapshot = await db.collection("negocios").doc("Pendientes").collection("items").get();
      const cpPendiente = pendientesSnapshot.docs.some(doc => 
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
      longitud
    } = req.body;

    console.log("[registerBusinessWithImages] Body recibido:", req.body);
    console.log("[registerBusinessWithImages] 📍 Coordenadas recibidas:", { latitud, longitud });
    console.log("[registerBusinessWithImages] Files recibidos:", req.files);

    // Validar que los campos obligatorios estén presentes
    if (!businessName || !email || !rfc || !cp || !category || !phone || !location || !website) {
      const missingFields = [];
      if (!businessName) missingFields.push("businessName");
      if (!email) missingFields.push("email");
      if (!rfc) missingFields.push("rfc");
      if (!cp) missingFields.push("cp");
      if (!category) missingFields.push("category");
      if (!phone) missingFields.push("phone");
      if (!location) missingFields.push("location");
      if (!website) missingFields.push("website");
      console.log("[registerBusinessWithImages] Campos faltantes:", missingFields);
      return res.status(400).json({ 
        message: "Datos incompletos. Verifica todos los campos obligatorios.",
        missingFields 
      });
    }

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
    // Subir logo a Cloudinary con estructura: pitzbol/negocios/pendientes/{uid}/logo
    logoUrl = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: `pitzbol/negocios/pendientes/${uid}/logo`,
        resource_type: 'image',
      }, (error, result) => {
        if (error) return reject(error);
        if (result && result.secure_url) return resolve(result.secure_url);
        return reject(new Error('No se pudo obtener la URL del logo desde Cloudinary.'));
      });
      stream.end(logoFile.buffer);
    });
    // Subir imágenes (campo 'images') con estructura: pitzbol/negocios/pendientes/{uid}/galeria
    if (filesObj && Array.isArray(filesObj['images'])) {
      for (const file of filesObj['images']) {
        const url = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({
            folder: `pitzbol/negocios/pendientes/${uid}/galeria`,
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
        images: imageUrls,
        logo: logoUrl,
        owner: ownerUid || uid, // Usar ownerUid si existe, sino el uid del negocio
        latitud: latitud || null,
        longitud: longitud || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    };
    
    console.log(`[registerBusinessWithImages] 💾 Guardando en Firestore con coordenadas:`, {
      latitud: businessData.business.latitud,
      longitud: businessData.business.longitud
    });
    
    await db.collection("negocios").doc("Pendientes").collection("items").doc(uid).set(businessData);

    // Notificar a los administradores de nueva solicitud de negocio
    await sendNotificationToAdmins({
      tipo: 'nueva_solicitud_negocio',
      titulo: 'Nueva solicitud de negocio',
      mensaje: `Se ha recibido una nueva solicitud de negocio: ${businessName}`,
      fecha: new Date().toISOString(),
      leido: false,
      enlace: `/admin/negocios-pendientes`
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
        enlace: `/negocio/preview?id=${uid}`
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

      // Notificar a los administradores de nueva solicitud de negocio
      await sendNotificationToAdmins({
        tipo: 'nueva_solicitud_negocio',
        titulo: 'Nueva solicitud de negocio',
        mensaje: `Se ha recibido una nueva solicitud de negocio: ${businessName}`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: `/admin/negocios-pendientes`
      });

      // Notificar al usuario dueño de la solicitud
      await sendNotificationToUser(uid, {
        tipo: 'solicitud_negocio_enviada',
        titulo: 'Solicitud enviada',
        mensaje: `Tu negocio "${businessName}" fue enviado a revision.`,
        fecha: new Date().toISOString(),
        leido: false,
        enlace: `/negocio/preview?id=${uid}`
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

    // PRIORIDAD 3: Buscar por ownerUid en Business (aprobados)
    if (userUid) {
      const businessSnapByUid = await db
        .collection("negocios")
        .doc("Business")
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

    // PRIORIDAD 4: Buscar por email en Business (aprobados)
    const businessSnap = await db
      .collection("negocios")
      .doc("Business")
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
        .collection("negocios_archivados")
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
      .collection("negocios_archivados")
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
    return res.status(500).json({ success: false, error: error.message });
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

    const pendientesDoc = await db
      .collection("negocios")
      .doc("Pendientes")
      .collection("items")
      .doc(businessId)
      .get();

    if (pendientesDoc.exists) {
      const data = pendientesDoc.data();
      const isOwner =
        data?.ownerUid === userUid ||
        data?.uid === userUid ||
        (userEmail && data?.email === userEmail);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: "No autorizado" });
      }

      return res.json({ success: true, business: mapBusinessDoc(pendientesDoc) });
    }

    const approvedDoc = await db
      .collection("negocios")
      .doc("Business")
      .collection("items")
      .doc(businessId)
      .get();

    if (approvedDoc.exists) {
      const data = approvedDoc.data();
      const isOwner =
        data?.ownerUid === userUid ||
        data?.uid === userUid ||
        (userEmail && data?.email === userEmail);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: "No autorizado" });
      }

      return res.json({ success: true, business: mapBusinessDoc(approvedDoc) });
    }

    const archivedDoc = await db
      .collection("negocios_archivados")
      .doc(businessId)
      .get();

    if (archivedDoc.exists) {
      const data = archivedDoc.data();
      const isOwner =
        data?.ownerUid === userUid ||
        data?.uid === userUid ||
        (userEmail && data?.email === userEmail);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: "No autorizado" });
      }

      return res.json({ success: true, business: mapBusinessDoc(archivedDoc) });
    }

    return res.status(404).json({ success: false, message: "Negocio no encontrado" });
  } catch (error: any) {
    console.error("Error getBusinessById:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};