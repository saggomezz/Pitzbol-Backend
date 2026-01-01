import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const allowRoles = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ msg: "No autenticado" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        msg: "No tienes permisos para esta acción",
      });
    }

    next();
  };
};
