import Dexie, { Table } from 'dexie';

export interface ProfileSystemRow {
  id?: number;
  name_he: string;
  series_code: string | null;
  manufacturer: string | null;
  price_per_meter: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface GlassTypeRow {
  id?: number;
  name_he: string;
  thickness_mm: string | null;
  price_per_sqm: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AccessoryRow {
  id?: number;
  name_he: string;
  unit: string;
  price_per_unit: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface OpeningTypeRow {
  id?: number;
  name_he: string;
  code: string;
  profile_factor: number;
  glass_area_ratio: number;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface OpeningTypeAccessoryRow {
  id?: number;
  opening_type_id: number;
  accessory_id: number;
  quantity: number;
}

export interface SettingsRow {
  id: number;
  labor_pct: number;
  installation_pct: number;
  vat_pct: number;
  company_name: string;
  company_phone: string;
  company_address: string;
  company_email: string;
  company_tax_id: string;
  company_logo: string;
  standard_terms: string;
  updated_at: string;
}

export interface CustomerRow {
  id?: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id?: number;
  customer_id: number | null;
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
}

export interface OpeningRow {
  id?: number;
  project_id: number;
  opening_type_id: number;
  profile_system_id: number;
  glass_type_id: number;
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
}

export interface OpeningAccessoryRow {
  id?: number;
  opening_id: number;
  accessory_id: number;
  accessory_name_snapshot: string;
  quantity: number;
  price_per_unit_snapshot: number;
  line_total: number;
}

// The app's entire dataset lives in the browser's own IndexedDB (via Dexie) — there is no
// server. Every device/browser that opens the app has its own independent copy of this data.
class AppDatabase extends Dexie {
  profile_systems!: Table<ProfileSystemRow, number>;
  glass_types!: Table<GlassTypeRow, number>;
  accessories!: Table<AccessoryRow, number>;
  opening_types!: Table<OpeningTypeRow, number>;
  opening_type_accessories!: Table<OpeningTypeAccessoryRow, number>;
  settings!: Table<SettingsRow, number>;
  customers!: Table<CustomerRow, number>;
  projects!: Table<ProjectRow, number>;
  openings!: Table<OpeningRow, number>;
  opening_accessories!: Table<OpeningAccessoryRow, number>;

  constructor() {
    super('alumor-pricing');
    this.version(1).stores({
      profile_systems: '++id, name_he, is_active',
      glass_types: '++id, name_he, is_active',
      accessories: '++id, name_he, is_active',
      opening_types: '++id, code, sort_order, is_active',
      opening_type_accessories: '++id, opening_type_id, accessory_id',
      settings: 'id',
      customers: '++id, name',
      projects: '++id, customer_id, status, quote_number, created_at',
      openings: '++id, project_id, opening_type_id, profile_system_id, glass_type_id',
      opening_accessories: '++id, opening_id, accessory_id',
    });
  }
}

export const db = new AppDatabase();

export function nowIso(): string {
  return new Date().toISOString();
}
