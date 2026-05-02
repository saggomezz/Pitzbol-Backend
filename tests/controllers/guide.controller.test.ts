import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest, createMockResponse } from "../utils/http";

const {
  collectionMock,
  pendingSetMock,
  touristDeleteMock,
  pendingWhereGetMock,
  approvedWhereGetMock,
  verifiedGuidesGetMock,
  guideListWhereGetMock,
  updateDocMock,
  sendNotificationToAdminsMock,
  sendNotificationToUserMock,
  uploadStreamMock,
  fieldDeleteMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  pendingSetMock: vi.fn(),
  touristDeleteMock: vi.fn(),
  pendingWhereGetMock: vi.fn(),
  approvedWhereGetMock: vi.fn(),
  verifiedGuidesGetMock: vi.fn(),
  guideListWhereGetMock: vi.fn(),
  updateDocMock: vi.fn(),
  sendNotificationToAdminsMock: vi.fn(),
  sendNotificationToUserMock: vi.fn(),
  uploadStreamMock: vi.fn(),
  fieldDeleteMock: vi.fn(() => "FIELD_DELETE"),
}));

vi.mock("../../src/config/firebase", () => ({
  db: {
    collection: collectionMock,
  },
}));

vi.mock("../../src/services/notification.service", () => ({
  sendNotificationToAdmins: sendNotificationToAdminsMock,
  sendNotificationToUser: sendNotificationToUserMock,
}));

vi.mock("firebase-admin", () => ({
  default: {
    firestore: {
      FieldValue: {
        delete: fieldDeleteMock,
      },
    },
  },
}));

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: uploadStreamMock,
    },
  },
}));

import {
  getGuidePublicProfile,
  getGuideRequest,
  getVerifiedGuides,
  registerGuide,
  updateGuideProfile,
} from "../../src/controllers/guide.controller";

function createSnapshot(docs: Array<{ id?: string; data: () => any; ref?: { update?: typeof updateDocMock } }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((doc, index) => ({
      id: doc.id ?? `doc-${index + 1}`,
      exists: true,
      data: doc.data,
      ref: doc.ref ?? { update: updateDocMock },
    })),
  };
}

describe("guide.controller", () => {
  beforeEach(() => {
    collectionMock.mockReset();
    pendingSetMock.mockReset();
    touristDeleteMock.mockReset();
    pendingWhereGetMock.mockReset();
    approvedWhereGetMock.mockReset();
    verifiedGuidesGetMock.mockReset();
    guideListWhereGetMock.mockReset();
    updateDocMock.mockReset();
    sendNotificationToAdminsMock.mockReset();
    sendNotificationToUserMock.mockReset();
    uploadStreamMock.mockReset();
    fieldDeleteMock.mockClear();

    uploadStreamMock.mockImplementation((_options, callback) => ({
      end: () => callback(null, { secure_url: "https://img/logo.png" }),
    }));

    collectionMock.mockImplementation((name: string) => {
      if (name !== "usuarios") {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        doc: vi.fn((docId: string) => {
          if (docId === "guias") {
            return {
              collection: vi.fn((collectionName: string) => {
                if (collectionName === "pendientes") {
                  return {
                    doc: vi.fn(() => ({ set: pendingSetMock })),
                    where: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        get: pendingWhereGetMock,
                      })),
                    })),
                  };
                }

                if (collectionName === "lista") {
                  return {
                    where: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        get: guideListWhereGetMock,
                      })),
                    })),
                    get: verifiedGuidesGetMock,
                  };
                }

                throw new Error(`Unexpected guias collection: ${collectionName}`);
              }),
            };
          }

          if (docId === "turistas") {
            return {
              collection: vi.fn((collectionName: string) => {
                if (collectionName !== "lista") {
                  throw new Error(`Unexpected turistas collection: ${collectionName}`);
                }

                return {
                  doc: vi.fn(() => ({ delete: touristDeleteMock })),
                  where: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      get: approvedWhereGetMock,
                    })),
                  })),
                };
              }),
            };
          }

          throw new Error(`Unexpected usuarios doc: ${docId}`);
        }),
      };
    });
  });

  it("returns 400 when registerGuide is missing uid", async () => {
    const req = createMockRequest({ body: { nombre: "Ana" } });
    const res = createMockResponse();

    await registerGuide(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "El UID es obligatorio." });
  });

  it("stores a pending guide request and notifies admins and user", async () => {
    const req = createMockRequest({
      body: {
        uid: "guide-1",
        nombre: "Ana",
        apellido: "Lopez",
        email: "ana@pitzbol.me",
        telefono: "+523300000000",
        nacionalidad: "MX",
        categorias: '["cultura","gastronomia"]',
        tipo: "empresa",
        empresaNombre: "Ana Tours",
        empresaPagina: "https://anatours.mx",
        precioMXN: 900,
      },
      files: {
        empresaLogo: [{ buffer: Buffer.from("logo") }],
      },
    });
    const res = createMockResponse();

    await registerGuide(req, res);

    expect(pendingSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "guide-1",
        "01_nombre": "Ana",
        "03_rol": "turista",
        "07_especialidades": ["cultura", "gastronomia"],
        "16_status": "en_revision",
        empresaNombre: "Ana Tours",
        empresaLogo: "https://img/logo.png",
      })
    );
    expect(touristDeleteMock).toHaveBeenCalled();
    expect(sendNotificationToAdminsMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationToUserMock).toHaveBeenCalledWith(
      "guide-1",
      expect.objectContaining({ tipo: "solicitud_guia_enviada" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns a pending guide request for the authenticated user", async () => {
    pendingWhereGetMock.mockResolvedValue(
      createSnapshot([
        {
          data: () => ({
            uid: "guide-1",
            "01_nombre": "Ana",
            "04_correo": "ana@pitzbol.me",
            "08_rfc": "RFC123",
            "10_cp": "44100",
            "07_especialidades": ["cultura"],
            "18_validacion_biometrica": { porcentaje: 98, mensaje: "Validado" },
            "13_foto_rostro": { secure_url: "https://img/face.png" },
            createdAt: "2026-04-29T12:00:00.000Z",
          }),
        },
      ])
    );
    const req = createMockRequest({ user: { uid: "guide-1" } });
    const res = createMockResponse();

    await getGuideRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: "pendiente",
        uid: "guide-1",
        facePhoto: "https://img/face.png",
      })
    );
  });

  it("updates guide categories and keeps the alias field in sync", async () => {
    guideListWhereGetMock.mockResolvedValue(
      createSnapshot([
        {
          data: () => ({ uid: "guide-1" }),
          ref: { update: updateDocMock },
        },
      ])
    );
    const req = createMockRequest({
      body: {
        uid: "guide-1",
        categorias: ["arte", "historia"],
      },
    });
    const res = createMockResponse();

    await updateGuideProfile(req, res);

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({
        "07_especialidades": ["arte", "historia"],
        especialidades: ["arte", "historia"],
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("normalizes the verified guides payload", async () => {
    verifiedGuidesGetMock.mockResolvedValue(
      createSnapshot([
        {
          id: "guide-doc",
          data: () => ({
            uid: "guide-1",
            "01_nombre": "Ana",
            "02_apellido": "Lopez",
            "14_foto_perfil": { url: "https://img/profile.png" },
            "15_descripcion": "Experta en recorridos",
            "09_idiomas": ["es", "en"],
            "07_especialidades": ["cultura"],
            "17_tarifa_mxn": 1200,
            "04_correo": "ana@pitzbol.me",
            "06_telefono": "+523300000000",
          }),
        },
      ])
    );
    const req = createMockRequest({});
    const res = createMockResponse();

    await getVerifiedGuides(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      guides: [
        expect.objectContaining({
          uid: "guide-1",
          nombre: "Ana Lopez",
          tarifa: 1200,
        }),
      ],
      total: 1,
    });
  });

  it("returns the normalized public guide profile", async () => {
    guideListWhereGetMock.mockResolvedValue(
      createSnapshot([
        {
          data: () => ({
            uid: "guide-1",
            "01_nombre": "Ana",
            "02_apellido": "Lopez",
            "15_descripcion": "Guía local",
            "07_especialidades": ["cultura"],
            "17_tarifa_mxn": 800,
            empresaNombre: "Ana Tours",
            tipo: "empresa",
          }),
        },
      ])
    );
    const req = createMockRequest({ params: { uid: "guide-1" } });
    const res = createMockResponse();

    await getGuidePublicProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      guide: expect.objectContaining({
        uid: "guide-1",
        nombre: "Ana Lopez",
        tipo: "empresa",
        empresaNombre: "Ana Tours",
      }),
    });
  });
});