/**
 * Integration-style test for registerBusinessWithImages using in-memory mocks
 */

describe('registerBusinessWithImages (integration)', () => {
  test('uploads images, saves business data and emits socket event', async () => {
    const { registerBusinessWithImages } = require('../../src/controllers/business.controller');
    const socket = require('../../src/socket');

    const req: any = {
      body: {
        businessName: 'Tienda Test',
        category: 'Gastronomia',
        phone: '555-0000',
        location: 'Ciudad Test',
        website: 'https://tienda.test',
        rfc: 'RFCTEST123',
        cp: '12345',
        description: 'Descripción de prueba',
        email: 'owner@test.example',
      },
      files: {
        logo: [{ buffer: Buffer.from('logo content') }],
        images: [{ buffer: Buffer.from('img1') }, { buffer: Buffer.from('img2') }]
      },
      user: { uid: 'test_user' }
    };

    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await (registerBusinessWithImages as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const mockDb = (global as any).__mockDb;
    const docs = mockDb.getDocumentsAtPath('negocios/Pendientes/items');
    expect(docs.length).toBeGreaterThan(0);
    const saved = docs[0].data();
    expect(saved).toBeDefined();
    expect(saved.business).toBeDefined();
    expect(saved.business.logo).toMatch(/^https?:\/\/mock.cloud\//);
    expect(Array.isArray(saved.business.images)).toBe(true);
    expect(saved.business.images.length).toBe(2);

    expect(socket.emitNewPendingBusiness).toHaveBeenCalled();
  });
});
