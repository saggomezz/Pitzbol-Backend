import { Request, Response } from "express";
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
export const registerBusinessWithImages = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      businessName,
      category,
      phone,
      location,
      website,
      rfc,
      cp,
      description,
      owner
    } = req.body;

    if (!email || !password || !businessName || !rfc || !cp) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    // Crear usuario
    const userRecord = await auth.createUser({
      email,
      password,
    });
    const uid = userRecord.uid;

    // Procesar logo y otras imágenes
    let imageUrls: string[] = [];
    let logoUrl = "";
    // req.files puede ser un array o un objeto (según multer config)
    // Si usas upload.array, req.files es un array; si usas upload.fields, es un objeto
    // Aquí soportamos ambos para robustez
    const filesArr = Array.isArray(req.files) ? req.files : (req.files ? Object.values(req.files).flat() : []);
    // Buscar el logo (campo 'logo')
    let logoFile = null;
    if (req.file) logoFile = req.file; // Si usas upload.single('logo')
    if (!logoFile && req.files && !Array.isArray(req.files) && req.files['logo']) logoFile = req.files['logo'][0];
    if (!logoFile && filesArr.length) {
      // Buscar por nombre de campo
      logoFile = filesArr.find((f:any) => f.fieldname === 'logo');
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
    // Subir imágenes (excluyendo el logo)
    for (const file of filesArr) {
      if (file === logoFile) continue;
      if (file.fieldname === 'images') {
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
      email,
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
        owner: owner || "",
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
      uid,
    });
  } catch (error: any) {
    console.error("Error registerBusinessWithImages:", error);
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ message: "Correo ya registrado" });
    }
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const registerBusiness = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      businessName,
      category,
      phone,
      location,
      website,
      rfc,
      cp,
      images,
      description,
      owner
    } = req.body;

    if (!email || !password || !businessName || !rfc || !cp) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    // Crear usuario
    const userRecord = await auth.createUser({
      email,
      password,
    });

    const uid = userRecord.uid;

    // Guardar negocio en Businnes/Pendientes/items
    await db.collection("negocios").doc("Pendientes").collection("items").doc(uid).set({
      uid,
      email,
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
        owner: owner || "",
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

    return res.status(201).json({
      message: "Business registrado correctamente",
      uid,
    });
  } catch (error: any) {
    console.error("Error registerBusiness:", error);

    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ message: "Correo ya registrado" });
    }

    return res.status(500).json({ message: "Error interno del servidor" });
  }
};