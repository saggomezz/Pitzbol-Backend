import { Request, Response } from 'express';
import { db } from '../config/firebase';

interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

function normalizeName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBusinessName(data: any): string {
  const business = data?.business || {};
  return String(
    business?.name || data?.name || data?.businessName || ''
  ).trim();
}

function sanitizeFavorites(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;

    const key = normalizeName(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

async function getExistingFavoriteNameSet(): Promise<Set<string>> {
  const [placesSnap, activeBusinessesSnap] = await Promise.all([
    db.collection('lugares').get(),
    db.collection('negocios').doc('Activos').collection('items').get(),
  ]);

  const existing = new Set<string>();

  placesSnap.docs.forEach((doc) => {
    const nombre = String(doc.data()?.nombre || '').trim();
    const key = normalizeName(nombre);
    if (key) existing.add(key);
  });

  activeBusinessesSnap.docs.forEach((doc) => {
    const nombre = getBusinessName(doc.data());
    const key = normalizeName(nombre);
    if (key) existing.add(key);
  });

  return existing;
}

function filterValidFavorites(favorites: string[], existingNames: Set<string>): string[] {
  return favorites.filter((name) => existingNames.has(normalizeName(name)));
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
    const rawFavorites = Array.isArray(userData?.favorites) ? userData?.favorites : [];
    const normalizedFavorites = sanitizeFavorites(rawFavorites);
    const existingNames = await getExistingFavoriteNameSet();
    const favorites = filterValidFavorites(normalizedFavorites, existingNames);

    // Persistir limpieza automática de favoritos huérfanos
    if (favorites.length !== rawFavorites.length) {
      await userDoc.ref.update({
        favorites,
        updatedAt: new Date().toISOString(),
      });
    }

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
    const currentFavorites = sanitizeFavorites(Array.isArray(userData?.favorites) ? userData.favorites : []);

    const existingNames = await getExistingFavoriteNameSet();
    if (!existingNames.has(normalizeName(nombreLugar))) {
      return res.status(404).json({
        success: false,
        message: 'El lugar o negocio ya no existe y no puede agregarse a favoritos',
      });
    }

    // Verificar si ya existe
    if (currentFavorites.some((fav) => normalizeName(fav) === normalizeName(nombreLugar))) {
      return res.status(400).json({
        success: false,
        message: 'Este lugar ya está en favoritos'
      });
    }

    // Agregar el nuevo favorito
    const updatedFavorites = [...currentFavorites, nombreLugar.trim()];
    
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
    const currentFavorites = sanitizeFavorites(Array.isArray(userData?.favorites) ? userData.favorites : []);

    // Filtrar el favorito a eliminar
    const target = normalizeName(nombreLugar);
    const updatedFavorites = currentFavorites.filter((fav: string) => normalizeName(fav) !== target);

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

    // Combinar favoritos locales con los del servidor, limpiar inválidos y mantener solo existentes
    const favoritosUnicos = sanitizeFavorites([...currentFavorites, ...favoritosLocales]);
    const existingNames = await getExistingFavoriteNameSet();
    const favoritosValidos = filterValidFavorites(favoritosUnicos, existingNames);

    await userRef.update({
      favorites: favoritosValidos,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Favoritos sincronizados correctamente',
      favorites: favoritosValidos
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
