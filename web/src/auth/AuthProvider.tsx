import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
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
  }, []);

  async function signInWithGoogle() {
    await signInWithPopup(auth, new GoogleAuthProvider());
  }

  async function signOut() {
    await firebaseSignOut(auth);
    // Query keys (['businesses'], ['project', businessId, id], ...) aren't scoped by uid, so
    // without this a second account signing in on the same device would briefly render the
    // previous user's still-cached data before its own refetch lands.
    queryClient.clear();
  }

  return <AuthContext.Provider value={{ user, loading, isAdmin, signInWithGoogle, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
