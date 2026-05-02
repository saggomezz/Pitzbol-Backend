import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest, createMockResponse } from "../utils/http";

const {
  guideQueryGetMock,
  tourDocGetMock,
  tourDocUpdateMock,
  tourSetMock,
  collectionMock,
  uploadStreamMock,
} = vi.hoisted(() => ({
  guideQueryGetMock: vi.fn(),
  tourDocGetMock: vi.fn(),
  tourDocUpdateMock: vi.fn(),
  tourSetMock: vi.fn(),
  collectionMock: vi.fn(),
  uploadStreamMock: vi.fn(),
}));

vi.mock("../../src/config/firebase", () => ({
  db: {
    collection: collectionMock,
  },
}));

vi.mock("firebase-admin", () => ({
  default: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => "server-timestamp"),
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

import { createTour, deleteTour, updateTour } from "../../src/controllers/tours.controller";

describe("tours.controller guide flow", () => {
  beforeEach(() => {
    guideQueryGetMock.mockReset();
    tourDocGetMock.mockReset();
    tourDocUpdateMock.mockReset();
    tourSetMock.mockReset();
    collectionMock.mockReset();
    uploadStreamMock.mockReset();

    collectionMock.mockImplementation((name: string) => {
      if (name === "usuarios") {
        return {
          doc: vi.fn(() => ({
            collection: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: guideQueryGetMock,
                })),
              })),
            })),
          })),
        };
      }

      if (name === "tours") {
        return {
          doc: vi.fn((id?: string) => {
            if (id) {
              return {
                get: tourDocGetMock,
                update: tourDocUpdateMock,
              };
            }

            return {
              id: "tour-1",
              set: tourSetMock,
            };
          }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    });
  });

  it("rejects unauthenticated requests", async () => {
    const req = createMockRequest({
      body: { guiaId: "guide-1", titulo: "Centro", destino: "Guadalajara" },
    });
    const res = createMockResponse();

    await createTour(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "No autorizado" });
  });

  it("creates a guide tour for the authenticated guide", async () => {
    guideQueryGetMock.mockResolvedValue({
      empty: false,
      docs: [
        {
          data: () => ({
            "01_nombre": "Ana",
            empresaLogo: "https://img/logo.jpg",
          }),
        },
      ],
    });

    const req = createMockRequest({
      user: { uid: "guide-owner" },
      body: {
        guiaId: "guide-owner",
        titulo: "Centro histórico",
        destino: "Guadalajara",
        idiomas: '["es"]',
      },
      files: {},
    });
    const res = createMockResponse();

    await createTour(req, res);

    expect(tourSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        guiaId: "guide-owner",
        titulo: "Centro histórico",
        destino: "Guadalajara",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects creating a guide tour for another guide id", async () => {
    guideQueryGetMock.mockResolvedValue({
      empty: false,
      docs: [
        {
          data: () => ({
            "01_nombre": "Ana",
            empresaNombre: "",
            empresaLogo: "",
            "14_foto_perfil": { url: "https://img/ana.jpg" },
          }),
        },
      ],
    });

    const req = createMockRequest({
      user: { uid: "guide-owner" },
      body: {
        guiaId: "guide-other",
        titulo: "Centro histórico",
        destino: "Guadalajara",
      },
      files: {},
    });
    const res = createMockResponse();

    await createTour(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "No puedes publicar tours para otro guía",
    });
    expect(tourSetMock).not.toHaveBeenCalled();
  });

  it("blocks updating a guide tour owned by another guide", async () => {
    tourDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ guiaId: "guide-other" }),
    });

    const req = createMockRequest({
      user: { uid: "guide-owner" },
      params: { id: "tour-1" },
      body: { titulo: "Nuevo título" },
      files: {},
    });
    const res = createMockResponse();

    await updateTour(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "No tienes permiso para editar este tour",
    });
    expect(tourDocUpdateMock).not.toHaveBeenCalled();
  });

  it("blocks deleting a guide tour owned by another guide", async () => {
    tourDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ guiaId: "guide-other" }),
    });

    const req = createMockRequest({
      user: { uid: "guide-owner" },
      params: { id: "tour-1" },
    });
    const res = createMockResponse();

    await deleteTour(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "No tienes permiso para eliminar este tour",
    });
    expect(tourDocUpdateMock).not.toHaveBeenCalled();
  });
});