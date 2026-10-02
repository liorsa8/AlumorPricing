import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import RequireAuth from './auth/RequireAuth';
import LoginPage from './pages/LoginPage';
import BusinessListPage from './pages/BusinessListPage';
import ProjectsListPage from './pages/ProjectsListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectPrintPage from './pages/ProjectPrintPage';
import CustomersPage from './pages/CustomersPage';
import SettingsPage from './pages/SettingsPage';
import OpeningTypesPage from './pages/catalog/OpeningTypesPage';
import ProfileSystemsPage from './pages/catalog/ProfileSystemsPage';
import GlassTypesPage from './pages/catalog/GlassTypesPage';
import AccessoriesPage from './pages/catalog/AccessoriesPage';

export default function App() {
  return (
    <Routes>
      {/* HashRouter treats a bare visit (no #/...) as "/" — without this, <Routes> would
          have nothing to match and silently render nothing. LoginPage itself bounces an
          already-signed-in user on to /businesses, so this is always the right landing spot. */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/businesses" element={<BusinessListPage />} />
        <Route path="/b/:businessId/projects/:id/print" element={<ProjectPrintPage />} />
        <Route path="/b/:businessId" element={<AppShell />}>
          <Route index element={<ProjectsListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="catalog/opening-types" element={<OpeningTypesPage />} />
          <Route path="catalog/profile-systems" element={<ProfileSystemsPage />} />
          <Route path="catalog/glass-types" element={<GlassTypesPage />} />
          <Route path="catalog/accessories" element={<AccessoriesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
