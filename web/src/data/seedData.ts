// A pure display label now (see api/types.ts's ProfileSystem) — no price here anymore.
export const SEED_PROFILE_SYSTEMS = [
  { name_he: 'קליל 7000 (הזזה קלאסי)', series_code: '7000', manufacturer: 'קליל' },
  { name_he: 'קליל 7300 בלגי (הזזה)', series_code: '7300', manufacturer: 'קליל' },
  { name_he: 'קליל 9000 (הזזה, מפתח גדול)', series_code: '9000', manufacturer: 'קליל' },
  { name_he: 'קליל 4100 בלגי ארט (ציר)', series_code: '4100', manufacturer: 'קליל' },
  { name_he: 'קליל 4500 קלאסי (ציר)', series_code: '4500', manufacturer: 'קליל' },
  { name_he: 'קליל דלת בלגית (כניסה)', series_code: '4400', manufacturer: 'קליל' },
  { name_he: 'PVC REHAU 76 מ"מ (6 תאים)', series_code: 'PVC 76', manufacturer: 'REHAU' },
];

export const SEED_GLASS_TYPES = [
  { name_he: 'זכוכית בודדת', thickness_mm: '4 מ"מ', price_per_sqm: 120 },
  { name_he: 'זכוכית כפולה', thickness_mm: '4+12+4', price_per_sqm: 220 },
  { name_he: 'זכוכית בטיחות (טמפרד)', thickness_mm: '5 מ"מ', price_per_sqm: 280 },
];

export const SEED_ACCESSORIES = [
  { name_he: 'ציר', unit: 'יחידה', price_per_unit: 25 },
  { name_he: 'ידית חלון', unit: 'יחידה', price_per_unit: 35 },
  { name_he: 'ידית דלת', unit: 'יחידה', price_per_unit: 60 },
  { name_he: 'מנעול הזזה', unit: 'יחידה', price_per_unit: 40 },
  { name_he: 'מנעול רב נקודי', unit: 'יחידה', price_per_unit: 220 },
  { name_he: 'גלגלת הזזה', unit: 'יחידה', price_per_unit: 18 },
  { name_he: 'גלגלת הזזה מוגברת', unit: 'יחידה', price_per_unit: 22 },
  { name_he: 'אטם גומי (EPDM)', unit: 'מ׳', price_per_unit: 8 },
  { name_he: 'מברשת איטום', unit: 'מ׳', price_per_unit: 6 },
  { name_he: 'מנעול אטימה לחלון', unit: 'יחידה', price_per_unit: 55 },
];

export interface SeedOpeningType {
  name_he: string;
  code: string;
  price_per_sqm: number;
  has_glass: boolean;
  sort_order: number;
  accessories: { name_he: string; quantity: number }[];
}

// price_per_sqm values back-derived from this file's own old profile_factor/glass_area_ratio ×
// its previous profile-system/glass-type pairing (48 ₪/m profile, 220 ₪/sqm glass), so a fresh
// dev seed prices roughly the same as before — treat as a starting point, not a real price list.
export const SEED_OPENING_TYPES: SeedOpeningType[] = [
  {
    name_he: 'חלון הזזה',
    code: 'sliding_window',
    price_per_sqm: 104,
    has_glass: true,
    sort_order: 1,
    accessories: [
      { name_he: 'גלגלת הזזה', quantity: 2 },
      { name_he: 'מנעול הזזה', quantity: 1 },
      { name_he: 'אטם גומי (EPDM)', quantity: 1 },
      { name_he: 'מברשת איטום', quantity: 1 },
    ],
  },
  {
    name_he: 'חלון ציר',
    code: 'casement_window',
    price_per_sqm: 222,
    has_glass: true,
    sort_order: 2,
    accessories: [
      { name_he: 'ציר', quantity: 2 },
      { name_he: 'ידית חלון', quantity: 1 },
      { name_he: 'מנעול הזזה', quantity: 1 },
      { name_he: 'אטם גומי (EPDM)', quantity: 1 },
    ],
  },
  {
    name_he: 'דלת כניסה',
    code: 'entry_door',
    price_per_sqm: 256,
    has_glass: true,
    sort_order: 3,
    accessories: [
      { name_he: 'ציר', quantity: 3 },
      { name_he: 'מנעול רב נקודי', quantity: 1 },
      { name_he: 'ידית דלת', quantity: 1 },
      { name_he: 'אטם גומי (EPDM)', quantity: 1 },
    ],
  },
  {
    name_he: 'דלת הזזה',
    code: 'sliding_door',
    price_per_sqm: 176,
    has_glass: true,
    sort_order: 4,
    accessories: [
      { name_he: 'גלגלת הזזה', quantity: 2 },
      { name_he: 'מנעול הזזה', quantity: 1 },
      { name_he: 'אטם גומי (EPDM)', quantity: 1 },
      { name_he: 'מברשת איטום', quantity: 1 },
    ],
  },
  {
    name_he: 'חלון קבוע',
    code: 'fixed_window',
    price_per_sqm: 84,
    has_glass: true,
    sort_order: 5,
    accessories: [],
  },
];

export const DEFAULT_STANDARD_TERMS = [
  'המחירים כוללים מדידה, ייצור, הובלה, הרכבה וזיגוג.',
  'ההרכבה מתבצעת לאחר סיום עבודות בטון, טיח וצבע, פנים וחוץ.',
  'חשמל, אמצעי הרמה ושטח אחסון יועמדו לרשות הצוות על ידי המזמין.',
  'המחירים עשויים להתעדכן בהתאם לשינויים במחירון האלומיניום.',
  'תוקף ההצעה 30 יום מתאריך ההנפקה.',
].join('\n');
