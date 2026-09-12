import { Routes, Route } from 'react-router-dom';
import AppShell from './components/AppShell';
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
      <Route path="/projects/:id/print" element={<ProjectPrintPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<ProjectsListPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/catalog/opening-types" element={<OpeningTypesPage />} />
        <Route path="/catalog/profile-systems" element={<ProfileSystemsPage />} />
        <Route path="/catalog/glass-types" element={<GlassTypesPage />} />
        <Route path="/catalog/accessories" element={<AccessoriesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
