import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';

// Firebase's web config (apiKey etc.) is meant to be public — it ends up in the built bundle
// regardless, and it's not what protects the data. Real protection is firestore.rules.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Persistent local cache so the app keeps the "works offline once installed" property it had
// before this migration — a device still needs one successful online session to populate its
// cache, and offline writes only sync once reconnected, so this narrows that regression
// rather than pretending it isn't one.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Opt-in, not automatic: `npm test` sets this (see .env.test) so the test suite always hits
// the local Firestore/Auth emulator (see firebase.json), never real data. `npm run dev` talks
// to the real project by default — set VITE_USE_FIREBASE_EMULATOR=true in web/.env.local if you
// want to point local dev at the emulator too (once it's actually running).
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}
