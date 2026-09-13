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
  ],
} as unknown as ProjectDetail;

// The mobile stacked-card view (print.css) relies on each cell's data-label matching its
// column header exactly — CSS reads it via content: attr(data-label), so nothing in
// TypeScript catches the two drifting apart. If a header is renamed (or a column reordered)
// without updating its cell's data-label, the mobile view silently shows the wrong label
// next to each value, with no error anywhere.
describe('PrintableQuote', () => {
  it('gives every opening cell a data-label matching its column header, in order', () => {
    const { container } = render(<PrintableQuote project={project} settings={undefined} />);

    const openingsTable = container.querySelector('.print-table-wrap table')!;
    const headers = Array.from(openingsTable.querySelectorAll('thead th')).map((th) => th.textContent);
    const firstRowCells = Array.from(openingsTable.querySelectorAll('tbody tr:first-child td'));
    const labels = firstRowCells.map((td) => td.getAttribute('data-label'));

    expect(headers.length).toBeGreaterThan(0);
    expect(labels).toEqual(headers);
  });
});
