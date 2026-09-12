import { Router } from 'express';
import { db, nowIso } from '../db/connection';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM settings WHERE id = 1').get());
});

settingsRouter.put('/', (req, res) => {
  const existing = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>;
  const merged = {
    labor_pct: req.body.labor_pct ?? existing.labor_pct,
    installation_pct: req.body.installation_pct ?? existing.installation_pct,
    vat_pct: req.body.vat_pct ?? existing.vat_pct,
    company_name: req.body.company_name ?? existing.company_name,
    company_phone: req.body.company_phone ?? existing.company_phone,
    company_address: req.body.company_address ?? existing.company_address,
    standard_terms: req.body.standard_terms ?? existing.standard_terms,
  };

  db.prepare(
    `UPDATE settings SET labor_pct=?, installation_pct=?, vat_pct=?, company_name=?, company_phone=?, company_address=?, standard_terms=?, updated_at=?
     WHERE id = 1`
  ).run(
    merged.labor_pct,
    merged.installation_pct,
    merged.vat_pct,
    merged.company_name,
    merged.company_phone,
    merged.company_address,
    merged.standard_terms,
    nowIso()
  );

  res.json(db.prepare('SELECT * FROM settings WHERE id = 1').get());
});
