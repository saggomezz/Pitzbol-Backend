import { Request as ExpressRequest, Response } from "express";
import { db } from "../config/firebase";
import admin from "firebase-admin";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
});

interface RequestWithUser extends ExpressRequest {
  user?: { uid: string; email?: string; [key: string]: any };
}

function parseJ<T>(value: unknown): T | null {
  if (!value || value === "") return null;
  if (typeof value === "object") return value as T;
  try { return JSON.parse(value as string) as T; } catch { return null; }
}

// GET /api/paquetes — todos los paquetes públicos (status "activo" o sin status)
export const getPublicPaquetes = async (_req: ExpressRequest, res: Response) => {
  try {
    const snap = await db.collection("paquetes").get();
    const paquetes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((p: any) => !p.status || p.status === "activo");
    res.json({ success: true, paquetes });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/paquetes/guia/:guiaId — paquetes de un guía
export const getPaquetesByGuia = async (req: ExpressRequest, res: Response) => {
  try {
    const { guiaId } = req.params;
    const snap = await db.collection("paquetes").where("guiaId", "==", guiaId).get();
    const paquetes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, paquetes });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/paquetes/:id
export const getPaqueteById = async (req: ExpressRequest, res: Response) => {
  try {
    const doc = await db.collection("paquetes").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Paquete no encontrado" });
    res.json({ success: true, paquete: { id: doc.id, ...doc.data() } });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/paquetes — crear paquete (guía autenticado)
export const createPaquete = async (req: RequestWithUser, res: Response) => {
  try {
    const ownerUid = req.user?.uid;
    if (!ownerUid) return res.status(401).json({ success: false, message: "No autorizado" });

    const { titulo, descripcion, destino, duracion, precio, idiomas, queIncluye, puntoSalida, capacidad } = req.body;
    if (!titulo || !destino) return res.status(400).json({ success: false, message: "Faltan campos: titulo, destino" });

    // Verificar que es guía
    const guiaSnap = await db.collection("usuarios").doc("guias").collection("lista")
      .where("uid", "==", ownerUid).limit(1).get();
    if (guiaSnap.empty) return res.status(403).json({ success: false, message: "No eres un guía verificado" });
    const guiaData = guiaSnap.docs[0].data();

    // Subir hasta 3 fotos
    const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const fotoFiles = filesObj?.["fotos"] || [];
    const uploadFoto = (file: Express.Multer.File): Promise<string> =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: `pitzbol/paquetes/${ownerUid}`, resource_type: "image" },
          (error, result) => {
            if (error || !result?.secure_url) return reject(error || new Error("Sin URL"));
            resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
    const fotos = fotoFiles.length > 0
      ? await Promise.all(fotoFiles.slice(0, 3).map(uploadFoto))
      : [];
    const fotoPrincipal = fotos[0] || "";

    const ref = db.collection("paquetes").doc();
    const data = {
      id: ref.id,
      guiaId: ownerUid,
      guiaNombre: `${guiaData["01_nombre"] || ""} ${guiaData["02_apellido"] || ""}`.trim(),
      guiaFoto: guiaData["14_foto_perfil"]?.url || "",
      titulo,
      descripcion: descripcion || "",
      destino,
      duracion: duracion || "",
      precio: precio || "",
      idiomas: parseJ<string[]>(idiomas) || [],
      queIncluye: parseJ<string[]>(queIncluye) || [],
      puntoSalida: puntoSalida || "",
      capacidad: capacidad || "",
      fotos,
      fotoPrincipal,
      status: "activo",
      createdAt: new Date().toISOString(),
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(data);
    res.json({ success: true, paquete: { ...data, id: ref.id } });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// PATCH /api/paquetes/:id
export const updatePaquete = async (req: RequestWithUser, res: Response) => {
  try {
    const ownerUid = req.user?.uid;
    const doc = await db.collection("paquetes").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Paquete no encontrado" });
    if (doc.data()?.guiaId !== ownerUid) return res.status(403).json({ success: false, message: "Sin permiso" });

    const { titulo, descripcion, destino, duracion, precio, idiomas, queIncluye, puntoSalida, capacidad, status } = req.body;
    const updates: any = { updatedAt: new Date().toISOString() };
    if (titulo !== undefined) updates.titulo = titulo;
    if (descripcion !== undefined) updates.descripcion = descripcion;
    if (destino !== undefined) updates.destino = destino;
    if (duracion !== undefined) updates.duracion = duracion;
    if (precio !== undefined) updates.precio = precio;
    if (idiomas !== undefined) updates.idiomas = parseJ<string[]>(idiomas) || [];
    if (queIncluye !== undefined) updates.queIncluye = parseJ<string[]>(queIncluye) || [];
    if (puntoSalida !== undefined) updates.puntoSalida = puntoSalida;
    if (capacidad !== undefined) updates.capacidad = capacidad;
    if (status !== undefined) updates.status = status;

    const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const fotoFiles = filesObj?.["fotos"] || [];
    if (fotoFiles.length > 0) {
      const uploadFoto = (file: Express.Multer.File): Promise<string> =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: `pitzbol/paquetes/${ownerUid}`, resource_type: "image" },
            (error, result) => {
              if (error || !result?.secure_url) return reject(error || new Error("Sin URL"));
              resolve(result.secure_url);
            }
          );
          stream.end(file.buffer);
        });
      updates.fotos = await Promise.all(fotoFiles.slice(0, 3).map(uploadFoto));
      updates.fotoPrincipal = updates.fotos[0];
    }

    await db.collection("paquetes").doc(req.params.id).update(updates);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/paquetes/:id
export const deletePaquete = async (req: RequestWithUser, res: Response) => {
  try {
    const ownerUid = req.user?.uid;
    const doc = await db.collection("paquetes").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Paquete no encontrado" });
    if (doc.data()?.guiaId !== ownerUid) return res.status(403).json({ success: false, message: "Sin permiso" });
    await db.collection("paquetes").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/paquetes/:id/ocupacion?fecha=YYYY-MM-DD — plazas ocupadas para una fecha
export const getPaqueteOcupacion = async (req: ExpressRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { fecha } = req.query;
    if (!fecha || typeof fecha !== "string") {
      return res.status(400).json({ success: false, message: "Falta el parámetro 'fecha'" });
    }

    const doc = await db.collection("paquetes").doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Paquete no encontrado" });
    const capacidad = parseInt(doc.data()?.capacidad || "0", 10);

    const bookingsSnap = await db.collection("bookings")
      .where("paqueteId", "==", id)
      .where("fecha", "==", fecha)
      .get();

    const ACTIVE_STATUSES = ["pendiente", "confirmado", "pagado"];
    let personasOcupadas = 0;
    bookingsSnap.forEach((d) => {
      const data = d.data();
      if (ACTIVE_STATUSES.includes(data.status)) {
        personasOcupadas += Number(data.numPersonas) || 0;
      }
    });

    res.json({
      success: true,
      capacidad,
      personasOcupadas,
      disponibles: Math.max(0, capacidad - personasOcupadas),
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};
