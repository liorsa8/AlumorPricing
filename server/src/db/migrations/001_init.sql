CREATE TABLE IF NOT EXISTS profile_systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he TEXT NOT NULL,
  series_code TEXT,
  manufacturer TEXT,
  price_per_meter REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS glass_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he TEXT NOT NULL,
  thickness_mm TEXT,
  price_per_sqm REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'יחידה',
  price_per_unit REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opening_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  profile_factor REAL NOT NULL DEFAULT 0,
  glass_area_ratio REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opening_type_accessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opening_type_id INTEGER NOT NULL REFERENCES opening_types(id) ON DELETE CASCADE,
  accessory_id INTEGER NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  labor_pct REAL NOT NULL DEFAULT 0,
  installation_pct REAL NOT NULL DEFAULT 0,
  vat_pct REAL NOT NULL DEFAULT 0,
  company_name TEXT NOT NULL DEFAULT '',
  company_phone TEXT NOT NULL DEFAULT '',
  company_address TEXT NOT NULL DEFAULT '',
  company_email TEXT NOT NULL DEFAULT '',
  company_tax_id TEXT NOT NULL DEFAULT '',
  company_logo TEXT NOT NULL DEFAULT '',
  standard_terms TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  quote_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','archived')),
  notes TEXT,
  labor_pct_snapshot REAL NOT NULL DEFAULT 0,
  installation_pct_snapshot REAL NOT NULL DEFAULT 0,
  vat_pct_snapshot REAL NOT NULL DEFAULT 0,
  discount_pct REAL NOT NULL DEFAULT 0,
  material_subtotal REAL NOT NULL DEFAULT 0,
  labor_amount REAL NOT NULL DEFAULT 0,
  installation_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  pre_vat_total REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS openings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  opening_type_id INTEGER NOT NULL REFERENCES opening_types(id),
  profile_system_id INTEGER NOT NULL REFERENCES profile_systems(id),
  glass_type_id INTEGER NOT NULL REFERENCES glass_types(id),
  label TEXT NOT NULL DEFAULT '',
  width_mm INTEGER NOT NULL,
  height_mm INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  profile_length_m REAL NOT NULL,
  glass_area_sqm REAL NOT NULL,
  material_cost REAL NOT NULL,
  accessories_cost REAL NOT NULL,
  unit_subtotal REAL NOT NULL,
  line_subtotal REAL NOT NULL,
  profile_factor_snapshot REAL NOT NULL,
  glass_area_ratio_snapshot REAL NOT NULL,
  profile_price_per_meter_snapshot REAL NOT NULL,
  glass_price_per_sqm_snapshot REAL NOT NULL,
  opening_type_name_snapshot TEXT NOT NULL,
  profile_system_name_snapshot TEXT NOT NULL,
  profile_system_series_code_snapshot TEXT,
  glass_type_name_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opening_accessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opening_id INTEGER NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
  accessory_id INTEGER NOT NULL REFERENCES accessories(id),
  accessory_name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_per_unit_snapshot REAL NOT NULL,
  line_total REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openings_project_id ON openings(project_id);
CREATE INDEX IF NOT EXISTS idx_opening_accessories_opening_id ON opening_accessories(opening_id);
CREATE INDEX IF NOT EXISTS idx_opening_type_accessories_type_id ON opening_type_accessories(opening_type_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
