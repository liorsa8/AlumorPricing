import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), 'print.css');
const css = readFileSync(cssPath, 'utf-8');

// jsdom doesn't compute layout or CSS, so nothing here can check how the quote actually
// looks. This is a narrow tripwire for the *specific* mechanism already hit twice — not a
// general "no cards ever" guarantee, which is what PrintableQuote.test.tsx's row-count
// assertion covers (implementation-agnostic: it'd still catch a card layout built a
// different way, e.g. CSS Grid). Scoped to .print-table-wrap specifically, not any tr/td in
// the file, so an unrelated future rule elsewhere can't trip this by coincidence.
describe('print.css — quote table never restacks into cards', () => {
  it('never overrides the openings table to display: block (the restacking trigger)', () => {
    expect(css).not.toMatch(/\.print-table-wrap\s+(tr|td)\s*(,[^{]*)?\{[^}]*display:\s*block/);
  });

  it('never reads a per-cell label out of a data-label attribute (the card-label mechanism)', () => {
    expect(css).not.toContain('attr(data-label)');
  });
});
