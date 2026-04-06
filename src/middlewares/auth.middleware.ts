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

/**
 * Middleware de autenticación opcional.
 * Si hay token, lo valida y adjunta req.user.
 * Si no hay token o el token es inválido/expirado, continúa sin req.user (no rechaza).
 */
export const optionalAuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const parts = authHeader.split(" ");
      if (parts.length === 2) token = parts[1];
    }
    if (!token && req.cookies?.authToken) {
      token = req.cookies.authToken;
    }

    if (!token || !JWT_SECRET) return next();

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      req.user = {
        uid: decoded.uid as string,
        email: decoded.email as string,
        role: decoded.role as string,
      };
      console.log(`   ✅ [optionalAuth] Usuario autenticado: ${req.user.uid}`);
    } catch {
      // Token inválido o expirado — continuar sin usuario
      console.log(`   ℹ️ [optionalAuth] Token inválido o ausente, continuando anónimo`);
    }

    next();
  } catch (error: any) {
    next(); // Nunca bloqueamos la petición en auth opcional
  }
};
