// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { forgetPersistedUser, startPersistingQueries, switchPersistedUser } from './persistedQueryCache';

const KEY = (uid: string) => `alumor:query-cache:${uid}`;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  switchPersistedUser(new QueryClient(), null);
  vi.useRealTimers();
});

// Phone report: every screen waited seconds for its first Firestore answer. The last result of
// each query is kept per user on the device and restored (stale) at sign-in.
describe('persistedQueryCache', () => {
  it('remembers a successful query and restores it, stale, for the same user', async () => {
    const first = new QueryClient();
    startPersistingQueries(first);
    switchPersistedUser(first, 'u1');
    await first.fetchQuery({ queryKey: ['businesses'], queryFn: () => Promise.resolve([{ id: 'b1' }]) });
    vi.advanceTimersByTime(600);

    // a fresh page load
    const second = new QueryClient();
    switchPersistedUser(second, 'u1');

    expect(second.getQueryData(['businesses'])).toEqual([{ id: 'b1' }]);
    // updatedAt 0 = stale, so the normal refetch still runs and replaces it
    expect(second.getQueryState(['businesses'])!.dataUpdatedAt).toBe(0);
  });

  it("never restores another user's results", async () => {
    const qc = new QueryClient();
    startPersistingQueries(qc);
    switchPersistedUser(qc, 'u1');
    await qc.fetchQuery({ queryKey: ['businesses'], queryFn: () => Promise.resolve([{ id: 'b1' }]) });
    vi.advanceTimersByTime(600);

    const other = new QueryClient();
    switchPersistedUser(other, 'u2');

    expect(other.getQueryData(['businesses'])).toBeUndefined();
  });

  it('forgets the results of a signed-out user', async () => {
    const qc = new QueryClient();
    startPersistingQueries(qc);
    switchPersistedUser(qc, 'u1');
    await qc.fetchQuery({ queryKey: ['businesses'], queryFn: () => Promise.resolve([{ id: 'b1' }]) });
    vi.advanceTimersByTime(600);
    expect(localStorage.getItem(KEY('u1'))).not.toBeNull();

    forgetPersistedUser('u1');
    vi.advanceTimersByTime(600);

    expect(localStorage.getItem(KEY('u1'))).toBeNull();
  });

  it('stores nothing while nobody is signed in', async () => {
    const qc = new QueryClient();
    startPersistingQueries(qc);
    switchPersistedUser(qc, null);
    await qc.fetchQuery({ queryKey: ['x'], queryFn: () => Promise.resolve(1) });
    vi.advanceTimersByTime(600);

    expect(localStorage.length).toBe(0);
  });

  it('does not throw when storage is unavailable', async () => {
    const qc = new QueryClient();
    startPersistingQueries(qc);
    switchPersistedUser(qc, 'u1');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await qc.fetchQuery({ queryKey: ['x'], queryFn: () => Promise.resolve(1) });

    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
    vi.restoreAllMocks();
  });
});
