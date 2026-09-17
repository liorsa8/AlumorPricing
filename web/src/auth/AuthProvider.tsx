import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '../db/firebaseConfig';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  // The previously-seen uid across onAuthStateChanged firings. 'unset' (not a valid uid or
  // null) only until the first firing, so that one — page load, cache already empty — never
  // triggers a pointless clear.
  const previousUidRef = useRef<string | null | 'unset'>('unset');

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      const nextUid = nextUser?.uid ?? null;
      // Query keys (['businesses'], ['project', businessId, id], ...) aren't scoped by uid, so a
      // switch to a different signed-in account must clear the cache — otherwise the new
      // account's screens can briefly render the previous account's still-cached data before
      // their own refetch lands. This has to live here, not just in the signOut() wrapper below:
      // Firebase Auth syncs sign-out across every tab of the same browser, so a sign-out in
      // another tab reaches THIS tab's onAuthStateChanged directly, never going through this
      // tab's own signOut() call.
      if (previousUidRef.current !== 'unset' && previousUidRef.current !== nextUid) {
        queryClient.clear();
      }
      previousUidRef.current = nextUid;

      setUser(nextUser);
      try {
        // Admin status is a custom auth claim (set only by scripts/firebase-admin/setAdminClaim.js,
        // never client-settable) baked into the ID token — refreshed here on every sign-in.
        setIsAdmin(nextUser ? (await nextUser.getIdTokenResult()).claims.admin === true : false);
      } catch {
        // A transient failure here (e.g. a network blip refreshing the ID token) must not
        // leave `loading` stuck true forever — fail closed on admin status instead.
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });
  }, [queryClient]);

  async function signInWithGoogle() {
    await signInWithPopup(auth, new GoogleAuthProvider());
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  return <AuthContext.Provider value={{ user, loading, isAdmin, signInWithGoogle, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
