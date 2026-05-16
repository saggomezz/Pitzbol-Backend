import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret";

const bookingMocks = vi.hoisted(() => ({
  getGuideBookings: vi.fn(),
  getBookingById: vi.fn(),
  updateBookingStatus: vi.fn(),
  cancelBooking: vi.fn(),
  createBooking: vi.fn(),
  getTouristBookings: vi.fn(),
  checkGuideAvailability: vi.fn(),
}));

const availabilityMocks = vi.hoisted(() => ({
  setGuideAvailability: vi.fn(),
  getGuideAvailability: vi.fn(),
  getGuideAvailabilities: vi.fn(),
  getAvailabilityById: vi.fn(),
  deleteAvailability: vi.fn(),
  isTimeSlotAvailable: vi.fn(),
}));

const chatMocks = vi.hoisted(() => ({
  getOrCreateChat: vi.fn(),
  getChatById: vi.fn(),
  getMessages: vi.fn(),
  getUserChats: vi.fn(),
  markAsRead: vi.fn(),
  getUnreadMessages: vi.fn(),
  deleteChat: vi.fn(),
}));

vi.mock("../../src/services/booking.service", () => ({
  BookingService: bookingMocks,
}));

vi.mock("../../src/services/availability.service", () => ({
  AvailabilityService: availabilityMocks,
}));

vi.mock("../../src/services/chat.service", () => ({
  ChatService: chatMocks,
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

describe("guide functions integration", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const [bookingRoutesModule, availabilityRoutesModule, chatRoutesModule] = await Promise.all([
      import("../../src/routes/booking.routes"),
      import("../../src/routes/availability.routes"),
      import("../../src/routes/chat.routes"),
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api/bookings", bookingRoutesModule.default);
    app.use("/api/availability", availabilityRoutesModule.default);
    app.use("/api/chat", chatRoutesModule.default);

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
    vi.clearAllMocks();
  });

  it("rejects a tourist trying to set guide availability", async () => {
    const response = await fetch(`${baseUrl}/api/availability/set`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken("tourist-1", "turista")}`,
      },
      body: JSON.stringify({
        guideId: "guide-1",
        fecha: "2026-05-20",
        horasDisponibles: [{ horaInicio: "09:00", horaFin: "10:00" }],
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      msg: "Acceso solo para guías",
    });
    expect(availabilityMocks.setGuideAvailability).not.toHaveBeenCalled();
  });

  it("rejects setting availability for another guide", async () => {
    const response = await fetch(`${baseUrl}/api/availability/set`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
      body: JSON.stringify({
        guideId: "guide-2",
        fecha: "2026-05-20",
        horasDisponibles: [{ horaInicio: "09:00", horaFin: "10:00" }],
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "No puedes establecer disponibilidad para otro guía",
    });
    expect(availabilityMocks.setGuideAvailability).not.toHaveBeenCalled();
  });

  it("checks a time slot through the dedicated public route", async () => {
    availabilityMocks.isTimeSlotAvailable.mockResolvedValue(true);

    const response = await fetch(`${baseUrl}/api/availability/check/timeslot?guideId=guide-1&fecha=2026-05-20&horaInicio=09:00`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      isAvailable: true,
    });
    expect(availabilityMocks.isTimeSlotAvailable).toHaveBeenCalledWith("guide-1", "2026-05-20", "09:00");
    expect(availabilityMocks.getGuideAvailability).not.toHaveBeenCalled();
  });

  it("rejects deleting availability owned by another guide", async () => {
    availabilityMocks.getAvailabilityById.mockResolvedValue({ id: "availability-1", guideId: "guide-2" });

    const response = await fetch(`${baseUrl}/api/availability/availability-1`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "No puedes eliminar disponibilidad de otro guía",
    });
    expect(availabilityMocks.deleteAvailability).not.toHaveBeenCalled();
  });

  it("returns bookings only for the authenticated guide", async () => {
    bookingMocks.getGuideBookings.mockResolvedValue([{ id: "booking-1" }]);

    const response = await fetch(`${baseUrl}/api/bookings/guide/guide-1`, {
      headers: {
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      bookings: [{ id: "booking-1" }],
      total: 1,
    });
    expect(bookingMocks.getGuideBookings).toHaveBeenCalledWith("guide-1");
  });

  it("rejects confirming a booking for another guide", async () => {
    const response = await fetch(`${baseUrl}/api/bookings/booking-1/confirm`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken("guide-2", "guia")}`,
      },
      body: JSON.stringify({
        guideId: "guide-1",
        action: "confirmar",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Solo el guía puede confirmar/rechazar reservas",
    });
    expect(bookingMocks.getBookingById).not.toHaveBeenCalled();
    expect(bookingMocks.updateBookingStatus).not.toHaveBeenCalled();
  });

  it("completes a confirmed tour for the authenticated guide", async () => {
    bookingMocks.getBookingById.mockResolvedValue({
      id: "booking-1",
      guideId: "guide-1",
      status: "confirmado",
    });

    const response = await fetch(`${baseUrl}/api/bookings/booking-1/complete`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
      body: JSON.stringify({ guideId: "guide-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Tour completado exitosamente. El turista ahora puede calificarte.",
    });
    expect(bookingMocks.updateBookingStatus).toHaveBeenCalledWith("booking-1", "completado");
  });

  it("allows a guide participant to create a chat", async () => {
    chatMocks.getOrCreateChat.mockResolvedValue({
      id: "chat-1",
      touristId: "tourist-1",
      guideId: "guide-1",
    });

    const response = await fetch(`${baseUrl}/api/chat/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
      body: JSON.stringify({
        touristId: "tourist-1",
        guideId: "guide-1",
        touristName: "Ana",
        guideName: "Luis",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      chat: {
        id: "chat-1",
        touristId: "tourist-1",
        guideId: "guide-1",
      },
    });
    expect(chatMocks.getOrCreateChat).toHaveBeenCalledWith("tourist-1", "guide-1", "Ana", "Luis");
  });

  it("rejects a guide trying to list another guide chats", async () => {
    const response = await fetch(`${baseUrl}/api/chat/user/guide-2?userType=guide`, {
      headers: {
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      msg: "No puedes ver chats de otro usuario",
    });
    expect(chatMocks.getUserChats).not.toHaveBeenCalled();
  });

  it("returns unread chat counters for the authenticated guide", async () => {
    chatMocks.getUnreadMessages.mockResolvedValue({
      totalUnread: 2,
      chats: [{ chatId: "chat-1", count: 2 }],
    });

    const response = await fetch(`${baseUrl}/api/chat/unread/guide-1?userType=guide`, {
      headers: {
        Authorization: `Bearer ${createToken("guide-1", "guia")}`,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      totalUnread: 2,
      chats: [{ chatId: "chat-1", count: 2 }],
    });
    expect(chatMocks.getUnreadMessages).toHaveBeenCalledWith("guide-1", "guide");
  });
});