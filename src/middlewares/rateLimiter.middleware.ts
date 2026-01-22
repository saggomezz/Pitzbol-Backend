import rateLimit from 'express-rate-limit';

// Rate limiter para registro: 3 intentos por hora
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  message: JSON.stringify({ success: false, msg: "Demasiados intentos de registro, intente más tarde" }),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, msg: "Demasiados intentos de registro, intente más tarde" });
  }
});

// Rate limiter para login: 10 intentos por 15 minutos
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: JSON.stringify({ success: false, msg: "Demasiados intentos de login, intente más tarde" }),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, msg: "Demasiados intentos de login, intente más tarde" });
  }
});

// Rate limiter para recuperación de contraseña: 3 intentos por 30 minutos
export const passwordLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutos
  max: 3,
  message: JSON.stringify({ success: false, msg: "Demasiados intentos de recuperación, intente más tarde" }),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, msg: "Demasiados intentos de recuperación, intente más tarde" });
  }
});
