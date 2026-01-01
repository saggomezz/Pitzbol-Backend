import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const isBusiness = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== "negociante") {
    return res.status(403).json({
      msg: "Acceso solo para negocios",
    });
  }

  next();
};
