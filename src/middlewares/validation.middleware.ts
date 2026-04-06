import { Request, Response, NextFunction } from "express";

// Strip HTML tags to prevent stored XSS
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

// Validación de entrada para registro
export const validateRegisterInput = (req: Request, res: Response, next: NextFunction) => {
  const { email, password, nombre, apellido } = req.body;

  // Validar que los campos requeridos estén presentes
  if (!email || !password || !nombre) {
    return res.status(400).json({ msg: "Email, contraseña y nombre son requeridos" });
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ msg: "Email inválido" });
  }

  // Validar longitud de contraseña (mínimo 8 caracteres para más seguridad)
  if (password.length < 8) {
    return res.status(400).json({ msg: "La contraseña debe tener al menos 8 caracteres" });
  }

  // Validar longitud de campos de texto
  if (nombre.length > 100 || (apellido && apellido.length > 100)) {
    return res.status(400).json({ msg: "Nombre/apellido demasiado largo (máximo 100 caracteres)" });
  }

  // Sanitizar campos de texto contra XSS
  req.body.nombre = stripHtml(nombre).trim();
  if (apellido) req.body.apellido = stripHtml(apellido).trim();

  next();
};

// Validación de entrada para login
export const validateLoginInput = (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ msg: "Email y contraseña son requeridos" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ msg: "Email inválido" });
  }

  next();
};

// Validación de entrada para recuperación de contraseña
export const validatePasswordRecoveryInput = (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ msg: "Email es requerido" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ msg: "Email inválido" });
  }

  next();
};

// Validación de entrada para actualización de perfil
export const validateProfileUpdate = (req: Request, res: Response, next: NextFunction) => {
  const { nombre, apellido, telefono, nacionalidad, especialidades, descripcion } = req.body;

  // Al menos uno de estos campos debe estar presente
  if (!nombre && !apellido && !telefono && !nacionalidad && !especialidades && !descripcion) {
    return res.status(400).json({ msg: "Debe proporcionar al menos un campo para actualizar" });
  }

  // Sanitizar y validar longitud de campos de texto
  if (nombre) {
    if (nombre.length > 100) return res.status(400).json({ msg: "Nombre demasiado largo" });
    req.body.nombre = stripHtml(nombre).trim();
  }
  if (apellido) {
    if (apellido.length > 100) return res.status(400).json({ msg: "Apellido demasiado largo" });
    req.body.apellido = stripHtml(apellido).trim();
  }
  if (descripcion) {
    if (descripcion.length > 2000) return res.status(400).json({ msg: "Descripción demasiado larga" });
    req.body.descripcion = stripHtml(descripcion).trim();
  }
  if (telefono) {
    const phoneClean = telefono.replace(/\D/g, '');
    if (phoneClean.length < 7 || phoneClean.length > 15) {
      return res.status(400).json({ msg: "Teléfono inválido" });
    }
  }
  if (especialidades && !Array.isArray(especialidades)) {
    return res.status(400).json({ msg: "Especialidades debe ser un array" });
  }

  next();
};
