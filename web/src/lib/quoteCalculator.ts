export interface OpeningFactors {
  profile_factor: number;
  glass_area_ratio: number;
}

export interface OpeningPrices {
  profile_price_per_meter: number;
  glass_price_per_sqm: number;
}

export interface AccessoryInput {
  accessory_id: number;
  name_he: string;
  quantity: number;
  price_per_unit: number;
}

export interface AccessoryLineResult extends AccessoryInput {
  line_total: number;
}

export interface OpeningLineResult {
  profile_length_m: number;
  glass_area_sqm: number;
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
  factors: OpeningFactors,
  prices: OpeningPrices,
  accessories: AccessoryInput[]
): OpeningLineResult {
  const areaSqm = (widthMm / 1000) * (heightMm / 1000);
  const profileLengthM = areaSqm * factors.profile_factor;
  const glassAreaSqm = areaSqm * factors.glass_area_ratio;
  const materialCost =
    profileLengthM * prices.profile_price_per_meter + glassAreaSqm * prices.glass_price_per_sqm;

  const accessoryLines: AccessoryLineResult[] = accessories.map((a) => ({
    ...a,
    line_total: a.quantity * a.price_per_unit,
  }));
  const accessoriesCost = accessoryLines.reduce((sum, a) => sum + a.line_total, 0);

  const unitSubtotal = materialCost + accessoriesCost;
  const lineSubtotal = unitSubtotal * quantity;

  return {
    profile_length_m: profileLengthM,
    glass_area_sqm: glassAreaSqm,
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

export function computeProjectTotals(
  materialSubtotal: number,
  laborPct: number,
  installationPct: number,
  discountPct: number,
  vatPct: number
): ProjectTotalsResult {
  const laborAmount = (materialSubtotal * laborPct) / 100;
  const installationAmount = (materialSubtotal * installationPct) / 100;
  const subtotalBeforeDiscount = materialSubtotal + laborAmount + installationAmount;
  const discountAmount = (subtotalBeforeDiscount * discountPct) / 100;
  const preVatTotal = subtotalBeforeDiscount - discountAmount;
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
