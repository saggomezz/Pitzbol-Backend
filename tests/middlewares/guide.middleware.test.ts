import type { NextFunction } from "express";
import { describe, expect, it, vi } from "vitest";
import { createMockResponse } from "../utils/http";
import { isGuide } from "../../src/middlewares/guide.middleware";

describe("isGuide", () => {
  it("rejects users that are not guides", () => {
    const req = { user: { role: "turista" } } as any;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    isGuide(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows authenticated guides to continue", () => {
    const req = { user: { role: "guia" } } as any;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    isGuide(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});