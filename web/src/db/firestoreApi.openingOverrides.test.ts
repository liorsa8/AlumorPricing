import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { firestoreRequest } from './firestoreApi';
import { clearFirestore, signUpOrSignIn, ensureSignedIn, setupBusinessWithCatalog, TestCatalogIds } from './firestoreTestHelpers';

// Runs against the Firebase emulator — see firestoreApi.test.ts's header comment.

const TEST_EMAIL = 'tester-overrides@example.com';
const TEST_PASSWORD = 'test-password-123';

let ids: TestCatalogIds;

beforeAll(() => signUpOrSignIn(TEST_EMAIL, TEST_PASSWORD));
beforeEach(async () => {
  await clearFirestore();
  await ensureSignedIn(TEST_EMAIL, TEST_PASSWORD);
  ids = await setupBusinessWithCatalog();
});

interface OpeningDto {
  id: number;
  labor_pct_override: number | null;
  discount_pct_override: number | null;
}
interface ProjectDto {
  id: string;
  material_subtotal: number;
  labor_amount: number;
  installation_amount: number;
  discount_amount: number;
  pre_vat_total: number;
  vat_amount: number;
  total: number;
  openings: OpeningDto[];
}

function addOpeningWithOverrides(
  projectId: string,
  overrides: { labor_pct_override?: number | null; discount_pct_override?: number | null; label?: string }
) {
  return firestoreRequest<OpeningDto>('POST', `/businesses/${ids.businessId}/projects/${projectId}/openings`, {
    opening_type_id: ids.openingTypeId,
    profile_system_id: ids.profileSystemId,
    glass_type_id: ids.glassTypeId,
    width_mm: 1000,
    height_mm: 1000,
    quantity: 1,
    ...overrides,
  });
}

// Real request from the shop owner: a big job's labor cut on one item, or a discount on just
// one item, instead of touching the whole quote's labor%/discount%. The test catalog's setup
// (opening type 110 ₪/מ"ר + glass 200 ₪/מ"ר, on a 1x1m opening) always gives a 310 ₪
// material line — business defaults are labor 100%, installation 10%, so with no override at
// all a line comes to 310 + 310 + 31 = 651 before any discount.
describe('per-opening labor%/discount% overrides', () => {
  it("uses the opening's own labor% instead of the quote's, without touching material_subtotal", async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    await addOpeningWithOverrides(project.id, { labor_pct_override: 50 });

    const detail = await firestoreRequest<ProjectDto>('GET', `/businesses/${ids.businessId}/projects/${project.id}`);

    expect(detail.material_subtotal).toBeCloseTo(310); // material cost itself never changes
    expect(detail.labor_amount).toBeCloseTo(155); // 310 * 50%, not the business's 100%
    expect(detail.installation_amount).toBeCloseTo(31); // installation stays project-wide
    expect(detail.pre_vat_total).toBeCloseTo(496); // 310 + 155 + 31
  });

  it("replaces the quote's own discount for just that line, leaving other lines at the quote rate", async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    await firestoreRequest('PUT', `/businesses/${ids.businessId}/projects/${project.id}`, { discount_pct: 10 });
    await addOpeningWithOverrides(project.id, { label: 'no override' }); // uses the quote's 10%
    await addOpeningWithOverrides(project.id, { label: 'no discount here', discount_pct_override: 0 });

    const detail = await firestoreRequest<ProjectDto>('GET', `/businesses/${ids.businessId}/projects/${project.id}`);

    // Each line: 310 + 310 + 31 = 651 before discount.
    // Line A: 651 * 10% = 65.1 discount -> 585.9. Line B: 0 discount -> 651.
    expect(detail.discount_amount).toBeCloseTo(65.1);
    expect(detail.pre_vat_total).toBeCloseTo(585.9 + 651);
  });

  it('reverts to the quote defaults once the override is explicitly cleared (set to null)', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    const opening = await addOpeningWithOverrides(project.id, { discount_pct_override: 50 });

    await firestoreRequest(
      'PUT',
      `/businesses/${ids.businessId}/projects/${project.id}/openings/${opening.id}`,
      { discount_pct_override: null }
    );

    const detail = await firestoreRequest<ProjectDto>('GET', `/businesses/${ids.businessId}/projects/${project.id}`);
    const updated = detail.openings.find((o) => o.id === opening.id)!;

    expect(updated.discount_pct_override).toBeNull();
    expect(detail.discount_amount).toBeCloseTo(0); // back to the quote's own (default 0%) discount
  });

  it('leaves an existing override untouched when a later PUT omits it entirely', async () => {
    const project = await firestoreRequest<{ id: string }>('POST', `/businesses/${ids.businessId}/projects`, {});
    const opening = await addOpeningWithOverrides(project.id, { labor_pct_override: 40 });

    // Only touching the label — the same "don't drop what the body didn't send" contract as the
    // concurrent-edit fix in firestoreApi.test.ts.
    await firestoreRequest('PUT', `/businesses/${ids.businessId}/projects/${project.id}/openings/${opening.id}`, {
      label: 'מטבח',
    });

    const detail = await firestoreRequest<ProjectDto>('GET', `/businesses/${ids.businessId}/projects/${project.id}`);
    const updated = detail.openings.find((o) => o.id === opening.id)!;

    expect(updated.labor_pct_override).toBe(40);
  });
});
