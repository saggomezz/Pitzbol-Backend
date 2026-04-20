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

export const createTour = async (req: RequestWithUser, res: Response) => {
  try {
    const ownerUid = req.user?.uid;
    if (!ownerUid) return res.status(401).json({ success: false, message: "No autorizado" });

    const {
      empresaId, guiaId, tipoGuia, titulo, descripcion, destino, duracion, precio,
      idiomas, queIncluye, puntoRecogida, capacidad, tipoVehiculo, disponibilidad,
      incluyeTransporte,
    } = req.body;

    if (!titulo || !destino) {
      return res.status(400).json({ success: false, message: "Faltan campos: titulo, destino" });
    }

    // Determinar propietario: empresa de negocios o guía
    let propietarioNombre = "";
    let propietarioLogo = "";
    let propietarioId = "";
    const esGuia = !!guiaId;

    if (esGuia) {
      // Verificar guía en Firebase
      const guiaSnap = await db.collection("usuarios").doc("guias").collection("lista")
        .where("uid", "==", ownerUid).limit(1).get();
      if (guiaSnap.empty) return res.status(403).json({ success: false, message: "No eres un guía verificado" });
      const guiaData = guiaSnap.docs[0].data();
      propietarioId = guiaId;
      propietarioNombre = guiaData?.empresaNombre || guiaData?.["01_nombre"] || "";
      propietarioLogo = guiaData?.empresaLogo || guiaData?.["14_foto_perfil"]?.url || "";
    } else {
      if (!empresaId) return res.status(400).json({ success: false, message: "Falta empresaId" });
      const empresaSnap = await db.collection("negocios").doc("Activos").collection("items").doc(empresaId).get();
      if (!empresaSnap.exists) return res.status(404).json({ success: false, message: "Empresa no encontrada" });
      const empresaData = empresaSnap.data();
      const empresaOwnerUid = empresaData?.ownerUid || empresaData?.business?.owner || empresaData?.owner;
      if (empresaOwnerUid !== ownerUid) return res.status(403).json({ success: false, message: "No tienes permiso para publicar en esta empresa" });
      propietarioId = empresaId;
      propietarioNombre = empresaData?.business?.name || "";
      propietarioLogo = empresaData?.business?.logo || "";
    }

    // Subir hasta 3 fotos del tour a Cloudinary
    const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const uploadedFotos: string[] = [];
    const fotosFiles = filesObj?.["fotos"] || [];
    for (const file of fotosFiles) {
      const url = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: `pitzbol/tours/${propietarioId}`, resource_type: "image" },
          (error, result) => {
            if (error || !result?.secure_url) return reject(error || new Error("Sin URL"));
            resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
      uploadedFotos.push(url);
    }
    const fotoPrincipal = uploadedFotos[0] || "";

    const tourRef = db.collection("tours").doc();
    const tourData = {
      id: tourRef.id,
      ...(esGuia ? { guiaId: propietarioId } : { empresaId: propietarioId }),
      tipoGuia: tipoGuia || (esGuia ? "persona" : "empresa"),
      empresaNombre: propietarioNombre,
      empresaLogo: propietarioLogo,
      titulo,
      descripcion: descripcion || "",
      destino,
      fotoPrincipal,
      fotos: uploadedFotos,
      duracion: duracion || "",
      precio: precio || "",
      idiomas: parseJ<string[]>(idiomas) || [],
      queIncluye: parseJ<string[]>(queIncluye) || [],
      puntoRecogida: puntoRecogida || "",
      capacidad: capacidad || "",
      incluyeTransporte: incluyeTransporte === "true" || incluyeTransporte === true,
      tipoVehiculo: parseJ<string[]>(tipoVehiculo) || [],
      disponibilidad: disponibilidad || "",
      status: "activo",
      createdAt: new Date().toISOString(),
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await tourRef.set(tourData);
    return res.status(201).json({ success: true, tour: { ...tourData, id: tourRef.id } });
  } catch (error: any) {
    console.error("Error createTour:", error);
    return res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const getPublicTours = async (req: ExpressRequest, res: Response) => {
  try {
    const snap = await db.collection("tours").where("status", "==", "activo").get();
    const tours = snap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .sort((a: any, b: any) => (b.createdAt > a.createdAt ? 1 : -1));
    return res.json({ success: true, tours });
  } catch (error: any) {
    console.error("Error getPublicTours:", error);
    return res.status(500).json({ success: false, tours: [] });
  }
};

export const getGuiaTours = async (req: ExpressRequest, res: Response) => {
  try {
    const guiaId = String(req.params.guiaId);
    const snap = await db.collection("tours")
      .where("guiaId", "==", guiaId)
      .where("status", "==", "activo")
      .get();
    const tours = snap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .sort((a: any, b: any) => (b.createdAt > a.createdAt ? 1 : -1));
    return res.json({ success: true, tours });
  } catch (error: any) {
    console.error("Error getGuiaTours:", error);
    return res.status(500).json({ success: false, tours: [] });
  }
};

export const getEmpresaTours = async (req: ExpressRequest, res: Response) => {
  try {
    const empresaId = String(req.params.empresaId);
    const snap = await db.collection("tours")
      .where("empresaId", "==", empresaId)
      .where("status", "==", "activo")
      .get();
    const tours = snap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .sort((a: any, b: any) => (b.createdAt > a.createdAt ? 1 : -1));
    return res.json({ success: true, tours });
  } catch (error: any) {
    console.error("Error getEmpresaTours:", error);
    return res.status(500).json({ success: false, tours: [] });
  }
};

export const getTourById = async (req: ExpressRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const snap = await db.collection("tours").doc(id).get();
    if (!snap.exists) return res.status(404).json({ success: false, message: "Tour no encontrado" });
    return res.json({ success: true, tour: { ...snap.data(), id: snap.id } });
  } catch (error: any) {
    console.error("Error getTourById:", error);
    return res.status(500).json({ success: false });
  }
};

export const updateTour = async (req: RequestWithUser, res: Response) => {
  try {
    const ownerUid = req.user?.uid;
    const id = String(req.params.id);
    if (!ownerUid) return res.status(401).json({ success: false });

    const snap = await db.collection("tours").doc(id).get();
    if (!snap.exists) return res.status(404).json({ success: false, message: "Tour no encontrado" });

    const tourData = snap.data();
    const guiaId = tourData?.guiaId;
    const empresaId = tourData?.empresaId;

    if (guiaId) {
      const guiaSnap = await db.collection("usuarios").doc("guias").collection("lista")
        .where("uid", "==", ownerUid).limit(1).get();
      if (guiaSnap.empty) return res.status(403).json({ success: false });
    } else if (empresaId) {
      const empresaSnap = await db.collection("negocios").doc("Activos").collection("items").doc(empresaId).get();
      const empData = empresaSnap.data();
      const ownerField = empData?.ownerUid || empData?.business?.owner || empData?.owner;
      if (ownerField !== ownerUid) return res.status(403).json({ success: false });
    }

    const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const newFotos: string[] = [];
    const fotosFiles = filesObj?.["fotos"] || [];
    const propietarioId = guiaId || empresaId || ownerUid;
    for (const file of fotosFiles) {
      const url = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: `pitzbol/tours/${propietarioId}`, resource_type: "image" },
          (error, result) => {
            if (error || !result?.secure_url) return reject(error || new Error("Sin URL"));
            resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
      newFotos.push(url);
    }

    const allowed = ["titulo", "descripcion", "destino", "duracion", "precio", "puntoRecogida",
      "capacidad", "disponibilidad", "incluyeTransporte", "tipoVehiculo", "idiomas", "queIncluye"];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = parseJ(req.body[key]) ?? req.body[key];
      }
    }
    if (newFotos.length > 0) {
      updates.fotos = newFotos;
      updates.fotoPrincipal = newFotos[0];
    }
    updates.updatedAt = new Date().toISOString();

    await db.collection("tours").doc(id).update(updates);
    const updated = (await db.collection("tours").doc(id).get()).data();
    return res.json({ success: true, tour: { ...updated, id } });
  } catch (error: any) {
    console.error("Error updateTour:", error);
    return res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const deleteTour = async (req: RequestWithUser, res: Response) => {
  try {
    const ownerUid = req.user?.uid;
    const id = String(req.params.id);
    if (!ownerUid) return res.status(401).json({ success: false });

    const snap = await db.collection("tours").doc(id).get();
    if (!snap.exists) return res.status(404).json({ success: false });

    const tourData = snap.data();
    const empresaId = tourData?.empresaId;
    if (empresaId) {
      const empresaSnap = await db.collection("negocios").doc("Activos").collection("items").doc(empresaId).get();
      const empresaData = empresaSnap.data();
      const empresaOwnerUid = empresaData?.ownerUid || empresaData?.business?.owner || empresaData?.owner;
      if (empresaOwnerUid !== ownerUid) return res.status(403).json({ success: false });
    }

    await db.collection("tours").doc(id).update({ status: "pausado" });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleteTour:", error);
    return res.status(500).json({ success: false });
  }
};
