export type ProjectStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'archived';

// A pure display label now — shown as "סדרה" on the printed quote. It no longer prices
// anything; that lives entirely on OpeningType.price_per_sqm and GlassType.price_per_sqm.
export interface ProfileSystem {
  id: string;
  name_he: string;
  series_code: string | null;
  manufacturer: string | null;
  is_active: number;
  // Present (true/false) only when read through a business's merged catalog view; absent when
  // read through the admin-only /catalog/:kind endpoint. True means this row is a business-
  // owned override shadowing a global item of the same id — offer "revert to default," not
  // "delete," for it.
  forked_from_global?: boolean;
}

export interface GlassType {
  id: string;
  name_he: string;
  thickness_mm: string | null;
  price_per_sqm: number;
  is_active: number;
  forked_from_global?: boolean;
}

export interface Accessory {
  id: string;
  name_he: string;
  unit: string;
  price_per_unit: number;
  is_active: number;
  forked_from_global?: boolean;
}

export interface OpeningTypeAccessoryLine {
  accessory_id: string;
  name_he: string;
  price_per_unit: number;
  quantity: number;
}

// The plain, hand-typed columns of an opening type — shared between this client-facing type and
// db/firestoreApi.ts's internal OpeningTypeRow (which extends this the same way, plus its own
// storage-only fields). One declaration for the fields that actually price a quote line, so a
// future pricing-field change is one edit instead of two hand-kept-in-sync interfaces — that
// exact duplication is what made the profile_factor/glass_area_ratio -> price_per_sqm migration
// touch more files than it needed to.
export interface OpeningTypeFields {
  name_he: string;
  code: string;
  // ₪ per m² — set directly from real aluminum-pricing sites, not derived from any factor.
  price_per_sqm: number;
  // false = this opening type has no glass component (a net, a shutter, a monoblock box) — its
  // quote lines skip picking a glass type and never get a glass surcharge.
  has_glass: boolean;
  sort_order: number;
  notes: string;
}

export interface OpeningType extends OpeningTypeFields {
  id: string;
  is_active: number;
  accessories: OpeningTypeAccessoryLine[];
  forked_from_global?: boolean;
}

// A business is a signed-in user's "account" — its own letterhead + pricing defaults, replacing
// what used to be the single global /settings row. A user can own more than one.
export interface Business {
  id: string;
  owner_uid: string;
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
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export interface ProjectListItem {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  quote_number: number;
  title: string;
  status: ProjectStatus;
  total: number;
  created_at: string;
}

export interface OpeningAccessoryLine {
  id: number;
  accessory_id: string;
  accessory_name_snapshot: string;
  quantity: number;
  price_per_unit_snapshot: number;
  line_total: number;
}

export interface Opening {
  id: number;
  project_id: string;
  opening_type_id: string;
  profile_system_id: string;
  // '' when this opening type has no glass component (has_glass: false).
  glass_type_id: string;
  label: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
  // null = use the quote's own labor_pct/discount_pct. See ProjectDetailPage's item form.
  labor_pct_override: number | null;
  discount_pct_override: number | null;
  material_cost: number;
  accessories_cost: number;
  unit_subtotal: number;
  line_subtotal: number;
  opening_type_name_snapshot: string;
  profile_system_name_snapshot: string;
  profile_system_series_code_snapshot: string | null;
  glass_type_name_snapshot: string | null;
  accessory_lines: OpeningAccessoryLine[];
}

export interface ProjectDetail {
  id: string;
  customer_id: string | null;
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
