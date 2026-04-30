/**
 * Skeleton tests for auth routes (commit: 9b0931f...)
 */

describe('Auth Routes', () => {
  test('validateRegisterInput rejects missing fields', async () => {
    const { validateRegisterInput } = require('../../src/middlewares/validation.middleware');
    const req: any = { body: { email: '', password: '', nombre: '' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    (validateRegisterInput as any)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('validateLoginInput rejects invalid email', async () => {
    const { validateLoginInput } = require('../../src/middlewares/validation.middleware');
    const req: any = { body: { email: 'bad', password: '123' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    (validateLoginInput as any)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
