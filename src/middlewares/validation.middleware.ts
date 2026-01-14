import { Request, Response, NextFunction } from "express";

// Validación de entrada para registro
export const validateRegisterInput = (req: Request, res: Response, next: NextFunction) => {
  const { email, password, nombre } = req.body;

  // Validar que los campos requeridos estén presentes
  if (!email || !password || !nombre) {
    return res.status(400).json({ msg: "Email, contraseña y nombre son requeridos" });
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ msg: "Email inválido" });
  }

  // Validar longitud de contraseña
  if (password.length < 6) {
    return res.status(400).json({ msg: "La contraseña debe tener al menos 6 caracteres" });
  }

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
  const { nombre, apellido, telefono, nacionalidad, especialidades } = req.body;

  // Al menos uno de estos campos debe estar presente
  if (!nombre && !apellido && !telefono && !nacionalidad && !especialidades) {
    return res.status(400).json({ msg: "Debe proporcionar al menos un campo para actualizar" });
  }

  next();
};
