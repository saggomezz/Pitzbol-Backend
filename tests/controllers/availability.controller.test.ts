import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest, createMockResponse } from "../utils/http";

const {
  setGuideAvailabilityMock,
  getGuideAvailabilityMock,
  getAvailabilityByIdMock,
  deleteAvailabilityMock,
  isTimeSlotAvailableMock,
} = vi.hoisted(() => ({
  setGuideAvailabilityMock: vi.fn(),
  getGuideAvailabilityMock: vi.fn(),
  getAvailabilityByIdMock: vi.fn(),
  deleteAvailabilityMock: vi.fn(),
  isTimeSlotAvailableMock: vi.fn(),
}));

vi.mock("../../src/services/availability.service", () => ({
  AvailabilityService: {
    setGuideAvailability: setGuideAvailabilityMock,
    getGuideAvailability: getGuideAvailabilityMock,
    getAvailabilityById: getAvailabilityByIdMock,
    deleteAvailability: deleteAvailabilityMock,
    isTimeSlotAvailable: isTimeSlotAvailableMock,
    getGuideAvailabilities: vi.fn(),
  },
}));

import {
  checkTimeSlotAvailability,
  deleteAvailability,
  getGuideAvailabilityByDate,
  setGuideAvailability,
} from "../../src/controllers/availability.controller";

describe("availability.controller", () => {
  beforeEach(() => {
    setGuideAvailabilityMock.mockReset();
    getGuideAvailabilityMock.mockReset();
    getAvailabilityByIdMock.mockReset();
    deleteAvailabilityMock.mockReset();
    isTimeSlotAvailableMock.mockReset();
  });

  it("validates the date format before setting guide availability", async () => {
    const req = createMockRequest({
      body: {
        guideId: "guide-1",
        fecha: "29-04-2026",
        horasDisponibles: [{ horaInicio: "09:00", horaFin: "10:00" }],
      },
      user: { uid: "guide-1" },
    });
    const res = createMockResponse();

    await setGuideAvailability(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(setGuideAvailabilityMock).not.toHaveBeenCalled();
  });

  it("stores guide availability through the service", async () => {
    setGuideAvailabilityMock.mockResolvedValue({ id: "availability-1" });
    const req = createMockRequest({
      body: {
        guideId: "guide-1",
        fecha: "2026-05-02",
        horasDisponibles: [{ horaInicio: "09:00", horaFin: "10:00" }],
        maxReservasPorHora: 2,
      },
      user: { uid: "guide-1" },
    });
    const res = createMockResponse();

    await setGuideAvailability(req, res);

    expect(setGuideAvailabilityMock).toHaveBeenCalledWith({
      guideId: "guide-1",
      fecha: "2026-05-02",
      horasDisponibles: [{ horaInicio: "09:00", horaFin: "10:00" }],
      maxReservasPorHora: 2,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects setting guide availability for another guide", async () => {
    const req = createMockRequest({
      body: {
        guideId: "guide-1",
        fecha: "2026-05-02",
        horasDisponibles: [{ horaInicio: "09:00", horaFin: "10:00" }],
      },
      user: { uid: "guide-2" },
    });
    const res = createMockResponse();

    await setGuideAvailability(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(setGuideAvailabilityMock).not.toHaveBeenCalled();
  });

  it("returns 404 when no availability exists for a guide and date", async () => {
    getGuideAvailabilityMock.mockResolvedValue(null);
    const req = createMockRequest({ params: { guideId: "guide-1", fecha: "2026-05-02" } });
    const res = createMockResponse();

    await getGuideAvailabilityByDate(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("deletes an availability record when the id is present", async () => {
    getAvailabilityByIdMock.mockResolvedValue({ id: "availability-1", guideId: "guide-1" });
    const req = createMockRequest({ params: { availabilityId: "availability-1" }, user: { uid: "guide-1" } });
    const res = createMockResponse();

    await deleteAvailability(req, res);

    expect(getAvailabilityByIdMock).toHaveBeenCalledWith("availability-1");
    expect(deleteAvailabilityMock).toHaveBeenCalledWith("availability-1");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("checks whether a guide time slot is available", async () => {
    isTimeSlotAvailableMock.mockResolvedValue(true);
    const req = createMockRequest({
      query: { guideId: "guide-1", fecha: "2026-05-02", horaInicio: "09:00" },
    });
    const res = createMockResponse();

    await checkTimeSlotAvailability(req, res);

    expect(isTimeSlotAvailableMock).toHaveBeenCalledWith("guide-1", "2026-05-02", "09:00");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});