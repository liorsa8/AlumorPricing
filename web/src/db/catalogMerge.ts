export interface CatalogRow {
  id: string;
  is_active: number;
  name_he: string;
  [key: string]: unknown;
}

// merged = every global item, shadowed by a same-id business override when one exists (or
// removed, if the override is a soft-deactivation), plus every override whose id has no
// matching global item (a wholly business-owned addition). Each returned row is stamped with
// forked_from_global — true only when an override actually shadows that global item — so
// callers (catalog CRUD pages) can tell "already forked, offer revert-to-default" apart from
// "still the plain global value" without a second round-trip to re-fetch the global collection
// themselves.
export function mergeCatalog<T extends CatalogRow>(globalItems: T[], overrides: T[]): (T & { forked_from_global: boolean })[] {
  const overridesById = new Map(overrides.map((o) => [o.id, o]));
  const globalIds = new Set(globalItems.map((g) => g.id));
  const merged = globalItems.map((g) => {
    const override = overridesById.get(g.id);
    return override ? { ...override, forked_from_global: true } : { ...g, forked_from_global: false };
  });
  const custom = overrides.filter((o) => !globalIds.has(o.id)).map((o) => ({ ...o, forked_from_global: false }));
  return [...merged, ...custom];
}
