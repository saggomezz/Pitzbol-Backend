/* eslint-disable */
import { jest } from '@jest/globals';

describe('getBusinessStatus controller', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('returns business found in Activos by id for owner', async () => {
    const mockDb: any = (global as any).__mockDb;
    const businessId = 'biz-1';
    const ownerUid = 'owner-1';

    await mockDb.collection('negocios').doc('Activos').collection('items').doc(businessId).set({
      business: { name: 'La Taqueria' },
      ownerUid: ownerUid,
      email: 'owner@example.com'
    });

    const { getBusinessStatus } = await import('../../src/controllers/business.controller');

    const req: any = { query: { businessId }, user: { uid: ownerUid, email: 'owner@example.com', role: 'BUSINESS' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await getBusinessStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, exists: true, source: 'Activos' }));
    const callArg: any = (res.json as jest.Mock).mock.calls[0]?.[0];
    expect(callArg.business).toMatchObject({ id: businessId, name: 'La Taqueria' });
  });

  test('detects deletion in movimientos and returns deleted info', async () => {
    const mockDb: any = (global as any).__mockDb;
    const negocioId = 'biz-2';
    const nombre = 'Negocio Eliminado';

    // Add a deletion movement in nested movimientos
    await mockDb.collection('negocios').doc('movimientos').collection('items').doc('mov-1').set({
      accion: 'eliminado_permanente',
      negocioId,
      nombreNegocio: nombre,
      fecha: '2026-04-01T00:00:00Z',
      reason: 'Infracción'
    });

    const { getBusinessStatus } = await import('../../src/controllers/business.controller');

    const req: any = { query: { businessId: negocioId }, user: { uid: 'someone', role: 'tourist' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await getBusinessStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, exists: false, deleted: true }));
    const callArg: any = (res.json as jest.Mock).mock.calls[0]?.[0];
    expect(callArg.deletion).toMatchObject({ businessId: negocioId, businessName: nombre, reason: 'Infracción' });
  });
});
