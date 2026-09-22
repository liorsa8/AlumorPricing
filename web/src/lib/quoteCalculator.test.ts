import { describe, it, expect } from 'vitest';
import { computeOpeningLine, computeProjectTotals, lineMarkupFactor } from './quoteCalculator';

describe('computeOpeningLine', () => {
  it('computes material, accessories, and line totals for a sliding window', () => {
    // Same scenario hand-verified against the running app: 1000x1200mm sliding window, with its
    // default accessory kit. opening_type_price_per_sqm 104.4 is a stand-in for whatever a real
    // "חלון הזזה" base price would be, chosen only so this scenario's numbers keep matching what
    // this test asserted under the old profile_factor/glass_area_ratio model.
    const result = computeOpeningLine(
      1000,
      1200,
      1,
      { opening_type_price_per_sqm: 104.4, glass_price_per_sqm: 220 },
      [
        { accessory_id: '1', name_he: 'גלגלת הזזה', quantity: 2, price_per_unit: 18 },
        { accessory_id: '2', name_he: 'מנעול הזזה', quantity: 1, price_per_unit: 40 },
        { accessory_id: '3', name_he: 'אטם גומי (EPDM)', quantity: 1, price_per_unit: 8 },
        { accessory_id: '4', name_he: 'מברשת איטום', quantity: 1, price_per_unit: 6 },
      ]
    );

    expect(result.area_sqm).toBeCloseTo(1.2);
    expect(result.material_cost).toBeCloseTo(389.28);
    expect(result.accessories_cost).toBeCloseTo(90);
    expect(result.unit_subtotal).toBeCloseTo(479.28);
    expect(result.line_subtotal).toBeCloseTo(479.28);
  });

  it('multiplies the per-unit subtotal by quantity', () => {
    const result = computeOpeningLine(
      1000,
      1000,
      3,
      { opening_type_price_per_sqm: 90, glass_price_per_sqm: 100 },
      []
    );

    expect(result.unit_subtotal).toBeCloseTo(190); // 1m² area: 90 base + 100 glass
    expect(result.line_subtotal).toBeCloseTo(570);
  });

  it('has no glass surcharge for an opening type with no glass component (a net, a shutter)', () => {
    const result = computeOpeningLine(1000, 1000, 1, { opening_type_price_per_sqm: 200, glass_price_per_sqm: 0 }, []);

    expect(result.material_cost).toBeCloseTo(200);
  });
});

describe('computeProjectTotals', () => {
  it('applies labor, installation, and VAT in the documented order with no discount', () => {
    const totals = computeProjectTotals([{ line_subtotal: 479.28, labor_pct: 100, discount_pct: 0 }], 10, 18);

    expect(totals.labor_amount).toBeCloseTo(479.28);
    expect(totals.installation_amount).toBeCloseTo(47.928);
    expect(totals.pre_vat_total).toBeCloseTo(1006.488);
    expect(totals.vat_amount).toBeCloseTo(181.16784);
    expect(totals.total).toBeCloseTo(1187.65584);
  });

  it('applies the discount to the labor+installation-inclusive subtotal, before VAT', () => {
    const totals = computeProjectTotals([{ line_subtotal: 1000, labor_pct: 20, discount_pct: 10 }], 10, 18);

    // subtotal before discount = 1000 + 200 + 100 = 1300; 10% discount = 130
    expect(totals.discount_amount).toBeCloseTo(130);
    expect(totals.pre_vat_total).toBeCloseTo(1170);
    expect(totals.vat_amount).toBeCloseTo(210.6);
    expect(totals.total).toBeCloseTo(1380.6);
  });

  it('sums independently across lines with different labor% and discount% (per-item overrides)', () => {
    // Line A: no override, uses the quote's own 20% labor / 10% discount.
    // Line B: overridden to 60% labor and 0% discount — e.g. a big job where the owner cut
    // labor on this one item instead of discounting the whole quote.
    const totals = computeProjectTotals(
      [
        { line_subtotal: 1000, labor_pct: 20, discount_pct: 10 },
        { line_subtotal: 500, labor_pct: 60, discount_pct: 0 },
      ],
      10,
      18
    );

    // Line A: 1000 + 200 + 100 = 1300, -10% = 1170
    // Line B: 500 + 300 + 50 = 850, no discount = 850
    expect(totals.material_subtotal).toBeCloseTo(1500);
    expect(totals.labor_amount).toBeCloseTo(500); // 200 + 300
    expect(totals.installation_amount).toBeCloseTo(150); // 100 + 50
    expect(totals.discount_amount).toBeCloseTo(130); // only line A
    expect(totals.pre_vat_total).toBeCloseTo(2020); // 1170 + 850
  });

  it('is equivalent to the old single-percentage call when every line shares the same %', () => {
    // Guards the refactor from computeProjectTotals(materialSubtotal, laborPct, ...) to a
    // per-line list: splitting one project's material subtotal across several lines that all
    // use the SAME labor%/discount% must produce identical totals to treating it as one lump sum.
    const lumpSum = computeProjectTotals([{ line_subtotal: 1300, labor_pct: 15, discount_pct: 5 }], 8, 18);
    const splitAcrossLines = computeProjectTotals(
      [
        { line_subtotal: 800, labor_pct: 15, discount_pct: 5 },
        { line_subtotal: 500, labor_pct: 15, discount_pct: 5 },
      ],
      8,
      18
    );

    expect(splitAcrossLines).toEqual(lumpSum);
  });
});

// PrintableQuote shows each line's price pre-marked-up (labor+installation, then discount),
// using lineMarkupFactor instead of re-deriving this arithmetic by hand — pin the two down as
// staying in sync: a single line's displayed price (line_subtotal × factor) must equal what
// computeProjectTotals treats as that line's own pre-VAT contribution.
describe('lineMarkupFactor', () => {
  it('matches the per-line arithmetic computeProjectTotals does internally', () => {
    const lineSubtotal = 800;
    const laborPct = 20;
    const installationPct = 10;
    const discountPct = 15;

    const factor = lineMarkupFactor(laborPct, installationPct, discountPct);
    const totals = computeProjectTotals([{ line_subtotal: lineSubtotal, labor_pct: laborPct, discount_pct: discountPct }], installationPct, 0);

    expect(lineSubtotal * factor).toBeCloseTo(totals.pre_vat_total);
  });
});
