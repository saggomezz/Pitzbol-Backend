import express, { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { upload, uploadLimiter } from '../middleware/uploadMiddleware';
import { 
  subirFotoPerfil, 
  obtenerFotoPerfil,
  obtenerTarjetas,
  crearSetupIntent,
  guardarTarjeta,
  eliminarTarjeta,
  establecerPredeterminada
} from '../controllers/perfil.controller';
import multer from 'multer';
import { db } from '../config/firebase';

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

/**
 * WALLET ROUTES
 */

// DEBUG: Verificar autenticación
router.get("/debug/auth", authMiddleware, (req: any, res: Response) => {
  console.log('🔍 [DEBUG] Endpoint de autenticación accedido');
  console.log(`   - req.user:`, req.user);
  res.json({
    success: true,
    message: "Autenticación verificada",
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Obtener tarjetas guardadas del usuario
router.get("/wallet", authMiddleware, obtenerTarjetas);

// Crear setup intent para guardar tarjeta
router.post("/setup-intent", authMiddleware, crearSetupIntent);

// Guardar tarjeta
router.post("/save-card", authMiddleware, guardarTarjeta);

// Eliminar tarjeta
router.delete("/card/:cardId", authMiddleware, eliminarTarjeta);

// Establecer tarjeta como predeterminada
router.post("/card/:cardId/default", authMiddleware, establecerPredeterminada);

export default router;
