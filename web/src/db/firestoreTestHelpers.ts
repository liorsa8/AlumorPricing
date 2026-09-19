import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { firestoreRequest } from './firestoreApi';

// Shared by every firestoreApi.*.test.ts file — all run against the same Firebase emulator
// (see package.json's "test" script: firebase emulators:exec wraps vitest so Firestore/Auth
// are live at localhost before any of these files run).

export const EMULATOR_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;

export async function clearFirestore() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

// Creates the test user on first call (across the whole suite), signs in on every later one.
export async function signUpOrSignIn(email: string, password: string) {
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch {
    await signInWithEmailAndPassword(auth, email, password);
  }
}

// clearFirestore() doesn't touch Auth, but a suite-wide sign-in can still be lost between
// files/workers — re-sign-in only if needed, to avoid a redundant round trip on every test.
export async function ensureSignedIn(email: string, password: string) {
  if (!auth.currentUser) await signInWithEmailAndPassword(auth, email, password);
}

export interface TestCatalogIds {
  businessId: string;
  openingTypeId: string;
  profileSystemId: string;
  glassTypeId: string;
}

// A fresh business plus one business-owned catalog item of each simple kind (via POST, not the
// global catalog) — everything a project/opening test needs, without caring whether the items
// are forked.
export async function setupBusinessWithCatalog(): Promise<TestCatalogIds> {
  const business = await firestoreRequest<{ id: string }>('POST', '/businesses', {});
  const businessId = business.id;
  const [openingType, profileSystem, glassType] = await Promise.all([
    firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/opening-types`, {
      name_he: 'סוג בדיקה',
      code: 'test',
      profile_factor: 3,
      glass_area_ratio: 0.8,
      sort_order: 0,
    }),
    firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/profile-systems`, {
      name_he: 'מערכת בדיקה',
      series_code: 'T',
      manufacturer: null,
      price_per_meter: 50,
    }),
    firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/glass-types`, {
      name_he: 'זכוכית בדיקה',
      thickness_mm: '4',
      price_per_sqm: 200,
    }),
  ]);
  return { businessId, openingTypeId: openingType.id, profileSystemId: profileSystem.id, glassTypeId: glassType.id };
}

export function addOpening(ids: TestCatalogIds, projectId: string) {
  return firestoreRequest<{ id: number }>('POST', `/businesses/${ids.businessId}/projects/${projectId}/openings`, {
    opening_type_id: ids.openingTypeId,
    profile_system_id: ids.profileSystemId,
    glass_type_id: ids.glassTypeId,
    width_mm: 1000,
    height_mm: 1000,
    quantity: 1,
  });
}
