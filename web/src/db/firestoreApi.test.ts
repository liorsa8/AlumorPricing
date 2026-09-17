import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { doc, setDoc } from 'firebase/firestore';
import { db as firestore } from './firebaseConfig';
import { firestoreRequest } from './firestoreApi';
import { clearFirestore, signUpOrSignIn, ensureSignedIn, setupBusinessWithCatalog, addOpening, TestCatalogIds } from './firestoreTestHelpers';

// Runs against the Firebase emulator (see package.json's "test" script: firebase
// emulators:exec wraps vitest so Firestore/Auth are live at localhost before this file runs).

const TEST_EMAIL = 'tester@example.com';
const TEST_PASSWORD = 'test-password-123';

let ids: TestCatalogIds;

async function setProjectUpdatedAt(projectId: string, updatedAt: string) {
  await setDoc(doc(firestore, 'businesses', ids.businessId, 'projects', projectId), { updated_at: updatedAt }, { merge: true });
}

const OLD_TIMESTAMP = () => new Date(Date.now() - 20 * 60 * 1000).toISOString();

// Shared by every describe block below — same test user, same fresh business+catalog per test.
beforeAll(() => signUpOrSignIn(TEST_EMAIL, TEST_PASSWORD));
beforeEach(async () => {
  await clearFirestore();
  await ensureSignedIn(TEST_EMAIL, TEST_PASSWORD);
  ids = await setupBusinessWithCatalog();
});

// Regression coverage for a real bug: the empty-draft cleanup swept a brand-new quote out
// from under someone who was still actively filling it in, because "just created" and
// "abandoned" both looked like "no customer, no openings" at the time. Fixed with a grace
// period — these tests pin that behavior down so it can't quietly regress. Ported from the
// Dexie-era localApi.test.ts onto the same firestoreRequest entry point, now against a real
// (emulated) Firestore business.
describe('empty draft cleanup', () => {
  it('keeps a brand-new empty draft even if the quotes list is viewed', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${ids.businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('lets an opening still be added to a brand-new draft after a list view', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    await firestoreRequest('GET', `/businesses/${ids.businessId}/projects`); // exactly what used to delete it

    const opening = await addOpening(ids, project.id);

    expect(opening.id).toBeDefined();
  });

  it('removes a genuinely old empty draft', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    await setProjectUpdatedAt(project.id, OLD_TIMESTAMP());

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${ids.businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(false);
  });

  it('never removes a draft that has a customer, no matter how old', async () => {
    const customer = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/customers`, {
      name: 'לקוח בדיקה',
    });
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    await firestoreRequest('PUT', `/businesses/${ids.businessId}/projects/${project.id}`, { customer_id: customer.id });
    await setProjectUpdatedAt(project.id, OLD_TIMESTAMP());

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${ids.businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('never removes an old draft that has an opening but no customer', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    await addOpening(ids, project.id);
    await setProjectUpdatedAt(project.id, OLD_TIMESTAMP());

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${ids.businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('keeps a draft alive past the original grace period if it was edited more recently', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    // Touching the draft (e.g. typing a title) bumps updated_at without setting a customer
    // or adding an opening — it should still count as recent activity, not "abandoned".
    await firestoreRequest('PUT', `/businesses/${ids.businessId}/projects/${project.id}`, { title: 'עבודה בהתחלה' });

    const list = await firestoreRequest<{ id: string }[]>('GET', `/businesses/${ids.businessId}/projects`);

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });
});

// Regression coverage for a real bug: PUT .../openings/:id used to merge the request body over
// an opening snapshot read BEFORE the transaction started, so any field the body didn't touch
// fell back to that stale value — a concurrent edit to a DIFFERENT field of the same opening
// could be silently overwritten once this edit's transaction committed. Fixed by re-reading and
// re-merging entirely inside the transaction, so a retry (forced here by two edits racing) sees
// the other edit's already-committed change.
describe('concurrent opening edits', () => {
  it('does not lose one edit when two PUTs to different fields of the same opening race', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    const opening = await addOpening(ids, project.id);

    await Promise.all([
      firestoreRequest('PUT', `/businesses/${ids.businessId}/projects/${project.id}/openings/${opening.id}`, {
        width_mm: 1200,
      }),
      firestoreRequest('PUT', `/businesses/${ids.businessId}/projects/${project.id}/openings/${opening.id}`, {
        label: 'מטבח',
      }),
    ]);

    const detail = await firestoreRequest<{ openings: { id: number; width_mm: number; label: string }[] }>(
      'GET',
      `/businesses/${ids.businessId}/projects/${project.id}`
    );
    const updated = detail.openings.find((o) => o.id === opening.id)!;

    expect(updated.width_mm).toBe(1200);
    expect(updated.label).toBe('מטבח');
  });
});
