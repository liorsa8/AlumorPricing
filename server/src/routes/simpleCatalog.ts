import { Router } from 'express';
import { db, nowIso } from '../db/connection';

interface SimpleCatalogConfig {
  table: string;
  fields: string[];
  referencedBy: { table: string; column: string }[];
  orderBy?: string;
}

export function createSimpleCatalogRouter(config: SimpleCatalogConfig): Router {
  const router = Router();
  const { table, fields, referencedBy } = config;
  const orderBy = config.orderBy ?? 'name_he';

  router.get('/', (_req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json(row);
  });

  router.post('/', (req, res) => {
    const values = fields.map((f) => req.body[f] ?? null);
    const placeholders = fields.map(() => '?').join(', ');
    const result = db
      .prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`)
      .run(...values);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(row);
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const mergedFieldValues = fields.map((f) => (req.body[f] !== undefined ? req.body[f] : existing[f]));
    const isActive =
      req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;

    const setSql = [...fields, 'is_active', 'updated_at'].map((f) => `${f} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${setSql} WHERE id = ?`).run(
      ...mergedFieldValues,
      isActive,
      nowIso(),
      req.params.id
    );
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const id = req.params.id;
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const isReferenced = referencedBy.some(({ table: refTable, column }) => {
      const row = db.prepare(`SELECT 1 FROM ${refTable} WHERE ${column} = ? LIMIT 1`).get(id);
      return !!row;
    });

    if (isReferenced) {
      db.prepare(`UPDATE ${table} SET is_active = 0, updated_at = ? WHERE id = ?`).run(nowIso(), id);
      return res.json({ deactivated: true });
    }

    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    res.json({ deleted: true });
  });

  return router;
}

export const profileSystemsRouter = createSimpleCatalogRouter({
  table: 'profile_systems',
  fields: ['name_he', 'series_code', 'manufacturer', 'price_per_meter'],
  referencedBy: [{ table: 'openings', column: 'profile_system_id' }],
});

export const glassTypesRouter = createSimpleCatalogRouter({
  table: 'glass_types',
  fields: ['name_he', 'thickness_mm', 'price_per_sqm'],
  referencedBy: [{ table: 'openings', column: 'glass_type_id' }],
});

export const accessoriesRouter = createSimpleCatalogRouter({
  table: 'accessories',
  fields: ['name_he', 'unit', 'price_per_unit'],
  referencedBy: [
    { table: 'opening_type_accessories', column: 'accessory_id' },
    { table: 'opening_accessories', column: 'accessory_id' },
  ],
});
