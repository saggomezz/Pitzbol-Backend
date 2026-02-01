import { Request, Response } from 'express';
import { db } from '../config/firebase';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import stripe from '../config/stripe';
import { saveCard, getUserCards, setDefaultCard, deleteCard } from '../services/wallet.service';

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

// Función auxiliar para subir base64 a Cloudinary
const subirBase64ACloudinary = async (base64Image: string, uid: string): Promise<string> => {
  try {
    const uploadResult = await cloudinary.uploader.upload(base64Image, {
      folder: `pitzbol/profile_photos/${uid}`,
      public_id: `${uid}_${Date.now()}`,
      resource_type: 'auto',
      format: 'webp',
      transformation: [
        { width: 800, height: 800, crop: 'fill' },
        { quality: 'auto:good' }
      ]
    });
    
    return uploadResult.secure_url;
  } catch (error) {
    console.error('❌ Error subiendo base64 a Cloudinary:', error);
    throw error;
  }
};

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
    // Primero buscar en turistas
    let userDocRef: any = null;
    let snapshot = await db.collection('usuarios')
      .doc('turistas')
      .collection('lista')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    if (!snapshot.empty && snapshot.docs.length > 0) {
      userDocRef = snapshot.docs[0]!.ref;
    } else {
      // Si no está en turistas, buscar en guías lista
      const guiasSnapshot = await db.collection('usuarios')
        .doc('guias')
        .collection('lista')
        .get();

      for (const doc of guiasSnapshot.docs) {
        const data = doc.data();
        if (data && data.uid === uid) {
          userDocRef = doc.ref;
          break;
        }
      }

      // Si no está en guías aprobados, buscar en guías pendientes
      if (!userDocRef) {
        const pendientesSnapshot = await db.collection('usuarios')
          .doc('guias')
          .collection('pendientes')
          .get();

        for (const doc of pendientesSnapshot.docs) {
          const data = doc.data();
          if (data && data.uid === uid) {
            userDocRef = doc.ref;
            break;
          }
        }
      }
    }

    if (!userDocRef) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Obtener datos actuales del usuario
    const userSnapshot = await userDocRef.get();
    const userData = userSnapshot.data();

    // Eliminar foto anterior de Cloudinary si existe
    const oldPublicId = userData?.fotoPerfilCloudinary;
    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
        console.log('✅ Foto anterior eliminada de Cloudinary:', oldPublicId);
      } catch (error) {
        console.error('⚠️ Error al eliminar foto anterior:', error);
      }
    }

    // Actualizar documento con nueva foto
    await userDocRef.update({
      fotoPerfil: fotoPerfil,
      fotoPerfilSubidaEn: new Date().toISOString(),
      fotoPerfilCloudinary: uploadData.public_id
    });

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

    console.log(`🔍 Buscando foto de perfil para uid: ${uid}`);

    // Buscar primero en turistas
    const snapshot = await db.collection('usuarios')
      .doc('turistas')
      .collection('lista')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0];
      const userData = userDoc ? userDoc.data() : null;
      console.log(`✅ Usuario encontrado en turistas`);
      
      // Si no tiene fotoPerfil pero tiene 13_foto_rostro, subir a Cloudinary
      if (!userData?.fotoPerfil && userData?.['13_foto_rostro']) {
        console.log('📤 Migrando 13_foto_rostro a Cloudinary...');
        try {
          const cloudinaryUrl = await subirBase64ACloudinary(userData['13_foto_rostro'], uid);
          
          // Actualizar Firebase con la nueva URL
          await userDoc!.ref.update({
            fotoPerfil: cloudinaryUrl,
            fotoPerfilSubidaEn: new Date().toISOString()
          });
          
          console.log('✅ Foto migrada a Cloudinary exitosamente');
          
          return res.status(200).json({
            fotoPerfil: cloudinaryUrl,
            fotoPerfilSubidaEn: new Date().toISOString()
          });
        } catch (error) {
          console.error('❌ Error migrando foto:', error);
          return res.status(500).json({ error: 'Error procesando foto de perfil' });
        }
      }
      
      return res.status(200).json({
        fotoPerfil: userData?.fotoPerfil || null,
        fotoPerfilSubidaEn: userData?.fotoPerfilSubidaEn || null
      });
    }

    // Buscar en admins
    const adminSnap = await db.collection('usuarios')
      .doc('admins')
      .collection('lista')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    if (!adminSnap.empty) {
      const adminDoc = adminSnap.docs[0];
      const adminData = adminDoc ? adminDoc.data() : null;
      console.log(`✅ Usuario encontrado en admins`);
      return res.status(200).json({
        fotoPerfil: adminData?.fotoPerfil || null,
        fotoPerfilSubidaEn: adminData?.fotoPerfilSubidaEn || null
      });
    }

    // Si no está en turistas, buscar en guías lista
    const guiasSnapshot = await db.collection('usuarios')
      .doc('guias')
      .collection('lista')
      .get();

    for (const doc of guiasSnapshot.docs) {
      const data = doc.data();
      if (data && data.uid === uid) {
        console.log(`✅ Usuario encontrado en guías/lista`);
        
        // Si no tiene fotoPerfil pero tiene 13_foto_rostro, subir a Cloudinary
        if (!data.fotoPerfil && data['13_foto_rostro']) {
          console.log('📤 Migrando 13_foto_rostro a Cloudinary...');
          try {
            const cloudinaryUrl = await subirBase64ACloudinary(data['13_foto_rostro'], uid);
            
            // Actualizar Firebase con la nueva URL
            await doc.ref.update({
              fotoPerfil: cloudinaryUrl,
              fotoPerfilSubidaEn: new Date().toISOString()
            });
            
            console.log('✅ Foto migrada a Cloudinary exitosamente');
            
            return res.status(200).json({
              fotoPerfil: cloudinaryUrl,
              fotoPerfilSubidaEn: new Date().toISOString()
            });
          } catch (error) {
            console.error('❌ Error migrando foto:', error);
            return res.status(500).json({ error: 'Error procesando foto de perfil' });
          }
        }
        
        return res.status(200).json({
          fotoPerfil: data.fotoPerfil || null,
          fotoPerfilSubidaEn: data.fotoPerfilSubidaEn || null
        });
      }
    }

    // Si no está en guías aprobados, buscar en guías pendientes
    const pendientesSnapshot = await db.collection('usuarios')
      .doc('guias')
      .collection('pendientes')
      .get();

    for (const doc of pendientesSnapshot.docs) {
      const data = doc.data();
      if (data && data.uid === uid) {
        console.log(`✅ Usuario encontrado en guías/pendientes`);
        console.log(`📸 Foto de perfil: ${data.fotoPerfil ? 'SÍ existe' : 'NO existe'}`);
        console.log(`📸 Campos disponibles: ${Object.keys(data).join(', ')}`);
        
        // Si no tiene fotoPerfil pero tiene 13_foto_rostro, subir a Cloudinary
        if (!data.fotoPerfil && data['13_foto_rostro']) {
          console.log('📤 Migrando 13_foto_rostro a Cloudinary...');
          try {
            const cloudinaryUrl = await subirBase64ACloudinary(data['13_foto_rostro'], uid);
            
            // Actualizar Firebase con la nueva URL
            await doc.ref.update({
              fotoPerfil: cloudinaryUrl,
              fotoPerfilSubidaEn: new Date().toISOString()
            });
            
            console.log('✅ Foto migrada a Cloudinary exitosamente');
            
            return res.status(200).json({
              fotoPerfil: cloudinaryUrl,
              fotoPerfilSubidaEn: new Date().toISOString()
            });
          } catch (error) {
            console.error('❌ Error migrando foto:', error);
            return res.status(500).json({ error: 'Error procesando foto de perfil' });
          }
        }
        
        return res.status(200).json({
          fotoPerfil: data.fotoPerfil || null,
          fotoPerfilSubidaEn: data.fotoPerfilSubidaEn || null
        });
      }
    }

    console.warn(`⚠️ Usuario no encontrado en ninguna colección: ${uid}`);
    return res.status(404).json({ error: 'Usuario no encontrado' });

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

export const actualizarPerfil = async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user?.uid;
    const { descripcion, idiomas, especialidades, nombre, apellido } = req.body;

    console.log("📥 Datos recibidos en el backend:", { uid, descripcion, idiomas, especialidades, nombre, apellido });

    if (!uid) return res.status(401).json({ error: 'No autenticado' });


    let userDocRef: any = null;

    // Buscar en turistas
    const snapT = await db.collection('usuarios').doc('turistas').collection('lista').where('uid', '==', uid).limit(1).get();
    if (!snapT.empty) {
      userDocRef = snapT.docs[0]?.ref;
    }

    // Buscar en admins
    if (!userDocRef) {
      const snapA = await db.collection('usuarios').doc('admins').collection('lista').where('uid', '==', uid).limit(1).get();
      if (!snapA.empty) {
        userDocRef = snapA.docs[0]?.ref;
      }
    }

    // Buscar en guías lista
    if (!userDocRef) {
      const snapGL = await db.collection('usuarios').doc('guias').collection('lista').where('uid', '==', uid).limit(1).get();
      if (!snapGL.empty) {
        userDocRef = snapGL.docs[0]?.ref;
      }
    }

    // Buscar en guías pendientes
    if (!userDocRef) {
      const snapGP = await db.collection('usuarios').doc('guias').collection('pendientes').where('uid', '==', uid).limit(1).get();
      if (!snapGP.empty) {
        userDocRef = snapGP.docs[0]?.ref;
      }
    }

    if (!userDocRef) {
      return res.status(404).json({ error: 'Usuario no encontrado en Firebase' });
    }

    const camposAActualizar: any = {
      ultimaActualizacion: new Date().toISOString()
    };

    // Solo actualizar campos que fueron enviados
    if (descripcion !== undefined) {
      camposAActualizar.descripcion = descripcion;
      camposAActualizar["15_descripcion"] = descripcion;
    }

    if (idiomas !== undefined) {
      camposAActualizar.idiomas = idiomas;
      camposAActualizar["09_idiomas"] = idiomas;
    }

    if (especialidades !== undefined) {
      camposAActualizar.especialidades = especialidades;
      camposAActualizar["07_especialidades"] = especialidades;
    }

    if (nombre !== undefined) {
      camposAActualizar.nombre = nombre;
      camposAActualizar["01_nombre"] = nombre;
    }

    if (apellido !== undefined) {
      camposAActualizar.apellido = apellido;
      camposAActualizar["02_apellido"] = apellido;
    }

    await userDocRef.update(camposAActualizar);

    console.log("✅ Perfil actualizado exitosamente");

    return res.status(200).json({
      msg: 'Perfil actualizado exitosamente',
      ...camposAActualizar
    });

  } catch (error: any) {
    console.error('❌ Error fatal en actualizarPerfil:', error);
    return res.status(500).json({ msg: 'Error interno del servidor', details: error.message });
  }
};


    /**
 * WALLET CONTROLLERS
 */

// GET /api/perfil/wallet - Obtener tarjetas del usuario
export const obtenerTarjetas = async (req: any, res: Response) => {
  try {
    const uid = req.user?.uid;

    console.log('📋 [obtenerTarjetas] Iniciando...');
    console.log(`   - UID del token: ${uid}`);
    console.log(`   - req.user completo:`, req.user);

    if (!uid) {
      console.error('❌ [obtenerTarjetas] UID no encontrado en token');
      return res.status(401).json({ error: 'No autenticado - UID no encontrado en token' });
    }

    console.log(`✅ [obtenerTarjetas] UID validado: ${uid}`);

    const cards = await getUserCards(uid);
    
    console.log(`✅ [obtenerTarjetas] ${cards.length} tarjeta(s) encontrada(s) para UID: ${uid}`);
    
    res.json({ cards });
  } catch (error: any) {
    console.error('❌ Error obteniendo tarjetas:', error);
    res.status(500).json({ error: error.message || 'Error al obtener tarjetas' });
  }
};

// POST /api/perfil/setup-intent - Crear Setup Intent
export const crearSetupIntent = async (req: any, res: Response) => {
  try {
    const uid = req.user?.uid;
    
    console.log('🔐 [crearSetupIntent] Iniciando...');
    console.log(`   - UID del token: ${uid}`);
    console.log(`   - req.user completo:`, req.user);

    if (!uid) {
      console.error('❌ [crearSetupIntent] UID no encontrado en token');
      return res.status(401).json({ error: 'No autenticado - UID no encontrado en token' });
    }

    console.log(`✅ [crearSetupIntent] UID validado: ${uid}`);

    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ['card'],
      metadata: { uid },
    });

    console.log(`✅ [crearSetupIntent] Setup intent creado: ${setupIntent.id}`);

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (error: any) {
    console.error('❌ Error creando setup intent:', error);
    res.status(500).json({ error: error.message || 'Error creando setup intent' });
  }
};

// POST /api/perfil/save-card - Guardar tarjeta
export const guardarTarjeta = async (req: any, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { paymentMethodId } = req.body;

    console.log('💳 [guardarTarjeta] Iniciando...');
    console.log(`   - UID del token: ${uid}`);
    console.log(`   - Payment Method ID: ${paymentMethodId}`);
    console.log(`   - req.user completo:`, req.user);

    if (!uid) {
      console.error('❌ [guardarTarjeta] UID no encontrado en token');
      return res.status(401).json({ error: 'No autenticado - UID no encontrado en token' });
    }

    if (!paymentMethodId) {
      console.error('❌ [guardarTarjeta] Payment method ID requerido');
      return res.status(400).json({ error: 'Payment method ID requerido' });
    }

    console.log(`✅ [guardarTarjeta] Validaciones pasadas. UID: ${uid}`);

    // Obtener detalles de Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!paymentMethod.card) {
      console.error('❌ [guardarTarjeta] Payment method no válido');
      return res.status(400).json({ error: 'Payment method no válido' });
    }

    const card = paymentMethod.card;

    console.log(`✅ [guardarTarjeta] Payment method validado. Brand: ${card.brand}, Last4: ${card.last4}`);

    // Guardar en Firestore
    const newCard = await saveCard(uid, {
      stripePaymentMethodId: paymentMethodId,
      last4: card.last4 || '',
      brand: (card.brand || 'unknown').toLowerCase(),
      expMonth: card.exp_month || 0,
      expYear: card.exp_year || 0,
    });

    console.log(`✅ [guardarTarjeta] Tarjeta guardada en Firestore. ID: ${newCard.id}, UID: ${uid}`);

    res.json({
      success: true,
      message: 'Tarjeta guardada exitosamente',
      card: {
        id: newCard.id,
        last4: newCard.last4,
        brand: newCard.brand,
        expMonth: newCard.expMonth,
        expYear: newCard.expYear,
        isDefault: newCard.isDefault,
      },
    });
  } catch (error: any) {
    console.error('❌ Error guardando tarjeta:', error);
    res.status(500).json({ error: error.message || 'Error guardando tarjeta' });
  }
};

// DELETE /api/perfil/card/:cardId - Eliminar tarjeta
export const eliminarTarjeta = async (req: any, res: Response) => {
  try {
    const uid = req.user?.uid || (req as any).uid;
    const { cardId } = req.params;

    if (!uid) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!cardId) {
      return res.status(400).json({ error: 'Card ID requerido' });
    }

    await deleteCard(uid, cardId);

    res.json({
      success: true,
      message: 'Tarjeta eliminada',
    });
  } catch (error: any) {
    console.error('❌ Error eliminando tarjeta:', error);
    res.status(500).json({ error: error.message || 'Error eliminando tarjeta' });
  }
};

// POST /api/perfil/card/:cardId/default - Establecer como predeterminada
export const establecerPredeterminada = async (req: any, res: Response) => {
  try {
    const uid = req.user?.uid || (req as any).uid;
    const { cardId } = req.params;

    if (!uid) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!cardId) {
      return res.status(400).json({ error: 'Card ID requerido' });
    }

    await setDefaultCard(uid, cardId);

    res.json({
      success: true,
      message: 'Tarjeta establecida como predeterminada',
    });
  } catch (error: any) {
    console.error('❌ Error estableciendo predeterminada:', error);
    res.status(500).json({ error: error.message || 'Error estableciendo predeterminada' });
  }
};