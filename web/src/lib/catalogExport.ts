import { db } from '../db/schema';
import { downloadBlob } from './download';

const CATALOG_TABLES = ['profile_systems', 'glass_types', 'accessories', 'opening_types', 'opening_type_accessories'] as const;

interface CatalogExportFile {
  app: 'AlumorPricing';
  kind: 'catalog';
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

// Exports just the catalog (profile systems, glass types, accessories, opening types +
// their default accessory kits) — not customers or quotes. Useful for moving a calibrated
// catalog to another device, or keeping a snapshot before making pricing changes.
export async function exportCatalog(): Promise<void> {
  const tables: Record<string, unknown[]> = {};
  for (const name of CATALOG_TABLES) {
    tables[name] = await db[name].toArray();
  }
  const payload: CatalogExportFile = { app: 'AlumorPricing', kind: 'catalog', exportedAt: new Date().toISOString(), tables };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `alumor-pricing-catalog-${new Date().toISOString().slice(0, 10)}.json`);
}
