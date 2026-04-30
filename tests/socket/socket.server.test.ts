/**
 * Skeleton tests for Socket.IO server (commit: 2263abf...)
 */

describe('Socket.IO Server', () => {
  test('emitNewPendingBusiness does not throw when io not set', () => {
    const { emitNewPendingBusiness } = require('../../src/socket');
    expect(() => emitNewPendingBusiness('id123', 'Negocio X')).not.toThrow();
  });
});
