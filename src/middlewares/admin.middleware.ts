import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ msg: "Usuario no autenticado" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ msg: "Acceso denegado. Se requiere rol de administrador" });
  }

  next();
};
