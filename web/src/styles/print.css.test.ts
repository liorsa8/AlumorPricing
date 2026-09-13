import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), 'print.css');
const css = readFileSync(cssPath, 'utf-8');
const projectDetailPageSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../pages/ProjectDetailPage.tsx'),
  'utf-8'
);

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

// Real bug, not hypothetical: the off-screen share-capture node is always rendered at a
// fixed 800px, but @media queries key off the actual device viewport, not that element's own
// width — so on a narrow phone, the mobile-only min-width rule above was incorrectly applying
// to the capture node too, forcing its totals table to overflow its container so far the
// value column rendered completely outside the captured image. Both halves of the fix (the
// override rule existing here, and the component actually applying the class it targets)
// have to stay in place together.
describe('print.css — the share-capture node is immune to viewport-relative mobile rules', () => {
  it('overrides the mobile min-width rule specifically for .share-capture-node', () => {
    expect(css).toMatch(/\.share-capture-node\s+\.print-page\s+table\s*\{[^}]*min-width:\s*0/);
  });

  it('ProjectDetailPage actually applies the class that override targets', () => {
    // className="share-capture-node" specifically — not just the string anywhere in the file
    // (it's also named in a comment above this exact div, which would make a bare substring
    // check pass even with the actual className removed).
    expect(projectDetailPageSource).toContain('className="share-capture-node"');
  });
});
