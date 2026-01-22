import { Router } from 'express';
import * as placesController from '../controllers/places.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { upload } from '../middleware/uploadMiddleware';

const router = Router();

/**
 * RUTAS PÚBLICAS (no requieren autenticación)
 */

// IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros dinámicos

// POST /api/lugares/geocode - Obtener coordenadas de una dirección (público)
// Esta ruta debe ir ANTES de /:nombre para que no la capture
if (!placesController.geocodeAddress) {
  console.error('❌ ERROR: geocodeAddress no está disponible en placesController');
} else {
  console.log('✅ Registrando ruta POST /api/lugares/geocode');
  router.post('/geocode', placesController.geocodeAddress);
}

// GET /api/lugares - Obtener todos los lugares (público)
router.get('/', placesController.getAllPlaces);

// GET /api/lugares/:nombre - Obtener un lugar específico (público)
// Esta ruta debe ir DESPUÉS de /geocode para no capturarla
router.get('/:nombre', placesController.getPlaceByName);

// POST /api/lugares - Crear un lugar nuevo (admin)
router.post(
  '/',
  authMiddleware,
  requireAdmin,
  placesController.createPlace
);

// POST /api/lugares/:nombre/fotos - Agregar fotos a un lugar (admin)
// Acepta múltiples archivos (field name: 'fotos') o URLs en el body
router.post(
  '/:nombre/fotos',
  authMiddleware,
  requireAdmin,
  upload.array('fotos', 10), // Máximo 10 fotos a la vez
  placesController.addPlacePhotos
);

// DELETE /api/lugares/:nombre/fotos/:index - Eliminar una foto (admin)
router.delete(
  '/:nombre/fotos/:index',
  authMiddleware,
  requireAdmin,
  placesController.deletePlacePhoto
);

// PUT /api/lugares/:nombre - Actualizar datos del lugar (admin)
router.put(
  '/:nombre',
  authMiddleware,
  requireAdmin,
  placesController.updatePlace
);

export default router;