import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './schema';
import { localRequest } from './localApi';

async function addOpening(projectId: number) {
  const [openingTypes, profileSystems, glassTypes] = await Promise.all([
    localRequest<{ id: number }[]>('GET', '/api/opening-types'),
    localRequest<{ id: number }[]>('GET', '/api/profile-systems'),
    localRequest<{ id: number }[]>('GET', '/api/glass-types'),
  ]);
  return localRequest<{ id: number }>('POST', `/api/projects/${projectId}/openings`, {
    opening_type_id: openingTypes[0].id,
    profile_system_id: profileSystems[0].id,
    glass_type_id: glassTypes[0].id,
    width_mm: 1000,
    height_mm: 1000,
    quantity: 1,
  });
}

const OLD_TIMESTAMP = () => new Date(Date.now() - 20 * 60 * 1000).toISOString();

// Regression coverage for a real bug: the empty-draft cleanup swept a brand-new quote out
// from under someone who was still actively filling it in, because "just created" and
// "abandoned" both looked like "no customer, no openings" at the time. Fixed with a grace
// period — these tests pin that behavior down so it can't quietly regress.
describe('empty draft cleanup', () => {
  // Only clear per-quote business data between tests — the catalog/settings tables seed
  // once (memoized) on first use, so wiping them here would leave later tests with no
  // settings row and no catalog to reference.
  beforeEach(async () => {
    await Promise.all(
      [db.projects, db.openings, db.opening_accessories, db.customers].map((table) => table.clear())
    );
  });

  it('keeps a brand-new empty draft even if the quotes list is viewed', async () => {
    const project = await localRequest<{ id: number }>('POST', '/api/projects', {});

    const list = await localRequest<{ id: number }[]>('GET', '/api/projects');

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('lets an opening still be added to a brand-new draft after a list view', async () => {
    const project = await localRequest<{ id: number }>('POST', '/api/projects', {});
    await localRequest('GET', '/api/projects'); // exactly what used to delete it

    const opening = await addOpening(project.id);

    expect(opening.id).toBeDefined();
  });

  it('removes a genuinely old empty draft', async () => {
    const project = await localRequest<{ id: number }>('POST', '/api/projects', {});
    await db.projects.update(project.id, { updated_at: OLD_TIMESTAMP() });

    const list = await localRequest<{ id: number }[]>('GET', '/api/projects');

    expect(list.some((p) => p.id === project.id)).toBe(false);
  });

  it('never removes a draft that has a customer, no matter how old', async () => {
    const customer = await localRequest<{ id: number }>('POST', '/api/customers', { name: 'לקוח בדיקה' });
    const project = await localRequest<{ id: number }>('POST', '/api/projects', {});
    await localRequest('PUT', `/api/projects/${project.id}`, { customer_id: customer.id });
    await db.projects.update(project.id, { updated_at: OLD_TIMESTAMP() });

    const list = await localRequest<{ id: number }[]>('GET', '/api/projects');

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('never removes an old draft that has an opening but no customer', async () => {
    const project = await localRequest<{ id: number }>('POST', '/api/projects', {});
    await addOpening(project.id);
    await db.projects.update(project.id, { updated_at: OLD_TIMESTAMP() });

    const list = await localRequest<{ id: number }[]>('GET', '/api/projects');

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });

  it('keeps a draft alive past the original grace period if it was edited more recently', async () => {
    const project = await localRequest<{ id: number }>('POST', '/api/projects', {});
    await db.projects.update(project.id, { created_at: OLD_TIMESTAMP() });
    // Touching the draft (e.g. typing a title) bumps updated_at without setting a customer
    // or adding an opening — it should still count as recent activity, not "abandoned".
    await localRequest('PUT', `/api/projects/${project.id}`, { title: 'עבודה בהתחלה' });

    const list = await localRequest<{ id: number }[]>('GET', '/api/projects');

    expect(list.some((p) => p.id === project.id)).toBe(true);
  });
});
