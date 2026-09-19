// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './AuthProvider';

type FakeUser = { uid: string; getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }> };
let authStateCallback: (user: FakeUser | null) => void | Promise<void>;

// Mocked so the test can fire fake onAuthStateChanged transitions directly, without a real
// Firebase project or emulator — this is a pure state-management regression test, not an
// integration test (that's what firestoreApi.test.ts's emulator-backed suite is for).
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(() => Promise.resolve()),
  signOut: vi.fn(() => Promise.resolve()),
  onAuthStateChanged: (_auth: unknown, cb: (user: FakeUser | null) => void | Promise<void>) => {
    authStateCallback = cb;
    return () => {};
  },
}));

vi.mock('../db/firebaseConfig', () => ({ auth: {} }));

function fakeUser(uid: string): FakeUser {
  return { uid, getIdTokenResult: () => Promise.resolve({ claims: {} }) };
}

function renderAuthProvider() {
  const queryClient = new QueryClient();
  const clearSpy = vi.spyOn(queryClient, 'clear');
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{null}</AuthProvider>
    </QueryClientProvider>
  );
  return clearSpy;
}

// Regression coverage for a real bug: queryClient.clear() used to run only from the app's own
// signOut() wrapper. Firebase Auth syncs sign-out/sign-in across every tab of the same browser,
// so a sign-out triggered in another tab reaches THIS tab's onAuthStateChanged listener
// directly, bypassing signOut() entirely — leaving stale, uid-unscoped query data (['businesses'],
// ['project', businessId, id], ...) cached for whichever account signs in next. The fix moved
// the clear into onAuthStateChanged itself, keyed on the uid actually changing.
describe('AuthProvider — query cache clearing on auth transitions', () => {
  it('clears the cache when the signed-in uid changes, even without calling signOut() directly', async () => {
    const clearSpy = renderAuthProvider();

    // First firing (page load / initial auth resolution) must not clear a cache that was never
    // populated by a previous, different user.
    await act(async () => {
      await authStateCallback(fakeUser('user-a'));
    });
    expect(clearSpy).not.toHaveBeenCalled();

    // A different uid signing in on this tab without this tab ever calling its own signOut() —
    // e.g. synced in from another tab's sign-out/sign-in — must still clear.
    await act(async () => {
      await authStateCallback(fakeUser('user-b'));
    });
    expect(clearSpy).toHaveBeenCalledTimes(1);

    // Signing out (uid -> null) is also a transition and must clear too.
    await act(async () => {
      await authStateCallback(null);
    });
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  it('does not clear the cache when the same uid fires again (e.g. a token refresh)', async () => {
    const clearSpy = renderAuthProvider();

    await act(async () => {
      await authStateCallback(fakeUser('user-a'));
    });
    await act(async () => {
      await authStateCallback(fakeUser('user-a'));
    });

    expect(clearSpy).not.toHaveBeenCalled();
  });
});
