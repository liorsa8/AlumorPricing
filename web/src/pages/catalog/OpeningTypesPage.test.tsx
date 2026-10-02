// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OpeningTypesPage from './OpeningTypesPage';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(() => Promise.resolve([])), post: vi.fn(() => Promise.resolve({})), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ isAdmin: false }) }));

afterEach(cleanup);

function renderPage() {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/b/biz1/opening-types']}>
        <Routes>
          <Route path="/b/:businessId/opening-types" element={<OpeningTypesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The form's labels aren't wired to their inputs with htmlFor (true of every field in this
// codebase, not just this one), so getByLabelText can't find them — go by field order instead:
// name, code, price_per_sqm, sort_order (see the form-grid in the page).
function pricePerSqmInput(container: HTMLElement): HTMLInputElement {
  return container.querySelectorAll('input[type="number"]')[0] as HTMLInputElement;
}

// Real production bug: an old per-sqm calibration factor (a different field, since removed) was
// mistyped and turned a 1x1m window into a ~756,000 ₪ line item, with nothing in the UI to catch
// it. price_per_sqm is a real ₪ figure now, checkable against real aluminum-pricing sites.
describe('OpeningTypesPage — a wildly-off price is flagged before saving', () => {
  it('shows no warning for a realistic value', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    fireEvent.change(pricePerSqmInput(container), { target: { value: '1200' } });

    expect(screen.queryByText(/טעות הקלדה/)).toBeNull();
  });

  it('warns when the value is far above the normal range', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    fireEvent.change(pricePerSqmInput(container), { target: { value: '75000' } });

    expect(screen.getByText(/טעות הקלדה/)).toBeTruthy();
  });

  it('warns when the value is far below the normal range', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    fireEvent.change(pricePerSqmInput(container), { target: { value: '5' } });

    expect(screen.getByText(/טעות הקלדה/)).toBeTruthy();
  });

  it('does not warn on an empty or non-numeric field', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    fireEvent.change(pricePerSqmInput(container), { target: { value: '' } });
    expect(screen.queryByText(/טעות הקלדה/)).toBeNull();
  });
});

// A live worked example turns the abstract "₪/מ"ר" into a concrete price before it's saved.
describe('OpeningTypesPage — a live example table shows the resulting price', () => {
  it('computes the example base price from the entered price_per_sqm', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    fireEvent.change(pricePerSqmInput(container), { target: { value: '150' } });

    // 1.0 × 1.0m: area 1 m² -> 150.00 ₪ base price.
    const firstRow = screen.getByText('1.0 × 1.0 מ׳').closest('tr')!;
    expect(firstRow.textContent).toContain('150.00 ₪');
  });
});

describe('OpeningTypesPage — has_glass controls whether glass is priced in', () => {
  it('is checked by default, and its footnote mentions glass being added on top', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    expect((screen.getByRole('checkbox', { name: /כולל זכוכית/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/מחיר מ"ר של סוג הזכוכית שנבחר/)).toBeTruthy();
  });

  it('unchecking it swaps the footnote to say no glass cost applies', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    fireEvent.click(screen.getByRole('checkbox', { name: /כולל זכוכית/ }));

    expect(screen.getByText(/לא תתווסף עלות זכוכית/)).toBeTruthy();
  });

  it('sends has_glass: false in the create payload when unchecked', async () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    const [nameInput, codeInput] = container.querySelectorAll('input[type="text"], input:not([type])');
    fireEvent.change(nameInput, { target: { value: 'רשת' } });
    fireEvent.change(codeInput, { target: { value: 'net' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /כולל זכוכית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'שמור' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ has_glass: false }))
    );
  });
});

describe('OpeningTypesPage — optional notes on why the values are what they are', () => {
  it('sends the notes text as part of the create payload', async () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'הוסף סוג פתח' }));

    const [nameInput, codeInput] = container.querySelectorAll('input[type="text"], input:not([type])');
    fireEvent.change(nameInput, { target: { value: 'סוג בדיקה' } });
    fireEvent.change(codeInput, { target: { value: 'test' } });
    fireEvent.change(container.querySelector('textarea')!, { target: { value: 'הושווה מול מחירון קליל 7000' } });
    fireEvent.click(screen.getByRole('button', { name: 'שמור' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ notes: 'הושווה מול מחירון קליל 7000' })
      )
    );
  });
});
