// One-time bootstrap: writes the REAL, hand-tuned catalog export (data/catalog-seed.json —
// exported from the app's own "ייצוא קטלוג" button, not the placeholder web/src/data/seedData.ts)
// into the global catalog_* collections. Every signed-in user can read these; only an admin
// (see setAdminClaim.js) can write them — enforced by firestore.rules, not this script.
//
// Firestore document IDs are the source file's own numeric ids (as strings) — simplest way to
// keep opening_type_accessories' cross-references (opening_type_id/accessory_id) valid without
// building an id-remapping table, and it's a one-time seed into empty collections so there's no
// collision risk.
//
// Usage:
//   node seedCatalog.js                 (real project, needs service-account.json)
//   node seedCatalog.js --emulator      (local emulator, no credentials needed)
//   node seedCatalog.js --force         (overwrite even if the catalog already has data)
const fs = require('fs');
const path = require('path');
const { initAdmin } = require('./initAdmin');

const SEED_FILE = path.join(__dirname, 'data', 'catalog-seed.json');

const COLLECTIONS = {
  profile_systems: 'catalog_profile_systems',
  glass_types: 'catalog_glass_types',
  accessories: 'catalog_accessories',
  opening_types: 'catalog_opening_types',
};

async function main() {
  const force = process.argv.includes('--force');
  const admin = initAdmin();
  const db = admin.firestore();

  const existing = await db.collection(COLLECTIONS.profile_systems).limit(1).get();
  if (!existing.empty && !force) {
    console.log('catalog_profile_systems already has data — skipping (pass --force to overwrite).');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
  const { profile_systems, glass_types, accessories, opening_types, opening_type_accessories } = raw.tables;

  const kitByOpeningType = new Map();
  for (const row of opening_type_accessories) {
    const list = kitByOpeningType.get(row.opening_type_id) ?? [];
    list.push({ accessory_id: String(row.accessory_id), quantity: row.quantity });
    kitByOpeningType.set(row.opening_type_id, list);
  }

  const batch = db.batch();
  let count = 0;

  function writeRow(collectionName, row, extra = {}) {
    const { id, ...fields } = row;
    const ref = db.collection(collectionName).doc(String(id));
    batch.set(ref, { ...fields, ...extra });
    count += 1;
  }

  for (const row of profile_systems) writeRow(COLLECTIONS.profile_systems, row);
  for (const row of glass_types) writeRow(COLLECTIONS.glass_types, row);
  for (const row of accessories) writeRow(COLLECTIONS.accessories, row);
  for (const row of opening_types) writeRow(COLLECTIONS.opening_types, row, { accessories: kitByOpeningType.get(row.id) ?? [] });

  await batch.commit();
  console.log(`Seeded ${count} catalog documents (${profile_systems.length} profile systems, ${glass_types.length} glass types, ${accessories.length} accessories, ${opening_types.length} opening types).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
