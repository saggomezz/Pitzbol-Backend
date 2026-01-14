import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

/**
 * Middleware de autenticación con JWT
 * Valida el token Bearer enviado en el header Authorization
 * Añade los datos del usuario decodificado a req.user
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1 Obtener el token del header Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
      console.warn('⚠️ Intento de acceso sin token');
      return res.status(401).json({ 
        error: 'Token no proporcionado',
        message: 'Se requiere autenticación'
      });
    }

    // 2 Verificar y decodificar el token con Firebase
    try {
      const decodedToken = await auth.verifyIdToken(token);
      
      // 3 Añadir información del usuario al request
      (req as any).user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        claims: decodedToken.claims
      };

      console.log(`✅ Token validado para usuario: ${decodedToken.uid}`);
      next();

    } catch (tokenError: any) {
      console.error('❌ Error al verificar token:', tokenError.message);
      
      if (tokenError.code === 'auth/id-token-expired') {
        return res.status(401).json({ 
          error: 'Token expirado',
          message: 'Por favor, inicia sesión de nuevo'
        });
      }
      
      return res.status(403).json({ 
        error: 'Token inválido',
        message: 'Credenciales no válidas'
      });
    }

  } catch (error: any) {
    console.error('❌ Error en middleware de autenticación:', error);
    return res.status(500).json({ 
      error: 'Error interno en autenticación'
    });
  }
};

/**
 * Middleware opcional de autenticación (no falla si no hay token)
 * Útil para rutas que pueden ser públicas o privadas
 */
export const authenticateTokenOptional = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decodedToken = await auth.verifyIdToken(token);
        (req as any).user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name,
          claims: decodedToken.claims
        };
        console.log(`✅ Usuario autenticado: ${decodedToken.uid}`);
      } catch (error) {
        console.warn('⚠️ Token inválido pero el acceso es opcional');
      }
    }

    next();

  } catch (error: any) {
    console.error('❌ Error en middleware opcional:', error);
    next(); // Continuar aunque haya error
  }
};

/**
 * Middleware de validación de rol
 * Verifica que el usuario tenga un rol específico
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      const userRole = user.claims?.role;

      if (!allowedRoles.includes(userRole)) {
        console.warn(`⚠️ Usuario ${user.uid} sin permisos. Rol requerido: ${allowedRoles.join(', ')}, tiene: ${userRole}`);
        return res.status(403).json({ 
          error: 'Permiso denegado',
          message: `Se requiere rol: ${allowedRoles.join(' o ')}`
        });
      }

      next();

    } catch (error: any) {
      console.error('❌ Error en validación de rol:', error);
      res.status(500).json({ error: 'Error interno en validación' });
    }
  };
};
