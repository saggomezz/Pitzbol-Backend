/**
 * Skeleton tests for registerBusinessWithImages (commit: e0e67da0...)
 */

describe('registerBusinessWithImages', () => {
  test('returns 400 when required fields missing', async () => {
    const { registerBusinessWithImages } = require('../../src/controllers/business.controller');
    const req: any = { body: { }, files: undefined, user: { uid: 'user1' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await (registerBusinessWithImages as any)(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
