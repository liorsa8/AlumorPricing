import { Router } from 'express';
import { db, nowIso } from '../db/connection';

export const openingTypesRouter = Router();

function getKit(openingTypeId: number) {
  return db
    .prepare(
      `SELECT ota.id, ota.accessory_id, ota.quantity, a.name_he, a.price_per_unit
       FROM opening_type_accessories ota JOIN accessories a ON a.id = ota.accessory_id
       WHERE ota.opening_type_id = ?`
    )
    .all(openingTypeId);
}

openingTypesRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM opening_types ORDER BY sort_order, name_he').all() as Record<
    string,
    unknown
  >[];

  const kitRows = db
    .prepare(
      `SELECT ota.id, ota.opening_type_id, ota.accessory_id, ota.quantity, a.name_he, a.price_per_unit
       FROM opening_type_accessories ota JOIN accessories a ON a.id = ota.accessory_id`
    )
    .all() as Record<string, unknown>[];
  const kitsByType = new Map<number, Record<string, unknown>[]>();
  for (const row of kitRows) {
    const key = row.opening_type_id as number;
    if (!kitsByType.has(key)) kitsByType.set(key, []);
    kitsByType.get(key)!.push(row);
  }

  res.json(rows.map((r) => ({ ...r, accessories: kitsByType.get(r.id as number) ?? [] })));
});

openingTypesRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM opening_types WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ ...row, accessories: getKit(row.id as number) });
});

openingTypesRouter.post('/', (req, res) => {
  const { name_he, code, profile_factor, glass_area_ratio, sort_order } = req.body;
  const result = db
    .prepare(
      'INSERT INTO opening_types (name_he, code, profile_factor, glass_area_ratio, sort_order) VALUES (?, ?, ?, ?, ?)'
    )
    .run(name_he, code, profile_factor, glass_area_ratio, sort_order ?? 0);
  const row = db.prepare('SELECT * FROM opening_types WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...(row as object), accessories: [] });
});

openingTypesRouter.put('/:id', (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM opening_types WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const merged = {
    name_he: req.body.name_he ?? existing.name_he,
    code: req.body.code ?? existing.code,
    profile_factor: req.body.profile_factor ?? existing.profile_factor,
    glass_area_ratio: req.body.glass_area_ratio ?? existing.glass_area_ratio,
    sort_order: req.body.sort_order ?? existing.sort_order,
    is_active: req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active,
  };

  db.prepare(
    `UPDATE opening_types SET name_he=?, code=?, profile_factor=?, glass_area_ratio=?, sort_order=?, is_active=?, updated_at=? WHERE id=?`
  ).run(
    merged.name_he,
    merged.code,
    merged.profile_factor,
    merged.glass_area_ratio,
    merged.sort_order,
    merged.is_active,
    nowIso(),
    id
  );

  const row = db.prepare('SELECT * FROM opening_types WHERE id = ?').get(id) as Record<string, unknown>;
  res.json({ ...row, accessories: getKit(row.id as number) });
});

openingTypesRouter.delete('/:id', (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM opening_types WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const referenced = db.prepare('SELECT 1 FROM openings WHERE opening_type_id = ? LIMIT 1').get(id);
  if (referenced) {
    db.prepare('UPDATE opening_types SET is_active = 0, updated_at = ? WHERE id = ?').run(nowIso(), id);
    return res.json({ deactivated: true });
  }

  db.prepare('DELETE FROM opening_types WHERE id = ?').run(id);
  res.json({ deleted: true });
});

openingTypesRouter.put('/:id/accessories', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM opening_types WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const items: { accessory_id: number; quantity: number }[] = req.body.accessories ?? [];
  const replaceKit = db.transaction(() => {
    db.prepare('DELETE FROM opening_type_accessories WHERE opening_type_id = ?').run(id);
    const insert = db.prepare(
      'INSERT INTO opening_type_accessories (opening_type_id, accessory_id, quantity) VALUES (?, ?, ?)'
    );
    for (const item of items) {
      if (item.quantity > 0) insert.run(id, item.accessory_id, item.quantity);
    }
  });
  replaceKit();

  res.json({ accessories: getKit(id) });
});
