/* eslint-disable */
import { jest } from '@jest/globals';

describe('updateBusinessNameInNotifications', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('updates owner and admin notifications and emits updates', async () => {
    // Access the in-memory mock DB prepared by tests/setupTests.ts
    const mockDb: any = (global as any).__mockDb;

    const ownerUid = 'owner1';
    const negocioId = 'biz-123';
    const newName = 'Nuevo Nombre';
    const previousNames = ['Viejo Nombre'];

    const ownerCol = mockDb.collection('usuarios').doc('notificaciones').collection(ownerUid);
    const adminCol = mockDb.collection('usuarios').doc('notificaciones').collection('admin');

    // Create owner docs: one matching negocioId, one matching enlace, one matching previous name
    await ownerCol.doc('ownerById').set({
      tipo: 'solicitud_negocio_enviada',
      mensaje: 'Tu negocio "Viejo Nombre" fue enviado a revision.',
      negocioId: negocioId,
    });

    await ownerCol.doc('ownerByEnlace').set({
      tipo: 'otra',
      mensaje: 'Enlace antiguo',
      enlace: `/negocio/mis-solicitudes/${negocioId}`,
    });

    await ownerCol.doc('ownerByPrev').set({
      tipo: 'otra',
      mensaje: 'Mensaje que menciona "Viejo Nombre" y necesita actualización',
    });

    // Admin docs: one matching negocioId and one containing previous name
    await adminCol.doc('adminById').set({
      tipo: 'negocio_archivado',
      mensaje: 'Tu negocio "Viejo Nombre" ha sido archivado',
      negocioId: negocioId,
      archivedReason: 'razonX'
    });

    await adminCol.doc('adminByPrev').set({
      tipo: 'otra',
      mensaje: 'Admin nota: "Viejo Nombre" requiere atención',
    });

    // Import the service after the mock DB is prepared
    const svc = await import('../../src/services/notification.service');
    const socket = await import('../../src/socket');

    // Reset mock call history
    (socket.emitNotificationToUser as jest.Mock).mockClear?.();

    // Call the function under test
    await svc.updateBusinessNameInNotifications(negocioId, newName, ownerUid, previousNames);

    // Verify ownerById updated message
    const ownerById = await ownerCol.doc('ownerById').get();
    expect(ownerById.data().mensaje).toContain(newName);

    // Verify ownerByPrev updated because it contained previous name
    const ownerByPrev = await ownerCol.doc('ownerByPrev').get();
    expect(ownerByPrev.data().mensaje).toContain(newName);

    // Verify adminById updated
    const adminById = await adminCol.doc('adminById').get();
    expect(adminById.data().mensaje).toContain(newName);

    // Expect socket emit called at least for owner and admin updates
    expect((socket.emitNotificationToUser as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
    // One of the calls should include ownerUid as first arg
    expect((socket.emitNotificationToUser as jest.Mock).mock.calls.some((c: any[]) => c[0] === ownerUid)).toBe(true);
    // One of the calls should include 'admin' as first arg
    expect((socket.emitNotificationToUser as jest.Mock).mock.calls.some((c: any[]) => c[0] === 'admin')).toBe(true);
  });
});
