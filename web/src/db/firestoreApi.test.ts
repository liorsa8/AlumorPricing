import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db as firestore } from './firebaseConfig';
import { firestoreRequest } from './firestoreApi';

// Runs against the Firebase emulator (see package.json's "test" script: firebase
// emulators:exec wraps vitest so Firestore/Auth are live at localhost before this file runs).
// firebaseConfig.ts connects to those emulators automatically in dev/test mode.

const TEST_EMAIL = 'tester@example.com';
const TEST_PASSWORD = 'test-password-123';

async function clearFirestore() {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

let businessId: string;
let openingTypeId: string;
let profileSystemId: string;
let glassTypeId: string;

async function addOpening(projectId: string) {
  return firestoreRequest<{ id: number }>('POST', `/businesses/${businessId}/projects/${projectId}/openings`, {
    opening_type_id: openingTypeId,
    profile_system_id: profileSystemId,
    glass_type_id: glassTypeId,
    width_mm: 1000,
    height_mm: 1000,
    quantity: 1,
  });
}

async function setProjectUpdatedAt(projectId: string, updatedAt: string) {
  await setDoc(doc(firestore, 'businesses', businessId, 'projects', projectId), { updated_at: updatedAt }, { merge: true });
}

const OLD_TIMESTAMP = () => new Date(Date.now() - 20 * 60 * 1000).toISOString();

// Regression coverage for a real bug: the empty-draft cleanup swept a brand-new quote out
// from under someone who was still actively filling it in, because "just created" and
// "abandoned" both looked like "no customer, no openings" at the time. Fixed with a grace
// period — these tests pin that behavior down so it can't quietly regress. Ported from the
// Dexie-era localApi.test.ts onto the same firestoreRequest entry point, now against a real
// (emulated) Firestore business.
describe('empty draft cleanup', () => {
  beforeAll(async () => {
    try {
      await createUserWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
    } catch {
      await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
    }
  });

  beforeEach(async () => {
    await clearFirestore();
    if (!auth.currentUser) await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);

    const business = await firestoreRequest<{ id: string }>('POST', '/businesses', {});
    businessId = business.id;
    const openingType = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/opening-types`, {
      name_he: 'סוג בדיקה',
      code: 'test',
      profile_factor: 3,
      glass_area_ratio: 0.8,
      sort_order: 0,
    });
    openingTypeId = openingType.id;
    const profileSystem = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/profile-systems`, {
      name_he: 'מערכת בדיקה',
      series_code: 'T',
      manufacturer: null,
      price_per_meter: 50,
    });
    profileSystemId = profileSystem.id;
    const glassType = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/glass-types`, {
      name_he: 'זכוכית בדיקה',
      thickness_mm: '4',
      price_per_sqm: 200,
    });
    glassTypeId = glassType.id;
  });

  it('keeps a brand-new empty draft even if the quotes list is viewed', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/projects`, {});

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('lets an opening still be added to a brand-new draft after a list view', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/projects`, {});
    await firestoreRequest('GET', `/businesses/${businessId}/projects`); // exactly what used to delete it

    const opening = await addOpening(project.id);

    expect(opening.id).toBeDefined();
  });

  it('removes a genuinely old empty draft', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/projects`, {});
    await setProjectUpdatedAt(project.id, OLD_TIMESTAMP());

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(false);
  });

  it('never removes a draft that has a customer, no matter how old', async () => {
    const customer = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/customers`, {
      name: 'לקוח בדיקה',
    });
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/projects`, {});
    await firestoreRequest('PUT', `/businesses/${businessId}/projects/${project.id}`, { customer_id: customer.id });
    await setProjectUpdatedAt(project.id, OLD_TIMESTAMP());

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('never removes an old draft that has an opening but no customer', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/projects`, {});
    await addOpening(project.id);
    await setProjectUpdatedAt(project.id, OLD_TIMESTAMP());

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('keeps a draft alive past the original grace period if it was edited more recently', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${businessId}/projects`, {});
    // Touching the draft (e.g. typing a title) bumps updated_at without setting a customer
    // or adding an opening — it should still count as recent activity, not "abandoned".
    await firestoreRequest('PUT', `/businesses/${businessId}/projects/${project.id}`, { title: 'עבודה בהתחלה' });

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });
});
