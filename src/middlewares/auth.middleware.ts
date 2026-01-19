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
    console.log(`🔐 [authMiddleware] Petición: [${req.method}] ${req.url}`);
    console.log(`   - Auth header: ${authHeader ? authHeader.substring(0, 30) + '...' : 'VACIO'}`);
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const parts = authHeader.split(" ");
      if (parts.length === 2) {
        token = parts[1];
        console.log(`   ✅ Token extraído del header Authorization`);
      }
    }

    // Si no hay token en header, intenta leer de las cookies
    if (!token && req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
      console.log(`   ✅ Token extraído de cookies`);
    }

    if (!token) {
      console.log(`   ❌ Token no proporcionado`);
      return res.status(401).json({ msg: "Token no proporcionado" });
    }
    
    console.log(`   ✅ Token encontrado, validando...`);

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

    console.log(`   ✅ Token validado correctamente`);
    console.log(`   - UID: ${req.user.uid}`);
    console.log(`   - Email: ${req.user.email}`);
    console.log(`   - Role: ${req.user.role}`);

    next();
  } catch (error: any) {
    console.error(`   ❌ Error en autenticación:`, error.message);
    return res.status(401).json({ msg: "Token inválido o expirado" });
  }
};
