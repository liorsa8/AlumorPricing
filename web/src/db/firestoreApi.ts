import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
  writeBatch,
  CollectionReference,
  Query,
  DocumentData,
} from 'firebase/firestore';
import { db as firestore, auth } from './firebaseConfig';
import { mergeCatalog } from './catalogMerge';
import { computeOpeningLine, computeProjectTotals, AccessoryInput, OpeningLineResult } from '../lib/quoteCalculator';
import { DEFAULT_STANDARD_TERMS } from '../data/seedData';
import { DEFAULT_COMPANY_LOGO } from '../data/companyLogo';

// A tiny in-memory router — the exact same addRoute/localRequest pattern web/src/db/localApi.ts
// used for the Dexie-backed version (see docs/ARCHITECTURE.md: this is a deliberate, reused
// project convention), so web/src/api/client.ts's api.get/post/put/delete(url) calls don't
// need to change shape. Only the transport changed: Firestore instead of IndexedDB, and every
// business-scoped path now carries a /businesses/:businessId segment. Two namespaces:
// /catalog/... (admin-only, the true global catalog) and /businesses/:businessId/... (the
// merged, per-business view — reads combine global + this business's own overrides).

class ApiError extends Error {}

type Handler = (params: Record<string, string>, query: URLSearchParams, body: any) => Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];

function addRoute(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const patternStr = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment;
    })
    .join('/');
  routes.push({ method, pattern: new RegExp(`^${patternStr}$`), keys, handler });
}

export async function firestoreRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const [rawPath, queryString] = url.split('?');
  const path = rawPath.replace(/^\/api/, '') || '/';
  const query_ = new URLSearchParams(queryString ?? '');

  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => (params[key] = match[i + 1]));
    try {
      return (await route.handler(params, query_, body)) as T;
    } catch (e) {
      if (e instanceof ApiError) throw new Error(e.message);
      throw e;
    }
  }
  throw new ApiError(`route_not_found: ${method} ${path}`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentUid(): string {
  const u = auth.currentUser;
  if (!u) throw new ApiError('not_signed_in');
  return u.uid;
}

// ---- Row shapes (id: string — Firestore auto-ids — except embedded opening/accessory-line
// ids, which stay small numbers from a per-project counter, since they're never their own
// Firestore documents) ----

interface CatalogItemRow {
  id: string;
  name_he: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface OpeningTypeKitLine {
  accessory_id: string;
  quantity: number;
}

interface OpeningTypeRow extends CatalogItemRow {
  code: string;
  profile_factor: number;
  glass_area_ratio: number;
  sort_order: number;
  accessories: OpeningTypeKitLine[];
}

interface BusinessRow {
  id: string;
  owner_uid: string;
  company_name: string;
  company_phone: string;
  company_address: string;
  company_email: string;
  company_tax_id: string;
  company_logo: string;
  labor_pct: number;
  installation_pct: number;
  vat_pct: number;
  standard_terms: string;
  next_quote_number: number;
  created_at: string;
  updated_at: string;
}

interface CustomerRow {
  id: string;
  owner_uid: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AccessoryLineEntry {
  id: number;
  accessory_id: string;
  accessory_name_snapshot: string;
  quantity: number;
  price_per_unit_snapshot: number;
  line_total: number;
}

interface OpeningEntry {
  id: number;
  opening_type_id: string;
  profile_system_id: string;
  glass_type_id: string;
  label: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
  profile_length_m: number;
  glass_area_sqm: number;
  material_cost: number;
  accessories_cost: number;
  unit_subtotal: number;
  line_subtotal: number;
  profile_factor_snapshot: number;
  glass_area_ratio_snapshot: number;
  profile_price_per_meter_snapshot: number;
  glass_price_per_sqm_snapshot: number;
  opening_type_name_snapshot: string;
  profile_system_name_snapshot: string;
  profile_system_series_code_snapshot: string | null;
  glass_type_name_snapshot: string;
  created_at: string;
  updated_at: string;
  accessory_lines: AccessoryLineEntry[];
}

interface ProjectRow {
  id: string;
  owner_uid: string;
  customer_id: string | null;
  quote_number: number;
  title: string;
  status: string;
  notes: string | null;
  labor_pct_snapshot: number;
  installation_pct_snapshot: number;
  vat_pct_snapshot: number;
  discount_pct: number;
  material_subtotal: number;
  labor_amount: number;
  installation_amount: number;
  discount_amount: number;
  pre_vat_total: number;
  vat_amount: number;
  total: number;
  created_at: string;
  updated_at: string;
  next_opening_id: number;
  openings: OpeningEntry[];
}

// ---- Firestore path helpers ----

const businessDoc = (businessId: string) => doc(firestore, 'businesses', businessId);
const customersCol = (businessId: string) => collection(firestore, 'businesses', businessId, 'customers');
const customerDoc = (businessId: string, id: string) => doc(firestore, 'businesses', businessId, 'customers', id);
const projectsCol = (businessId: string) => collection(firestore, 'businesses', businessId, 'projects');
const projectDoc = (businessId: string, id: string) => doc(firestore, 'businesses', businessId, 'projects', id);

const SIMPLE_CATALOG_KINDS = ['profile-systems', 'glass-types', 'accessories'] as const;
type SimpleCatalogKind = (typeof SIMPLE_CATALOG_KINDS)[number];
const CATALOG_COLLECTION_NAME: Record<SimpleCatalogKind | 'opening-types', string> = {
  'profile-systems': 'profile_systems',
  'glass-types': 'glass_types',
  accessories: 'accessories',
  'opening-types': 'opening_types',
};
const globalCol = (kind: SimpleCatalogKind | 'opening-types') => collection(firestore, `catalog_${CATALOG_COLLECTION_NAME[kind]}`);
const overridesCol = (businessId: string, kind: SimpleCatalogKind | 'opening-types') =>
  collection(firestore, 'businesses', businessId, `${CATALOG_COLLECTION_NAME[kind]}_overrides`);

async function readCollection<T extends { id: string }>(col: CollectionReference<DocumentData> | Query<DocumentData>): Promise<T[]> {
  const snap = await getDocs(col);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

// Reads of a business-scoped collection (customers, projects, catalog overrides) MUST filter
// on owner_uid: firestore.rules gates read on a per-document owner_uid equality check, and a
// multi-document query is only allowed to run at all if it's provably restricted to documents
// the caller could read — a query with no matching where('owner_uid', ...) clause is rejected
// outright with permission-denied, even for the legitimate owner.
function ownScopedCol(col: CollectionReference<DocumentData>): Query<DocumentData> {
  return query(col, where('owner_uid', '==', currentUid()));
}

// No ordering guarantee — callers that display this list sort it themselves (some need plain
// name order, others like opening-types need sort_order first), so sorting here would either be
// wasted work (immediately overwritten) or wrong for the caller that actually needs a different
// order.
async function readMergedCatalog<T extends CatalogItemRow>(businessId: string, kind: SimpleCatalogKind | 'opening-types'): Promise<T[]> {
  const [globalItems, overrides] = await Promise.all([
    readCollection<T>(globalCol(kind)),
    readCollection<T>(ownScopedCol(overridesCol(businessId, kind))),
  ]);
  return mergeCatalog(globalItems, overrides);
}

// The two orderings every catalog list route needs — shared so the comparator itself only
// exists once, even though it's applied at 4 different call sites (global/business × simple
// catalogs/opening-types).
function sortByNameHe<T extends CatalogItemRow>(rows: T[]): T[] {
  return rows.sort((a, b) => a.name_he.localeCompare(b.name_he));
}
function sortByOrderThenName<T extends OpeningTypeRow>(rows: T[]): T[] {
  return rows.sort((a, b) => a.sort_order - b.sort_order || a.name_he.localeCompare(b.name_he));
}

// Point lookup for a single merged catalog item (override first, else global) — used wherever
// only one specific id is needed, so the caller isn't paying for a full collection scan of
// every other item in that catalog just to find the one it wants.
async function resolveMergedItem<T extends CatalogItemRow>(
  businessId: string,
  kind: SimpleCatalogKind | 'opening-types',
  id: string
): Promise<T | null> {
  const overrideSnap = await getDoc(doc(overridesCol(businessId, kind), id));
  if (overrideSnap.exists()) return { id: overrideSnap.id, ...overrideSnap.data() } as T;
  const globalSnap = await getDoc(doc(globalCol(kind), id));
  if (globalSnap.exists()) return { id: globalSnap.id, ...globalSnap.data() } as T;
  return null;
}

// ---- Businesses (was the single global /settings row) ----

addRoute('GET', '/businesses', async () => {
  const q = query(collection(firestore, 'businesses'), where('owner_uid', '==', currentUid()));
  const rows = await readCollection<BusinessRow>(q);
  rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return rows;
});

addRoute('POST', '/businesses', async (_p, _q, body: any) => {
  const now = nowIso();
  const ref = doc(collection(firestore, 'businesses'));
  const data: Omit<BusinessRow, 'id'> = {
    owner_uid: currentUid(),
    company_name: body.company_name ?? 'אלומור',
    company_phone: body.company_phone ?? '0544343384',
    company_address: body.company_address ?? 'הסתדרות 128, חולון',
    company_email: body.company_email ?? '',
    company_tax_id: body.company_tax_id ?? '',
    company_logo: body.company_logo ?? DEFAULT_COMPANY_LOGO,
    labor_pct: body.labor_pct ?? 100,
    installation_pct: body.installation_pct ?? 10,
    vat_pct: body.vat_pct ?? 18,
    standard_terms: body.standard_terms ?? DEFAULT_STANDARD_TERMS,
    next_quote_number: 1,
    created_at: now,
    updated_at: now,
  };
  await setDoc(ref, data);
  return { id: ref.id, ...data };
});

addRoute('GET', '/businesses/:businessId', async (p) => {
  const snap = await getDoc(businessDoc(p.businessId));
  if (!snap.exists()) throw new ApiError('not_found');
  return { id: snap.id, ...snap.data() };
});

addRoute('PUT', '/businesses/:businessId', async (p, _q, body: any) => {
  const ref = businessDoc(p.businessId);
  const existing = (await getDoc(ref)).data() as BusinessRow | undefined;
  if (!existing) throw new ApiError('not_found');
  await updateDoc(ref, {
    labor_pct: body.labor_pct ?? existing.labor_pct,
    installation_pct: body.installation_pct ?? existing.installation_pct,
    vat_pct: body.vat_pct ?? existing.vat_pct,
    company_name: body.company_name ?? existing.company_name,
    company_phone: body.company_phone ?? existing.company_phone,
    company_address: body.company_address ?? existing.company_address,
    company_email: body.company_email ?? existing.company_email,
    company_tax_id: body.company_tax_id ?? existing.company_tax_id,
    company_logo: body.company_logo ?? existing.company_logo,
    standard_terms: body.standard_terms ?? existing.standard_terms,
    updated_at: nowIso(),
  });
  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
});

// ---- Customers ----

addRoute('GET', '/businesses/:businessId/customers', async (p) => {
  const rows = await readCollection<CustomerRow>(ownScopedCol(customersCol(p.businessId)));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
});

addRoute('POST', '/businesses/:businessId/customers', async (p, _q, body: any) => {
  if (!body.name) throw new ApiError('name_required');
  const now = nowIso();
  const ref = doc(customersCol(p.businessId));
  const data: Omit<CustomerRow, 'id'> = {
    owner_uid: currentUid(),
    name: body.name,
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ?? null,
    notes: body.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  await setDoc(ref, data);
  return { id: ref.id, ...data };
});

addRoute('PUT', '/businesses/:businessId/customers/:id', async (p, _q, body: any) => {
  const ref = customerDoc(p.businessId, p.id);
  const existing = (await getDoc(ref)).data() as CustomerRow | undefined;
  if (!existing) throw new ApiError('not_found');
  await updateDoc(ref, {
    name: body.name ?? existing.name,
    phone: body.phone ?? existing.phone,
    email: body.email ?? existing.email,
    address: body.address ?? existing.address,
    notes: body.notes ?? existing.notes,
    updated_at: nowIso(),
  });
  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
});

addRoute('DELETE', '/businesses/:businessId/customers/:id', async (p) => {
  const existing = await getDoc(customerDoc(p.businessId, p.id));
  if (!existing.exists()) throw new ApiError('not_found');
  // Intentionally app-layer-only, unlike the draft-lock in firestore.rules: an owner bypassing
  // this could only ever corrupt their own business's data (an orphaned customer_id on their
  // own project), never another business's, so there's no matching security rule for it.
  // Also intentionally NOT a transaction: Firestore transactions can only tx.get() individual
  // documents, never run a query, so this check-then-act still has a narrow race window (a
  // concurrent PUT could point a project at this customer between the check and the delete,
  // below) that would need a denormalized reference counter to close properly.
  const referenced = (
    await getDocs(query(projectsCol(p.businessId), where('owner_uid', '==', currentUid()), where('customer_id', '==', p.id)))
  ).size > 0;
  if (referenced) throw new ApiError('customer_has_projects');
  await deleteDoc(customerDoc(p.businessId, p.id));
  return { deleted: true };
});

// ---- Simple catalogs (profile systems / glass types / accessories) ----
//
// Two namespaces, sharing the same field lists: /catalog/:kind (admin-only, the true global
// catalog — enforced by firestore.rules, not just this code) and
// /businesses/:businessId/:kind (the merged, per-business view: reads combine global +
// this business's own overrides; writes always go to the business's override collection,
// never the global one — "unchanged for everyone else" holds by construction).

const SIMPLE_CATALOG_CONFIGS: { kind: SimpleCatalogKind; fields: string[] }[] = [
  { kind: 'profile-systems', fields: ['name_he', 'series_code', 'manufacturer', 'price_per_meter'] },
  { kind: 'glass-types', fields: ['name_he', 'thickness_mm', 'price_per_sqm'] },
  { kind: 'accessories', fields: ['name_he', 'unit', 'price_per_unit'] },
];

function registerGlobalSimpleCatalogRoutes(kind: SimpleCatalogKind, fields: string[]) {
  const base = `/catalog/${kind}`;

  addRoute('GET', base, async () => sortByNameHe(await readCollection<CatalogItemRow>(globalCol(kind))));

  addRoute('POST', base, async (_p, _q, body: any) => {
    const now = nowIso();
    const ref = doc(globalCol(kind));
    const data: any = { is_active: 1, created_at: now, updated_at: now };
    for (const f of fields) data[f] = body[f] ?? null;
    await setDoc(ref, data);
    return { id: ref.id, ...data };
  });

  addRoute('PUT', `${base}/:id`, async (p, _q, body: any) => {
    const ref = doc(globalCol(kind), p.id);
    const existing = (await getDoc(ref)).data() as CatalogItemRow | undefined;
    if (!existing) throw new ApiError('not_found');
    const patch: any = {};
    for (const f of fields) patch[f] = body[f] !== undefined ? body[f] : existing[f];
    patch.is_active = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
    patch.updated_at = nowIso();
    await updateDoc(ref, patch);
    const snap = await getDoc(ref);
    return { id: snap.id, ...snap.data() };
  });

  addRoute('DELETE', `${base}/:id`, async (p) => {
    const existing = await getDoc(doc(globalCol(kind), p.id));
    if (!existing.exists()) throw new ApiError('not_found');
    // Always soft-deactivate, never hard-delete: a global item can be referenced by any
    // number of OTHER businesses' drafts, and cheaply checking across all of them isn't
    // practical (would need a collection-group query over every business) — deactivating
    // is safe by construction instead, and matches the original "protect existing usage"
    // intent even though it can no longer verify usage is actually zero.
    await updateDoc(doc(globalCol(kind), p.id), { is_active: 0, updated_at: nowIso() });
    return { deactivated: true };
  });
}

for (const cfg of SIMPLE_CATALOG_CONFIGS) registerGlobalSimpleCatalogRoutes(cfg.kind, cfg.fields);

// Every project's openings, regardless of status — a catalog item can still be referenced by a
// FINALIZED quote's frozen opening, not just a draft one, and hard-deleting an override that's
// still referenced anywhere would leave that project's opening pointing at a nonexistent doc.
async function getAllOpenings(businessId: string): Promise<OpeningEntry[]> {
  const snap = await getDocs(ownScopedCol(projectsCol(businessId)));
  const openings: OpeningEntry[] = [];
  snap.docs.forEach((d) => openings.push(...((d.data() as ProjectRow).openings ?? [])));
  return openings;
}

// Both referenced-checks below are intentionally app-layer-only, same reasoning as
// customer_has_projects above: bypassing them can only ever corrupt this business's own
// data (a dangling catalog reference in one of its own openings), never another business's —
// so unlike the draft-lock, there's no matching firestore.rules check.
async function isReferencedInBusinessDrafts(
  businessId: string,
  field: 'profile_system_id' | 'glass_type_id',
  id: string
): Promise<boolean> {
  const openings = await getAllOpenings(businessId);
  return openings.some((o) => o[field] === id);
}

async function isAccessoryReferenced(businessId: string, id: string): Promise<boolean> {
  const [openings, openingTypes] = await Promise.all([
    getAllOpenings(businessId),
    readMergedCatalog<OpeningTypeRow>(businessId, 'opening-types'),
  ]);
  if (openings.some((o) => o.accessory_lines.some((a) => a.accessory_id === id))) return true;
  return openingTypes.some((t) => t.accessories.some((a) => a.accessory_id === id));
}

// Shared by every merged catalog kind (simple catalogs and opening-types alike): revert a fork
// back to the global value if it exists there, else deactivate-if-referenced or hard-delete a
// business-only item. Kept as one function so a fix to this logic (e.g. the getAllOpenings
// scope) only has to be made once instead of drifting between per-kind copies.
async function deleteMergedCatalogItem(
  kind: SimpleCatalogKind | 'opening-types',
  businessId: string,
  id: string,
  isReferenced: (businessId: string, id: string) => Promise<boolean>
): Promise<{ deleted: true } | { deactivated: true }> {
  const globalSnap = await getDoc(doc(globalCol(kind), id));
  const overrideRef = doc(overridesCol(businessId, kind), id);
  if (globalSnap.exists()) {
    const overrideSnap = await getDoc(overrideRef);
    if (!overrideSnap.exists()) {
      // Never forked — the UI can't tell a plain global item apart from a business-only one
      // (both show forked_from_global: false), so it offers the same "מחיקה" button on both.
      // There's nothing of this business's own to revert here, and a global item can't be
      // deleted outright (it's shared by every business) — fork it into an inactive override
      // instead, the same end state the "השבת" toggle already produces for a forked item.
      await setDoc(overrideRef, { ...globalSnap.data(), owner_uid: currentUid(), is_active: 0, updated_at: nowIso() });
      return { deactivated: true };
    }
    // Reverting a fork is always safe — historical quotes already snapshot the values
    // they were priced with regardless of catalog source, so falling back to the current
    // global value can never retroactively change an existing quote.
    await deleteDoc(overrideRef);
    return { deleted: true };
  }
  const existing = await getDoc(overrideRef);
  if (!existing.exists()) throw new ApiError('not_found');
  // Intentionally NOT a transaction, same reasoning as the customer DELETE route below:
  // Firestore transactions can only tx.get() individual documents, never run the query
  // `isReferenced` needs, so this check-then-act has a narrow race window (a concurrent
  // opening add/edit could start referencing this item between the check and the delete)
  // that would need a denormalized reference counter to close properly. Bypassing it can only
  // ever corrupt this business's own data, never another business's.
  if (await isReferenced(businessId, id)) {
    await updateDoc(overrideRef, { is_active: 0, updated_at: nowIso() });
    return { deactivated: true };
  }
  await deleteDoc(overrideRef);
  return { deleted: true };
}

function registerBusinessSimpleCatalogRoutes(
  kind: SimpleCatalogKind,
  fields: string[],
  isReferenced: (businessId: string, id: string) => Promise<boolean>
) {
  const base = `/businesses/:businessId/${kind}`;

  addRoute('GET', base, async (p) => sortByNameHe(await readMergedCatalog<CatalogItemRow>(p.businessId, kind)));

  addRoute('POST', base, async (p, _q, body: any) => {
    const now = nowIso();
    const ref = doc(overridesCol(p.businessId, kind));
    const data: any = { owner_uid: currentUid(), is_active: 1, created_at: now, updated_at: now };
    for (const f of fields) data[f] = body[f] ?? null;
    await setDoc(ref, data);
    return { id: ref.id, ...data };
  });

  addRoute('PUT', `${base}/:id`, async (p, _q, body: any) => {
    const existing = await resolveMergedItem<CatalogItemRow>(p.businessId, kind, p.id);
    if (!existing) throw new ApiError('not_found');
    const patch: any = { owner_uid: currentUid(), created_at: existing.created_at, updated_at: nowIso() };
    for (const f of fields) patch[f] = body[f] !== undefined ? body[f] : existing[f];
    patch.is_active = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
    await setDoc(doc(overridesCol(p.businessId, kind), p.id), patch);
    return { id: p.id, ...patch };
  });

  addRoute('DELETE', `${base}/:id`, async (p) => deleteMergedCatalogItem(kind, p.businessId, p.id, isReferenced));
}

const BUSINESS_SIMPLE_CATALOG_REFERENCED_CHECKS: Record<SimpleCatalogKind, (businessId: string, id: string) => Promise<boolean>> = {
  'profile-systems': (bid, id) => isReferencedInBusinessDrafts(bid, 'profile_system_id', id),
  'glass-types': (bid, id) => isReferencedInBusinessDrafts(bid, 'glass_type_id', id),
  accessories: isAccessoryReferenced,
};

for (const cfg of SIMPLE_CATALOG_CONFIGS) {
  registerBusinessSimpleCatalogRoutes(cfg.kind, cfg.fields, BUSINESS_SIMPLE_CATALOG_REFERENCED_CHECKS[cfg.kind]);
}

// ---- Opening types (+ their default accessory kit) ----
//
// A kit is stored as raw { accessory_id, quantity } refs — never frozen, resolved against the
// live accessory catalog (global-only for the /catalog namespace, merged for a business) every
// time it's read, exactly like the Dexie version's join. Only a *placed quote's* openings[]
// freeze accessory names/prices — see accessory_lines in ProjectRow.

interface OpeningTypeKitDisplayLine {
  accessory_id: string;
  quantity: number;
  name_he: string;
  price_per_unit: number;
}

function resolveKit(rawKit: OpeningTypeKitLine[], accessoriesById: Map<string, CatalogItemRow>): OpeningTypeKitDisplayLine[] {
  const lines: OpeningTypeKitDisplayLine[] = [];
  for (const k of rawKit ?? []) {
    const acc = accessoriesById.get(k.accessory_id);
    if (acc) lines.push({ accessory_id: k.accessory_id, quantity: k.quantity, name_he: acc.name_he, price_per_unit: acc.price_per_unit as number });
  }
  return lines;
}

function parseKitBody(body: any): OpeningTypeKitLine[] {
  return (body.accessories ?? [])
    .filter((i: any) => i.quantity > 0)
    .map((i: any) => ({ accessory_id: i.accessory_id, quantity: i.quantity }));
}

// -- Global (admin) --

addRoute('GET', '/catalog/opening-types', async () => {
  const [rows, accessories] = await Promise.all([
    readCollection<OpeningTypeRow>(globalCol('opening-types')),
    readCollection<CatalogItemRow>(globalCol('accessories')),
  ]);
  sortByOrderThenName(rows);
  const byId = new Map(accessories.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, accessories: resolveKit(r.accessories, byId) }));
});

addRoute('POST', '/catalog/opening-types', async (_p, _q, body: any) => {
  const now = nowIso();
  const ref = doc(globalCol('opening-types'));
  const data: Omit<OpeningTypeRow, 'id'> = {
    name_he: body.name_he,
    code: body.code,
    profile_factor: body.profile_factor,
    glass_area_ratio: body.glass_area_ratio,
    sort_order: body.sort_order ?? 0,
    is_active: 1,
    accessories: [],
    created_at: now,
    updated_at: now,
  };
  await setDoc(ref, data);
  return { id: ref.id, ...data };
});

addRoute('PUT', '/catalog/opening-types/:id', async (p, _q, body: any) => {
  const ref = doc(globalCol('opening-types'), p.id);
  const existing = (await getDoc(ref)).data() as OpeningTypeRow | undefined;
  if (!existing) throw new ApiError('not_found');
  await updateDoc(ref, {
    name_he: body.name_he ?? existing.name_he,
    code: body.code ?? existing.code,
    profile_factor: body.profile_factor ?? existing.profile_factor,
    glass_area_ratio: body.glass_area_ratio ?? existing.glass_area_ratio,
    sort_order: body.sort_order ?? existing.sort_order,
    is_active: body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active,
    updated_at: nowIso(),
  });
  const [snap, accessories] = await Promise.all([getDoc(ref), readCollection<CatalogItemRow>(globalCol('accessories'))]);
  const data = snap.data() as OpeningTypeRow;
  return { ...data, id: snap.id, accessories: resolveKit(data.accessories, new Map(accessories.map((a) => [a.id, a]))) };
});

addRoute('DELETE', '/catalog/opening-types/:id', async (p) => {
  const existing = await getDoc(doc(globalCol('opening-types'), p.id));
  if (!existing.exists()) throw new ApiError('not_found');
  await updateDoc(doc(globalCol('opening-types'), p.id), { is_active: 0, updated_at: nowIso() });
  return { deactivated: true };
});

// Resolves exactly the accessories referenced by a kit (a handful of items) via point lookups,
// instead of `resolveKit` + a full collection scan — used wherever a kit is written and its
// resolved display lines are needed back in the response, without also needing every other
// accessory that happens to exist in the catalog.
async function resolveKitByLookup(items: OpeningTypeKitLine[], lookup: (id: string) => Promise<CatalogItemRow | null>): Promise<OpeningTypeKitDisplayLine[]> {
  const accDocs = await Promise.all(items.map((i) => lookup(i.accessory_id)));
  const lines: OpeningTypeKitDisplayLine[] = [];
  items.forEach((item, idx) => {
    const acc = accDocs[idx];
    if (acc) lines.push({ accessory_id: item.accessory_id, quantity: item.quantity, name_he: acc.name_he, price_per_unit: acc.price_per_unit as number });
  });
  return lines;
}

async function getGlobalAccessory(id: string): Promise<CatalogItemRow | null> {
  const snap = await getDoc(doc(globalCol('accessories'), id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as CatalogItemRow) : null;
}

addRoute('PUT', '/catalog/opening-types/:id/accessories', async (p, _q, body: any) => {
  const ref = doc(globalCol('opening-types'), p.id);
  const existing = await getDoc(ref);
  if (!existing.exists()) throw new ApiError('not_found');
  const items = parseKitBody(body);
  await updateDoc(ref, { accessories: items, updated_at: nowIso() });
  return { accessories: await resolveKitByLookup(items, getGlobalAccessory) };
});

// -- Business-scoped (merged) --

addRoute('GET', '/businesses/:businessId/opening-types', async (p) => {
  const [rows, accessories] = await Promise.all([
    readMergedCatalog<OpeningTypeRow>(p.businessId, 'opening-types'),
    readMergedCatalog<CatalogItemRow>(p.businessId, 'accessories'),
  ]);
  sortByOrderThenName(rows);
  const byId = new Map(accessories.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, accessories: resolveKit(r.accessories, byId) }));
});

addRoute('POST', '/businesses/:businessId/opening-types', async (p, _q, body: any) => {
  const now = nowIso();
  const ref = doc(overridesCol(p.businessId, 'opening-types'));
  const data = {
    owner_uid: currentUid(),
    name_he: body.name_he,
    code: body.code,
    profile_factor: body.profile_factor,
    glass_area_ratio: body.glass_area_ratio,
    sort_order: body.sort_order ?? 0,
    is_active: 1,
    accessories: [] as OpeningTypeKitLine[],
    created_at: now,
    updated_at: now,
  };
  await setDoc(ref, data);
  return { id: ref.id, ...data, accessories: [] };
});

addRoute('PUT', '/businesses/:businessId/opening-types/:id', async (p, _q, body: any) => {
  const existing = await resolveMergedItem<OpeningTypeRow>(p.businessId, 'opening-types', p.id);
  if (!existing) throw new ApiError('not_found');
  const patch = {
    owner_uid: currentUid(),
    name_he: body.name_he ?? existing.name_he,
    code: body.code ?? existing.code,
    profile_factor: body.profile_factor ?? existing.profile_factor,
    glass_area_ratio: body.glass_area_ratio ?? existing.glass_area_ratio,
    sort_order: body.sort_order ?? existing.sort_order,
    is_active: body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active,
    accessories: existing.accessories,
    created_at: existing.created_at,
    updated_at: nowIso(),
  };
  await setDoc(doc(overridesCol(p.businessId, 'opening-types'), p.id), patch);
  return { id: p.id, ...patch, accessories: await resolveKitByLookup(patch.accessories, (id) => resolveMergedItem<CatalogItemRow>(p.businessId, 'accessories', id)) };
});

addRoute('DELETE', '/businesses/:businessId/opening-types/:id', async (p) =>
  deleteMergedCatalogItem('opening-types', p.businessId, p.id, async (businessId, id) => {
    const openings = await getAllOpenings(businessId);
    return openings.some((o) => o.opening_type_id === id);
  })
);

addRoute('PUT', '/businesses/:businessId/opening-types/:id/accessories', async (p, _q, body: any) => {
  const existing = await resolveMergedItem<OpeningTypeRow>(p.businessId, 'opening-types', p.id);
  if (!existing) throw new ApiError('not_found');
  const items = parseKitBody(body);
  const patch = { ...existing, owner_uid: currentUid(), accessories: items, updated_at: nowIso() };
  delete (patch as any).id;
  await setDoc(doc(overridesCol(p.businessId, 'opening-types'), p.id), patch);
  return { accessories: await resolveKitByLookup(items, (id) => resolveMergedItem<CatalogItemRow>(p.businessId, 'accessories', id)) };
});

// ---- Projects + nested openings ----
//
// Openings live as an embedded array on their project document (never their own Firestore
// documents), so create/update/delete all go through runTransaction on that one document —
// the transaction is what next_opening_id and the running totals are consistent against.
// Catalog lookups (opening type / profile system / glass type / accessory kit) are resolved
// against the business's MERGED catalog via plain reads before the transaction starts: they
// aren't part of what the transaction needs to stay consistent, exactly like the Dexie
// version's non-transactional resolveOpeningRefs.

interface ResolvedOpeningRefs {
  type: OpeningTypeRow;
  kit: AccessoryInput[];
  profileSystem: CatalogItemRow;
  glassType: CatalogItemRow;
}

async function resolveOpeningRefs(
  businessId: string,
  openingTypeId: string,
  profileSystemId: string,
  glassTypeId: string
): Promise<ResolvedOpeningRefs | null> {
  // Point lookups for the 3 referenced ids (not a full scan of each catalog) — this runs on
  // every opening add/edit/recalculate, the hottest write path while building a quote.
  const [type, profileSystem, glassType] = await Promise.all([
    resolveMergedItem<OpeningTypeRow>(businessId, 'opening-types', openingTypeId),
    resolveMergedItem<CatalogItemRow>(businessId, 'profile-systems', profileSystemId),
    resolveMergedItem<CatalogItemRow>(businessId, 'glass-types', glassTypeId),
  ]);
  if (!type || !profileSystem || !glassType) return null;

  // Same for the kit's own accessories — a handful of point lookups, not the whole collection.
  const kitRefs = type.accessories ?? [];
  const accessoryDocs = await Promise.all(kitRefs.map((k) => resolveMergedItem<CatalogItemRow>(businessId, 'accessories', k.accessory_id)));
  const kit: AccessoryInput[] = [];
  kitRefs.forEach((k, i) => {
    const acc = accessoryDocs[i];
    if (acc) kit.push({ accessory_id: k.accessory_id, name_he: acc.name_he, quantity: k.quantity, price_per_unit: acc.price_per_unit as number });
  });
  return { type, kit, profileSystem, glassType };
}

function priceOpening(refs: ResolvedOpeningRefs, widthMm: number, heightMm: number, quantity: number): OpeningLineResult {
  return computeOpeningLine(
    widthMm,
    heightMm,
    quantity,
    { profile_factor: refs.type.profile_factor, glass_area_ratio: refs.type.glass_area_ratio },
    { profile_price_per_meter: refs.profileSystem.price_per_meter as number, glass_price_per_sqm: refs.glassType.price_per_sqm as number },
    refs.kit
  );
}

interface OpeningOwnColumns {
  opening_type_id: string;
  profile_system_id: string;
  glass_type_id: string;
  label: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
}

function buildOpeningEntry(id: number, own: OpeningOwnColumns, computed: OpeningLineResult, refs: ResolvedOpeningRefs, createdAt: string): OpeningEntry {
  return {
    id,
    ...own,
    profile_length_m: computed.profile_length_m,
    glass_area_sqm: computed.glass_area_sqm,
    material_cost: computed.material_cost,
    accessories_cost: computed.accessories_cost,
    unit_subtotal: computed.unit_subtotal,
    line_subtotal: computed.line_subtotal,
    profile_factor_snapshot: refs.type.profile_factor,
    glass_area_ratio_snapshot: refs.type.glass_area_ratio,
    profile_price_per_meter_snapshot: refs.profileSystem.price_per_meter as number,
    glass_price_per_sqm_snapshot: refs.glassType.price_per_sqm as number,
    opening_type_name_snapshot: refs.type.name_he,
    profile_system_name_snapshot: refs.profileSystem.name_he,
    profile_system_series_code_snapshot: (refs.profileSystem.series_code as string | undefined) ?? null,
    glass_type_name_snapshot: refs.glassType.name_he,
    created_at: createdAt,
    updated_at: nowIso(),
    accessory_lines: computed.accessory_lines.map((line, i) => ({
      id: i + 1,
      accessory_id: line.accessory_id,
      accessory_name_snapshot: line.name_he,
      quantity: line.quantity,
      price_per_unit_snapshot: line.price_per_unit,
      line_total: line.line_total,
    })),
  };
}

// Shared by recalculate and every opening create/update/delete: recomputes totals from the
// given openings against the business's CURRENT pricing settings (always current — these
// routes only ever run while status === 'draft', so re-pulling labor/installation/vat live on
// every change is exactly the intended behavior, not a cache-staleness bug) and returns the
// patch fields those four call sites all used to build by hand.
function repriceProject(openings: OpeningEntry[], biz: BusinessRow, discountPct: number) {
  const totals = computeProjectTotals(
    openings.reduce((sum, o) => sum + o.line_subtotal, 0),
    biz.labor_pct,
    biz.installation_pct,
    discountPct,
    biz.vat_pct
  );
  return {
    labor_pct_snapshot: biz.labor_pct,
    installation_pct_snapshot: biz.installation_pct,
    vat_pct_snapshot: biz.vat_pct,
    ...totals,
  };
}

async function loadProjectDetail(businessId: string, id: string) {
  const snap = await getDoc(projectDoc(businessId, id));
  if (!snap.exists()) return null;
  const project = { id: snap.id, ...(snap.data() as Omit<ProjectRow, 'id'>) };
  const customerSnap = project.customer_id ? await getDoc(customerDoc(businessId, project.customer_id)) : null;
  const customer = customerSnap && customerSnap.exists() ? (customerSnap.data() as CustomerRow) : null;
  return {
    ...project,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_email: customer?.email ?? null,
    customer_address: customer?.address ?? null,
  };
}

// A "new quote" is created immediately (so there's a page to build it on) with no customer
// and no openings yet — which is also exactly what it looks like for the first few moments
// while the owner is actively filling in that very first opening. Only ever consider a draft
// once it's been sitting untouched for a while (updated_at, not created_at — it's bumped on
// every real edit), so an actively-open editing session can never be swept, and even then
// only remove one with NEITHER a customer NOR any opening.
const ABANDONED_DRAFT_AGE_MS = 10 * 60 * 1000;

async function deleteEmptyAbandonedDrafts(businessId: string) {
  const cutoff = new Date(Date.now() - ABANDONED_DRAFT_AGE_MS).toISOString();
  const snap = await getDocs(
    query(
      projectsCol(businessId),
      where('owner_uid', '==', currentUid()),
      where('status', '==', 'draft'),
      where('customer_id', '==', null),
      where('updated_at', '<', cutoff)
    )
  );
  const emptyDocs = snap.docs.filter((d) => ((d.data() as ProjectRow).openings ?? []).length === 0);
  if (!emptyDocs.length) return;
  const batch = writeBatch(firestore);
  emptyDocs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

addRoute('GET', '/businesses/:businessId/projects', async (p, q) => {
  const status = q.get('status') ?? undefined;
  const constraints = [where('owner_uid', '==', currentUid())];
  if (status) constraints.push(where('status', '==', status));
  const projectsQuery = query(projectsCol(p.businessId), ...constraints);

  // The sweep must finish before the projects read starts — running it concurrently (as before)
  // let a draft that the sweep's batch.commit() hadn't landed yet still show up in this same
  // response. It's background maintenance, though, so a failure here (e.g. a composite index
  // still building on a freshly-provisioned project) must not take down the primary read below —
  // the user just keeps seeing whatever stale empty drafts didn't get swept this time.
  try {
    await deleteEmptyAbandonedDrafts(p.businessId);
  } catch {
    // Best-effort cleanup only — see above.
  }
  const [rows, customers] = await Promise.all([
    readCollection<ProjectRow>(projectsQuery),
    // One read of the whole (small, per-business) customer list beats one getDoc per distinct
    // customer_id on the projects list — a page every business owner hits constantly.
    readCollection<CustomerRow>(ownScopedCol(customersCol(p.businessId))),
  ]);
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  return rows.map((r) => ({ ...r, customer_name: r.customer_id ? (nameById.get(r.customer_id) ?? null) : null }));
});

addRoute('GET', '/businesses/:businessId/projects/:id', async (p) => {
  const project = await loadProjectDetail(p.businessId, p.id);
  if (!project) throw new ApiError('not_found');
  return project;
});

addRoute('POST', '/businesses/:businessId/projects', async (p, _q, body: any) => {
  const bizRef = businessDoc(p.businessId);
  const projRef = doc(projectsCol(p.businessId));
  const now = nowIso();
  const uid = currentUid();

  await runTransaction(firestore, async (tx) => {
    const bizSnap = await tx.get(bizRef);
    if (!bizSnap.exists()) throw new ApiError('not_found');
    const biz = bizSnap.data() as BusinessRow;
    const quoteNumber = biz.next_quote_number;
    const data: Omit<ProjectRow, 'id'> = {
      owner_uid: uid,
      customer_id: body.customer_id ?? null,
      quote_number: quoteNumber,
      title: body.title ?? '',
      status: 'draft',
      notes: body.notes ?? null,
      labor_pct_snapshot: biz.labor_pct,
      installation_pct_snapshot: biz.installation_pct,
      vat_pct_snapshot: biz.vat_pct,
      discount_pct: 0,
      material_subtotal: 0,
      labor_amount: 0,
      installation_amount: 0,
      discount_amount: 0,
      pre_vat_total: 0,
      vat_amount: 0,
      total: 0,
      created_at: now,
      updated_at: now,
      next_opening_id: 1,
      openings: [],
    };
    tx.set(projRef, data);
    tx.update(bizRef, { next_quote_number: quoteNumber + 1 });
  });

  return loadProjectDetail(p.businessId, projRef.id);
});

addRoute('PUT', '/businesses/:businessId/projects/:id', async (p, _q, body: any) => {
  const ref = projectDoc(p.businessId, p.id);

  // Transactional so this can't race the opening-mutation transactions below: without it, a
  // concurrent opening add/edit/delete that lands between this route's read and its write would
  // have its totals silently overwritten by the stale totals computed here.
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ApiError('not_found');
    const existing = snap.data() as ProjectRow;

    const status = body.status ?? existing.status;
    const discountPct = body.discount_pct ?? existing.discount_pct;

    let laborPct = existing.labor_pct_snapshot;
    let installationPct = existing.installation_pct_snapshot;
    let vatPct = existing.vat_pct_snapshot;
    if (status === 'draft') {
      const bizSnap = await tx.get(businessDoc(p.businessId));
      if (!bizSnap.exists()) throw new ApiError('not_found');
      const biz = bizSnap.data() as BusinessRow;
      laborPct = biz.labor_pct;
      installationPct = biz.installation_pct;
      vatPct = biz.vat_pct;
    }
    const totals = computeProjectTotals(
      (existing.openings ?? []).reduce((sum, o) => sum + o.line_subtotal, 0),
      laborPct,
      installationPct,
      discountPct,
      vatPct
    );

    tx.update(ref, {
      customer_id: body.customer_id !== undefined ? body.customer_id : existing.customer_id,
      title: body.title ?? existing.title,
      notes: body.notes ?? existing.notes,
      status,
      discount_pct: discountPct,
      labor_pct_snapshot: laborPct,
      installation_pct_snapshot: installationPct,
      vat_pct_snapshot: vatPct,
      ...totals,
      updated_at: nowIso(),
    });
  });

  return loadProjectDetail(p.businessId, p.id);
});

addRoute('DELETE', '/businesses/:businessId/projects/:id', async (p) => {
  const ref = projectDoc(p.businessId, p.id);
  const existing = await getDoc(ref);
  if (!existing.exists()) throw new ApiError('not_found');
  await deleteDoc(ref);
  return { deleted: true };
});

async function repriceOpening(businessId: string, o: OpeningEntry): Promise<OpeningEntry> {
  const refs = await resolveOpeningRefs(businessId, o.opening_type_id, o.profile_system_id, o.glass_type_id);
  if (!refs) return o;
  const computed = priceOpening(refs, o.width_mm, o.height_mm, o.quantity);
  return buildOpeningEntry(
    o.id,
    {
      opening_type_id: o.opening_type_id,
      profile_system_id: o.profile_system_id,
      glass_type_id: o.glass_type_id,
      label: o.label,
      width_mm: o.width_mm,
      height_mm: o.height_mm,
      quantity: o.quantity,
    },
    computed,
    refs,
    o.created_at
  );
}

addRoute('POST', '/businesses/:businessId/projects/:id/recalculate', async (p) => {
  const ref = projectDoc(p.businessId, p.id);

  // Transactional, with the project re-read fresh inside: if a concurrent opening add/edit/
  // delete lands mid-recalculation, Firestore retries this whole callback against the new
  // state instead of letting a stale-based write silently discard that concurrent change.
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ApiError('not_found');
    const project = snap.data() as ProjectRow;
    if (project.status !== 'draft') throw new ApiError('project_not_draft');

    // Point lookups for every opening's catalog refs are independent of each other — resolving
    // them in parallel instead of one-by-one avoids an N-round-trip chain on a project with
    // many openings.
    const repriced = await Promise.all((project.openings ?? []).map((o) => repriceOpening(p.businessId, o)));

    const bizSnap = await tx.get(businessDoc(p.businessId));
    if (!bizSnap.exists()) throw new ApiError('not_found');
    const biz = bizSnap.data() as BusinessRow;

    tx.update(ref, {
      openings: repriced,
      ...repriceProject(repriced, biz, project.discount_pct),
      updated_at: nowIso(),
    });
  });

  return loadProjectDetail(p.businessId, p.id);
});

addRoute('POST', '/businesses/:businessId/projects/:projectId/openings', async (p, _q, body: any) => {
  const { opening_type_id, profile_system_id, glass_type_id, label, width_mm, height_mm, quantity } = body;
  if (!width_mm || !height_mm || width_mm <= 0 || height_mm <= 0) throw new ApiError('invalid_dimensions');

  const refs = await resolveOpeningRefs(p.businessId, opening_type_id, profile_system_id, glass_type_id);
  if (!refs) throw new ApiError('invalid_reference');

  const qty = quantity && quantity > 0 ? quantity : 1;
  const computed = priceOpening(refs, width_mm, height_mm, qty);
  const ref = projectDoc(p.businessId, p.projectId);
  let newOpening: OpeningEntry | undefined;

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ApiError('not_found');
    const project = snap.data() as ProjectRow;
    if (project.status !== 'draft') throw new ApiError('project_not_draft');
    const bizSnap = await tx.get(businessDoc(p.businessId));
    if (!bizSnap.exists()) throw new ApiError('not_found');
    const biz = bizSnap.data() as BusinessRow;

    const now = nowIso();
    const openingId = project.next_opening_id ?? 1;
    newOpening = buildOpeningEntry(
      openingId,
      { opening_type_id, profile_system_id, glass_type_id, label: label ?? '', width_mm, height_mm, quantity: qty },
      computed,
      refs,
      now
    );
    const openings = [...(project.openings ?? []), newOpening];

    tx.update(ref, {
      openings,
      next_opening_id: openingId + 1,
      ...repriceProject(openings, biz, project.discount_pct),
      updated_at: now,
    });
  });

  return { ...newOpening!, project_id: p.projectId };
});

addRoute('PUT', '/businesses/:businessId/projects/:projectId/openings/:id', async (p, _q, body: any) => {
  const openingId = Number(p.id);
  const ref = projectDoc(p.businessId, p.projectId);

  let updatedOpening: OpeningEntry | undefined;
  // Resolved catalog refs, memoized across transaction retries by the exact (type, profile,
  // glass) triple they were resolved for. A retry is forced by contention on the project doc,
  // typically from a concurrent edit to an unrelated field (label, width_mm, ...) — the triple
  // is almost always unchanged, so this avoids re-issuing the same handful of Firestore
  // point-lookups (resolveOpeningRefs) on every retry.
  let cachedRefsKey: string | undefined;
  let cachedRefs: ResolvedOpeningRefs | null | undefined;

  // Everything below — reading the existing opening, merging the body over it, resolving
  // catalog refs, and pricing — happens INSIDE the transaction and is re-derived from scratch
  // on every retry. Merging against a snapshot read before the transaction started (as this
  // route used to) meant any field the body didn't touch fell back to a stale value: a
  // concurrent edit to a different field of this same opening (a realistic multi-tab/device
  // scenario now that Firestore replaced the old single-tab Dexie backend) would be silently
  // overwritten once this transaction's write landed.
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ApiError('not_found');
    const project = snap.data() as ProjectRow;
    if (project.status !== 'draft') throw new ApiError('project_not_draft');
    const idx = (project.openings ?? []).findIndex((o) => o.id === openingId);
    if (idx === -1) throw new ApiError('not_found');
    const existingOpening = project.openings[idx];

    const merged: OpeningOwnColumns = {
      opening_type_id: body.opening_type_id ?? existingOpening.opening_type_id,
      profile_system_id: body.profile_system_id ?? existingOpening.profile_system_id,
      glass_type_id: body.glass_type_id ?? existingOpening.glass_type_id,
      label: body.label ?? existingOpening.label,
      width_mm: body.width_mm ?? existingOpening.width_mm,
      height_mm: body.height_mm ?? existingOpening.height_mm,
      quantity: body.quantity && body.quantity > 0 ? body.quantity : existingOpening.quantity,
    };
    // Same guard the create route applies — without it, editing width_mm/height_mm to 0 (falsy,
    // so it survives the ?? above) would silently zero out this opening's line_subtotal and drag
    // down the whole project's total with no error shown.
    if (!merged.width_mm || !merged.height_mm || merged.width_mm <= 0 || merged.height_mm <= 0) {
      throw new ApiError('invalid_dimensions');
    }

    // Catalog lookups aren't part of what the transaction needs to stay consistent (same
    // reasoning as resolveOpeningRefs' other callers) — a plain read, not tx.get(), is fine
    // here even mid-transaction.
    const refsKey = `${merged.opening_type_id}|${merged.profile_system_id}|${merged.glass_type_id}`;
    if (refsKey !== cachedRefsKey) {
      cachedRefs = await resolveOpeningRefs(p.businessId, merged.opening_type_id, merged.profile_system_id, merged.glass_type_id);
      cachedRefsKey = refsKey;
    }
    const refs = cachedRefs;
    if (!refs) throw new ApiError('invalid_reference');
    const computed = priceOpening(refs, merged.width_mm, merged.height_mm, merged.quantity);

    const bizSnap = await tx.get(businessDoc(p.businessId));
    if (!bizSnap.exists()) throw new ApiError('not_found');
    const biz = bizSnap.data() as BusinessRow;

    updatedOpening = buildOpeningEntry(openingId, merged, computed, refs, existingOpening.created_at);
    const openings = [...project.openings];
    openings[idx] = updatedOpening;

    tx.update(ref, {
      openings,
      ...repriceProject(openings, biz, project.discount_pct),
      updated_at: nowIso(),
    });
  });

  return { ...updatedOpening!, project_id: p.projectId };
});

addRoute('DELETE', '/businesses/:businessId/projects/:projectId/openings/:id', async (p) => {
  const openingId = Number(p.id);
  const ref = projectDoc(p.businessId, p.projectId);

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ApiError('not_found');
    const project = snap.data() as ProjectRow;
    if (project.status !== 'draft') throw new ApiError('project_not_draft');
    const originalOpenings = project.openings ?? [];
    const openings = originalOpenings.filter((o) => o.id !== openingId);
    if (openings.length === originalOpenings.length) throw new ApiError('not_found');
    const bizSnap = await tx.get(businessDoc(p.businessId));
    if (!bizSnap.exists()) throw new ApiError('not_found');
    const biz = bizSnap.data() as BusinessRow;

    tx.update(ref, {
      openings,
      ...repriceProject(openings, biz, project.discount_pct),
      updated_at: nowIso(),
    });
  });

  return { deleted: true };
});
