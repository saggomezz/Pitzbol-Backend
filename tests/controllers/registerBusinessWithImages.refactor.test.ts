/* eslint-disable */
import { jest } from '@jest/globals';

describe('registerBusinessWithImages refactor', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('returns 400 when required fields are missing', async () => {
    jest.mock('../../src/config/firebase', () => ({
      db: {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            id: 'generated_uid',
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ set: jest.fn(async () => {}) }))
            }))
          }))
        }))
      }
    }));

    const { registerBusinessWithImages } = await import('../../src/controllers/business.controller');

    const req: any = { body: {}, files: undefined };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await registerBusinessWithImages(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  test('returns 400 when logo file is missing even if required fields provided', async () => {
    jest.mock('../../src/config/firebase', () => ({
      db: {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            id: 'generated_uid',
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ set: jest.fn(async () => {}) }))
            }))
          }))
        }))
      }
    }));

    const { registerBusinessWithImages } = await import('../../src/controllers/business.controller');

    const req: any = {
      body: {
        businessName: 'B',
        email: 'e@x.com',
        rfc: 'RFC',
        cp: '12345',
        category: 'C',
        phone: '123',
        location: 'L',
        website: 'https://x',
        description: 'desc'
      },
      files: undefined
    };

    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await registerBusinessWithImages(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/logo/i) }));
  });
});
