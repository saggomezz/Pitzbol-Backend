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

export interface BusinessImageMoveResult {
  attempted: number;
  moved: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Reorganiza imágenes en Cloudinary de una carpeta a otra
 * @param businessId - ID del negocio
 * @returns Promesa que se resuelve cuando se han reorganizado todas las imágenes
 */
export const reorganizeBusinessImages = async (businessId: string): Promise<BusinessImageMoveResult> => {
  const result: BusinessImageMoveResult = {
    attempted: 0,
    moved: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    console.log(`[reorganizeBusinessImages] Reorganizando imágenes para negocio ${businessId}`);
    
    // Obtener todos los recursos en la carpeta pendientes
    const pendientesPath = `pitzbol/negocios/pendientes/${businessId}`;
    let nextCursor: string | undefined;
    const resources: any[] = [];

    // Buscar todos los archivos en la carpeta pendientes (con paginación)
    do {
      const page = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'image',
        prefix: pendientesPath,
        max_results: 500,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      });

      resources.push(...(page.resources || []));
      nextCursor = page.next_cursor;
    } while (nextCursor);

    console.log(`[reorganizeBusinessImages] Encontrados ${resources.length} recursos a reorganizar`);

    // Reorganizar cada recurso
    for (const resource of resources) {
      const oldPublicId = resource.public_id; // ej: pitzbol/negocios/pendientes/uid/galeria/image1
      const newPublicId = oldPublicId.replace('/pendientes/', '/activos/');

      if (oldPublicId === newPublicId) {
        result.skipped += 1;
        continue;
      }

      result.attempted += 1;

      try {
        // Usar rename para mover el archivo y reflejar cambios en CDN
        await cloudinary.uploader.rename(oldPublicId, newPublicId, {
          resource_type: 'image',
          type: 'upload',
          overwrite: true,
          invalidate: true,
        });
        console.log(`[reorganizeBusinessImages] ✅ Movido: ${oldPublicId} -> ${newPublicId}`);
        result.moved += 1;
      } catch (renameError: any) {
        const msg = renameError?.message || 'Error desconocido al renombrar en Cloudinary';
        console.error(`[reorganizeBusinessImages] Error al renombrar ${oldPublicId}:`, msg);
        result.failed += 1;
        result.errors.push(`${oldPublicId}: ${msg}`);
      }
    }

    console.log(`[reorganizeBusinessImages] ✅ Reorganización completada para negocio ${businessId}`, result);
    return result;
  } catch (error: any) {
    console.error(`[reorganizeBusinessImages] ❌ Error reorganizando imágenes:`, error);
    result.failed += 1;
    result.errors.push(error?.message || 'Error general al reorganizar imágenes');
    return result;
  }
};

export interface BusinessDeleteResult {
  attempted: number;
  deleted: number;
  failed: number;
  errors: string[];
}

/**
 * Elimina completamente todas las imágenes de un negocio de Cloudinary
 * Busca en todas las posibles carpetas: pendientes, activos y archivados
 * @param businessId - ID del negocio
 * @returns Resultado de la eliminación
 */
export const deleteBusinessFromCloudinary = async (businessId: string): Promise<BusinessDeleteResult> => {
  const result: BusinessDeleteResult = {
    attempted: 0,
    deleted: 0,
    failed: 0,
    errors: [],
  };

  try {
    console.log(`[deleteBusinessFromCloudinary] 🗑️ Iniciando eliminación de todas las imágenes para negocio ${businessId}`);
    
    // Buscar en todas las posibles carpetas
    const possiblePaths = [
      `pitzbol/negocios/pendientes/${businessId}`,
      `pitzbol/negocios/activos/${businessId}`,
      `pitzbol/negocios/archivados/${businessId}`,
    ];

    for (const path of possiblePaths) {
      try {
        console.log(`[deleteBusinessFromCloudinary] Buscando en: ${path}`);
        let nextCursor: string | undefined;
        const resources: any[] = [];

        // Buscar todos los archivos en esta carpeta (con paginación)
        do {
          try {
            const page = await cloudinary.api.resources({
              type: 'upload',
              resource_type: 'image',
              prefix: path,
              max_results: 500,
              ...(nextCursor ? { next_cursor: nextCursor } : {}),
            });

            resources.push(...(page.resources || []));
            nextCursor = page.next_cursor;
          } catch (apiError: any) {
            // Si no existe la carpeta, continuar
            if (apiError.error?.http_code === 404 || apiError.http_code === 404) {
              console.log(`[deleteBusinessFromCloudinary] Carpeta no encontrada: ${path}`);
              break;
            }
            throw apiError;
          }
        } while (nextCursor);

        if (resources.length === 0) {
          console.log(`[deleteBusinessFromCloudinary] No se encontraron recursos en ${path}`);
          continue;
        }

        console.log(`[deleteBusinessFromCloudinary] Encontrados ${resources.length} recursos en ${path}`);

        // Eliminar cada recurso
        for (const resource of resources) {
          result.attempted += 1;
          try {
            await cloudinary.uploader.destroy(resource.public_id, {
              resource_type: 'image',
              type: 'upload',
              invalidate: true,
            });
            console.log(`[deleteBusinessFromCloudinary] ✅ Eliminado: ${resource.public_id}`);
            result.deleted += 1;
          } catch (deleteError: any) {
            const msg = deleteError?.message || 'Error desconocido al eliminar';
            console.error(`[deleteBusinessFromCloudinary] Error al eliminar ${resource.public_id}:`, msg);
            result.failed += 1;
            result.errors.push(`${resource.public_id}: ${msg}`);
          }
        }

        // Intentar eliminar la carpeta vacía
        try {
          await cloudinary.api.delete_folder(path);
          console.log(`[deleteBusinessFromCloudinary] ✅ Carpeta eliminada: ${path}`);
        } catch (folderError: any) {
          // No es crítico si falla la eliminación de carpeta
          console.log(`[deleteBusinessFromCloudinary] ⚠️ No se pudo eliminar carpeta ${path}:`, folderError?.message);
        }
      } catch (pathError: any) {
        console.error(`[deleteBusinessFromCloudinary] Error procesando path ${path}:`, pathError);
        result.errors.push(`Path ${path}: ${pathError?.message || 'Error desconocido'}`);
      }
    }

    console.log(`[deleteBusinessFromCloudinary] ✅ Eliminación completada para negocio ${businessId}`, result);
    return result;
  } catch (error: any) {
    console.error(`[deleteBusinessFromCloudinary] ❌ Error general eliminando imágenes:`, error);
    result.errors.push(error?.message || 'Error general al eliminar imágenes');
    return result;
  }
};
