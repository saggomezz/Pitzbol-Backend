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
import { sendNotificationToAdmins } from "../services/notification.service";
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
      try {
        await auth.getUserByEmail(email);
        errors.email = "Este correo electrónico ya está registrado";
      } catch (error: any) {
        // Si no existe el usuario, está disponible (código 'auth/user-not-found')
        if (error.code !== 'auth/user-not-found') {
          console.error("Error verificando email:", error);
        }
      }

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
      owner,
      email
    } = req.body;

    // El usuario debe estar autenticado y su UID debe venir de req.user o del campo owner
    const uid = req.user?.uid || owner;
    if (!uid || !businessName || !rfc || !cp) {
      return res.status(400).json({ message: "Datos incompletos o usuario no autenticado" });
    }

    // Procesar logo y otras imágenes
    let imageUrls: string[] = [];
    let logoUrl = "";
    // req.files es un objeto: { logo: [File], images: [File, ...] }
    let logoFile = null;
    // Tipar req.files como un objeto con campos string: File[]
    const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (filesObj && Array.isArray(filesObj['logo']) && filesObj['logo'][0]) {
      logoFile = filesObj['logo'][0];
    }
    if (!logoFile) {
      return res.status(400).json({ message: "El logo del negocio es obligatorio." });
    }
    // Subir logo a Cloudinary
    logoUrl = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: 'negocios/pendientes/logos',
        resource_type: 'image',
      }, (error, result) => {
        if (error) return reject(error);
        if (result && result.secure_url) return resolve(result.secure_url);
        return reject(new Error('No se pudo obtener la URL del logo desde Cloudinary.'));
      });
      stream.end(logoFile.buffer);
    });
    // Subir imágenes (campo 'images')
    if (filesObj && Array.isArray(filesObj['images'])) {
      for (const file of filesObj['images']) {
        const url = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({
            folder: 'negocios/pendientes',
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
    await db.collection("negocios").doc("Pendientes").collection("items").doc(uid).set({
      uid,
      email: email || '',
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
        images: imageUrls,
        logo: logoUrl,
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
      enlace: `/admin/historial-solicitudes`
    });

    return res.status(201).json({
      message: "Business registrado correctamente",
      uid: owner,
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
        enlace: `/admin/historial-solicitudes`
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