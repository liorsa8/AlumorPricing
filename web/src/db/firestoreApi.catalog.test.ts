import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { doc, setDoc } from 'firebase/firestore';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { firestoreRequest } from './firestoreApi';
import { clearFirestore, ensureSignedIn, signUpOrSignIn, EMULATOR_PROJECT_ID } from './firestoreTestHelpers';

// Runs against the same Firebase emulator as firestoreApi.test.ts (see package.json's "test"
// script). Covers the merged-catalog (global item + per-business override) behavior — the area
// with zero coverage until now, since firestoreApi.test.ts only ever creates business-owned
// catalog items, never a plain global item a business has not forked.

const TEST_EMAIL = 'catalog-tester@example.com';
const TEST_PASSWORD = 'test-password-123';

let testEnv: RulesTestEnvironment;
let businessId: string;

// The only way to get a plain, never-forked catalog item into the emulator without running the
// real scripts/firebase-admin/setAdminClaim.js + seedCatalog.js by hand: a rules-unit-testing
// context with the `admin` custom claim, writing straight into the global catalog_* collection.
async function seedGlobalCatalogItem(collectionName: string, id: string, data: Record<string, unknown>) {
  const adminDb = testEnv.authenticatedContext('seed-admin', { admin: true }).firestore();
  await setDoc(doc(adminDb, collectionName, id), { is_active: 1, created_at: '', updated_at: '', ...data });
}

// The one profile-system fixture every test below needs — only `price_per_meter` ever varies,
// via the optional override.
function seedProfileSystem(id: string, overrides: Record<string, unknown> = {}) {
  return seedGlobalCatalogItem('catalog_profile_systems', id, {
    name_he: 'קליל 7000',
    series_code: '7000',
    manufacturer: null,
    price_per_meter: 50,
    ...overrides,
  });
}

describe('merged catalog: global items vs. business overrides', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: EMULATOR_PROJECT_ID,
      firestore: { host: '127.0.0.1', port: 8080 },
    });
    await signUpOrSignIn(TEST_EMAIL, TEST_PASSWORD);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await clearFirestore();
    await ensureSignedIn(TEST_EMAIL, TEST_PASSWORD);
    const business = await firestoreRequest<{ id: string }>('POST', '/businesses', {});
    businessId = business.id;
  });

  // Regression for the firestore.rules bug where an override collection's read rule
  // dereferenced resource.data on a document that doesn't exist yet — Firestore evaluates
  // rules even for reads of missing documents (resource == null there), so this threw
  // permission-denied instead of falling back to the global item, breaking the most common
  // case: adding an opening that references a catalog item this business never forked.
  it('lets a business add an opening referencing a global catalog item it never forked', async () => {
    await Promise.all([
      seedGlobalCatalogItem('catalog_opening_types', 'ot1', {
        name_he: 'חלון',
        code: 'w',
        profile_factor: 3,
        glass_area_ratio: 0.8,
        sort_order: 0,
        accessories: [],
      }),
      seedProfileSystem('ps1'),
      seedGlobalCatalogItem('catalog_glass_types', 'gt1', {
        name_he: 'זכוכית',
        thickness_mm: '4',
        price_per_sqm: 200,
      }),
    ]);

    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/projects`, {});

    const opening = await firestoreRequest<{ id: number }>(
      'POST',
      `/businesses/${businessId}/projects/${project.id}/openings`,
      { opening_type_id: 'ot1', profile_system_id: 'ps1', glass_type_id: 'gt1', width_mm: 1000, height_mm: 1000, quantity: 1 }
    );

    expect(opening.id).toBeDefined();
  });

  it('shows a never-forked global item in the business catalog list, marked as not forked', async () => {
    await seedProfileSystem('ps1');

    const list = await firestoreRequest<{ id: string; forked_from_global: boolean }[]>(
      'GET',
      `/businesses/${businessId}/profile-systems`
    );

    expect(list).toHaveLength(1);
    expect(list[0].forked_from_global).toBe(false);
  });

  it('sorts the business simple-catalog list alphabetically', async () => {
    await Promise.all([seedProfileSystem('ps-b', { name_he: 'ב' }), seedProfileSystem('ps-a', { name_he: 'א' })]);

    const list = await firestoreRequest<{ name_he: string }[]>('GET', `/businesses/${businessId}/profile-systems`);

    expect(list.map((r) => r.name_he)).toEqual(['א', 'ב']);
  });

  // Regression: readMergedCatalog used to always sort by name_he before returning, which this
  // route immediately overwrote with a sort_order sort — wasted work, but also a trap if that
  // final sort were ever accidentally dropped. Pin the actually-required order down directly.
  it('sorts the business opening-types list by sort_order, not by name', async () => {
    await Promise.all([
      seedGlobalCatalogItem('catalog_opening_types', 'ot-second', {
        name_he: 'א',
        code: 'a',
        profile_factor: 1,
        glass_area_ratio: 1,
        sort_order: 2,
        accessories: [],
      }),
      seedGlobalCatalogItem('catalog_opening_types', 'ot-first', {
        name_he: 'ב',
        code: 'b',
        profile_factor: 1,
        glass_area_ratio: 1,
        sort_order: 1,
        accessories: [],
      }),
    ]);

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${businessId}/opening-types`);

    expect(list.map((r) => r.id)).toEqual(['ot-first', 'ot-second']);
  });

  // Regression: deleting a plain, never-forked global item used to try deleting a nonexistent
  // override document (a Firestore no-op) and report {deleted: true} anyway — the item would
  // silently reappear on the next fetch. It should now fork-and-deactivate instead, the same
  // end state the "toggle active" button already produces.
  it('deleting a never-forked global item hides it instead of silently no-opping', async () => {
    await seedProfileSystem('ps1');

    const result = await firestoreRequest<{ deactivated?: boolean; deleted?: boolean }>(
      'DELETE',
      `/businesses/${businessId}/profile-systems/ps1`
    );
    expect(result.deactivated).toBe(true);

    const list = await firestoreRequest<{ id: string; is_active: number }[]>('GET', `/businesses/${businessId}/profile-systems`);
    const item = list.find((r) => r.id === 'ps1');
    expect(item).toBeDefined();
    expect(item!.is_active).toBe(0);
  });

  it('deleting a forked item reverts it to the current global value instead of hiding it', async () => {
    await seedProfileSystem('ps1');
    await firestoreRequest('PUT', `/businesses/${businessId}/profile-systems/ps1`, { price_per_meter: 999 });

    const result = await firestoreRequest<{ deleted?: boolean }>('DELETE', `/businesses/${businessId}/profile-systems/ps1`);
    expect(result.deleted).toBe(true);

    const list = await firestoreRequest<{ id: string; price_per_meter: number }[]>('GET', `/businesses/${businessId}/profile-systems`);
    expect(list.find((r) => r.id === 'ps1')!.price_per_meter).toBe(50);
  });

  it('deleting a wholly business-owned item with no references hard-deletes it', async () => {
    const created = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/accessories`, {
      name_he: 'ידית',
      unit: 'יח',
      price_per_unit: 20,
    });

    const result = await firestoreRequest<{ deleted?: boolean }>('DELETE', `/businesses/${businessId}/accessories/${created.id}`);
    expect(result.deleted).toBe(true);

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${businessId}/accessories`);
    expect(list.some((r) => r.id === created.id)).toBe(false);
  });
});
