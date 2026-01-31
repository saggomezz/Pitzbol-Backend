import { Request, Response } from 'express';
import { db } from '../config/firebase';

interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

/**
 * Obtener todos los favoritos del usuario
 */
export const obtenerFavoritos = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const userData = userDoc.data();
    const favorites = userData?.favorites || [];

    res.json({
      success: true,
      favorites
    });

  } catch (error: any) {
    console.error('Error al obtener favoritos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener favoritos',
      error: error.message
    });
  }
};

/**
 * Agregar un lugar a favoritos
 */
export const agregarFavorito = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    const { nombreLugar } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!nombreLugar || typeof nombreLugar !== 'string' || nombreLugar.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre del lugar es requerido'
      });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const userData = userDoc.data();
    const currentFavorites = userData?.favorites || [];

    // Verificar si ya existe
    if (currentFavorites.includes(nombreLugar)) {
      return res.status(400).json({
        success: false,
        message: 'Este lugar ya está en favoritos'
      });
    }

    // Agregar el nuevo favorito
    const updatedFavorites = [...currentFavorites, nombreLugar];
    
    await userRef.update({
      favorites: updatedFavorites,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Lugar agregado a favoritos',
      favorites: updatedFavorites
    });

  } catch (error: any) {
    console.error('Error al agregar favorito:', error);
    res.status(500).json({
      success: false,
      message: 'Error al agregar favorito',
      error: error.message
    });
  }
};

/**
 * Eliminar un lugar de favoritos
 */
export const eliminarFavorito = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    const { nombreLugar } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!nombreLugar || typeof nombreLugar !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'El nombre del lugar es requerido'
      });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const userData = userDoc.data();
    const currentFavorites = userData?.favorites || [];

    // Filtrar el favorito a eliminar
    const updatedFavorites = currentFavorites.filter((fav: string) => fav !== nombreLugar);

    await userRef.update({
      favorites: updatedFavorites,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Lugar eliminado de favoritos',
      favorites: updatedFavorites
    });

  } catch (error: any) {
    console.error('Error al eliminar favorito:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar favorito',
      error: error.message
    });
  }
};

/**
 * Sincronizar favoritos desde localStorage
 * (útil cuando el usuario se loguea y tiene favoritos locales)
 */
export const sincronizarFavoritos = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    const { favoritosLocales } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!Array.isArray(favoritosLocales)) {
      return res.status(400).json({
        success: false,
        message: 'Los favoritos deben ser un array'
      });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const userData = userDoc.data();
    const currentFavorites = userData?.favorites || [];

    // Combinar favoritos locales con los del servidor (sin duplicados)
    const favoritosUnicos = Array.from(new Set([...currentFavorites, ...favoritosLocales]));

    await userRef.update({
      favorites: favoritosUnicos,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Favoritos sincronizados correctamente',
      favorites: favoritosUnicos
    });

  } catch (error: any) {
    console.error('Error al sincronizar favoritos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al sincronizar favoritos',
      error: error.message
    });
  }
};
