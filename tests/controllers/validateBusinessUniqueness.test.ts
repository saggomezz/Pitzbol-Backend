/* eslint-disable */
import { jest } from '@jest/globals';

describe('validateBusinessUniqueness controller', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('detects duplicate business name and returns 400 with errors', async () => {
    // Mock Firestore responses to simulate existing records
    jest.mock('../../src/config/firebase', () => ({
      db: {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              get: jest.fn(async () => ({
                docs: [
                  {
                    id: 'doc1',
                    data: () => ({
                      business: { name: 'Test Business', phone: '555' },
                      email: 'test@example.com'
                    })
                  }
                ]
              }))
            }))
          }))
        }))
      }
    }));

    const { validateBusinessUniqueness } = await import('../../src/controllers/business.controller');

    const req: any = { body: { businessName: 'Test Business' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await validateBusinessUniqueness(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        valid: false,
        errors: expect.objectContaining({ businessName: expect.any(String) })
      })
    );
  });

  test('returns 200 valid true when no duplicates', async () => {
    jest.mock('../../src/config/firebase', () => ({
      db: {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              get: jest.fn(async () => ({ docs: [] }))
            }))
          }))
        }))
      }
    }));

    const { validateBusinessUniqueness } = await import('../../src/controllers/business.controller');
    const req: any = { body: { businessName: 'UniqueName' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await validateBusinessUniqueness(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: true }));
  });
});
