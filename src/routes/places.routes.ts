import { Router, Response, NextFunction } from 'express';
import * as placesController from '../controllers/places.controller';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { upload } from '../middleware/uploadMiddleware';

const EMAIL_ADMIN_LUGARES = 'cua@hotmail.com';
const requireEmailAdminLugares = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.email !== EMAIL_ADMIN_LUGARES) {
    return res.status(403).json({ success: false, msg: 'No autorizado' });
  }
  next();
};

const router = Router();

/**
 * RUTAS PÚBLICAS (no requieren autenticación)
 */

// IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros dinámicos

// POST /api/lugares/geocode - Obtener coordenadas de una dirección (público)
// Esta ruta debe ir ANTES de /:nombre para que no la capture
if (!placesController.geocodeAddress) {
  console.error('ERROR: geocodeAddress no está disponible en placesController');
} else {
  console.log('Registrando ruta POST /api/lugares/geocode');
  router.post('/geocode', placesController.geocodeAddress);
}

// POST /api/lugares/reverse-geocode - Obtener dirección desde coordenadas (público)
if (!placesController.reverseGeocodeAddress) {
  console.error('ERROR: reverseGeocodeAddress no está disponible en placesController');
} else {
  console.log('Registrando ruta POST /api/lugares/reverse-geocode');
  router.post('/reverse-geocode', placesController.reverseGeocodeAddress);
}

// GET /api/lugares - Obtener todos los lugares (público)
router.get('/', placesController.getAllPlaces);

// GET /api/lugares/:nombre - Obtener un lugar específico (público)
// Esta ruta debe ir DESPUÉS de /geocode para no capturarla
router.get('/:nombre', placesController.getPlaceByName);

// POST /api/lugares - Crear un lugar nuevo (email autorizado)
router.post(
  '/',
  authMiddleware,
  requireEmailAdminLugares,
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

// PATCH /api/lugares/:nombre/fotos - Reemplazar fotos (solo auth, no admin)
router.patch('/:nombre/fotos', authMiddleware, placesController.setPlaceFotos);

// PATCH /api/lugares/:nombre/categorias - Reemplazar categorías (solo auth, no admin)
router.patch('/:nombre/categorias', authMiddleware, placesController.setPlaceCategorias);

// PATCH /api/lugares/:nombre/info - Actualizar info del lugar (público, control por UI)
router.patch('/:nombre/info', placesController.setPlaceInfo);

// DELETE /api/lugares/:nombre - Eliminar lugar completo (solo auth, no admin)
router.delete('/:nombre', authMiddleware, placesController.deletePlace);

// PUT /api/lugares/:nombre - Actualizar datos del lugar (admin)
router.put(
  '/:nombre',
  authMiddleware,
  requireAdmin,
  placesController.updatePlace
);

export default router;