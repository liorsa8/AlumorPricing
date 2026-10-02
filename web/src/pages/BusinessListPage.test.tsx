// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BusinessListPage from './BusinessListPage';
import { api } from '../api/client';

const oneBusiness = [{ id: 'biz1', company_name: 'אלומור - ליאור' }];
const twoBusinesses = [
  { id: 'biz1', company_name: 'אלומור - ליאור' },
  { id: 'biz2', company_name: 'עסק נוסף' },
];

let businessesResponse: unknown[] = oneBusiness;

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(() => Promise.resolve(businessesResponse)),
    post: vi.fn(() => Promise.resolve({ id: 'biz-new' })),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { email: 'lior880@gmail.com', displayName: null, photoURL: null },
    signOut: vi.fn(),
  }),
}));

beforeEach(() => {
  businessesResponse = oneBusiness;
});
afterEach(cleanup);

function QuotesPageStub() {
  const { businessId } = useParams<{ businessId: string }>();
  return <div>דף הצעות מחיר של {businessId}</div>;
}

function renderPage(initialEntry: string | { pathname: string; state?: unknown } = '/businesses') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/businesses" element={<BusinessListPage />} />
          <Route path="/b/:businessId" element={<QuotesPageStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Regression: "החלפת עסק" in the nav points at /businesses so a single-business user can add a
// second one, but the auto-redirect-when-there's-only-one-business shortcut used to fire on that
// visit too, bouncing the user straight back to their quotes page — the link looked broken.
describe('BusinessListPage — single-business auto-redirect vs. manual switch', () => {
  it('redirects straight to the quotes page when landing here with exactly one business', async () => {
    renderPage('/businesses');

    expect(await screen.findByText(/דף הצעות מחיר של biz1/)).toBeTruthy();
  });

  it('does NOT redirect when navigated here via "החלפת עסק" (manualSwitch state), even with one business', async () => {
    renderPage({ pathname: '/businesses', state: { manualSwitch: true } });

    expect(await screen.findByText('אלומור - ליאור')).toBeTruthy();
    expect(screen.queryByText(/דף הצעות מחיר/)).toBeNull();
  });

  it('shows the picker (no redirect) once a second business exists', async () => {
    businessesResponse = twoBusinesses;
    renderPage('/businesses');

    expect(await screen.findByText('אלומור - ליאור')).toBeTruthy();
    expect(screen.getByText('עסק נוסף')).toBeTruthy();
    expect(screen.queryByText(/דף הצעות מחיר/)).toBeNull();
  });
});

describe('BusinessListPage — picking and creating businesses', () => {
  it('navigates to the chosen business on click', async () => {
    businessesResponse = twoBusinesses;
    renderPage({ pathname: '/businesses', state: { manualSwitch: true } });
    await screen.findByText('עסק נוסף');

    fireEvent.click(screen.getByText('עסק נוסף').closest('button')!);

    expect(await screen.findByText(/דף הצעות מחיר של biz2/)).toBeTruthy();
  });

  it('creates a new business and navigates to it', async () => {
    businessesResponse = twoBusinesses;
    renderPage({ pathname: '/businesses', state: { manualSwitch: true } });
    await screen.findByText('אלומור - ליאור');

    fireEvent.click(screen.getByText('עסק חדש').closest('button')!);
    fireEvent.change(screen.getByPlaceholderText(/שם העסק/), { target: { value: 'עסק שלישי' } });
    fireEvent.click(screen.getByRole('button', { name: 'יצירת עסק' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/businesses', expect.objectContaining({ company_name: 'עסק שלישי' }))
    );
    expect(await screen.findByText(/דף הצעות מחיר של biz-new/)).toBeTruthy();
  });
});
