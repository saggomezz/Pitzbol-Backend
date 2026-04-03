import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export const setSocketServer = (io: Server) => {
  ioInstance = io;
};

export const emitNotificationToUser = (userId: string, payload: any) => {
  if (!ioInstance) return;
  try {
    ioInstance.to(`user:${userId}`).emit('new-notification', payload);
  } catch (_err) {
    // swallow emit errors silently; listeners may reconnect and fetch updated notifications from backend
  }
};

/**
 * Emite un evento explícito cuando cambia el estado de un negocio
 * El frontend escucha este evento para actualizar las vistas sin depender solo de notificaciones
 */
export const emitBusinessStatusChange = (userId: string, businessId: string, status: string, details?: any) => {
  if (!ioInstance) return;
  try {
    ioInstance.to(`user:${userId}`).emit('business-status-changed', {
      businessId,
      status, // 'aprobado', 'rechazado', 'archivado', 'pendiente'
      timestamp: new Date().toISOString(),
      ...details,
    });

    ioInstance.emit('admin-businesses-updated', {
      businessId,
      status,
      timestamp: new Date().toISOString(),
      ...details,
    });
  } catch (_err) {
    // swallow emit errors silently
  }
};

/**
 * Emite a todos los administradores cuando llega un nuevo negocio pendiente
 * @param businessId - ID del negocio
 * @param businessName - Nombre del negocio
 */
export const emitNewPendingBusiness = (businessId: string, businessName: string) => {
  if (!ioInstance) return;
  try {
    // Emitir a todos los clientes conectados (los clientes admin filtrarán)
    ioInstance.emit('new-pending-business', {
      businessId,
      businessName,
      timestamp: new Date().toISOString(),
    });

    ioInstance.emit('admin-businesses-updated', {
      businessId,
      status: 'pendiente',
      businessName,
      timestamp: new Date().toISOString(),
    });
  } catch (_err) {
    // swallow emit errors silently
  }
};
