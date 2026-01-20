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
 * Versión mejorada con búsquedas más precisas y mejor filtrado de resultados
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
    
    // Función para hacer búsqueda con diferentes parámetros
    const buscarConParams = async (params: Record<string, string>, limit: number = 25) => {
      const queryParams = new URLSearchParams();
      queryParams.append('format', 'json');
      queryParams.append('limit', limit.toString());
      queryParams.append('countrycodes', 'mx');
      queryParams.append('addressdetails', '1');
      queryParams.append('extratags', '1'); // Información adicional
      queryParams.append('namedetails', '1'); // Nombres alternativos
      
      // Agregar parámetros específicos
      Object.entries(params).forEach(([key, value]) => {
        if (value && value.trim()) queryParams.append(key, value.trim());
      });
      
      const url = `https://nominatim.openstreetmap.org/search?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Pitzbol-Tourism-App/1.0 (contact: admin@pitzbol.com)',
          'Accept-Language': 'es-MX,es,en'
        }
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    };

    // Función mejorada para calcular puntuación de relevancia de un resultado
    const calcularPuntuacion = (resultado: any, direccionBusqueda: string, componentes: any): number => {
      let puntuacion = (resultado.importance || 0) * 2; // Peso mayor a importance
      const displayName = (resultado.display_name || '').toLowerCase();
      const direccionLower = direccionBusqueda.toLowerCase();
      const address = resultado.address || {};
      
      // BONUS: Tipo de lugar muy específico
      if (resultado.type === 'house' || resultado.type === 'building') {
        puntuacion += 1.0;
      } else if (resultado.class === 'highway' && resultado.type === 'residential') {
        puntuacion += 0.5;
      } else if (['amenity', 'shop', 'tourism', 'leisure'].includes(resultado.class)) {
        puntuacion += 0.8;
      }
      
      // BONUS: Está en Guadalajara
      const enGuadalajara = 
        address.city?.toLowerCase().includes('guadalajara') ||
        address.town?.toLowerCase().includes('guadalajara') ||
        address.municipality?.toLowerCase().includes('guadalajara') ||
        displayName.includes('guadalajara');
      if (enGuadalajara) {
        puntuacion += 0.6;
      }
      
      // BONUS: Coincidencias de palabras clave
      const palabrasBusqueda = direccionLower
        .split(/[\s,]+/)
        .filter(p => p.length > 2 && !['la', 'del', 'de', 'los', 'las'].includes(p.toLowerCase()));
      
      let coincidencias = 0;
      palabrasBusqueda.forEach(palabra => {
        const palabraLimpia = palabra.replace(/[^\w]/g, '');
        if (displayName.includes(palabraLimpia) || 
            address.road?.toLowerCase().includes(palabraLimpia) ||
            address.suburb?.toLowerCase().includes(palabraLimpia) ||
            address.neighbourhood?.toLowerCase().includes(palabraLimpia)) {
          coincidencias++;
        }
      });
      
      if (palabrasBusqueda.length > 0) {
        puntuacion += (coincidencias / palabrasBusqueda.length) * 0.8;
      }
      
      // BONUS: Coincidencia de número (si hay)
      if (componentes.numero && address.house_number) {
        if (address.house_number.includes(componentes.numero) || 
            componentes.numero.includes(address.house_number)) {
          puntuacion += 1.5; // Muy importante si coincide el número
        }
      }
      
      // BONUS: Coincidencia de calle (road)
      if (componentes.calle && address.road) {
        const calleLimpia = componentes.calle
          .replace(/^(C\.|Calle|Av\.|Avenida|Blvd\.|Boulevard)\s+/i, '')
          .toLowerCase()
          .trim();
        const roadLimpio = address.road.toLowerCase().trim();
        
        if (roadLimpio.includes(calleLimpia) || calleLimpia.includes(roadLimpio)) {
          puntuacion += 1.2;
        }
      }
      
      return puntuacion;
    };

    // Función mejorada para extraer componentes de dirección
    const extraerComponentes = (dir: string) => {
      const partes = dir.split(',').map(p => p.trim()).filter(p => p);
      let calle = '';
      let numero = '';
      let colonia = '';
      let ciudad = 'Guadalajara';
      
      // Patrón para extraer número
      const patronNumero = /\b(\d+[A-Z]?)\b/;
      
      if (partes.length > 0) {
        // Primera parte: calle (puede incluir número)
        let primeraParte = partes[0];
        calle = primeraParte;
        
        // Extraer número de la calle si está presente
        const matchNumero = primeraParte.match(patronNumero);
        if (matchNumero && matchNumero.index !== undefined && matchNumero.index < primeraParte.length / 2) {
          numero = matchNumero[1];
          calle = primeraParte.replace(patronNumero, '').trim();
        }
        
        // Buscar colonia y ciudad en las siguientes partes
        for (let i = 1; i < partes.length; i++) {
          const parte = partes[i];
          if (parte.toLowerCase().includes('guadalajara') || parte.toLowerCase().includes('gdl')) {
            ciudad = 'Guadalajara';
          } else if (!colonia && i <= 2 && !parte.match(/^(Guadalajara|Jalisco|México|Méx)$/i)) {
            colonia = parte;
          }
        }
      }
      
      return { calle, numero, colonia, ciudad };
    };

    const componentes = extraerComponentes(direccionOriginal);
    console.log('  📋 Componentes extraídos:', componentes);

    // Lista de búsquedas a intentar (de más específica a menos específica)
    const busquedas = [
      // 1. Búsqueda estructurada con street específico
      componentes.calle ? {
        method: 'structured',
        params: {
          street: componentes.calle,
          city: componentes.ciudad,
          state: 'Jalisco',
          country: 'México'
        }
      } : null,
      
      // 2. Búsqueda por query con toda la dirección + contexto
      {
        method: 'query',
        params: { q: `${direccionOriginal}, Guadalajara, Jalisco, México` }
      },
      
      // 3. Búsqueda por query con dirección completa
      {
        method: 'query',
        params: { q: direccionOriginal }
      },
      
      // 4. Búsqueda por query solo con calle y ciudad
      componentes.calle ? {
        method: 'query',
        params: { q: `${componentes.calle}, ${componentes.ciudad}, Jalisco` }
      } : null,
      
      // 5. Búsqueda estructurada solo con ciudad y estado
      {
        method: 'structured',
        params: {
          city: componentes.ciudad,
          state: 'Jalisco',
          country: 'México'
        }
      },
      
      // 6. Búsqueda simplificada (solo primera parte de la dirección)
      {
        method: 'query',
        params: { q: `${direccionOriginal.split(',')[0]}, Guadalajara` }
      }
    ].filter(b => b !== null);

    let todosLosResultados: any[] = [];

    // Ejecutar todas las búsquedas
    for (let i = 0; i < busquedas.length; i++) {
      const busqueda = busquedas[i];
      console.log(`  Intento ${i + 1}/${busquedas.length}: ${busqueda?.method} - ${JSON.stringify(busqueda?.params)}`);
      
      try {
        let data;
        if (busqueda?.method === 'structured') {
          data = await buscarConParams(busqueda.params, 25);
        } else {
          data = await buscarConParams({ q: busqueda?.params?.q || direccionOriginal }, 25);
        }
        
        if (data && Array.isArray(data) && data.length > 0) {
          console.log(`    📊 ${data.length} resultado(s) encontrado(s)`);
          todosLosResultados.push(...data);
        }
        
        // Pausa más larga para respetar rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error: any) {
        console.log(`    ❌ Error:`, error.message);
        continue;
      }
    }

    if (todosLosResultados.length === 0) {
      console.log('  ❌ No se encontraron coordenadas en ninguna búsqueda');
      return res.status(200).json({ 
        message: 'No se encontraron coordenadas para esta dirección. Intenta ser más específico o ajusta la ubicación manualmente en el mapa.',
        success: false
      });
    }

    // Eliminar duplicados (mismo lugar_id)
    const unicos = todosLosResultados.filter((r, index, self) => 
      index === self.findIndex(t => t.place_id === r.place_id)
    );

    console.log(`  📊 Total de resultados únicos: ${unicos.length}`);

    // Calcular puntuación mejorada para cada resultado y ordenar
    const resultadosConPuntuacion = unicos.map(r => ({
      ...r,
      puntuacion: calcularPuntuacion(r, direccionOriginal, componentes)
    })).sort((a, b) => b.puntuacion - a.puntuacion);

    // Mostrar top 3 resultados para debugging
    console.log(`  🏆 Top 3 resultados:`);
    resultadosConPuntuacion.slice(0, 3).forEach((r, i) => {
      console.log(`    ${i + 1}. Puntuación: ${r.puntuacion.toFixed(2)} - ${r.display_name}`);
    });

    // Seleccionar el mejor resultado
    const mejorResultado = resultadosConPuntuacion[0];
    console.log(`  ✅ Mejor resultado seleccionado (puntuación: ${mejorResultado.puntuacion.toFixed(3)}):`, mejorResultado.display_name);

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
      message: 'No se encontraron coordenadas válidas. Por favor ajusta la ubicación manualmente en el mapa.',
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
    const { nombre } = req.params;
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
    
    const placeId = normalizePlaceName(nombre);
    
    // Obtener o crear el documento del lugar
    const placeRef = db.collection('lugares').doc(placeId);
    const placeDoc = await placeRef.get();
    
    const currentData = placeDoc.exists ? placeDoc.data() : {};
    const currentPhotos = currentData.fotos || [];
    
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
    const { nombre, index } = req.params;
    const placeId = normalizePlaceName(nombre);
    const photoIndex = parseInt(index);
    
    const placeRef = db.collection('lugares').doc(placeId);
    const placeDoc = await placeRef.get();
    
    if (!placeDoc.exists) {
      return res.status(404).json({ message: 'Lugar no encontrado' });
    }
    
    const data = placeDoc.data();
    const fotos = data?.fotos || [];
    
    if (photoIndex < 0 || photoIndex >= fotos.length) {
      return res.status(400).json({ message: 'Índice de foto inválido' });
    }
    
    // Eliminar foto de Cloudinary si es una URL de Cloudinary
    const photoUrl = fotos[photoIndex];
    if (photoUrl && photoUrl.includes('cloudinary.com')) {
      try {
        // Extraer public_id de la URL de Cloudinary
        const urlParts = photoUrl.split('/');
        const filenameIndex = urlParts.findIndex(part => part.includes('upload')) + 1;
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
    const { nombre } = req.params;
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
