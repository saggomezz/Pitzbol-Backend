/**
 * Skeleton tests for auth middleware (commit: a81f59b8...)
 */

describe('Auth Middleware', () => {
  test('should extract token and attach req.user (skeleton)', () => {
    const jwt = require('jsonwebtoken');
    const { authenticateToken } = require('../../src/middleware/auth');

    const mockReq: any = { headers: { authorization: 'Bearer faketoken' } };
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    jest.spyOn(jwt, 'verify').mockImplementation(() => ({ uid: 'user123', email: 'a@b.c', role: 'turista' }));

    return (authenticateToken as any)(mockReq, mockRes, next).then(() => {
      expect((mockReq as any).user).toBeDefined();
      expect((mockReq as any).user.uid).toBe('user123');
      expect(next).toHaveBeenCalled();
      (jwt.verify as jest.Mock).mockRestore();
    });
  });
});
