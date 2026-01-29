import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  obtenerFavoritos,
  agregarFavorito,
  eliminarFavorito,
  sincronizarFavoritos
} from '../controllers/favorites.controller';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

/**
 * GET /api/favorites
 * Obtener todos los favoritos del usuario
 */
router.get('/', obtenerFavoritos);

/**
 * POST /api/favorites
 * Agregar un lugar a favoritos
 * Body: { nombreLugar: string }
 */
router.post('/', agregarFavorito);

/**
 * DELETE /api/favorites
 * Eliminar un lugar de favoritos
 * Body: { nombreLugar: string }
 */
router.delete('/', eliminarFavorito);

/**
 * POST /api/favorites/sync
 * Sincronizar favoritos locales con el servidor
 * Body: { favoritosLocales: string[] }
 */
router.post('/sync', sincronizarFavoritos);

export default router;
