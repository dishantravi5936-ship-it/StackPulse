import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  ChevronLeft,
  AlertCircle,
  Command,
  ExternalLink,
  LayoutDashboard,
  Menu,
  Moon,
  MonitorCheck,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { IconButton } from './ui';

const navigation = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/endpoints', label: 'Endpoints', icon: MonitorCheck },
  { to: '/dashboard/incidents', label: 'Incidents', icon: AlertCircle },
  { to: '/dashboard/notifications', label: 'Notifications', icon: Bell },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const leave = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <>
      <div className="brand-lockup">
        <span className="brand-mark"><Activity size={17} strokeWidth={2.5} /></span>
        <span>stack<span className="brand-light">pulse</span></span>
        <span className="brand-badge">BETA</span>
      </div>
      <div className="workspace-switcher">
        <span className="workspace-avatar">{(user?.email[0] ?? 'S').toUpperCase()}</span>
        <span className="workspace-copy">
          <strong>Workspace</strong>
          <small>{user?.email ?? 'Local monitoring'}</small>
        </span>
        <ChevronLeft size={15} className="workspace-chevron" />
      </div>
      <p className="nav-caption">MONITORING</p>
      <nav className="side-nav" aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/status" className="nav-link" onClick={() => setMobileOpen(false)}>
          <ExternalLink size={16} />
          <span>Public status</span>
        </NavLink>
        <div className="sidebar-user">
          <span className="user-avatar">{(user?.email[0] ?? 'S').toUpperCase()}</span>
          <span className="user-copy">
            <strong>{user?.email ?? 'User'}</strong>
            <small>{user?.role === 'admin' ? 'Administrator' : 'Member'}</small>
          </span>
          <button className="signout-link" onClick={leave}>Sign out</button>
        </div>
      </div>
    </>
  );

  return (
    <div className="app-frame">
      <aside className="desktop-sidebar">{sidebar}</aside>
      {mobileOpen && (
        <div className="mobile-sidebar-layer">
          <button className="mobile-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
          <aside className="mobile-sidebar">
            <IconButton label="Close navigation" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></IconButton>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-leading">
            <IconButton label="Open navigation" className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={19} /></IconButton>
            <span className="breadcrumb-root">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <span className="breadcrumb-current">{navigation.find((item) => item.to === location.pathname)?.label ?? (location.pathname.includes('/endpoints/') ? 'Endpoint detail' : location.pathname.includes('/incidents/') ? 'Incident detail' : 'Overview')}</span>
          </div>
          <div className="topbar-actions">
            <span className="connection-indicator"><i /> Live polling</span>
            <IconButton label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
            <span className="topbar-divider" />
            <button className="shortcut-button" onClick={() => navigate('/dashboard/endpoints')} aria-label="Manage endpoints">
              <Command size={13} /> <span>E</span>
            </button>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>StackPulse · Monitoring you can trust</span>
          <span>Data refreshes automatically every 15 seconds</span>
        </footer>
      </div>
    </div>
  );
}
