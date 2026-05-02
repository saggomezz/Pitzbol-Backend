import type { Request, Response } from "express";
import { vi } from "vitest";

export function createMockRequest<T extends object>(request: T) {
  return request as unknown as Request & T;
}

export function createMockResponse() {
  const res = {} as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };

  res.status = vi.fn().mockImplementation(() => res);
  res.json = vi.fn().mockImplementation(() => res);

  return res;
}