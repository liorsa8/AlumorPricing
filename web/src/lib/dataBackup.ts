import { api } from '../api/client';
import { fetchBusinessCatalog } from './catalogExport';
import { downloadBlob } from './download';

interface BackupFile {
  app: 'AlumorPricing';
  exportedAt: string;
  data: Record<string, unknown>;
}

// Export-only: a point-in-time snapshot of everything this business can see (its own
// letterhead/pricing, customers, quotes with their openings, and its merged catalog) as a
// safety copy outside Firebase. There's no matching import — Firestore has no equivalent to
// atomically wiping and replacing every collection the way one IndexedDB transaction could,
// and export alone covers the real need: an off-Firebase copy in case of trouble.
export async function exportBackup(businessId: string): Promise<void> {
  const [business, customers, projects, catalog] = await Promise.all([
    api.get(`/businesses/${businessId}`),
    api.get(`/businesses/${businessId}/customers`),
    api.get<{ id: string }[]>(`/businesses/${businessId}/projects`),
    fetchBusinessCatalog(businessId),
  ]);
  const projectDetails = await Promise.all(
    projects.map((p) => api.get(`/businesses/${businessId}/projects/${p.id}`))
  );

  const payload: BackupFile = {
    app: 'AlumorPricing',
    exportedAt: new Date().toISOString(),
    data: { business, customers, projects: projectDetails, ...catalog },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `alumor-pricing-backup-${new Date().toISOString().slice(0, 10)}.json`);
}
