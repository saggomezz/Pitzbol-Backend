// Modelo de negocio para Firestore
export interface IBusiness {
  name: string;
  description: string;
  owner: string; // userId
  status: 'pendiente' | 'aprobado' | 'rechazado' | 'archivado';
  createdAt: Date;
  updatedAt: Date;
  history: Array<{
    action: string;
    date: Date;
    by: string;
    reason?: string;
  }>;
  archivedReason?: string;
}
