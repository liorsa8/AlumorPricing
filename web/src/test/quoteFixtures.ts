import type { Business, ProjectDetail } from '../api/types';

// One realistic draft quote + business, shared by the page-level tests (preview page, quote
// detail page) so they all assert against the same numbers.
export const quoteProject = {
  id: 'p1',
  status: 'draft',
  customer_id: 'c1',
  customer_name: 'דוד לוי',
  quote_number: 7,
  title: 'דירה ברמת גן',
  notes: null,
  created_at: '2026-09-13T10:00:00.000Z',
  labor_pct_snapshot: 100,
  installation_pct_snapshot: 10,
  vat_pct_snapshot: 18,
  discount_pct: 0,
  material_subtotal: 958.92,
  labor_amount: 958.92,
  installation_amount: 95.89,
  discount_amount: 0,
  pre_vat_total: 2013.73,
  vat_amount: 362.47,
  total: 2376.2,
  openings: [
    {
      id: 1,
      opening_type_id: 'ot1',
      profile_system_id: 'ps1',
      glass_type_id: 'gt1',
      label: 'סלון',
      width_mm: 1000,
      height_mm: 1200,
      quantity: 2,
      unit_subtotal: 479.46,
      line_subtotal: 958.92,
      opening_type_name_snapshot: 'חלון הזזה',
      profile_system_name_snapshot: 'קליל 7000',
      profile_system_series_code_snapshot: '7000',
      glass_type_name_snapshot: 'זכוכית כפולה',
    },
  ],
} as unknown as ProjectDetail;

export const quoteBusiness = {
  id: 'b1',
  company_name: 'אלומור',
  company_phone: '0544343384',
  company_email: '',
  company_address: 'חולון',
  company_tax_id: '',
  company_logo: '',
  standard_terms: 'תנאי ראשון\nתנאי שני',
} as unknown as Business;

export const TOTAL_AMOUNTS = [quoteProject.pre_vat_total, quoteProject.vat_amount, quoteProject.total];
