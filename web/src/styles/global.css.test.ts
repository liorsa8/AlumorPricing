import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'global.css'), 'utf-8');
const mobile = css.slice(css.indexOf('@media (max-width: 720px)'));

// jsdom can't lay anything out, so this is a tripwire for the specific mechanism behind a real
// phone bug: on a narrow screen the form fields were wider than their card and clipped on the
// left (the dropdown arrow was cut off, needing a sideways scroll). A bare `1fr` grid column is
// minmax(auto, 1fr), so a select with long option text stretched the column past the card.
describe('global.css — forms never overflow their card on a phone', () => {
  it('uses minmax(0, 1fr) for the single mobile form column, not a bare 1fr', () => {
    expect(mobile).toMatch(/\.form-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(mobile).not.toMatch(/\.form-grid\s*\{[^}]*grid-template-columns:\s*1fr\s*;/);
  });

  it('lets a field shrink below its content width', () => {
    expect(css).toMatch(/\.field\s*\{[^}]*min-width:\s*0/);
  });

  it('caps inputs, selects and textareas at their field width', () => {
    const rule = css.match(/\.field input,\s*\.field select,\s*\.field textarea\s*\{([^}]*)\}/)![1];
    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/min-width:\s*0/);
  });
});
