import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createMockFirestore } from "../mocks/mockFirestore";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret";
process.env.FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "test_firebase_web_api_key";

const mockDb = createMockFirestore();

vi.doMock("../../src/config/firebase", () => ({
  db: mockDb,
}));

vi.doMock("../../src/services/notification.service", () => ({
  sendNotificationToAdmins: vi.fn(),
  sendNotificationToUser: vi.fn(),
}));

vi.doMock("firebase-admin", () => ({
  default: {
    firestore: {
      FieldValue: {
        delete: vi.fn(() => "FIELD_DELETE"),
      },
    },
  },
}));

vi.doMock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn(),
    },
  },
}));

function createToken(uid: string, role: string) {
  return jwt.sign(
    {
      uid,
      email: `${uid}@pitzbol.test`,
      role,
    },
    process.env.JWT_SECRET as string
  );
}

describe("guide role integration", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const { default: guideRoutes } = await import("../../src/routes/guide.routes");
    const app = express();
    app.use(express.json());
    app.use("/api/guides", guideRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  beforeEach(() => {
    mockDb._getStore().clear();
  });

  it("returns the pending guide request for the authenticated guide", async () => {
    await mockDb
      .collection("usuarios")
      .doc("guias")
      .collection("pendientes")
      .doc("pending-guide-1")
      .set({
        uid: "guide-1",
        "01_nombre": "Ana",
        "04_correo": "ana@pitzbol.me",
        "08_rfc": "RFC123",
        "10_cp": "44100",
        "07_especialidades": ["cultura"],
        "18_validacion_biometrica": { porcentaje: 97, mensaje: "Validado" },
        "13_foto_rostro": { secure_url: "https://img/face.png" },
        createdAt: "2026-05-01T10:00:00.000Z",
      });

    const response = await fetch(`${baseUrl}/api/guides/my-request`, {
      headers: {
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        status: "pendiente",
        uid: "guide-1",
        facePhoto: "https://img/face.png",
      })
    );
  });

  it("rejects non-guide users from publishing tours", async () => {
    const response = await fetch(`${baseUrl}/api/guides/add-tour`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken("tourist-1", "turista")}`,
      },
      body: JSON.stringify({
        guideId: "guide-1",
        titulo: "Centro histórico",
        duracion: 2,
        precio: 500,
        maxPersonas: 8,
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      msg: "Acceso solo para guías",
    });
  });

  it("rejects a guide trying to publish tours for another guide", async () => {
    const response = await fetch(`${baseUrl}/api/guides/add-tour`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
      body: JSON.stringify({
        guideId: "guide-2",
        titulo: "Centro histórico",
        duracion: 2,
        precio: 500,
        maxPersonas: 8,
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes publicar tours para otro guía",
    });
    expect(mockDb.getDocumentsAtPath("usuarios/guias/lista/guide-1/tours_publicados")).toHaveLength(0);
    expect(mockDb.getDocumentsAtPath("usuarios/guias/lista/guide-2/tours_publicados")).toHaveLength(0);
  });

  it("requires authentication to update the guide profile", async () => {
    const response = await fetch(`${baseUrl}/api/guides/update`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: "guide-1",
        categorias: ["arte"],
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      msg: "Token no proporcionado",
    });
  });

  it("rejects a guide trying to update another guide profile", async () => {
    await mockDb
      .collection("usuarios")
      .doc("guias")
      .collection("lista")
      .doc("guide-doc-1")
      .set({
        uid: "guide-1",
        "07_especialidades": ["cultura"],
      });

    await mockDb
      .collection("usuarios")
      .doc("guias")
      .collection("lista")
      .doc("guide-doc-2")
      .set({
        uid: "guide-2",
        "07_especialidades": ["historia"],
      });

    const response = await fetch(`${baseUrl}/api/guides/update`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
      body: JSON.stringify({
        uid: "guide-2",
        categorias: ["arte", "gastronomia"],
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes actualizar el perfil de otro guía",
    });

    const ownGuideDocs = mockDb.getDocumentsAtPath("usuarios/guias/lista");
    expect(ownGuideDocs.find((doc) => doc.id === "guide-doc-1")?.data()).toEqual({
      uid: "guide-1",
      "07_especialidades": ["cultura"],
    });
    expect(ownGuideDocs.find((doc) => doc.id === "guide-doc-2")?.data()).toEqual({
      uid: "guide-2",
      "07_especialidades": ["historia"],
    });
  });
});