import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    role: string;
  };
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ msg: "Authorization header requerido" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Formato de token inválido" });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2) {
      return res.status(401).json({ msg: "Token malformado" });
    }

    const token = parts[1];

    if (!token) {
      return res.status(401).json({ msg: "Token no proporcionado" });
    }

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET no definido");
    }

    const secret: string = JWT_SECRET;

    const decoded = jwt.verify(token, secret) as JwtPayload;

    req.user = {
      uid: decoded.uid as string,
      email: decoded.email as string,
      role: decoded.role as string,
    };

    next();
  } catch (error) {
    return res.status(401).json({ msg: "Token inválido o expirado" });
  }
};
