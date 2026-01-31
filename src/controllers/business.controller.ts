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
      images,
      description
    } = req.body;
    const owner = req.user?.uid;
    const email = req.user?.email;
    if (!owner || !businessName || !rfc || !cp) {
      return res.status(400).json({ message: "Datos incompletos o usuario no autenticado" });
    }

    // Guardar negocio en Businnes/Pendientes/items
    await db.collection("negocios").doc("Pendientes").collection("items").doc(owner).set({
      uid: owner,
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
        images: images || [],
        owner: owner,
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
      enlace: `/admin/historial-solicitudes` // Ajusta la ruta si es necesario
    });

    return res.status(201).json({ message: "Business registrado correctamente", uid: owner });
  } catch (error: any) {
    console.error("Error registerBusiness:", error);

    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ message: "Correo ya registrado" });
    }

    return res.status(500).json({ message: "Error interno del servidor" });
  }
};