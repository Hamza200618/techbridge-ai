import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppShell, ProjectLayout } from './layouts/Shells';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { OverviewPage } from './pages/OverviewPage';
import { FilesPage } from './pages/FilesPage';
import { ArchitecturePage } from './pages/ArchitecturePage';
import { IssueDetailPage, IssuesPage } from './pages/IssuesPage';
import { AiPage } from './pages/AiPage';
import { ImpactPage, RootCausePage } from './pages/ImpactPages';
import { ExportPage, SecurityPage, ValidationPage, VersionsPage } from './pages/OpsPages';
import { LoadingState } from './components/ui';

function Protected() {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingState label="Restoring session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingState />;
  if (user) return <Navigate to="/app" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<Protected />}>
        <Route
          path="/app"
          element={
            <AppShell>
              <DashboardPage />
            </AppShell>
          }
        />
        <Route path="/app/projects" element={<Navigate to="/app" replace />} />
        <Route path="/app/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="architecture" element={<ArchitecturePage />} />
          <Route path="issues" element={<IssuesPage />} />
          <Route path="issues/:issueId" element={<IssueDetailPage />} />
          <Route path="ai" element={<AiPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="impact" element={<ImpactPage />} />
          <Route path="root-cause" element={<RootCausePage />} />
          <Route path="validation" element={<ValidationPage />} />
          <Route path="versions" element={<VersionsPage />} />
          <Route path="export" element={<ExportPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
