import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const isGuide = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== "guia") {
    return res.status(403).json({
      msg: "Acceso solo para guías",
    });
  }

  next();
};
