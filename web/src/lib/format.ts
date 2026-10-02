import { ProjectStatus } from '../api/types';

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// Agorot are never shown — amounts always round down (174.56 -> 174).
export function formatCurrency(value: number): string {
  return currencyFormatter.format(Math.floor(value));
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' });

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

// Fixed DD.MM.YYYY — formatDate() above is locale-driven and not guaranteed to zero-pad, which
// the quotes table's date column (and its tabular-nums alignment) depends on.
export function formatDateDMY(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const longHebrewDateFormatter = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatLongHebrewDate(date: Date): string {
  return longHebrewDateFormatter.format(date);
}

// Compact "₪1,234" format for the quotes table; always rounds down, never shows agorot.
export function formatQuoteTotal(value: number): string {
  return `₪${Math.floor(value).toLocaleString('en-US')}`;
}

// Shared by every "circle avatar with a letter in it" spot that has only one name-ish source to
// work with (a business name, a customer name with no second word) — AppShell's user card,
// BusinessListPage's workspace tiles and account fallback avatar.
export function firstLetterInitial(source: string | null | undefined): string {
  return (source || '?').trim().charAt(0).toUpperCase();
}

// "משפחת לוי" -> "ל", "דנה אברהם" -> "דא" — drops the "משפחת" honorific before taking initials
// since it's a title, not a name part, and would otherwise always collapse to the same "מ".
export function clientInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const cleaned = name.replace(/^משפחת\s+/, '').trim();
  if (!cleaned) return '?';
  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

const AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#E3EEFF', fg: '#1D5FE0' },
  { bg: '#DFF5FB', fg: '#0A7EA4' },
  { bg: '#E9E7FD', fg: '#5145CD' },
  { bg: '#E8F7EF', fg: '#157A4A' },
];

// Cycles through a fixed palette by a hash of the quote id, so a given quote's avatar color
// stays stable across re-renders and re-sorts instead of shifting with its position in the list.
export function avatarColors(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function summarizeOpenings(openings: Array<{ opening_type_name_snapshot: string; quantity: number }>): string {
  if (openings.length === 0) return 'אין פריטים';
  const qtyByType = new Map<string, number>();
  for (const o of openings) qtyByType.set(o.opening_type_name_snapshot, (qtyByType.get(o.opening_type_name_snapshot) ?? 0) + o.quantity);
  return Array.from(qtyByType.entries())
    .map(([name, qty]) => `${qty} ${name}`)
    .join(' · ');
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'טיוטה',
  sent: 'נשלחה',
  accepted: 'אושרה',
  rejected: 'נדחתה',
  archived: 'בארכיון',
};
