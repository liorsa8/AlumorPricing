import { api } from '../api/client';
import { downloadBlob } from './download';

interface CatalogExportFile {
  app: 'AlumorPricing';
  kind: 'catalog';
  exportedAt: string;
  data: Record<string, unknown>;
}

// Shared by exportCatalog here and exportBackup in dataBackup.ts — both need this business's
// full merged catalog view (profile systems, glass types, accessories, opening types + their
// default accessory kits).
export async function fetchBusinessCatalog(businessId: string) {
  const [profileSystems, glassTypes, accessories, openingTypes] = await Promise.all([
    api.get(`/businesses/${businessId}/profile-systems`),
    api.get(`/businesses/${businessId}/glass-types`),
    api.get(`/businesses/${businessId}/accessories`),
    api.get(`/businesses/${businessId}/opening-types`),
  ]);
  return { profile_systems: profileSystems, glass_types: glassTypes, accessories, opening_types: openingTypes };
}

// Exports just this business's merged catalog view — not customers or quotes. Useful for
// keeping a snapshot before making pricing changes, or handing the admin a look at real
// business data beyond the global seed.
export async function exportCatalog(businessId: string): Promise<void> {
  const payload: CatalogExportFile = {
    app: 'AlumorPricing',
    kind: 'catalog',
    exportedAt: new Date().toISOString(),
    data: await fetchBusinessCatalog(businessId),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `alumor-pricing-catalog-${new Date().toISOString().slice(0, 10)}.json`);
}
