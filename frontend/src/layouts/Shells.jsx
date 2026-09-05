import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ProjectProvider, useProject } from '../context/ProjectContext';
import { Button, ErrorState, LoadingState } from '../components/ui';

const APP_NAV = [
  { to: '/app', label: 'Dashboard', end: true },
];

const PROJECT_NAV = [
  { path: 'overview', label: 'Overview' },
  { path: 'files', label: 'Files' },
  { path: 'architecture', label: 'Architecture' },
  { path: 'issues', label: 'Issues' },
  { path: 'ai', label: 'AI Assistant' },
  { path: 'security', label: 'Security' },
  { path: 'impact', label: 'Impact' },
  { path: 'root-cause', label: 'Root Cause' },
  { path: 'validation', label: 'Validation' },
  { path: 'versions', label: 'Versions' },
  { path: 'export', label: 'Export' },
];

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">TB</span>
          TechBridge AI
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function AppFrame({ children, projectId }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="row">
          <Button variant="ghost" size="sm" onClick={() => setNavOpen((v) => !v)} aria-label="Toggle navigation">
            Menu
          </Button>
          <div className="brand">
            <span className="brand-mark">TB</span>
            TechBridge AI
          </div>
        </div>
        <div className="topbar-right">
          <span className="muted">{user?.name}</span>
          <div className="user-menu">
            <Button size="sm" onClick={() => setMenu((v) => !v)}>
              Account
            </Button>
            {menu ? (
              <div className="menu">
                <div className="muted" style={{ padding: 8 }}>{user?.email}</div>
                <Button
                  variant="ghost"
                  style={{ width: '100%' }}
                  onClick={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  Log out
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="shell-body">
        <nav className={`sidebar ${navOpen ? 'open' : ''}`}>
          <div className="nav-label">Workspace</div>
          {APP_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setNavOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          {projectId ? (
            <>
              <div className="nav-label">Project</div>
              {PROJECT_NAV.map((item) => (
                <NavLink
                  key={item.path}
                  to={`/app/projects/${projectId}/${item.path}`}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setNavOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </>
          ) : null}
        </nav>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }) {
  return <AppFrame>{children}</AppFrame>;
}

function ProjectGate() {
  const { project, loading, error } = useProject();
  if (loading) return <LoadingState label="Loading project…" />;
  if (error) return <ErrorState message={error} />;
  if (!project) return <ErrorState message="Project was not found." />;
  return <Outlet />;
}

export function ProjectLayout() {
  const { projectId } = useParams();
  return (
    <ProjectProvider>
      <AppFrame projectId={projectId}>
        <ProjectGate />
      </AppFrame>
    </ProjectProvider>
  );
}
