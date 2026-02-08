import { v2 as cloudinary } from 'cloudinary';

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

export type ImageType = 'perfil' | 'ine_frente' | 'ine_reverso' | 'rostro';

/**
 * Sube una imagen a Cloudinary con la estructura correcta de carpetas
 * Estructura: pitzbol/usuarios/{uid}/{imageType}/
 * 
 * @param base64OrBuffer - Imagen en base64 o Buffer
 * @param uid - ID del usuario (Firebase UID)
 * @param imageType - Tipo de imagen (perfil, ine_frente, ine_reverso, rostro)
 * @returns URL segura de la imagen subida
 */
export const uploadImageToCloudinary = async (
  base64OrBuffer: string | Buffer,
  uid: string,
  imageType: ImageType
): Promise<string> => {
  try {
    const folderPath = `pitzbol/usuarios/${uid}/${imageType}`;
    const publicId = `${uid}_${imageType}_${Date.now()}`;

    const uploadResult = await cloudinary.uploader.upload(
      typeof base64OrBuffer === 'string' 
        ? base64OrBuffer 
        : `data:image/jpeg;base64,${base64OrBuffer.toString('base64')}`,
      {
        folder: folderPath,
        public_id: publicId,
        resource_type: 'auto',
        format: 'webp',
        transformation: [
          { width: 1200, height: 1200, crop: 'fill' },
          { quality: 'auto:good' }
        ]
      }
    );

    if (!uploadResult.secure_url) {
      throw new Error('No se pudo obtener la URL de Cloudinary');
    }

    return uploadResult.secure_url;
  } catch (error) {
    console.error(`❌ Error subiendo imagen tipo ${imageType} para usuario ${uid}:`, error);
    throw error;
  }
};

/**
 * Sube una imagen usando stream (ideal para archivos del multer)
 * @param buffer - Buffer del archivo
 * @param uid - ID del usuario
 * @param imageType - Tipo de imagen
 * @returns URL segura de la imagen
 */
export const uploadImageStreamToCloudinary = async (
  buffer: Buffer,
  uid: string,
  imageType: ImageType
): Promise<string> => {
  try {
    const folderPath = `pitzbol/usuarios/${uid}/${imageType}`;
    const publicId = `${uid}_${imageType}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: folderPath,
          public_id: publicId,
          resource_type: 'auto',
          format: 'webp',
          transformation: [
            { width: 1200, height: 1200, crop: 'fill' },
            { quality: 'auto:good' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else if (result?.secure_url) resolve(result.secure_url);
          else reject(new Error('No se pudo obtener la URL de Cloudinary'));
        }
      );
      stream.end(buffer);
    });
  } catch (error) {
    console.error(`❌ Error subiendo imagen tipo ${imageType} para usuario ${uid}:`, error);
    throw error;
  }
};

/**
 * Obtiene la URL de Cloudinary para una imagen guardada
 * @param uid - ID del usuario
 * @param imageType - Tipo de imagen
 * @returns URL de la carpeta en Cloudinary
 */
export const getCloudinaryFolderUrl = (uid: string, imageType: ImageType): string => {
  return `pitzbol/usuarios/${uid}/${imageType}`;
};
