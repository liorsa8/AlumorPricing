import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

// Shared by every catalog page (CatalogCrudPage and OpeningTypesPage): owns the toggle between
// the admin-only global catalog (/catalog/:kind) and this business's merged view
// (/businesses/:businessId/:kind), so each page doesn't re-derive the same endpoint switch by
// hand. Only an admin can flip into global mode at all.
export function useCatalogAdminMode(kind: string, businessId: string) {
  const { isAdmin } = useAuth();
  const [adminMode, setAdminMode] = useState(false);
  const editingGlobal = isAdmin && adminMode;
  const endpoint = editingGlobal ? `/catalog/${kind}` : `/businesses/${businessId}/${kind}`;
  return { isAdmin, adminMode, setAdminMode, editingGlobal, endpoint };
}
