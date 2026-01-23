import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
    console.log("🔒 [requireAdmin] Verificando rol de admin");
    console.log("   - Usuario:", req.user ? req.user.uid : "NO AUTENTICADO");
    console.log("   - Rol:", req.user ? req.user.role : "NINGUNO");

  if (!req.user) {
    console.warn("⚠️ [requireAdmin] Usuario no autenticado");
    return res.status(401).json({ 
      success: false,
      msg: "Usuario no autenticado" 
    });
  }

  if (req.user.role !== "admin") {
    console.warn(`⚠️ [requireAdmin] Acceso denegado. Rol actual: ${req.user.role}`);
    return res.status(403).json({ 
      success: false,
      msg: "Acceso denegado. Se requiere rol de administrador" 
    });
    console.log("✅ [requireAdmin] Acceso concedido");
  }

  next();
};
