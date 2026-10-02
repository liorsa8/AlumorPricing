// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectPrintPage from './ProjectPrintPage';
import { formatCurrency } from '../lib/format';
import { quoteProject, quoteBusiness, TOTAL_AMOUNTS } from '../test/quoteFixtures';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn((url: string) => Promise.resolve(url.includes('/projects/') ? quoteProject : quoteBusiness)),
  },
}));

afterEach(cleanup);

function renderPreview() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/b/b1/projects/p1/print']}>
        <Routes>
          <Route path="/b/:businessId/projects/:id/print" element={<ProjectPrintPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Phone regression: in the preview the totals amounts rendered off-screen (only the labels
// were visible), because a mobile min-width rule meant for the openings table also hit the
// totals table. jsdom can't lay anything out, so these pin down the two things that keep the
// amounts on-screen: they must be in the page, and in a box the openings-table rule can't reach.
describe('ProjectPrintPage (preview)', () => {
  it('shows every totals amount next to its label', async () => {
    const { container } = renderPreview();
    await screen.findByText(/הצעת מחיר מס' 7/);

    const totals = container.querySelector('.print-totals')!;
    for (const amount of TOTAL_AMOUNTS) {
      expect(totals.textContent).toContain(formatCurrency(amount));
    }
    expect(totals.textContent).toContain('סה"כ לתשלום');
  });

  it('keeps the totals outside the horizontally-scrolling openings table', async () => {
    const { container } = renderPreview();
    await screen.findByText(/הצעת מחיר מס' 7/);

    const totals = container.querySelector('.print-totals')!;
    expect(totals.closest('.print-table-wrap')).toBeNull();
    // ...and the only table the mobile min-width rule targets is the openings one.
    expect(container.querySelector('.print-table-wrap table')).not.toBeNull();
    expect(container.querySelectorAll('.print-table-wrap table').length).toBe(1);
  });

  it('shows the openings with the customer and quote number', async () => {
    const { container } = renderPreview();
    await screen.findByText(/הצעת מחיר מס' 7/);

    expect(screen.getByText(/דוד לוי/)).toBeTruthy();
    expect(container.querySelectorAll('.print-table-wrap tbody tr').length).toBe(1);
  });
});
