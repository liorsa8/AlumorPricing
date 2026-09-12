import { db } from './connection';

interface SeedOpeningType {
  name_he: string;
  code: string;
  profile_factor: number;
  glass_area_ratio: number;
  sort_order: number;
  accessories: { name_he: string; quantity: number }[];
}

const SEED_PROFILE_SYSTEMS = [
  { name_he: 'קליל 7000 (הזזה קלאסי)', series_code: '7000', manufacturer: 'קליל', price_per_meter: 48 },
  { name_he: 'קליל 7300 בלגי (הזזה)', series_code: '7300', manufacturer: 'קליל', price_per_meter: 68 },
  { name_he: 'קליל 9000 (הזזה, מפתח גדול)', series_code: '9000', manufacturer: 'קליל', price_per_meter: 72 },
  { name_he: 'קליל 4100 בלגי ארט (ציר)', series_code: '4100', manufacturer: 'קליל', price_per_meter: 75 },
  { name_he: 'קליל 4500 קלאסי (ציר)', series_code: '4500', manufacturer: 'קליל', price_per_meter: 58 },
  { name_he: 'קליל דלת בלגית (כניסה)', series_code: '4400', manufacturer: 'קליל', price_per_meter: 95 },
  { name_he: 'PVC REHAU 76 מ"מ (6 תאים)', series_code: 'PVC 76', manufacturer: 'REHAU', price_per_meter: 42 },
];

const SEED_GLASS_TYPES = [
  { name_he: 'זכוכית בודדת', thickness_mm: '4 מ"מ', price_per_sqm: 120 },
  { name_he: 'זכוכית כפולה', thickness_mm: '4+12+4', price_per_sqm: 220 },
  { name_he: 'זכוכית בטיחות (טמפרד)', thickness_mm: '5 מ"מ', price_per_sqm: 280 },
];

const SEED_ACCESSORIES = [
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

const SEED_OPENING_TYPES: SeedOpeningType[] = [
  {
    name_he: 'חלון הזזה',
    code: 'sliding_window',
    profile_factor: 3.0,
    glass_area_ratio: 0.82,
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
    profile_factor: 3.6,
    glass_area_ratio: 0.78,
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
    profile_factor: 4.2,
    glass_area_ratio: 0.35,
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
    profile_factor: 3.4,
    glass_area_ratio: 0.75,
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
    profile_factor: 2.2,
    glass_area_ratio: 0.9,
    sort_order: 5,
    accessories: [],
  },
];

const DEFAULT_STANDARD_TERMS = [
  'המחירים כוללים מדידה, ייצור, הובלה, הרכבה וזיגוג.',
  'ההרכבה מתבצעת לאחר סיום עבודות בטון, טיח וצבע, פנים וחוץ.',
  'חשמל, אמצעי הרמה ושטח אחסון יועמדו לרשות הצוות על ידי המזמין.',
  'המחירים עשויים להתעדכן בהתאם לשינויים במחירון האלומיניום.',
  'תוקף ההצעה 30 יום מתאריך ההנפקה.',
].join('\n');

export function seedIfEmpty(): void {
  const profileCount = (db.prepare('SELECT COUNT(*) AS c FROM profile_systems').get() as { c: number }).c;
  if (profileCount === 0) {
    const insert = db.prepare(
      'INSERT INTO profile_systems (name_he, series_code, manufacturer, price_per_meter) VALUES (?, ?, ?, ?)'
    );
    for (const p of SEED_PROFILE_SYSTEMS) insert.run(p.name_he, p.series_code, p.manufacturer, p.price_per_meter);
  }

  const glassCount = (db.prepare('SELECT COUNT(*) AS c FROM glass_types').get() as { c: number }).c;
  if (glassCount === 0) {
    const insert = db.prepare(
      'INSERT INTO glass_types (name_he, thickness_mm, price_per_sqm) VALUES (?, ?, ?)'
    );
    for (const g of SEED_GLASS_TYPES) insert.run(g.name_he, g.thickness_mm, g.price_per_sqm);
  }

  const accessoryCount = (db.prepare('SELECT COUNT(*) AS c FROM accessories').get() as { c: number }).c;
  if (accessoryCount === 0) {
    const insert = db.prepare(
      'INSERT INTO accessories (name_he, unit, price_per_unit) VALUES (?, ?, ?)'
    );
    for (const a of SEED_ACCESSORIES) insert.run(a.name_he, a.unit, a.price_per_unit);
  }

  const openingTypeCount = (db.prepare('SELECT COUNT(*) AS c FROM opening_types').get() as { c: number }).c;
  if (openingTypeCount === 0) {
    const insertType = db.prepare(
      'INSERT INTO opening_types (name_he, code, profile_factor, glass_area_ratio, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    const insertKitLine = db.prepare(
      'INSERT INTO opening_type_accessories (opening_type_id, accessory_id, quantity) VALUES (?, ?, ?)'
    );
    const findAccessoryId = db.prepare('SELECT id FROM accessories WHERE name_he = ?');
    for (const t of SEED_OPENING_TYPES) {
      const result = insertType.run(t.name_he, t.code, t.profile_factor, t.glass_area_ratio, t.sort_order);
      const typeId = result.lastInsertRowid as number;
      for (const acc of t.accessories) {
        const row = findAccessoryId.get(acc.name_he) as { id: number } | undefined;
        if (row) insertKitLine.run(typeId, row.id, acc.quantity);
      }
    }
  }

  const settingsRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settingsRow) {
    db.prepare(
      `INSERT INTO settings (id, labor_pct, installation_pct, vat_pct, company_name, company_phone, company_address, standard_terms)
       VALUES (1, 100, 10, 18, '', '', '', ?)`
    ).run(DEFAULT_STANDARD_TERMS);
  }
}
