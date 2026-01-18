import express, { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { upload, uploadLimiter } from '../middleware/uploadMiddleware';
import { subirFotoPerfil, obtenerFotoPerfil } from '../controllers/perfil.controller';
import multer from 'multer';
import { actualizarPerfil } from '../controllers/perfil.controller';

const router = express.Router();

// Middleware para manejar errores de Multer
const handleMulterError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    // Errores de Multer (tamaño, campos, etc)
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Archivo demasiado grande. Máximo 5MB.' });
    }
    return res.status(400).json({ error: `Error de carga: ${err.message}` });
  } else if (err) {
    // Errores personalizados (del fileFilter)
    return res.status(400).json({ error: err.message });
  }
  next();
};

/**
 * Middleware aplicados (en orden):
 * 1. authenticateToken - Validar JWT
 * 2. uploadLimiter - Rate limiting (max 5 uploads/hora)
 * 3. upload.single('foto') - Multer middleware
 * 4. handleMulterError - Manejo de errores de Multer
 * 5. subirFotoPerfil - Controlador con validaciones
 */
router.post(
  '/foto-perfil',
  authMiddleware,
  uploadLimiter,
  upload.single('foto'),
  handleMulterError,
  subirFotoPerfil
);

/**
 * Obtener foto de perfil del usuario autenticado
 */
router.get('/foto-perfil', authMiddleware, obtenerFotoPerfil);
router.patch('/update-profile', authMiddleware, actualizarPerfil);

export default router;
