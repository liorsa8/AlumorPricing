import { describe, it, expect } from 'vitest';
import { computeOpeningLine, computeProjectTotals } from './quoteCalculator';

describe('computeOpeningLine', () => {
  it('computes material, accessories, and line totals for a sliding window', () => {
    // Same scenario hand-verified against the running app: 1000x1200mm sliding window,
    // Klil 7000 profile, double glass, with its default accessory kit.
    const result = computeOpeningLine(
      1000,
      1200,
      1,
      { profile_factor: 3.0, glass_area_ratio: 0.82 },
      { profile_price_per_meter: 48, glass_price_per_sqm: 220 },
      [
        { accessory_id: 1, name_he: 'גלגלת הזזה', quantity: 2, price_per_unit: 18 },
        { accessory_id: 2, name_he: 'מנעול הזזה', quantity: 1, price_per_unit: 40 },
        { accessory_id: 3, name_he: 'אטם גומי (EPDM)', quantity: 1, price_per_unit: 8 },
        { accessory_id: 4, name_he: 'מברשת איטום', quantity: 1, price_per_unit: 6 },
      ]
    );

    expect(result.profile_length_m).toBeCloseTo(3.6);
    expect(result.glass_area_sqm).toBeCloseTo(0.984);
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
      { profile_factor: 2, glass_area_ratio: 0.9 },
      { profile_price_per_meter: 50, glass_price_per_sqm: 100 },
      []
    );

    expect(result.unit_subtotal).toBeCloseTo(190); // 1m² area: 2m profile @50 + 0.9m² glass @100
    expect(result.line_subtotal).toBeCloseTo(570);
  });
});

describe('computeProjectTotals', () => {
  it('applies labor, installation, and VAT in the documented order with no discount', () => {
    const totals = computeProjectTotals(479.28, 100, 10, 0, 18);

    expect(totals.labor_amount).toBeCloseTo(479.28);
    expect(totals.installation_amount).toBeCloseTo(47.928);
    expect(totals.pre_vat_total).toBeCloseTo(1006.488);
    expect(totals.vat_amount).toBeCloseTo(181.16784);
    expect(totals.total).toBeCloseTo(1187.65584);
  });

  it('applies the discount to the labor+installation-inclusive subtotal, before VAT', () => {
    const totals = computeProjectTotals(1000, 20, 10, 10, 18);

    // subtotal before discount = 1000 + 200 + 100 = 1300; 10% discount = 130
    expect(totals.discount_amount).toBeCloseTo(130);
    expect(totals.pre_vat_total).toBeCloseTo(1170);
    expect(totals.vat_amount).toBeCloseTo(210.6);
    expect(totals.total).toBeCloseTo(1380.6);
  });
});
