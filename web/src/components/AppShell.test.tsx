// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from './AppShell';
import BusinessListPage from '../pages/BusinessListPage';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(() => Promise.resolve([{ id: 'biz1', company_name: 'אלומור - ליאור' }])),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'lior880@gmail.com', displayName: null, photoURL: null }, signOut: vi.fn() }),
}));

afterEach(cleanup);

function renderApp() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/b/biz1']}>
        <Routes>
          <Route path="/businesses" element={<BusinessListPage />} />
          <Route path="/b/:businessId" element={<AppShell />}>
            <Route index element={<div>הצעות מחיר של biz1</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Regression: with only one business, clicking "החלפת עסק" bounced straight back to the quotes
// page instead of showing the business picker — BusinessListPage's single-business shortcut
// couldn't tell an explicit "switch business" click apart from a fresh post-login landing.
describe('AppShell — "החלפת עסק" reaches the business picker', () => {
  it('shows the business list instead of redirecting back, even with one business', async () => {
    renderApp();
    await screen.findByText('הצעות מחיר של biz1');

    fireEvent.click(screen.getByRole('link', { name: 'החלפת עסק' }));

    expect(await screen.findByText('אלומור - ליאור')).toBeTruthy();
    expect(screen.queryByText('הצעות מחיר של biz1')).toBeNull();
  });
});
