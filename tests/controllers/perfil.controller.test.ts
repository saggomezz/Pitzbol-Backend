/**
 * Skeleton tests for `perfil.controller.ts` (commit: a128143...)
 */

describe('Perfil Controller', () => {
  test('actualizarPerfil returns 401 when not authenticated', async () => {
    const { actualizarPerfil } = require('../../src/controllers/perfil.controller');
    const req: any = { body: {}, user: null };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await (actualizarPerfil as any)(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
