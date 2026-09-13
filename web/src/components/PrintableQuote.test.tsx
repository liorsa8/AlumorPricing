// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PrintableQuote from './PrintableQuote';
import type { ProjectDetail } from '../api/types';

const project = {
  quote_number: 1,
  customer_name: 'לקוח בדיקה',
  title: '',
  notes: null,
  created_at: new Date().toISOString(),
  labor_pct_snapshot: 100,
  installation_pct_snapshot: 10,
  vat_pct_snapshot: 18,
  discount_pct: 0,
  pre_vat_total: 1006.49,
  vat_amount: 181.17,
  total: 1187.66,
  openings: [
    {
      id: 1,
      label: '',
      width_mm: 1000,
      height_mm: 1200,
      quantity: 1,
      unit_subtotal: 479.28,
      line_subtotal: 479.28,
      opening_type_name_snapshot: 'חלון הזזה',
      profile_system_name_snapshot: 'קליל 7000',
      profile_system_series_code_snapshot: '7000',
      glass_type_name_snapshot: 'זכוכית כפולה',
    },
    {
      id: 2,
      label: '',
      width_mm: 900,
      height_mm: 1500,
      quantity: 2,
      unit_subtotal: 300,
      line_subtotal: 600,
      opening_type_name_snapshot: 'חלון ציר',
      profile_system_name_snapshot: 'קליל 4500',
      profile_system_series_code_snapshot: '4500',
      glass_type_name_snapshot: 'זכוכית בודדת',
    },
  ],
} as unknown as ProjectDetail;

// By explicit request, the openings list on the quote must always be a real row-per-opening
// table, on every screen size — not restacked into cards. This pins down the markup shape;
// styles/print.css.test.ts pins down that no future CSS turns it back into cards.
describe('PrintableQuote', () => {
  it('renders the openings as a table with one row per opening', () => {
    const { container } = render(<PrintableQuote project={project} settings={undefined} />);

    const openingsTable = container.querySelector('.print-table-wrap table');
    expect(openingsTable).not.toBeNull();
    expect(openingsTable!.querySelectorAll('thead th').length).toBeGreaterThan(0);
    expect(openingsTable!.querySelectorAll('tbody tr').length).toBe(project.openings.length);
  });
});
