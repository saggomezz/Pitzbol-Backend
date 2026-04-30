/* eslint-disable */
import { jest } from '@jest/globals';

describe('perfil.routes - subirFotoPerfil', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('returns 401 when user not authenticated', async () => {
    jest.mock('../../src/config/firebase', () => ({
      db: {
        collection: () => ({
          doc: () => ({ collection: () => ({}) })
        })
      }
    }));

    const { subirFotoPerfil } = await import('../../src/controllers/perfil.controller');

    const req: any = {}; // no user
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await subirFotoPerfil(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/No autenticado/i) }));
  });

  test('returns 400 when file not provided', async () => {
    jest.mock('../../src/config/firebase', () => ({
      db: {
        collection: () => ({ doc: () => ({ collection: () => ({}) }) })
      }
    }));

    const { subirFotoPerfil } = await import('../../src/controllers/perfil.controller');

    const req: any = { user: { uid: 'user1' }, file: undefined };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await subirFotoPerfil(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/No se envio archivo/i) }));
  });
});
