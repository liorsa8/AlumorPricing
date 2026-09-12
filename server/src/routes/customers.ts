import { Router } from 'express';
import { db, nowIso } from '../db/connection';

export const customersRouter = Router();

customersRouter.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM customers ORDER BY name').all());
});

customersRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

customersRouter.post('/', (req, res) => {
  const { name, phone, email, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name_required' });
  const result = db
    .prepare('INSERT INTO customers (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)')
    .run(name, phone ?? null, email ?? null, address ?? null, notes ?? null);
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid));
});

customersRouter.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const merged = {
    name: req.body.name ?? existing.name,
    phone: req.body.phone ?? existing.phone,
    email: req.body.email ?? existing.email,
    address: req.body.address ?? existing.address,
    notes: req.body.notes ?? existing.notes,
  };

  db.prepare('UPDATE customers SET name=?, phone=?, email=?, address=?, notes=?, updated_at=? WHERE id=?').run(
    merged.name,
    merged.phone,
    merged.email,
    merged.address,
    merged.notes,
    nowIso(),
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

customersRouter.delete('/:id', (req, res) => {
  const referenced = db.prepare('SELECT 1 FROM projects WHERE customer_id = ? LIMIT 1').get(req.params.id);
  if (referenced) return res.status(409).json({ error: 'customer_has_projects' });

  const result = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ deleted: true });
});
