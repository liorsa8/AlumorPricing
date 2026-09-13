import { db, nowIso } from './schema';
import {
  SEED_PROFILE_SYSTEMS,
  SEED_GLASS_TYPES,
  SEED_ACCESSORIES,
  SEED_OPENING_TYPES,
  DEFAULT_STANDARD_TERMS,
} from './seedData';
import { DEFAULT_COMPANY_LOGO } from './companyLogo';

let seedPromise: Promise<void> | null = null;

// Populates the local IndexedDB with the starter catalog + default company settings the
// first time the app runs on a given device/browser. No-op on every later run.
export function ensureSeeded(): Promise<void> {
  if (!seedPromise) seedPromise = seedIfEmpty();
  return seedPromise;
}

async function seedIfEmpty(): Promise<void> {
  const now = nowIso();

  if ((await db.profile_systems.count()) === 0) {
    await db.profile_systems.bulkAdd(
      SEED_PROFILE_SYSTEMS.map((p) => ({ ...p, is_active: 1, created_at: now, updated_at: now }))
    );
  }

  if ((await db.glass_types.count()) === 0) {
    await db.glass_types.bulkAdd(
      SEED_GLASS_TYPES.map((g) => ({ ...g, is_active: 1, created_at: now, updated_at: now }))
    );
  }

  if ((await db.accessories.count()) === 0) {
    await db.accessories.bulkAdd(
      SEED_ACCESSORIES.map((a) => ({ ...a, is_active: 1, created_at: now, updated_at: now }))
    );
  }

  if ((await db.opening_types.count()) === 0) {
    const accessoryIdByName = new Map((await db.accessories.toArray()).map((a) => [a.name_he, a.id!]));
    for (const t of SEED_OPENING_TYPES) {
      const typeId = await db.opening_types.add({
        name_he: t.name_he,
        code: t.code,
        profile_factor: t.profile_factor,
        glass_area_ratio: t.glass_area_ratio,
        sort_order: t.sort_order,
        is_active: 1,
        created_at: now,
        updated_at: now,
      });
      for (const acc of t.accessories) {
        const accessoryId = accessoryIdByName.get(acc.name_he);
        if (accessoryId !== undefined) {
          await db.opening_type_accessories.add({
            opening_type_id: typeId,
            accessory_id: accessoryId,
            quantity: acc.quantity,
          });
        }
      }
    }
  }

  if (!(await db.settings.get(1))) {
    await db.settings.add({
      id: 1,
      labor_pct: 100,
      installation_pct: 10,
      vat_pct: 18,
      company_name: 'אלומור',
      company_phone: '0544343384',
      company_address: 'הסתדרות 128, חולון',
      company_email: '',
      company_tax_id: '',
      company_logo: DEFAULT_COMPANY_LOGO,
      standard_terms: DEFAULT_STANDARD_TERMS,
      updated_at: now,
    });
  }
}
