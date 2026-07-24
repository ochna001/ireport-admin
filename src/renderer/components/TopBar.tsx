import { ChevronRight, LogOut, Settings as SettingsIcon, UserCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

interface PageMeta {
  title: string;
  parent?: { label: string; to: string };
}

const ROUTE_META: Record<string, PageMeta> = {
  dashboard: { title: 'Dashboard' },
  incidents: { title: 'Incidents' },
  agencies: { title: 'Agencies' },
  reports: { title: 'Reports' },
  calls: { title: 'Calls' },
  'ai-analysis': { title: 'AI Analysis' },
  users: { title: 'Users' },
  settings: { title: 'Settings' },
  notifications: { title: 'Notifications' },
  logs: { title: 'Activity Logs' },
};

function resolvePageMeta(pathname: string, incidentId?: string): PageMeta {
  const segments = pathname.split('/').filter(Boolean);
  const root = segments[0] || 'dashboard';

  if (root === 'incidents' && incidentId) {
    return {
      title: 'Incident details',
      parent: { label: 'Incidents', to: '/incidents' },
    };
  }

  return ROUTE_META[root] || { title: 'iReport Admin' };
}

interface TopBarProps {
  user: any;
  onLogoutClick: () => void;
}

/**
 * Consistent top chrome for every screen: page title + breadcrumb (so the
 * current context — e.g. which incident — is visible without scrolling to
 * the page's own header), plus a compact account menu. Complements the
 * sidebar rather than duplicating its navigation.
 */
export function TopBar({ user, onLogoutClick }: TopBarProps) {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const meta = resolvePageMeta(location.pathname, params.id);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-border-token bg-surface/95 px-4 backdrop-blur">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {meta.parent && (
          <>
            <Link to={meta.parent.to} className="truncate font-medium text-fg-muted hover:text-fg-strong">
              {meta.parent.label}
            </Link>
            <ChevronRight size={14} className="shrink-0 text-fg-subtle" />
          </>
        )}
        <span className="truncate font-semibold text-fg-strong">{meta.title}</span>
      </nav>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-fg-default transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-subtle text-fg-muted">
            <UserCircle size={18} />
          </span>
          <span className="hidden max-w-[140px] truncate sm:inline">{user?.display_name || user?.role || 'Account'}</span>
        </button>

        {menuOpen && (
          <div role="menu" className="absolute right-0 top-full mt-1 w-52 overflow-hidden rounded-lg border border-border-token bg-surface shadow-xl">
            <div className="border-b border-border-token px-3 py-2">
              <p className="truncate text-sm font-semibold text-fg-strong">{user?.display_name || 'Account'}</p>
              <p className="truncate text-xs text-fg-muted">{user?.role || '—'}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); navigate('/settings'); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg-default hover:bg-surface-subtle"
            >
              <SettingsIcon size={15} /> Settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onLogoutClick(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <LogOut size={15} /> Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default TopBar;
