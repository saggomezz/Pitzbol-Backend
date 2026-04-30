/* eslint-disable */
import { jest } from '@jest/globals';

describe('reverseGeocodeAddress controller', () => {
  beforeEach(() => {
    jest.resetModules();
    // Clear any previous fetch mock
    (global as any).fetch = undefined;
  });

  test('returns 400 when missing lat/lon', async () => {
    const { reverseGeocodeAddress } = await import('../../src/controllers/places.controller');
    const req: any = { body: {} };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await reverseGeocodeAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('returns success with address when fetch ok', async () => {
    (global as any).fetch = async () => ({
      ok: true,
      json: async () => ({ address: { city: 'Ciudad', state: 'Estado' }, display_name: 'Full address' })
    });

    const { reverseGeocodeAddress } = await import('../../src/controllers/places.controller');
    const req: any = { body: { latitud: '19.43', longitud: '-99.13' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await reverseGeocodeAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, address: expect.any(Object), displayName: 'Full address' }));
  });

  test('returns success:false when fetch not ok', async () => {
    (global as any).fetch = async () => ({ ok: false });

    const { reverseGeocodeAddress } = await import('../../src/controllers/places.controller');
    const req: any = { body: { latitud: '19.43', longitud: '-99.13' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await reverseGeocodeAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
