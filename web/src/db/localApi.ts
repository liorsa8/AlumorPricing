import { db, nowIso, OpeningRow, OpeningTypeRow, ProfileSystemRow, GlassTypeRow, AccessoryRow } from './schema';
import type { Table } from 'dexie';
import { ensureSeeded } from './seed';
import { computeOpeningLine, computeProjectTotals, AccessoryInput, OpeningLineResult } from '../lib/quoteCalculator';

// A tiny in-memory router that mirrors the shape of the old Express routes, so that
// web/src/api/client.ts can keep exposing the exact same api.get/post/put/delete(url) calls
// every page already uses. Only the transport changed (IndexedDB via Dexie instead of HTTP
// to a local server) — every page component is unchanged.

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

export async function localRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  await ensureSeeded();
  const [rawPath, queryString] = url.split('?');
  const path = rawPath.replace(/^\/api/, '') || '/';
  const query = new URLSearchParams(queryString ?? '');

  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => (params[key] = match[i + 1]));
    try {
      return (await route.handler(params, query, body)) as T;
    } catch (e) {
      if (e instanceof ApiError) throw new Error(e.message);
      throw e;
    }
  }
  throw new ApiError(`route_not_found: ${method} ${path}`);
}

// ---- Settings ----

addRoute('GET', '/settings', async () => db.settings.get(1));

addRoute('PUT', '/settings', async (_p, _q, body: any) => {
  const existing = (await db.settings.get(1))!;
  await db.settings.update(1, {
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
  return db.settings.get(1);
});

// ---- Customers ----

addRoute('GET', '/customers', async () => db.customers.orderBy('name').toArray());

addRoute('POST', '/customers', async (_p, _q, body: any) => {
  if (!body.name) throw new ApiError('name_required');
  const now = nowIso();
  const id = await db.customers.add({
    name: body.name,
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ?? null,
    notes: body.notes ?? null,
    created_at: now,
    updated_at: now,
  });
  return db.customers.get(id);
});

addRoute('PUT', '/customers/:id', async (p, _q, body: any) => {
  const id = Number(p.id);
  const existing = await db.customers.get(id);
  if (!existing) throw new ApiError('not_found');
  await db.customers.update(id, {
    name: body.name ?? existing.name,
    phone: body.phone ?? existing.phone,
    email: body.email ?? existing.email,
    address: body.address ?? existing.address,
    notes: body.notes ?? existing.notes,
    updated_at: nowIso(),
  });
  return db.customers.get(id);
});

addRoute('DELETE', '/customers/:id', async (p) => {
  const id = Number(p.id);
  const existing = await db.customers.get(id);
  if (!existing) throw new ApiError('not_found');
  const referenced = (await db.projects.where('customer_id').equals(id).count()) > 0;
  if (referenced) throw new ApiError('customer_has_projects');
  await db.customers.delete(id);
  return { deleted: true };
});

// ---- Simple catalogs (profile systems / glass types / accessories) ----

interface SimpleCatalogConfig<T> {
  table: Table<T, number>;
  fields: (keyof T)[];
  isReferenced: (id: number) => Promise<boolean>;
}

function registerSimpleCatalogRoutes<T extends { id?: number; is_active: number; name_he: string }>(
  basePath: string,
  config: SimpleCatalogConfig<T>
) {
  const { table, fields, isReferenced } = config;

  addRoute('GET', basePath, async () => table.orderBy('name_he').toArray());

  addRoute('POST', basePath, async (_p, _q, body: any) => {
    const now = nowIso();
    const row: any = { is_active: 1, created_at: now, updated_at: now };
    for (const f of fields) row[f] = body[f as string] ?? null;
    const id = await table.add(row);
    return table.get(id);
  });

  addRoute('PUT', `${basePath}/:id`, async (p, _q, body: any) => {
    const id = Number(p.id);
    const existing = await table.get(id);
    if (!existing) throw new ApiError('not_found');
    const patch: any = {};
    for (const f of fields) patch[f] = body[f as string] !== undefined ? body[f as string] : (existing as any)[f];
    patch.is_active = body.is_active !== undefined ? (body.is_active ? 1 : 0) : (existing as any).is_active;
    patch.updated_at = nowIso();
    await table.update(id, patch);
    return table.get(id);
  });

  addRoute('DELETE', `${basePath}/:id`, async (p) => {
    const id = Number(p.id);
    const existing = await table.get(id);
    if (!existing) throw new ApiError('not_found');
    if (await isReferenced(id)) {
      await table.update(id, { is_active: 0, updated_at: nowIso() } as any);
      return { deactivated: true };
    }
    await table.delete(id);
    return { deleted: true };
  });
}

registerSimpleCatalogRoutes<ProfileSystemRow>('/profile-systems', {
  table: db.profile_systems,
  fields: ['name_he', 'series_code', 'manufacturer', 'price_per_meter'],
  isReferenced: async (id) => (await db.openings.where('profile_system_id').equals(id).count()) > 0,
});

registerSimpleCatalogRoutes<GlassTypeRow>('/glass-types', {
  table: db.glass_types,
  fields: ['name_he', 'thickness_mm', 'price_per_sqm'],
  isReferenced: async (id) => (await db.openings.where('glass_type_id').equals(id).count()) > 0,
});

registerSimpleCatalogRoutes<AccessoryRow>('/accessories', {
  table: db.accessories,
  fields: ['name_he', 'unit', 'price_per_unit'],
  isReferenced: async (id) => {
    const inKits = (await db.opening_type_accessories.where('accessory_id').equals(id).count()) > 0;
    if (inKits) return true;
    return (await db.opening_accessories.where('accessory_id').equals(id).count()) > 0;
  },
});

// ---- Opening types (+ their default accessory kit) ----

interface KitLine {
  id: number;
  accessory_id: number;
  quantity: number;
  name_he: string;
  price_per_unit: number;
}

async function getOpeningTypeKit(openingTypeId: number): Promise<KitLine[]> {
  const kitRows = await db.opening_type_accessories.where('opening_type_id').equals(openingTypeId).toArray();
  const accessories = await db.accessories.bulkGet(kitRows.map((row) => row.accessory_id));
  const lines: KitLine[] = [];
  kitRows.forEach((row, i) => {
    const acc = accessories[i];
    if (acc) lines.push({ id: row.id!, accessory_id: row.accessory_id, quantity: row.quantity, name_he: acc.name_he, price_per_unit: acc.price_per_unit });
  });
  return lines;
}

function toAccessoryInputs(kit: KitLine[]): AccessoryInput[] {
  return kit.map(({ accessory_id, name_he, quantity, price_per_unit }) => ({ accessory_id, name_he, quantity, price_per_unit }));
}

addRoute('GET', '/opening-types', async () => {
  const rows = await db.opening_types.toArray();
  rows.sort((a, b) => a.sort_order - b.sort_order || a.name_he.localeCompare(b.name_he));
  const result = [];
  for (const r of rows) result.push({ ...r, accessories: await getOpeningTypeKit(r.id!) });
  return result;
});

addRoute('POST', '/opening-types', async (_p, _q, body: any) => {
  const now = nowIso();
  const id = await db.opening_types.add({
    name_he: body.name_he,
    code: body.code,
    profile_factor: body.profile_factor,
    glass_area_ratio: body.glass_area_ratio,
    sort_order: body.sort_order ?? 0,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });
  const row = await db.opening_types.get(id);
  return { ...row, accessories: [] };
});

addRoute('PUT', '/opening-types/:id', async (p, _q, body: any) => {
  const id = Number(p.id);
  const existing = await db.opening_types.get(id);
  if (!existing) throw new ApiError('not_found');
  await db.opening_types.update(id, {
    name_he: body.name_he ?? existing.name_he,
    code: body.code ?? existing.code,
    profile_factor: body.profile_factor ?? existing.profile_factor,
    glass_area_ratio: body.glass_area_ratio ?? existing.glass_area_ratio,
    sort_order: body.sort_order ?? existing.sort_order,
    is_active: body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active,
    updated_at: nowIso(),
  });
  const row = await db.opening_types.get(id);
  return { ...row, accessories: await getOpeningTypeKit(id) };
});

addRoute('DELETE', '/opening-types/:id', async (p) => {
  const id = Number(p.id);
  const existing = await db.opening_types.get(id);
  if (!existing) throw new ApiError('not_found');
  const referenced = (await db.openings.where('opening_type_id').equals(id).count()) > 0;
  if (referenced) {
    await db.opening_types.update(id, { is_active: 0, updated_at: nowIso() });
    return { deactivated: true };
  }
  await db.opening_types.delete(id);
  return { deleted: true };
});

addRoute('PUT', '/opening-types/:id/accessories', async (p, _q, body: any) => {
  const id = Number(p.id);
  const existing = await db.opening_types.get(id);
  if (!existing) throw new ApiError('not_found');
  const items: { accessory_id: number; quantity: number }[] = body.accessories ?? [];
  await db.transaction('rw', db.opening_type_accessories, async () => {
    await db.opening_type_accessories.where('opening_type_id').equals(id).delete();
    for (const item of items) {
      if (item.quantity > 0) await db.opening_type_accessories.add({ opening_type_id: id, accessory_id: item.accessory_id, quantity: item.quantity });
    }
  });
  return { accessories: await getOpeningTypeKit(id) };
});

// ---- Projects + nested openings ----

interface ResolvedOpeningRefs {
  type: OpeningTypeRow;
  kit: AccessoryInput[];
  profileSystem: ProfileSystemRow;
  glassType: GlassTypeRow;
}

async function resolveOpeningRefs(openingTypeId: number, profileSystemId: number, glassTypeId: number): Promise<ResolvedOpeningRefs | null> {
  const type = await db.opening_types.get(openingTypeId);
  const profileSystem = await db.profile_systems.get(profileSystemId);
  const glassType = await db.glass_types.get(glassTypeId);
  if (!type || !profileSystem || !glassType) return null;
  const kit = toAccessoryInputs(await getOpeningTypeKit(openingTypeId));
  return { type, kit, profileSystem, glassType };
}

function priceOpening(refs: ResolvedOpeningRefs, widthMm: number, heightMm: number, quantity: number): OpeningLineResult {
  return computeOpeningLine(
    widthMm,
    heightMm,
    quantity,
    { profile_factor: refs.type.profile_factor, glass_area_ratio: refs.type.glass_area_ratio },
    { profile_price_per_meter: refs.profileSystem.price_per_meter, glass_price_per_sqm: refs.glassType.price_per_sqm },
    refs.kit
  );
}

async function replaceOpeningAccessories(openingId: number, lines: OpeningLineResult['accessory_lines']) {
  await db.opening_accessories.where('opening_id').equals(openingId).delete();
  for (const line of lines) {
    await db.opening_accessories.add({
      opening_id: openingId,
      accessory_id: line.accessory_id,
      accessory_name_snapshot: line.name_he,
      quantity: line.quantity,
      price_per_unit_snapshot: line.price_per_unit,
      line_total: line.line_total,
    });
  }
}

interface OpeningOwnColumns {
  opening_type_id: number;
  profile_system_id: number;
  glass_type_id: number;
  label: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
}

function computedOpeningPatch(computed: OpeningLineResult, refs: ResolvedOpeningRefs) {
  return {
    profile_length_m: computed.profile_length_m,
    glass_area_sqm: computed.glass_area_sqm,
    material_cost: computed.material_cost,
    accessories_cost: computed.accessories_cost,
    unit_subtotal: computed.unit_subtotal,
    line_subtotal: computed.line_subtotal,
    profile_factor_snapshot: refs.type.profile_factor,
    glass_area_ratio_snapshot: refs.type.glass_area_ratio,
    profile_price_per_meter_snapshot: refs.profileSystem.price_per_meter,
    glass_price_per_sqm_snapshot: refs.glassType.price_per_sqm,
    opening_type_name_snapshot: refs.type.name_he,
    profile_system_name_snapshot: refs.profileSystem.name_he,
    profile_system_series_code_snapshot: refs.profileSystem.series_code,
    glass_type_name_snapshot: refs.glassType.name_he,
    updated_at: nowIso(),
  };
}

async function applyPricingToOpening(openingId: number, computed: OpeningLineResult, refs: ResolvedOpeningRefs, ownColumns?: OpeningOwnColumns) {
  const patch: Partial<OpeningRow> = computedOpeningPatch(computed, refs);
  if (ownColumns) Object.assign(patch, ownColumns);
  await db.openings.update(openingId, patch);
  await replaceOpeningAccessories(openingId, computed.accessory_lines);
}

async function insertOpeningRow(projectId: number, own: OpeningOwnColumns, computed: OpeningLineResult, refs: ResolvedOpeningRefs): Promise<number> {
  const now = nowIso();
  const id = await db.openings.add({
    project_id: projectId,
    ...own,
    ...computedOpeningPatch(computed, refs),
    created_at: now,
  } as OpeningRow);
  await replaceOpeningAccessories(id, computed.accessory_lines);
  return id;
}

async function loadOpeningWithAccessories(openingId: number) {
  const opening = await db.openings.get(openingId);
  const accessory_lines = await db.opening_accessories.where('opening_id').equals(openingId).toArray();
  return { ...opening, accessory_lines };
}

async function loadProjectDetail(id: number) {
  const project = await db.projects.get(id);
  if (!project) return null;
  const customer = project.customer_id ? await db.customers.get(project.customer_id) : undefined;

  const openingRows = await db.openings.where('project_id').equals(id).sortBy('id');
  const openingIds = openingRows.map((o) => o.id!);
  const accessoryRows = openingIds.length
    ? await db.opening_accessories.where('opening_id').anyOf(openingIds).toArray()
    : [];
  const accessoriesByOpening = new Map<number, typeof accessoryRows>();
  for (const row of accessoryRows) {
    const list = accessoriesByOpening.get(row.opening_id);
    if (list) list.push(row);
    else accessoriesByOpening.set(row.opening_id, [row]);
  }
  const openings = openingRows.map((o) => ({ ...o, accessory_lines: accessoriesByOpening.get(o.id!) ?? [] }));

  return {
    ...project,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_email: customer?.email ?? null,
    customer_address: customer?.address ?? null,
    openings,
  };
}

async function recomputeProjectTotals(projectId: number) {
  const project = await db.projects.get(projectId);
  if (!project) return;

  const openingRows = await db.openings.where('project_id').equals(projectId).toArray();
  const materialSubtotal = openingRows.reduce((sum, o) => sum + o.line_subtotal, 0);

  let laborPct = project.labor_pct_snapshot;
  let installationPct = project.installation_pct_snapshot;
  let vatPct = project.vat_pct_snapshot;
  const discountPct = project.discount_pct;

  if (project.status === 'draft') {
    const settings = (await db.settings.get(1))!;
    laborPct = settings.labor_pct;
    installationPct = settings.installation_pct;
    vatPct = settings.vat_pct;
  }

  const totals = computeProjectTotals(materialSubtotal, laborPct, installationPct, discountPct, vatPct);

  await db.projects.update(projectId, {
    material_subtotal: totals.material_subtotal,
    labor_amount: totals.labor_amount,
    installation_amount: totals.installation_amount,
    discount_amount: totals.discount_amount,
    pre_vat_total: totals.pre_vat_total,
    vat_amount: totals.vat_amount,
    total: totals.total,
    labor_pct_snapshot: laborPct,
    installation_pct_snapshot: installationPct,
    vat_pct_snapshot: vatPct,
    updated_at: nowIso(),
  });
}

async function repriceOpening(openingId: number) {
  const opening = await db.openings.get(openingId);
  if (!opening) return;
  const refs = await resolveOpeningRefs(opening.opening_type_id, opening.profile_system_id, opening.glass_type_id);
  if (!refs) return;
  const computed = priceOpening(refs, opening.width_mm, opening.height_mm, opening.quantity);
  await applyPricingToOpening(opening.id!, computed, refs);
}

// A "new quote" is created immediately (so there's a page to build it on) with no customer
// and no openings yet. If the shop owner backs out without entering either, that empty shell
// has no value and would otherwise just accumulate in the list — quietly clean those up
// whenever the list is viewed. Only ever removes drafts with NEITHER a customer NOR any
// opening, so a quote the owner is mid-way through (has picked a customer, say, but hasn't
// added a line item yet) is never touched.
async function deleteEmptyAbandonedDrafts() {
  const draftRows = await db.projects.where('status').equals('draft').toArray();
  const candidateIds = draftRows.filter((p) => p.customer_id == null).map((p) => p.id!);
  if (!candidateIds.length) return;
  const openingRows = await db.openings.where('project_id').anyOf(candidateIds).toArray();
  const idsWithOpenings = new Set(openingRows.map((o) => o.project_id));
  const emptyIds = candidateIds.filter((id) => !idsWithOpenings.has(id));
  if (emptyIds.length) await db.projects.bulkDelete(emptyIds);
}

addRoute('GET', '/projects', async (_p, query) => {
  await deleteEmptyAbandonedDrafts();
  const status = query.get('status') ?? undefined;
  const rows = status ? await db.projects.where('status').equals(status).toArray() : await db.projects.toArray();
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((cid): cid is number => cid != null))];
  const customers = await db.customers.bulkGet(customerIds);
  const nameById = new Map(customers.filter((c): c is NonNullable<typeof c> => !!c).map((c) => [c.id!, c.name]));
  return rows.map((r) => ({ ...r, customer_name: r.customer_id ? (nameById.get(r.customer_id) ?? null) : null }));
});

addRoute('GET', '/projects/:id', async (p) => {
  const project = await loadProjectDetail(Number(p.id));
  if (!project) throw new ApiError('not_found');
  return project;
});

addRoute('POST', '/projects', async (_p, _q, body: any) => {
  const settings = (await db.settings.get(1))!;
  const allProjects = await db.projects.toArray();
  const nextNumber = allProjects.reduce((max, proj) => Math.max(max, proj.quote_number), 0) + 1;
  const now = nowIso();
  const id = await db.projects.add({
    customer_id: body.customer_id ?? null,
    quote_number: nextNumber,
    title: body.title ?? '',
    status: 'draft',
    notes: body.notes ?? null,
    labor_pct_snapshot: settings.labor_pct,
    installation_pct_snapshot: settings.installation_pct,
    vat_pct_snapshot: settings.vat_pct,
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
  });
  return loadProjectDetail(id);
});

addRoute('PUT', '/projects/:id', async (p, _q, body: any) => {
  const id = Number(p.id);
  const existing = await db.projects.get(id);
  if (!existing) throw new ApiError('not_found');
  await db.projects.update(id, {
    customer_id: body.customer_id !== undefined ? body.customer_id : existing.customer_id,
    title: body.title ?? existing.title,
    notes: body.notes ?? existing.notes,
    status: body.status ?? existing.status,
    discount_pct: body.discount_pct ?? existing.discount_pct,
    updated_at: nowIso(),
  });
  await recomputeProjectTotals(id);
  return loadProjectDetail(id);
});

addRoute('DELETE', '/projects/:id', async (p) => {
  const id = Number(p.id);
  const existing = await db.projects.get(id);
  if (!existing) throw new ApiError('not_found');
  await db.transaction('rw', [db.projects, db.openings, db.opening_accessories], async () => {
    const openingIds = (await db.openings.where('project_id').equals(id).toArray()).map((o) => o.id!);
    if (openingIds.length) await db.opening_accessories.where('opening_id').anyOf(openingIds).delete();
    await db.openings.where('project_id').equals(id).delete();
    await db.projects.delete(id);
  });
  return { deleted: true };
});

addRoute('POST', '/projects/:id/recalculate', async (p) => {
  const id = Number(p.id);
  const project = await db.projects.get(id);
  if (!project) throw new ApiError('not_found');
  if (project.status !== 'draft') throw new ApiError('project_not_draft');

  const openingIds = (await db.openings.where('project_id').equals(id).toArray()).map((o) => o.id!);
  for (const openingId of openingIds) await repriceOpening(openingId);

  await recomputeProjectTotals(id);
  return loadProjectDetail(id);
});

addRoute('POST', '/projects/:projectId/openings', async (p, _q, body: any) => {
  const projectId = Number(p.projectId);
  const project = await db.projects.get(projectId);
  if (!project) throw new ApiError('not_found');
  if (project.status !== 'draft') throw new ApiError('project_not_draft');

  const { opening_type_id, profile_system_id, glass_type_id, label, width_mm, height_mm, quantity } = body;
  if (!width_mm || !height_mm || width_mm <= 0 || height_mm <= 0) throw new ApiError('invalid_dimensions');

  const refs = await resolveOpeningRefs(opening_type_id, profile_system_id, glass_type_id);
  if (!refs) throw new ApiError('invalid_reference');

  const qty = quantity && quantity > 0 ? quantity : 1;
  const computed = priceOpening(refs, width_mm, height_mm, qty);
  const openingId = await insertOpeningRow(
    projectId,
    { opening_type_id, profile_system_id, glass_type_id, label: label ?? '', width_mm, height_mm, quantity: qty },
    computed,
    refs
  );

  await recomputeProjectTotals(projectId);
  return loadOpeningWithAccessories(openingId);
});

addRoute('PUT', '/projects/:projectId/openings/:id', async (p, _q, body: any) => {
  const projectId = Number(p.projectId);
  const openingId = Number(p.id);
  const project = await db.projects.get(projectId);
  if (!project) throw new ApiError('not_found');
  if (project.status !== 'draft') throw new ApiError('project_not_draft');

  const existing = await db.openings.get(openingId);
  if (!existing || existing.project_id !== projectId) throw new ApiError('not_found');

  const merged: OpeningOwnColumns = {
    opening_type_id: body.opening_type_id ?? existing.opening_type_id,
    profile_system_id: body.profile_system_id ?? existing.profile_system_id,
    glass_type_id: body.glass_type_id ?? existing.glass_type_id,
    label: body.label ?? existing.label,
    width_mm: body.width_mm ?? existing.width_mm,
    height_mm: body.height_mm ?? existing.height_mm,
    quantity: body.quantity ?? existing.quantity,
  };

  const refs = await resolveOpeningRefs(merged.opening_type_id, merged.profile_system_id, merged.glass_type_id);
  if (!refs) throw new ApiError('invalid_reference');

  const computed = priceOpening(refs, merged.width_mm, merged.height_mm, merged.quantity);
  await applyPricingToOpening(openingId, computed, refs, merged);

  await recomputeProjectTotals(projectId);
  return loadOpeningWithAccessories(openingId);
});

addRoute('DELETE', '/projects/:projectId/openings/:id', async (p) => {
  const projectId = Number(p.projectId);
  const openingId = Number(p.id);
  const project = await db.projects.get(projectId);
  if (!project) throw new ApiError('not_found');
  if (project.status !== 'draft') throw new ApiError('project_not_draft');

  const existing = await db.openings.get(openingId);
  if (!existing || existing.project_id !== projectId) throw new ApiError('not_found');

  await db.transaction('rw', [db.openings, db.opening_accessories], async () => {
    await db.opening_accessories.where('opening_id').equals(openingId).delete();
    await db.openings.delete(openingId);
  });

  await recomputeProjectTotals(projectId);
  return { deleted: true };
});
