// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomersPage from './CustomersPage';

const customers = [{ id: 'c1', name: 'דוד לוי', phone: '050', email: null, address: null, notes: null }];

vi.mock('../api/client', () => ({
  api: { get: vi.fn(() => Promise.resolve(customers)), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

afterEach(cleanup);

function renderPage() {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/b/biz1/customers']}>
        <Routes>
          <Route path="/b/:businessId/customers" element={<CustomersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Phone layout regression: the form used to sit above the list, pushing the list off-screen.
// It must stay hidden behind an "add" button until asked for.
describe('CustomersPage — list first, form on demand', () => {
  it('shows the list and an add button, with the form hidden', async () => {
    const { container } = renderPage();

    expect(await screen.findByText('דוד לוי')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'הוסף לקוח' })).toBeTruthy();
    expect(container.querySelector('.card[hidden]')).not.toBeNull();
  });

  it('opens the form on "add" and hides it again on cancel', async () => {
    const { container } = renderPage();
    await screen.findByText('דוד לוי');

    fireEvent.click(screen.getByRole('button', { name: 'הוסף לקוח' }));
    expect(container.querySelector('.card[hidden]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'הוסף לקוח' })).toBeNull();
    expect(screen.getByRole('button', { name: 'שמור' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    await waitFor(() => expect(container.querySelector('.card[hidden]')).not.toBeNull());
    expect(screen.getByRole('button', { name: 'הוסף לקוח' })).toBeTruthy();
  });

  it('opens the form pre-filled when editing a row', async () => {
    const { container } = renderPage();
    await screen.findByText('דוד לוי');

    fireEvent.click(screen.getByRole('button', { name: 'עריכה' }));

    expect(container.querySelector('.card[hidden]')).toBeNull();
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('דוד לוי');
  });
});
