// Replaces an earlier two-coefficient model (meters of profile per m², fraction of the opening
// that's glass) that turned out to be a real production hazard: an easy-to-fat-finger,
// impossible-to-eyeball pair of multipliers — a single mistyped coefficient once turned a 1x1m
// window into a ~756,000 ₪ line. The owner now enters one ₪/מ"ר price directly on the opening
// type, checkable against real aluminum-pricing sites (e.g. "קליל 7000 ≈ 900-1,500 ₪/מ"ר").
export interface OpeningPrices {
  // The opening type's own base ₪/מ"ר (see OpeningTypesPage). Whatever glass this line uses
  // adds its own ₪/מ"ר surcharge on top, over the full area — 0 for an opening type that has no
  // glass component at all (a net, a shutter, ...), never scaled by a ratio.
  opening_type_price_per_sqm: number;
  glass_price_per_sqm: number;
}

export interface AccessoryInput {
  accessory_id: string;
  name_he: string;
  quantity: number;
  price_per_unit: number;
}

export interface AccessoryLineResult extends AccessoryInput {
  line_total: number;
}

export interface OpeningLineResult {
  area_sqm: number;
  material_cost: number;
  accessories_cost: number;
  unit_subtotal: number;
  line_subtotal: number;
  accessory_lines: AccessoryLineResult[];
}

export function computeOpeningLine(
  widthMm: number,
  heightMm: number,
  quantity: number,
  prices: OpeningPrices,
  accessories: AccessoryInput[]
): OpeningLineResult {
  const areaSqm = (widthMm / 1000) * (heightMm / 1000);
  const materialCost = areaSqm * (prices.opening_type_price_per_sqm + prices.glass_price_per_sqm);

  const accessoryLines: AccessoryLineResult[] = accessories.map((a) => ({
    ...a,
    line_total: a.quantity * a.price_per_unit,
  }));
  const accessoriesCost = accessoryLines.reduce((sum, a) => sum + a.line_total, 0);

  const unitSubtotal = materialCost + accessoriesCost;
  const lineSubtotal = unitSubtotal * quantity;

  return {
    area_sqm: areaSqm,
    material_cost: materialCost,
    accessories_cost: accessoriesCost,
    unit_subtotal: unitSubtotal,
    line_subtotal: lineSubtotal,
    accessory_lines: accessoryLines,
  };
}

export interface ProjectTotalsResult {
  material_subtotal: number;
  labor_amount: number;
  installation_amount: number;
  discount_amount: number;
  pre_vat_total: number;
  vat_amount: number;
  total: number;
}

// One line's own labor%/discount% — each opening can override the quote's own labor_pct/
// discount_pct (a big job might get a per-item discount, or one item's labor knocked down),
// so totals are built line by line instead of applying one project-wide % to the whole
// material subtotal at once. Installation stays project-wide only — nobody asked to override
// that per item, and there's no natural "this one item took less installation" case like there
// is for labor/discount.
export interface OpeningTotalsLine {
  line_subtotal: number;
  labor_pct: number;
  discount_pct: number;
}

// The single multiplier that turns a line's raw material+accessories price into what it should
// display as on a printed quote: labor and installation marked up, then the discount taken off
// the result — algebraically the same per-line arithmetic computeProjectTotals does internally
// (there just to get the itemized labor/installation/discount amounts, not a combined factor).
// Exported so a display-only consumer (the printed quote) computes a line's shown price with
// the same formula instead of re-deriving it, so the two can't drift apart.
export function lineMarkupFactor(laborPct: number, installationPct: number, discountPct: number): number {
  return (1 + (laborPct + installationPct) / 100) * (1 - discountPct / 100);
}

export function computeProjectTotals(
  lines: OpeningTotalsLine[],
  installationPct: number,
  vatPct: number
): ProjectTotalsResult {
  let materialSubtotal = 0;
  let laborAmount = 0;
  let installationAmount = 0;
  let discountAmount = 0;
  let preVatTotal = 0;

  for (const line of lines) {
    const lineLabor = (line.line_subtotal * line.labor_pct) / 100;
    const lineInstallation = (line.line_subtotal * installationPct) / 100;
    const lineBeforeDiscount = line.line_subtotal + lineLabor + lineInstallation;
    const lineDiscount = (lineBeforeDiscount * line.discount_pct) / 100;

    materialSubtotal += line.line_subtotal;
    laborAmount += lineLabor;
    installationAmount += lineInstallation;
    discountAmount += lineDiscount;
    preVatTotal += lineBeforeDiscount - lineDiscount;
  }

  const vatAmount = (preVatTotal * vatPct) / 100;
  const total = preVatTotal + vatAmount;

  return {
    material_subtotal: materialSubtotal,
    labor_amount: laborAmount,
    installation_amount: installationAmount,
    discount_amount: discountAmount,
    pre_vat_total: preVatTotal,
    vat_amount: vatAmount,
    total,
  };
}
