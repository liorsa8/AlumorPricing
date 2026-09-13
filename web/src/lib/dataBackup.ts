import { db } from '../db/schema';
import { downloadBlob } from './download';

interface BackupFile {
  app: 'AlumorPricing';
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<void> {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    tables[table.name] = await table.toArray();
  }
  const payload: BackupFile = { app: 'AlumorPricing', exportedAt: new Date().toISOString(), tables };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `alumor-pricing-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

// Fully replaces the local database with the contents of a previously exported file.
export async function importBackup(file: File): Promise<void> {
  const text = await file.text();
  const payload = JSON.parse(text) as BackupFile;
  if (payload.app !== 'AlumorPricing' || !payload.tables) throw new Error('invalid_backup_file');

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = payload.tables[table.name];
      if (rows && rows.length) await table.bulkAdd(rows);
    }
  });
}
