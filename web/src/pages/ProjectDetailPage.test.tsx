// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectDetailPage from './ProjectDetailPage';
import { quoteProject, quoteBusiness } from '../test/quoteFixtures';

const state = vi.hoisted(() => ({ project: null as unknown }));
const put = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
const post = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url.includes('/projects/')) return Promise.resolve(state.project);
      if (url.endsWith('/customers')) return Promise.resolve([{ id: 'c1', name: 'דוד לוי' }]);
      if (url.endsWith('/opening-types'))
        return Promise.resolve([
          { id: 'ot1', name_he: 'חלון הזזה', has_glass: true },
          { id: 'ot2', name_he: 'רשת', has_glass: false },
        ]);
      if (url.endsWith('/profile-systems')) return Promise.resolve([{ id: 'ps1', name_he: 'קליל 7000' }]);
      if (url.endsWith('/glass-types')) return Promise.resolve([{ id: 'gt1', name_he: 'זכוכית כפולה' }]);
      return Promise.resolve(quoteBusiness);
    }),
    post,
    put,
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

beforeEach(() => {
  state.project = quoteProject;
  put.mockClear();
  post.mockClear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/b/b1/projects/p1']}>
        <Routes>
          <Route path="/b/:businessId/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const ADD_LABEL = 'הוספת פריט להצעה';

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// Phone layout: the quote's lines and totals used to sit below two big forms. Now both forms
// are hidden behind buttons (like the catalog pages), so the lines come first.
describe('ProjectDetailPage — quote lines first, forms on demand', () => {
  it('shows the add button, the quote lines and the totals, with both forms hidden', async () => {
    const { container } = renderPage();
    await screen.findAllByText('חלון הזזה');

    const addButton = screen.getByRole('button', { name: ADD_LABEL });
    // The visible lines table, not the off-screen share-image copy of the quote at the top.
    const linesTable = container.querySelector('.card table')!;
    const totals = container.querySelector('.totals-panel')!;
    expect(before(addButton, linesTable)).toBe(true);
    expect(before(linesTable, totals)).toBe(true);
    // the add-item form and the quote-details form
    expect(container.querySelectorAll('[hidden]').length).toBe(2);
  });

  it('opens the add form from the button, and hides it again on cancel', async () => {
    const { container } = renderPage();
    await screen.findAllByText('חלון הזזה');

    fireEvent.click(screen.getByRole('button', { name: ADD_LABEL }));
    expect(screen.getByRole('heading', { name: ADD_LABEL })).toBeTruthy();
    expect(screen.queryByRole('button', { name: ADD_LABEL })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    await waitFor(() => expect(container.querySelectorAll('[hidden]').length).toBe(2));
    expect(screen.getByRole('button', { name: ADD_LABEL })).toBeTruthy();
  });

  it('opens the form in edit mode when editing a line', async () => {
    renderPage();
    await screen.findAllByText('חלון הזזה');

    fireEvent.click(screen.getByRole('button', { name: 'עריכה' }));

    expect(screen.getByRole('heading', { name: 'עריכת פתח' })).toBeTruthy();
  });

  it('shows the customer and title as a summary, with the fields behind an edit button', async () => {
    const { container } = renderPage();
    await screen.findAllByText('חלון הזזה');

    expect(screen.getAllByText('דוד לוי').length).toBeGreaterThan(0);
    expect(screen.getByText('דירה ברמת גן')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'עריכת פרטי הצעה' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'עריכת פרטי הצעה' }));
    expect(screen.queryByRole('button', { name: 'עריכת פרטי הצעה' })).toBeNull();
    expect(container.querySelectorAll('[hidden]').length).toBe(1);
  });

  it('saves the quote details with the שמור button and closes the fields', async () => {
    renderPage();
    await screen.findAllByText('חלון הזזה');

    fireEvent.click(screen.getByRole('button', { name: 'עריכת פרטי הצעה' }));
    fireEvent.click(screen.getByRole('button', { name: 'שמור' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith(
      '/businesses/b1/projects/p1',
      expect.objectContaining({ customer_id: 'c1', title: 'דירה ברמת גן', discount_pct: 0 })
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'עריכת פרטי הצעה' })).toBeTruthy());
  });

  it('offers to add a customer when the quote has none', async () => {
    state.project = { ...(quoteProject as object), customer_id: null, customer_name: null };
    renderPage();
    await screen.findAllByText('חלון הזזה');

    expect(screen.getByText('לא נבחר לקוח')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'הוסף לקוח / פרטי הצעה' })).toBeTruthy();
  });

  it('has no add button once the quote is no longer a draft', async () => {
    state.project = { ...(quoteProject as object), status: 'sent' };
    renderPage();
    await screen.findAllByText('חלון הזזה');

    expect(screen.queryByRole('button', { name: ADD_LABEL })).toBeNull();
    expect(screen.queryByRole('button', { name: 'עריכה' })).toBeNull();
  });
});

// Real request: a business owner wants to give a discount, or cut labor, on one specific item
// in a quote instead of touching the whole quote's labor%/discount%.
describe('ProjectDetailPage — per-item labor/discount overrides', () => {
  it('sends the override fields when adding an item, and null when left blank', async () => {
    renderPage();
    await screen.findAllByText('חלון הזזה');
    fireEvent.click(screen.getByRole('button', { name: ADD_LABEL }));

    // combobox[0] is the always-visible quote-status select, above the item form.
    const [, openingTypeSelect, profileSystemSelect, glassTypeSelect] = screen.getAllByRole('combobox');
    fireEvent.change(openingTypeSelect, { target: { value: 'ot1' } });
    fireEvent.change(profileSystemSelect, { target: { value: 'ps1' } });
    fireEvent.change(glassTypeSelect, { target: { value: 'gt1' } });
    // Scoped to the item form's own card, so the (hidden) quote-details form's own number
    // input (discount_pct) can't shift these indices.
    const itemForm = screen.getByRole('heading', { name: ADD_LABEL }).closest('.card')!;
    const numberInputs = itemForm.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: '1000' } }); // width
    fireEvent.change(numberInputs[1], { target: { value: '1000' } }); // height
    fireEvent.change(numberInputs[3], { target: { value: '60' } }); // labor override
    // discount override (numberInputs[4]) left blank on purpose

    fireEvent.click(screen.getByRole('button', { name: 'שמור' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith(
      '/businesses/b1/projects/p1/openings',
      expect.objectContaining({ labor_pct_override: 60, discount_pct_override: null })
    );
  });

  it('shows a note on a line that has its own labor%/discount%, and nothing on a plain line', async () => {
    state.project = {
      ...(quoteProject as object),
      openings: [{ ...quoteProject.openings[0], labor_pct_override: 60, discount_pct_override: null }],
    };
    const { container } = renderPage();
    await screen.findAllByText('חלון הזזה');

    expect(container.querySelector('.card table')!.textContent).toContain('עבודה 60%');
    expect(container.querySelector('.card table')!.textContent).not.toContain('הנחה');
  });
});

// Real regression this had to avoid: an opening type with no glass component (a net, a shutter)
// must never be forced to pick one, and must never silently get a glass surcharge.
describe('ProjectDetailPage — an opening type with no glass component', () => {
  it('hides the glass-type field once such a type is selected, and adds the item without one', async () => {
    renderPage();
    await screen.findAllByText('חלון הזזה');
    fireEvent.click(screen.getByRole('button', { name: ADD_LABEL }));

    expect(screen.getAllByRole('combobox').length).toBe(4); // status + type + profile + glass

    const [, openingTypeSelect, profileSystemSelect] = screen.getAllByRole('combobox');
    fireEvent.change(openingTypeSelect, { target: { value: 'ot2' } }); // רשת, has_glass: false

    expect(screen.getAllByRole('combobox').length).toBe(3); // glass select is gone

    fireEvent.change(profileSystemSelect, { target: { value: 'ps1' } });
    const itemForm = screen.getByRole('heading', { name: ADD_LABEL }).closest('.card')!;
    const numberInputs = itemForm.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: '1000' } }); // width
    fireEvent.change(numberInputs[1], { target: { value: '1000' } }); // height
    fireEvent.click(screen.getByRole('button', { name: 'שמור' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/businesses/b1/projects/p1/openings', expect.objectContaining({ glass_type_id: '' }))
    );
  });
});
