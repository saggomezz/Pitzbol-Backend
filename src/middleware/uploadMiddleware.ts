import multer, { StorageEngine } from 'multer';
import rateLimit from 'express-rate-limit';

// ⚠️ RATE LIMITING - Máximo 5 uploads por hora por usuario (ciberseguridad)
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: 'Demasiados intentos de carga. Intenta más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => !req.user, // Solo contar usuarios autenticados
});

// 🔒 Almacenamiento en memoria (no en disco para evitar ataques de ruta)
const storage: StorageEngine = multer.memoryStorage();

// 🛡️ Filtro de archivos - Validación en servidor
const fileFilter = (req: any, file: any, cb: any) => {
  // Validar extensión de archivo (no confiar solo en cliente)
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = file.originalname.toLowerCase().slice(-4);
  
  if (!allowedExts.includes(ext)) {
    return cb(new Error('Extensión de archivo no permitida. Solo: JPG, PNG, WebP'), false);
  }

  // 🔐 Sanitizar nombre de archivo - Evitar inyección de caracteres peligrosos
  const sanitizedName = file.originalname
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Solo caracteres seguros
    .replace(/\.+/g, '.')               // Evitar múltiples puntos
    .substring(0, 100)                 // Limitar longitud
    .toLowerCase();
  
  file.originalname = sanitizedName;

  cb(null, true);
};

// ✅ Configuración de multer con límites estrictos
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5MB máximo
    files: 1                     // Solo 1 archivo por request
  }
});
