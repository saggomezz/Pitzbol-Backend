import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest, createMockResponse } from "../utils/http";

const {
  getGuideBookingsMock,
  getBookingByIdMock,
  updateBookingStatusMock,
  cancelBookingMock,
} = vi.hoisted(() => ({
  getGuideBookingsMock: vi.fn(),
  getBookingByIdMock: vi.fn(),
  updateBookingStatusMock: vi.fn(),
  cancelBookingMock: vi.fn(),
}));

vi.mock("../../src/services/booking.service", () => ({
  BookingService: {
    getGuideBookings: getGuideBookingsMock,
    getBookingById: getBookingByIdMock,
    updateBookingStatus: updateBookingStatusMock,
    cancelBooking: cancelBookingMock,
    checkGuideAvailability: vi.fn(),
    createBooking: vi.fn(),
    getTouristBookings: vi.fn(),
  },
}));

import {
  completeTour,
  confirmBooking,
  getGuideBookings,
} from "../../src/controllers/booking.controller";

describe("booking.controller guide flow", () => {
  beforeEach(() => {
    getGuideBookingsMock.mockReset();
    getBookingByIdMock.mockReset();
    updateBookingStatusMock.mockReset();
    cancelBookingMock.mockReset();
  });

  it("prevents a guide from reading another guide bookings", async () => {
    const req = createMockRequest({
      params: { guideId: "guide-owner" },
      user: { uid: "guide-other" },
    });
    const res = createMockResponse();

    await getGuideBookings(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getGuideBookingsMock).not.toHaveBeenCalled();
  });

  it("returns the bookings for the authenticated guide", async () => {
    getGuideBookingsMock.mockResolvedValue([{ id: "booking-1" }]);
    const req = createMockRequest({
      params: { guideId: "guide-owner" },
      user: { uid: "guide-owner" },
    });
    const res = createMockResponse();

    await getGuideBookings(req, res);

    expect(getGuideBookingsMock).toHaveBeenCalledWith("guide-owner");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("confirms a pending booking owned by the authenticated guide", async () => {
    getBookingByIdMock.mockResolvedValue({
      id: "booking-1",
      guideId: "guide-owner",
      status: "pendiente",
    });
    const req = createMockRequest({
      params: { bookingId: "booking-1" },
      body: { guideId: "guide-owner", action: "confirmar" },
      user: { uid: "guide-owner" },
    });
    const res = createMockResponse();

    await confirmBooking(req, res);

    expect(updateBookingStatusMock).toHaveBeenCalledWith("booking-1", "confirmado");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects confirming a booking that belongs to another guide", async () => {
    getBookingByIdMock.mockResolvedValue({
      id: "booking-1",
      guideId: "guide-owner",
      status: "pendiente",
    });
    const req = createMockRequest({
      params: { bookingId: "booking-1" },
      body: { guideId: "guide-owner", action: "confirmar" },
      user: { uid: "guide-other" },
    });
    const res = createMockResponse();

    await confirmBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateBookingStatusMock).not.toHaveBeenCalled();
  });

  it("completes a confirmed tour for the authenticated guide", async () => {
    getBookingByIdMock.mockResolvedValue({
      id: "booking-1",
      guideId: "guide-owner",
      status: "confirmado",
    });
    const req = createMockRequest({
      params: { bookingId: "booking-1" },
      body: { guideId: "guide-owner" },
      user: { uid: "guide-owner" },
    });
    const res = createMockResponse();

    await completeTour(req, res);

    expect(updateBookingStatusMock).toHaveBeenCalledWith("booking-1", "completado");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});