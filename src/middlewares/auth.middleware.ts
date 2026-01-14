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
    let token: string | undefined;

    // Intenta leer del header Authorization primero
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const parts = authHeader.split(" ");
      if (parts.length === 2) {
        token = parts[1];
      }
    }

    // Si no hay token en header, intenta leer de las cookies
    if (!token && req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
    }

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
  } catch (error: any) {
    return res.status(401).json({ msg: "Token inválido o expirado" });
  }
};
