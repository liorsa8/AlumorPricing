export type ProjectStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'archived';

export interface ProfileSystem {
  id: number;
  name_he: string;
  series_code: string | null;
  manufacturer: string | null;
  price_per_meter: number;
  is_active: number;
}

export interface GlassType {
  id: number;
  name_he: string;
  thickness_mm: string | null;
  price_per_sqm: number;
  is_active: number;
}

export interface Accessory {
  id: number;
  name_he: string;
  unit: string;
  price_per_unit: number;
  is_active: number;
}

export interface OpeningTypeAccessoryLine {
  id: number;
  accessory_id: number;
  name_he: string;
  price_per_unit: number;
  quantity: number;
}

export interface OpeningType {
  id: number;
  name_he: string;
  code: string;
  profile_factor: number;
  glass_area_ratio: number;
  sort_order: number;
  is_active: number;
  accessories: OpeningTypeAccessoryLine[];
}

export interface Settings {
  id: 1;
  labor_pct: number;
  installation_pct: number;
  vat_pct: number;
  company_name: string;
  company_phone: string;
  company_address: string;
  standard_terms: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export interface ProjectListItem {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  quote_number: number;
  title: string;
  status: ProjectStatus;
  total: number;
  created_at: string;
}

export interface OpeningAccessoryLine {
  id: number;
  accessory_id: number;
  accessory_name_snapshot: string;
  quantity: number;
  price_per_unit_snapshot: number;
  line_total: number;
}

export interface Opening {
  id: number;
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
  opening_type_name_snapshot: string;
  profile_system_name_snapshot: string;
  profile_system_series_code_snapshot: string | null;
  glass_type_name_snapshot: string;
  accessory_lines: OpeningAccessoryLine[];
}

export interface ProjectDetail {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  quote_number: number;
  title: string;
  status: ProjectStatus;
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
  openings: Opening[];
}
