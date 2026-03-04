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
    const { businessName, email, phone, website, location, rfc, cp, excludeBusinessId } = req.body;
    const excludedId = typeof excludeBusinessId === "string" ? excludeBusinessId.trim() : "";
    const isExcludedDoc = (docId: string) => excludedId !== "" && docId === excludedId;
    
    const errors: { [key: string]: string } = {};

    // Verificar nombre del negocio en negocios aprobados
    if (businessName) {
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
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
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
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
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
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
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
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
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
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
      const negociosSnapshot = await db.collection("negocios").doc("Business").collection("items").get();
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
      enlace: `/admin/negocios/${uid}`
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
        enlace: `/admin/negocios/${uid}`
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

      const businessData = mapBusinessDoc(pendientesDoc);
      const ownerData = await getOwnerData(data?.ownerUid);
      
      return res.json({ 
        success: true, 
        business: businessData,
        owner: ownerData
      });
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

      const businessData = mapBusinessDoc(approvedDoc);
      const ownerData = await getOwnerData(data?.ownerUid);

      return res.json({ 
        success: true, 
        business: businessData,
        owner: ownerData
      });
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

      const businessData = mapBusinessDoc(archivedDoc);
      const ownerData = await getOwnerData(data?.ownerUid);

      return res.json({ 
        success: true, 
        business: businessData,
        owner: ownerData
      });
    }

    return res.status(404).json({ success: false, message: "Negocio no encontrado" });
  } catch (error: any) {
    console.error("Error getBusinessById:", error);
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
    .doc("Business")
    .collection("items")
    .doc(businessIdStr)
    .get();

  if (approvedDoc.exists) {
    return {
      collection: "negocios/Business/items",
      docPath: businessIdStr
    };
  }

  const archivedDoc = await db
    .collection("negocios_archivados")
    .doc(businessIdStr)
    .get();

  if (archivedDoc.exists) {
    return {
      collection: "negocios_archivados",
      docPath: businessIdStr
    };
  }

  return null;
};

// Función para eliminar imágenes de Cloudinary
const deleteCloudinaryImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extraer el public_id de la URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1]?.split('.')[0] || '';
    const folderPath = urlParts.slice(-3, -1).join('/');
    const publicId = `${folderPath}/${fileName}`;
    
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
    const { phone, location, website, latitud, longitud, calle, numero, colonia, codigoPostal, ciudad, estado, local, referencias, description, category, rfc, email, businessName } = req.body;

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
    if (email !== undefined) updateData["email"] = email; // Email se guarda a nivel raíz del documento

    // Obtener referencia del documento
    let docRef;
    if (collectionPath.collection === "negocios_archivados") {
      docRef = db.collection("negocios_archivados").doc(collectionPath.docPath);
    } else {
      const parts = collectionPath.collection.split('/');
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        return res.status(500).json({ success: false, message: "Error en la ruta de colección" });
      }
      docRef = db.collection(parts[0]!).doc(parts[1]!).collection(parts[2]!).doc(collectionPath.docPath);
    }

    // Actualizar el documento
    await docRef.update(updateData);

    return res.json({ 
      success: true, 
      message: "Negocio actualizado exitosamente"
    });
  } catch (error: any) {
    console.error("Error updateBusiness:", error);
    return res.status(500).json({ success: false, error: error.message });
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
          folder: `pitzbol/negocios/pendientes/${businessId}/logo`,
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
            folder: `pitzbol/negocios/pendientes/${businessId}/galeria`,
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
    let docRef;
    if (collectionPath.collection === "negocios_archivados") {
      docRef = db.collection("negocios_archivados").doc(collectionPath.docPath);
    } else {
      const parts = collectionPath.collection.split('/');
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        return res.status(500).json({ success: false, message: "Error en la ruta de colección" });
      }
      docRef = db.collection(parts[0]!).doc(parts[1]!).collection(parts[2]!).doc(collectionPath.docPath);
    }

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
    return res.status(500).json({ success: false, error: error.message });
  }
};