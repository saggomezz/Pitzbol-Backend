import { Request, Response } from 'express';
import { db } from '../config/firebase';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';

// Configurar Cloudinary con validación
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️ Variables de Cloudinary no configuradas en .env');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!
});

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_DIMENSIONS = { width: 4000, height: 4000 };
const MIN_IMAGE_DIMENSIONS = { width: 200, height: 200 };

export const subirFotoPerfil = async (req: any, res: Response) => {
  try {
    const uid = (req as any).user?.uid;

    if (!uid) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se envio archivo' });
    }

    const file = req.file;
    console.log('Procesando upload de foto para uid:', uid, 'tamano:', file.size, 'bytes');

    // VALIDAR TAMAÑO
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'Archivo demasiado grande. Máximo 5MB.' });
    }

    // VALIDAR TIPO MIME
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ 
        error: 'Formato no permitido. Solo JPEG, PNG o WebP.'
      });
    }

    // VALIDAR DIMENSIONES CON SHARP
    let metadata;
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch (error) {
      return res.status(400).json({ error: 'Archivo corrupto o no es una imagen válida' });
    }

    if (!metadata.width || !metadata.height) {
      return res.status(400).json({ error: 'No se pudo leer dimensiones de la imagen' });
    }

    if (metadata.width > MAX_IMAGE_DIMENSIONS.width || metadata.height > MAX_IMAGE_DIMENSIONS.height) {
      return res.status(400).json({ 
        error: 'Imagen demasiado grande. Máximo 4000x4000px.'
      });
    }

    if (metadata.width < MIN_IMAGE_DIMENSIONS.width || metadata.height < MIN_IMAGE_DIMENSIONS.height) {
      return res.status(400).json({ 
        error: 'Imagen demasiado pequeña. Mínimo 200x200px.'
      });
    }

    // OPTIMIZAR CON SHARP
    const optimizedBuffer = await sharp(file.buffer)
      .resize(800, 800, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // SUBIR A CLOUDINARY (sin mostrar URL pública en respuesta)
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `pitzbol/profile_photos/${uid}`,
          public_id: `${uid}_${Date.now()}`,
          resource_type: 'auto',
          format: 'webp'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      stream.end(optimizedBuffer);
    });

    const uploadData = uploadResult as any;
    const fotoPerfil = uploadData.secure_url;

    // ACTUALIZAR EN FIRESTORE
    const snapshot = await db.collection('usuarios')
      .doc('turistas')
      .collection('lista')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userDoc = snapshot.docs[0];
    if (userDoc) {
      // Eliminar foto anterior de Cloudinary si existe
      const userData = userDoc.data();
      const oldPublicId = userData?.fotoPerfilCloudinary;
      if (oldPublicId) {
        try {
          await cloudinary.uploader.destroy(oldPublicId);
          console.log('✅ Foto anterior eliminada de Cloudinary:', oldPublicId);
        } catch (error) {
          console.error('⚠️ Error al eliminar foto anterior:', error);
        }
      }

      await userDoc.ref.update({
        fotoPerfil: fotoPerfil,
        fotoPerfilSubidaEn: new Date().toISOString(),
        fotoPerfilCloudinary: uploadData.public_id
      });
    }

    console.log('Foto de perfil actualizada para uid:', uid);

    return res.status(200).json({
      message: 'Foto de perfil actualizada exitosamente',
      fotoPerfil: fotoPerfil
    });

  } catch (error: any) {
    console.error('Error al subir foto de perfil:', error);
    return res.status(500).json({ 
      error: 'Error al procesar la imagen',
      details: error.message 
    });
  }
};

export const obtenerFotoPerfil = async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user?.uid;

    if (!uid) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const snapshot = await db.collection('usuarios')
      .doc('turistas')
      .collection('lista')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc ? userDoc.data() : null;
    
    return res.status(200).json({
      fotoPerfil: userData?.fotoPerfil || null,
      fotoPerfilSubidaEn: userData?.fotoPerfilSubidaEn || null
    });

  } catch (error: any) {
    console.error('Error al obtener foto de perfil:', error);
    return res.status(500).json({ error: 'Error al obtener foto de perfil' });
  }
};

export const eliminarFotoPerfilAnterior = async (publicId: string) => {
  try {
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
      console.log('Foto anterior eliminada de Cloudinary');
    }
  } catch (error: any) {
    console.error('Error al eliminar foto anterior:', error);
  }
};