import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { upload } from '../middleware/uploadMiddleware';
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

/**
 * Normalizar nombre de lugar para usar como ID
 */
function normalizePlaceName(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[^a-z0-9]+/g, "_") // Reemplazar espacios y caracteres especiales
    .replace(/^_+|_+$/g, ""); // Quitar guiones al inicio y final
}

/**
 * GET /api/lugares - Obtener todos los lugares con sus fotos
 */
export const getAllPlaces = async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection('lugares').get();
    
    const lugares = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return res.status(200).json({ lugares });
  } catch (error: any) {
    console.error('Error obteniendo lugares:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * POST /api/lugares - Crear un lugar nuevo
 */
export const createPlace = async (req: Request, res: Response) => {
  try {
    const { nombre, categoria, ubicacion, latitud, longitud, descripcion } = req.body;
    
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre del lugar es requerido' });
    }
    
    const placeId = normalizePlaceName(nombre);
    
    // Verificar si el lugar ya existe
    const existingDoc = await db.collection('lugares').doc(placeId).get();
    if (existingDoc.exists) {
      return res.status(400).json({ message: 'Este lugar ya existe' });
    }
    
    // Crear el nuevo lugar
    const nuevoLugar: any = {
      nombre: nombre.trim(),
      fotos: [],
      createdAt: new Date().toISOString(),
      ultimaActualizacion: new Date().toISOString()
    };
    
    if (categoria) nuevoLugar.categoria = categoria.trim();
    if (ubicacion) nuevoLugar.ubicacion = ubicacion.trim();
    if (latitud) nuevoLugar.latitud = String(latitud).replace(',', '.').trim();
    if (longitud) nuevoLugar.longitud = String(longitud).replace(',', '.').trim();
    if (descripcion) nuevoLugar.descripcion = descripcion.trim();
    
    await db.collection('lugares').doc(placeId).set(nuevoLugar);
    
    console.log(`✅ Lugar creado: ${nombre} (ID: ${placeId})`);
    
    return res.status(201).json({
      message: 'Lugar creado correctamente',
      lugar: {
        id: placeId,
        ...nuevoLugar
      }
    });
  } catch (error: any) {
    console.error('Error creando lugar:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * POST /api/lugares/geocode - Obtener coordenadas de una dirección usando Nominatim
 * Versión optimizada con mejor precisión para calles de Guadalajara
 */
export const geocodeAddress = async (req: Request, res: Response) => {
  console.log('📍 geocodeAddress llamado con:', req.body);
  try {
    const { direccion } = req.body;
    
    if (!direccion || !direccion.trim()) {
      return res.status(400).json({ message: 'La dirección es requerida' });
    }

    const direccionOriginal = direccion.trim();
    console.log('🔍 Buscando coordenadas para:', direccionOriginal);
    
    // Función para normalizar texto (quitar acentos)
    const normalizar = (texto: string): string => {
      return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    // Función para generar variantes de calle (con/sin abreviaturas y con/sin acentos)
    const generarVariantesCalle = (calle: string): string[] => {
      const variantes: string[] = [];
      const vistos = new Set<string>();
      
      // Helper para agregar sin duplicados (normalizado)
      const agregar = (v: string) => {
        const normalizado = normalizar(v);
        if (!vistos.has(normalizado) && v.trim().length > 0) {
          vistos.add(normalizado);
          variantes.push(v);
        }
      };
      
      // 1. Original
      agregar(calle);
      
      // 2. Sin acentos (PRIORIDAD ALTA - muchos usuarios no escriben acentos)
      agregar(normalizar(calle));
      
      const calleLower = calle.toLowerCase();
      
      // 3. Expandir abreviaturas comunes
      if (calleLower.match(/\bav\b|\bave\b/)) {
        agregar(calle.replace(/\bav\b|\bave\b/gi, 'avenida'));
        agregar(normalizar(calle.replace(/\bav\b|\bave\b/gi, 'avenida')));
      } else if (calleLower.includes('avenida')) {
        agregar(calle.replace(/\bavenida\b/gi, 'av'));
        agregar(normalizar(calle.replace(/\bavenida\b/gi, 'av')));
      }
      
      if (calleLower.match(/\bc\.\s/)) {
        agregar(calle.replace(/\bc\.\s/gi, 'calle '));
        agregar(normalizar(calle.replace(/\bc\.\s/gi, 'calle ')));
      } else if (calleLower.startsWith('calle ')) {
        const sinPrefijo = calle.replace(/^calle\s/i, '');
        agregar(sinPrefijo);
        agregar(normalizar(sinPrefijo));
      }
      
      if (calleLower.match(/\bblvd\b/)) {
        agregar(calle.replace(/\bblvd\b/gi, 'boulevard'));
        agregar(normalizar(calle.replace(/\bblvd\b/gi, 'boulevard')));
      } else if (calleLower.includes('boulevard')) {
        agregar(calle.replace(/\bboulevard\b/gi, 'blvd'));
        agregar(normalizar(calle.replace(/\bboulevard\b/gi, 'blvd')));
      }
      
      return variantes;
    };
    
    // Función para hacer búsqueda
    const buscarConParams = async (params: Record<string, string>, limit: number = 10): Promise<any[]> => {
      const queryParams = new URLSearchParams();
      queryParams.append('format', 'json');
      queryParams.append('limit', limit.toString());
      queryParams.append('countrycodes', 'mx');
      queryParams.append('addressdetails', '1');
      
      Object.entries(params).forEach(([key, value]) => {
        if (value && value.trim()) queryParams.append(key, value.trim());
      });
      
      const url = `https://nominatim.openstreetmap.org/search?${queryParams.toString()}`;
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting (500ms)
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Pitzbol-Tourism-App/1.0',
          'Accept-Language': 'es-MX,es,en'
        }
      });

      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    };

    // Función mejorada de puntuación - prioriza coincidencias de calle
    const calcularPuntuacion = (resultado: any, callesBuscadas: string[]): number => {
      let puntuacion = 0;
      const address = resultado.address || {};
      const displayName = (resultado.display_name || '').toLowerCase();
      const road = (address.road || '').toLowerCase();
      
      // Primero: Verificar si está en Guadalajara (criterio básico)
      const enGuadalajara = 
        address.city?.toLowerCase().includes('guadalajara') ||
        address.town?.toLowerCase().includes('guadalajara') ||
        address.municipality?.toLowerCase().includes('guadalajara') ||
        displayName.includes('guadalajara');
      
      console.log(`    🔍 Evaluando: "${displayName}" | road="${road}" | enGDL=${enGuadalajara}`);
      
      // Si NO está en Guadalajara, descartar completamente
      if (!enGuadalajara) {
        console.log(`    ❌ DESCARTAR: No está en Guadalajara`);
        return -100;
      }
      
      // PUNTUACIÓN BASE: Está en Guadalajara
      puntuacion = 5.0;
      
      // BÚSQUEDA 1: Coincidencia de calle (máxima prioridad)
      let coincideCalle = false;
      
      for (const calleBuscada of callesBuscadas) {
        const calleNormalizada = normalizar(calleBuscada);
        const roadNormalizado = normalizar(road);
        
        // Exacta con road
        if (roadNormalizado && roadNormalizado === calleNormalizada) {
          puntuacion += 15.0;
          coincideCalle = true;
          console.log(`    ✅ EXACTA en road: "${calleBuscada}" = "${road}"`);
          break;
        }
        
        // Parcial: road contiene calle
        if (road && roadNormalizado.includes(calleNormalizada) && calleNormalizada.length > 2) {
          const bonus = 12.0 * (calleNormalizada.length / Math.max(roadNormalizado.length, 1));
          puntuacion += bonus;
          coincideCalle = true;
          console.log(`    ✅ PARCIAL 1 en road: "${calleBuscada}" ⊂ "${road}" (+${bonus.toFixed(2)})`);
          break;
        }
        
        // Parcial: calle contiene road
        if (calleNormalizada.includes(roadNormalizado) && roadNormalizado.length > 3) {
          const bonus = 11.0 * (roadNormalizado.length / calleNormalizada.length);
          puntuacion += bonus;
          coincideCalle = true;
          console.log(`    ✅ PARCIAL 2: "${road}" ⊂ "${calleBuscada}" (+${bonus.toFixed(2)})`);
          break;
        }
        
        // Buscar en display_name
        if (displayName.includes(calleNormalizada) && calleNormalizada.length > 2) {
          const bonus = 10.0;
          puntuacion += bonus;
          coincideCalle = true;
          console.log(`    ✅ Encontrado en displayName: "${displayName}" (+${bonus.toFixed(2)})`);
          break;
        }
      }
      
      // BÚSQUEDA 2: Si no coincide la calle exacta, usar Importance de Nominatim como factor
      if (!coincideCalle) {
        const importance = resultado.importance || 0;
        if (importance > 0.1) {
          puntuacion += importance * 5.0;
          console.log(`    ℹ️ Sin coincidencia de calle, pero importance=${importance.toFixed(3)} (+${(importance * 5).toFixed(2)})`);
        } else {
          // Si no hay ninguna coincidencia y importance bajo, dar mínima puntuación
          console.log(`    ⚠️ Sin coincidencia de calle, importance bajo=${importance}`);
        }
      }
      
      // BONUS: Tipo de lugar
      if (resultado.type === 'residential' && resultado.class === 'highway') {
        puntuacion += 5.0;
      } else if (resultado.type === 'house' || resultado.type === 'building') {
        puntuacion += 4.0;
      } else if (['amenity', 'shop', 'tourism'].includes(resultado.class)) {
        puntuacion += 2.0;
      }
      
      // BONUS por importance
      puntuacion += (resultado.importance || 0) * 0.5;
      
      console.log(`    📊 Puntuación final: ${puntuacion.toFixed(2)}`);
      return puntuacion;
    };

    // Extraer nombre de calle de la dirección
    const extraerCalle = (dir: string): string => {
      // Tomar la primera parte antes de la primera coma
      const primeraParte = dir.split(',')[0]?.trim() || dir;
      // Quitar números al inicio
      return primeraParte.replace(/^\d+\s*/, '').trim();
    };

    const calleOriginal = extraerCalle(direccionOriginal);
    const variantesCalle = generarVariantesCalle(calleOriginal);
    
    // Limitar variantes para evitar demasiadas búsquedas (máximo 6)
    const variantesLimitadas = variantesCalle.slice(0, 6);
    
    console.log('  📋 Variantes de calle a buscar:', variantesLimitadas);

    let todosLosResultados: any[] = [];

    // Estrategia 1: Búsquedas con variantes de calle + Guadalajara
    for (const variante of variantesLimitadas) {
      const query = `${variante}, Guadalajara, Jalisco, Mexico`;
      console.log(`  🔎 Buscando: "${query}"`);
      
      const resultados = await buscarConParams({ q: query }, 10);
      if (resultados && resultados.length > 0) {
        console.log(`    📊 ${resultados.length} resultado(s)`);
        todosLosResultados.push(...resultados);
      }
    }

    // Estrategia 2: Búsqueda estructurada con street (solo con original)
    if (calleOriginal) {
      console.log(`  🔎 Búsqueda estructurada con street: "${calleOriginal}"`);
      const resultados = await buscarConParams({
        street: calleOriginal,
        city: 'Guadalajara',
        state: 'Jalisco',
        country: 'Mexico'
      }, 10);
      
      if (resultados && resultados.length > 0) {
        console.log(`    📊 ${resultados.length} resultado(s)`);
        todosLosResultados.push(...resultados);
      }
    }

    if (todosLosResultados.length === 0) {
      console.log('  ❌ No se encontraron resultados');
      return res.status(200).json({ 
        message: 'No se encontró esta calle. Ajusta la ubicación manualmente en el mapa.',
        success: false
      });
    }

    // Eliminar duplicados por place_id
    const unicos = todosLosResultados.filter((r, index, self) => 
      index === self.findIndex(t => t.place_id === r.place_id)
    );

    console.log(`  📊 Total de resultados únicos: ${unicos.length}`);

    // Calcular puntuación y ordenar
    const resultadosConPuntuacion = unicos
      .map(r => ({
        ...r,
        puntuacion: calcularPuntuacion(r, variantesCalle)
      }))
      .filter(r => r.puntuacion > 0) // Descartar negativos
      .sort((a, b) => b.puntuacion - a.puntuacion);

    if (resultadosConPuntuacion.length === 0) {
      console.log('  ❌ Ningún resultado válido después del filtrado');
      return res.status(200).json({ 
        message: 'No se encontró una coincidencia precisa para esta calle.',
        success: false
      });
    }

    // Mostrar top 3
    console.log(`  🏆 Top resultados:`);
    resultadosConPuntuacion.slice(0, 3).forEach((r, i) => {
      console.log(`    ${i + 1}. Puntuación: ${r.puntuacion.toFixed(2)} - ${r.display_name}`);
    });

    const mejorResultado = resultadosConPuntuacion[0];
    console.log(`  ✅ Mejor resultado seleccionado:`, mejorResultado.display_name);

    const lat = parseFloat(mejorResultado.lat);
    const lon = parseFloat(mejorResultado.lon);
    
    if (!isNaN(lat) && !isNaN(lon)) {
      return res.status(200).json({
        success: true,
        latitud: lat.toString(),
        longitud: lon.toString(),
        direccionEncontrada: mejorResultado.display_name || direccionOriginal
      });
    }

    return res.status(200).json({ 
      message: 'No se encontraron coordenadas válidas.',
      success: false
    });
  } catch (error: any) {
    console.error('Error en geocodificación:', error);
    return res.status(500).json({ 
      message: 'Error interno al buscar coordenadas',
      error: error.message,
      success: false
    });
  }
};

/**
 * GET /api/lugares/:nombre - Obtener un lugar específico con sus fotos
 */
export const getPlaceByName = async (req: Request, res: Response) => {
  try {
    let { nombre } = req.params;
    if (!nombre) {
      return res.status(400).json({ message: 'Nombre de lugar requerido' });
    }
    if (Array.isArray(nombre)) {
      nombre = nombre.join(' ');
    }
    const placeId = normalizePlaceName(nombre);

    const doc = await db.collection('lugares').doc(placeId).get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'Lugar no encontrado' });
    }

    return res.status(200).json({
      id: doc.id,
      ...doc.data()
    });
  } catch (error: any) {
    console.error('Error obteniendo lugar:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * POST /api/lugares/:nombre/fotos - Agregar fotos a un lugar (URL o archivo)
 */
export const addPlacePhotos = async (req: any, res: Response) => {
  try {
    const { nombre } = req.params;
    const { fotosUrl } = req.body; // Array de URLs si se envían URLs
    const files = req.files || []; // Archivos subidos via multer

    if (!nombre) {
      return res.status(400).json({ message: 'Nombre de lugar requerido' });
    }
    const placeId = normalizePlaceName(nombre);

    // Obtener o crear el documento del lugar
    const placeRef = db.collection('lugares').doc(placeId);
    const placeDoc = await placeRef.get();

    const currentData = placeDoc.exists ? placeDoc.data() : {};
    const currentPhotos = (currentData && currentData.fotos) ? currentData.fotos : [];

    const newPhotos: string[] = [];
    
    // 1. Procesar URLs si se proporcionaron
    if (fotosUrl && Array.isArray(fotosUrl)) {
      fotosUrl.forEach((url: string) => {
        if (url && typeof url === 'string' && url.startsWith('http')) {
          newPhotos.push(url);
        }
      });
    }
    
    // 2. Procesar archivos subidos (subirlos a Cloudinary)
    if (files.length > 0) {
      for (const file of files) {
        try {
          // Subir a Cloudinary
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: `pitzbol/lugares/${placeId}`,
                public_id: `${placeId}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                resource_type: 'auto',
                format: 'webp',
                transformation: [
                  { width: 1200, height: 800, crop: 'limit' },
                  { quality: 'auto:good' }
                ]
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            
            stream.end(file.buffer);
          });
          
          const uploadData = result as any;
          if (uploadData.secure_url) {
            newPhotos.push(uploadData.secure_url);
          }
        } catch (error) {
          console.error('Error subiendo archivo a Cloudinary:', error);
          // Continuar con el siguiente archivo
        }
      }
    }
    
    if (newPhotos.length === 0) {
      return res.status(400).json({ message: 'No se proporcionaron fotos válidas' });
    }
    
    // Combinar fotos nuevas con las existentes (evitar duplicados)
    const allPhotos = [...currentPhotos, ...newPhotos];
    const uniquePhotos = Array.from(new Set(allPhotos)); // Eliminar duplicados
    
    // Actualizar documento
    const updateData: any = {
      nombre,
      fotos: uniquePhotos,
      ultimaActualizacion: new Date().toISOString()
    };
    
    // Si es un nuevo lugar, agregar datos adicionales
    if (!placeDoc.exists) {
      updateData.createdAt = new Date().toISOString();
    }
    
    await placeRef.set(updateData, { merge: true });
    
    console.log(`✅ ${newPhotos.length} foto(s) agregada(s) al lugar: ${nombre}`);
    
    return res.status(200).json({
      message: `${newPhotos.length} foto(s) agregada(s) correctamente`,
      lugar: {
        id: placeId,
        nombre,
        fotos: uniquePhotos
      }
    });
  } catch (error: any) {
    console.error('Error agregando fotos:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * DELETE /api/lugares/:nombre/fotos/:index - Eliminar una foto específica
 */
export const deletePlacePhoto = async (req: Request, res: Response) => {
  try {
    let { nombre, index } = req.params;
    if (!nombre || typeof index === 'undefined') {
      return res.status(400).json({ message: 'Nombre e índice requeridos' });
    }
    if (Array.isArray(nombre)) {
      nombre = nombre.join(' ');
    }
    const placeId = normalizePlaceName(nombre);
    const photoIndex = parseInt(index as string);

    const placeRef = db.collection('lugares').doc(placeId);
    const placeDoc = await placeRef.get();

    if (!placeDoc.exists) {
      return res.status(404).json({ message: 'Lugar no encontrado' });
    }

    const data = placeDoc.data();
    const fotos = (data && data.fotos) ? data.fotos : [];

    if (photoIndex < 0 || photoIndex >= fotos.length) {
      return res.status(400).json({ message: 'Índice de foto inválido' });
    }

    // Eliminar foto de Cloudinary si es una URL de Cloudinary
    const photoUrl = fotos[photoIndex];
    if (photoUrl && photoUrl.includes('cloudinary.com')) {
      try {
        // Extraer public_id de la URL de Cloudinary
        const urlParts = photoUrl.split('/');
        const filenameIndex = urlParts.findIndex((part: string) => part.includes('upload')) + 1;
        const filename = urlParts[filenameIndex]?.split('.')[0];
        if (filename) {
          await cloudinary.uploader.destroy(`pitzbol/lugares/${placeId}/${filename}`);
        }
      } catch (error) {
        console.error('Error eliminando foto de Cloudinary:', error);
        // Continuar aunque falle la eliminación en Cloudinary
      }
    }

    // Eliminar de array
    fotos.splice(photoIndex, 1);

    await placeRef.update({
      fotos,
      ultimaActualizacion: new Date().toISOString()
    });

    return res.status(200).json({
      message: 'Foto eliminada correctamente',
      fotos
    });
  } catch (error: any) {
    console.error('Error eliminando foto:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
};

/**
 * PUT /api/lugares/:nombre - Actualizar datos del lugar
 */
export const updatePlace = async (req: Request, res: Response) => {
  try {
    let { nombre } = req.params;
    if (!nombre) {
      return res.status(400).json({ message: 'Nombre de lugar requerido' });
    }
    if (Array.isArray(nombre)) {
      nombre = nombre.join(' ');
    }
    const updateData = req.body;

    const placeId = normalizePlaceName(nombre);

    await db.collection('lugares').doc(placeId).set({
      nombre,
      ...updateData,
      ultimaActualizacion: new Date().toISOString()
    }, { merge: true });

    return res.status(200).json({
      message: 'Lugar actualizado correctamente'
    });
  } catch (error: any) {
    console.error('Error actualizando lugar:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
};
