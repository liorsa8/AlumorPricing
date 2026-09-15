import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

// adminOnly gates a route behind the isAdmin claim (e.g. a future admin-only page) — none of
// today's routes need it yet, since admin mode inside CatalogCrudPage/OpeningTypesPage is a
// toggle within an otherwise-normal page, not a separate route.
export default function RequireAuth({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/businesses" replace />;

  return <Outlet />;
}
