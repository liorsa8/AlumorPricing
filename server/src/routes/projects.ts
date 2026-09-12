import { Router } from 'express';
import { db, nowIso } from '../db/connection';
import { computeOpeningLine, computeProjectTotals, AccessoryInput, OpeningLineResult } from '../services/quoteCalculator';

export const projectsRouter = Router();

function getOpeningTypeWithKit(id: number) {
  const type = db.prepare('SELECT * FROM opening_types WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!type) return null;
  const kit = db
    .prepare(
      `SELECT a.id AS accessory_id, a.name_he, a.price_per_unit, ota.quantity
       FROM opening_type_accessories ota JOIN accessories a ON a.id = ota.accessory_id
       WHERE ota.opening_type_id = ?`
    )
    .all(id) as AccessoryInput[];
  return { type, kit };
}

function getProfileSystem(id: number) {
  return db.prepare('SELECT * FROM profile_systems WHERE id = ?').get(id) as Record<string, unknown> | undefined;
}

function getGlassType(id: number) {
  return db.prepare('SELECT * FROM glass_types WHERE id = ?').get(id) as Record<string, unknown> | undefined;
}

interface ResolvedOpeningRefs {
  typeInfo: { type: Record<string, unknown>; kit: AccessoryInput[] };
  profileSystem: Record<string, unknown>;
  glassType: Record<string, unknown>;
}

function resolveOpeningRefs(
  openingTypeId: number,
  profileSystemId: number,
  glassTypeId: number
): ResolvedOpeningRefs | null {
  const typeInfo = getOpeningTypeWithKit(openingTypeId);
  const profileSystem = getProfileSystem(profileSystemId);
  const glassType = getGlassType(glassTypeId);
  if (!typeInfo || !profileSystem || !glassType) return null;
  return { typeInfo, profileSystem, glassType };
}

function priceOpening(refs: ResolvedOpeningRefs, widthMm: number, heightMm: number, quantity: number): OpeningLineResult {
  return computeOpeningLine(
    widthMm,
    heightMm,
    quantity,
    {
      profile_factor: refs.typeInfo.type.profile_factor as number,
      glass_area_ratio: refs.typeInfo.type.glass_area_ratio as number,
    },
    {
      profile_price_per_meter: refs.profileSystem.price_per_meter as number,
      glass_price_per_sqm: refs.glassType.price_per_sqm as number,
    },
    refs.typeInfo.kit
  );
}

function replaceOpeningAccessories(openingId: number, accessoryLines: OpeningLineResult['accessory_lines']) {
  db.prepare('DELETE FROM opening_accessories WHERE opening_id = ?').run(openingId);
  const insertAcc = db.prepare(
    `INSERT INTO opening_accessories (opening_id, accessory_id, accessory_name_snapshot, quantity, price_per_unit_snapshot, line_total)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const line of accessoryLines) {
    insertAcc.run(openingId, line.accessory_id, line.name_he, line.quantity, line.price_per_unit, line.line_total);
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

const COMPUTED_OPENING_COLUMNS_SQL = `
      profile_length_m=?, glass_area_sqm=?, material_cost=?, accessories_cost=?, unit_subtotal=?, line_subtotal=?,
      profile_factor_snapshot=?, glass_area_ratio_snapshot=?, profile_price_per_meter_snapshot=?, glass_price_per_sqm_snapshot=?,
      opening_type_name_snapshot=?, profile_system_name_snapshot=?, profile_system_series_code_snapshot=?, glass_type_name_snapshot=?, updated_at=?`;

function computedOpeningValues(computed: OpeningLineResult, refs: ResolvedOpeningRefs) {
  return [
    computed.profile_length_m,
    computed.glass_area_sqm,
    computed.material_cost,
    computed.accessories_cost,
    computed.unit_subtotal,
    computed.line_subtotal,
    refs.typeInfo.type.profile_factor,
    refs.typeInfo.type.glass_area_ratio,
    refs.profileSystem.price_per_meter,
    refs.glassType.price_per_sqm,
    refs.typeInfo.type.name_he,
    refs.profileSystem.name_he,
    refs.profileSystem.series_code,
    refs.glassType.name_he,
    nowIso(),
  ];
}

// Writes the computed pricing/snapshot columns (and, when reassigning references or
// dimensions, the "own" columns too) onto an existing opening row, then replaces its
// accessory line items. Used by both the create and update opening flows, and by reprice.
function applyPricingToOpening(
  openingId: number,
  computed: OpeningLineResult,
  refs: ResolvedOpeningRefs,
  ownColumns?: OpeningOwnColumns
) {
  const values = computedOpeningValues(computed, refs);
  if (ownColumns) {
    db.prepare(
      `UPDATE openings SET
        opening_type_id=?, profile_system_id=?, glass_type_id=?, label=?, width_mm=?, height_mm=?, quantity=?,${COMPUTED_OPENING_COLUMNS_SQL}
       WHERE id=?`
    ).run(
      ownColumns.opening_type_id,
      ownColumns.profile_system_id,
      ownColumns.glass_type_id,
      ownColumns.label,
      ownColumns.width_mm,
      ownColumns.height_mm,
      ownColumns.quantity,
      ...values,
      openingId
    );
  } else {
    db.prepare(`UPDATE openings SET${COMPUTED_OPENING_COLUMNS_SQL} WHERE id=?`).run(...values, openingId);
  }

  replaceOpeningAccessories(openingId, computed.accessory_lines);
}

function insertOpeningRow(projectId: number, own: OpeningOwnColumns, computed: OpeningLineResult, refs: ResolvedOpeningRefs): number {
  const result = db
    .prepare(
      `INSERT INTO openings (
        project_id, opening_type_id, profile_system_id, glass_type_id, label, width_mm, height_mm, quantity,
        profile_length_m, glass_area_sqm, material_cost, accessories_cost, unit_subtotal, line_subtotal,
        profile_factor_snapshot, glass_area_ratio_snapshot, profile_price_per_meter_snapshot, glass_price_per_sqm_snapshot,
        opening_type_name_snapshot, profile_system_name_snapshot, profile_system_series_code_snapshot, glass_type_name_snapshot
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      projectId,
      own.opening_type_id,
      own.profile_system_id,
      own.glass_type_id,
      own.label,
      own.width_mm,
      own.height_mm,
      own.quantity,
      computed.profile_length_m,
      computed.glass_area_sqm,
      computed.material_cost,
      computed.accessories_cost,
      computed.unit_subtotal,
      computed.line_subtotal,
      refs.typeInfo.type.profile_factor,
      refs.typeInfo.type.glass_area_ratio,
      refs.profileSystem.price_per_meter,
      refs.glassType.price_per_sqm,
      refs.typeInfo.type.name_he,
      refs.profileSystem.name_he,
      refs.profileSystem.series_code,
      refs.glassType.name_he
    );

  const openingId = result.lastInsertRowid as number;
  replaceOpeningAccessories(openingId, computed.accessory_lines);
  return openingId;
}

function loadOpeningWithAccessories(openingId: number) {
  const opening = db.prepare('SELECT * FROM openings WHERE id = ?').get(openingId);
  const accessory_lines = db.prepare('SELECT * FROM opening_accessories WHERE opening_id = ?').all(openingId);
  return { ...(opening as object), accessory_lines };
}

function loadProjectDetail(id: number) {
  const project = db
    .prepare(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address
       FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!project) return null;

  const openingRows = db.prepare('SELECT * FROM openings WHERE project_id = ? ORDER BY id').all(id) as Record<
    string,
    unknown
  >[];

  const openingIds = openingRows.map((o) => o.id as number);
  const accessoryRows = openingIds.length
    ? (db
        .prepare(`SELECT * FROM opening_accessories WHERE opening_id IN (${openingIds.map(() => '?').join(',')})`)
        .all(...openingIds) as Record<string, unknown>[])
    : [];
  const accessoriesByOpening = new Map<number, Record<string, unknown>[]>();
  for (const row of accessoryRows) {
    const key = row.opening_id as number;
    if (!accessoriesByOpening.has(key)) accessoriesByOpening.set(key, []);
    accessoriesByOpening.get(key)!.push(row);
  }

  const openings = openingRows.map((o) => ({
    ...o,
    accessory_lines: accessoriesByOpening.get(o.id as number) ?? [],
  }));

  return { ...project, openings };
}

function recomputeProjectTotals(projectId: number) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
  if (!project) return;

  const materialSubtotal = (
    db.prepare('SELECT COALESCE(SUM(line_subtotal), 0) AS total FROM openings WHERE project_id = ?').get(projectId) as {
      total: number;
    }
  ).total;

  let laborPct = project.labor_pct_snapshot as number;
  let installationPct = project.installation_pct_snapshot as number;
  let vatPct = project.vat_pct_snapshot as number;
  const discountPct = project.discount_pct as number;

  if (project.status === 'draft') {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>;
    laborPct = settings.labor_pct as number;
    installationPct = settings.installation_pct as number;
    vatPct = settings.vat_pct as number;
  }

  const totals = computeProjectTotals(materialSubtotal, laborPct, installationPct, discountPct, vatPct);

  db.prepare(
    `UPDATE projects SET material_subtotal=?, labor_amount=?, installation_amount=?, discount_amount=?,
     pre_vat_total=?, vat_amount=?, total=?,
     labor_pct_snapshot=?, installation_pct_snapshot=?, vat_pct_snapshot=?, updated_at=? WHERE id=?`
  ).run(
    totals.material_subtotal,
    totals.labor_amount,
    totals.installation_amount,
    totals.discount_amount,
    totals.pre_vat_total,
    totals.vat_amount,
    totals.total,
    laborPct,
    installationPct,
    vatPct,
    nowIso(),
    projectId
  );
}

function repriceOpening(openingId: number) {
  const opening = db.prepare('SELECT * FROM openings WHERE id = ?').get(openingId) as Record<string, unknown>;
  const refs = resolveOpeningRefs(
    opening.opening_type_id as number,
    opening.profile_system_id as number,
    opening.glass_type_id as number
  );
  if (!refs) return;

  const computed = priceOpening(refs, opening.width_mm as number, opening.height_mm as number, opening.quantity as number);
  applyPricingToOpening(openingId, computed, refs);
}

// ---- Projects ----

projectsRouter.get('/', (req, res) => {
  const status = req.query.status as string | undefined;
  const rows = status
    ? db
        .prepare(
          `SELECT p.*, c.name AS customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
           WHERE p.status = ? ORDER BY p.created_at DESC`
        )
        .all(status)
    : db
        .prepare(
          `SELECT p.*, c.name AS customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
           ORDER BY p.created_at DESC`
        )
        .all();
  res.json(rows);
});

projectsRouter.get('/:id', (req, res) => {
  const project = loadProjectDetail(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'not_found' });
  res.json(project);
});

projectsRouter.post('/', (req, res) => {
  const { customer_id, title, notes } = req.body;
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>;
  const nextNumber = (
    db.prepare('SELECT COALESCE(MAX(quote_number), 0) + 1 AS n FROM projects').get() as { n: number }
  ).n;

  const result = db
    .prepare(
      `INSERT INTO projects (customer_id, quote_number, title, notes, labor_pct_snapshot, installation_pct_snapshot, vat_pct_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      customer_id ?? null,
      nextNumber,
      title ?? '',
      notes ?? null,
      settings.labor_pct,
      settings.installation_pct,
      settings.vat_pct
    );

  res.status(201).json(loadProjectDetail(result.lastInsertRowid as number));
});

projectsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const merged = {
    customer_id: req.body.customer_id !== undefined ? req.body.customer_id : existing.customer_id,
    title: req.body.title ?? existing.title,
    notes: req.body.notes ?? existing.notes,
    status: req.body.status ?? existing.status,
    discount_pct: req.body.discount_pct ?? existing.discount_pct,
  };

  db.prepare(
    'UPDATE projects SET customer_id=?, title=?, notes=?, status=?, discount_pct=?, updated_at=? WHERE id=?'
  ).run(merged.customer_id, merged.title, merged.notes, merged.status, merged.discount_pct, nowIso(), id);

  recomputeProjectTotals(id);
  res.json(loadProjectDetail(id));
});

projectsRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ deleted: true });
});

projectsRouter.post('/:id/recalculate', (req, res) => {
  const projectId = Number(req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
  if (!project) return res.status(404).json({ error: 'not_found' });
  if (project.status !== 'draft') return res.status(409).json({ error: 'project_not_draft' });

  const openingIds = (
    db.prepare('SELECT id FROM openings WHERE project_id = ?').all(projectId) as { id: number }[]
  ).map((r) => r.id);
  for (const openingId of openingIds) repriceOpening(openingId);

  recomputeProjectTotals(projectId);
  res.json(loadProjectDetail(projectId));
});

// ---- Openings (nested under a project) ----

projectsRouter.post('/:projectId/openings', (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
  if (!project) return res.status(404).json({ error: 'not_found' });
  if (project.status !== 'draft') return res.status(409).json({ error: 'project_not_draft' });

  const { opening_type_id, profile_system_id, glass_type_id, label, width_mm, height_mm, quantity } = req.body;
  if (!width_mm || !height_mm || width_mm <= 0 || height_mm <= 0) {
    return res.status(400).json({ error: 'invalid_dimensions' });
  }

  const refs = resolveOpeningRefs(opening_type_id, profile_system_id, glass_type_id);
  if (!refs) return res.status(400).json({ error: 'invalid_reference' });

  const qty = quantity && quantity > 0 ? quantity : 1;
  const computed = priceOpening(refs, width_mm, height_mm, qty);
  const openingId = insertOpeningRow(
    projectId,
    { opening_type_id, profile_system_id, glass_type_id, label: label ?? '', width_mm, height_mm, quantity: qty },
    computed,
    refs
  );

  recomputeProjectTotals(projectId);
  res.status(201).json(loadOpeningWithAccessories(openingId));
});

projectsRouter.put('/:projectId/openings/:id', (req, res) => {
  const projectId = Number(req.params.projectId);
  const openingId = Number(req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
  if (!project) return res.status(404).json({ error: 'not_found' });
  if (project.status !== 'draft') return res.status(409).json({ error: 'project_not_draft' });

  const existing = db.prepare('SELECT * FROM openings WHERE id = ? AND project_id = ?').get(openingId, projectId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const merged: OpeningOwnColumns = {
    opening_type_id: (req.body.opening_type_id ?? existing.opening_type_id) as number,
    profile_system_id: (req.body.profile_system_id ?? existing.profile_system_id) as number,
    glass_type_id: (req.body.glass_type_id ?? existing.glass_type_id) as number,
    label: (req.body.label ?? existing.label) as string,
    width_mm: (req.body.width_mm ?? existing.width_mm) as number,
    height_mm: (req.body.height_mm ?? existing.height_mm) as number,
    quantity: (req.body.quantity ?? existing.quantity) as number,
  };

  const refs = resolveOpeningRefs(merged.opening_type_id, merged.profile_system_id, merged.glass_type_id);
  if (!refs) return res.status(400).json({ error: 'invalid_reference' });

  const computed = priceOpening(refs, merged.width_mm, merged.height_mm, merged.quantity);
  applyPricingToOpening(openingId, computed, refs, merged);

  recomputeProjectTotals(projectId);
  res.json(loadOpeningWithAccessories(openingId));
});

projectsRouter.delete('/:projectId/openings/:id', (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
  if (!project) return res.status(404).json({ error: 'not_found' });
  if (project.status !== 'draft') return res.status(409).json({ error: 'project_not_draft' });

  const result = db.prepare('DELETE FROM openings WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });

  recomputeProjectTotals(projectId);
  res.json({ deleted: true });
});
