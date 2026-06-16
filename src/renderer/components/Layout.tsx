import {
  BarChart3,
  Building2,
  Clock,
  FileText,
  LayoutDashboard,
  RefreshCw,
  Settings,
  Users,
  Wifi,
  BrainCircuit,
  WifiOff,
  LogOut,
  UserCircle,
  MapPin,
  Shield,
  Bell,
  History,
  PhoneCall,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Notifications } from './Notifications';
import CallRinger from './CallRinger';
import { getSessionScope } from '../utils/sessionScope';

interface SyncStatus {
  connected: boolean;
  lastSync: string | null;
  pending: number;
  syncing: boolean;
}

interface LayoutProps {
  onLogout: () => void;
}

function Layout({ onLogout }: LayoutProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    connected: false,
    lastSync: null,
    pending: 0,
    syncing: false,
  });
  const [ringMuted, setRingMuted] = useState<boolean>(
    () => localStorage.getItem('ireport_call_muted') === 'true',
  );
  const [hasIncomingCalls, setHasIncomingCalls] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('ireport_admin_current_user');
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Failed to parse user', e);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Check if API is available
    if (!window.api) {
      console.error('window.api not available');
      return;
    }

    // Get initial sync status
    window.api.getSyncStatus().then(setSyncStatus).catch(console.error);

    // Get initial sync status
    window.api.getSyncStatus().then(setSyncStatus).catch(console.error);

    // Listen for sync status updates
    const unSync = window.api.onSyncStatus((status) => {
      setSyncStatus(status);
    });

    // Get initial unread count — mirrors NotificationsPage's filtering logic
    // so the badge reflects the same notifications the page actually shows.
    const loadUnread = async () => {
      const scope = getSessionScope();
      try {
        const raw = await window.api.getNotificationsByUser(scope.userId || '');
        const unread = raw.filter((n: any) => {
          if (n.is_read) return false;
          // Mirror isAdminRelevant from NotificationsPage
          const body = n.body?.toLowerCase() ?? '';
          const title = n.title?.toLowerCase() ?? '';
          if (body.startsWith('your incident report status has been changed')) return false;
          if (body.startsWith('your incident status has been updated')) return false;
          if (body.startsWith('your report has been')) return false;
          if (title === 'new incident assignment' && body.startsWith('you have been assigned')) return false;
          return true;
        });
        setUnreadCount(unread.length);
      } catch (e) {
        console.error('Failed to load unread count', e);
      }
    };
    loadUnread();

    // Listen for real-time notifications from main process push service
    const unNotif = window.api.onNewNotification(() => {
      // Always reload from server — optimistic +1 can desync when
      // the push notification isn't relevant to this user's scope
      loadUnread();
    });

    // Listen for notification read events dispatched by NotificationsPage/dropdown
    const handleRead = () => loadUnread();
    window.addEventListener('notifications-read', handleRead);

    // Poll for unread count every 30s
    const pollInterval = setInterval(loadUnread, 30000);

    return () => {
      unSync();
      unNotif();
      window.removeEventListener('notifications-read', handleRead);
      clearInterval(pollInterval);
    };
  }, []);

  // Global call session polling for ringtone
  useEffect(() => {
    if (!window.api?.listCallSessions) return;

    const poll = async () => {
      try {
        const rows = await window.api.listCallSessions({ status: undefined, limit: 200 });
        const incoming = (Array.isArray(rows) ? rows : []).some(
          (s: any) => s.status === 'initiated' || s.status === 'ringing',
        );
        setHasIncomingCalls(incoming);
      } catch {}
    };

    poll();
    const timer = setInterval(poll, 4000);
    return () => clearInterval(timer);
  }, []);

  const toggleRingMute = useCallback(() => {
    setRingMuted((prev) => {
      const next = !prev;
      localStorage.setItem('ireport_call_muted', String(next));
      return next;
    });
  }, []);

  const scope = useMemo(() => getSessionScope(), []);

  const performLogout = async () => {
      console.log('[LOGOUT] ========== LOGOUT INITIATED ==========');
      console.log('[LOGOUT] Current user:', user);
      console.log('[LOGOUT] localStorage auth:', localStorage.getItem('ireport_admin_auth'));

      // Clear backend caches
      try {
        console.log('[LOGOUT] Calling window.api.logout()');
        await window.api.logout?.();
        console.log('[LOGOUT] Backend logout complete');
      } catch (e) {
        console.error('[LOGOUT] Backend logout error:', e);
      }

      // Clear local storage
      console.log('[LOGOUT] Clearing localStorage');
      localStorage.removeItem('ireport_admin_auth');
      localStorage.removeItem('ireport_admin_current_user');
      console.log('[LOGOUT] localStorage cleared');

      // Call parent onLogout to update auth state
      console.log('[LOGOUT] Calling onLogout callback');
      onLogout();

      // Navigate to login page instead of reloading
      console.log('[LOGOUT] Navigating to /login');
      navigate('/login', { replace: true });
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const handleManualSync = async () => {
    setSyncStatus((prev) => ({ ...prev, syncing: true }));
    try {
      await window.api.syncNow();
      const latestStatus = await window.api.getSyncStatus();
      setSyncStatus(latestStatus);
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus((prev) => ({ ...prev, syncing: false }));
    }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const lastSyncMs = new Date(dateStr).getTime();
    const diffSeconds = Math.max(0, Math.floor((now - lastSyncMs) / 1000));

    if (diffSeconds < 5) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getAgencyTheme = (shortName?: string) => {
    switch (shortName?.toUpperCase()) {
      case 'PNP': return 'blue';
      case 'BFP': return 'red';
      case 'MDRRMO': return 'orange';
      default: return 'blue';
    }
  };

  const themeColor = getAgencyTheme(user?.agencyShortName || user?.agencies?.short_name);
  const activeClass = `bg-${themeColor}-600 text-white`;
  const logoBgClass = `bg-${themeColor}-600`;

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 border border-gray-100 dark:border-gray-700">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-red-600 dark:text-red-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Logout?</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">You will need to sign in again to continue.</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    performLogout();
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 dark:bg-gray-900 text-white flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-1">
            <div className={`w-8 h-8 ${logoBgClass} rounded-lg flex items-center justify-center transition-colors duration-300`}>
              <Shield size={18} className="text-white" />
            </div>
            <h1 className="text-lg font-bold">{user?.role === 'Admin' ? 'iReport Control Center' : 'iReport Stations'}</h1>
          </div>
          <p className="text-xs text-gray-400">Camarines Norte LGU</p>
        </div>

        {/* User Profile Summary (Sidebar) */}
        {user && user.role !== 'Admin' && (
          <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                <UserCircle size={20} className="text-gray-400" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">{user.display_name || user.email}</p>
                <p className="text-xs text-gray-400 truncate">{user.role}</p>
              </div>
            </div>
            {(user.agencyShortName || user.agencies?.short_name) && (
              <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                <Shield size={10} />
                <span>{user.agencyShortName || user.agencies?.short_name}</span>
                {user.stationName && (
                  <>
                    <span className="text-gray-600">•</span>
                    <span className="truncate">{user.stationName}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? activeClass
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <LayoutDashboard size={20} />
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/notifications"
                className={({ isActive }) =>
                  `flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Bell size={20} />
                  Notifications
                </div>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/incidents"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <FileText size={20} />
                Incidents
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/agencies"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <Building2 size={20} />
                Agencies
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/reports"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <BarChart3 size={20} />
                Reports
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/calls"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <PhoneCall size={20} />
                Calls
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/ai-analysis"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <BrainCircuit size={20} />
                AI Analysis
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <Users size={20} />
                Users
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <Settings size={20} />
                Settings
              </NavLink>
            </li>
            {user?.role === 'Admin' && (
              <li>
                <NavLink
                  to="/logs"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                    }`
                  }
                >
                  <History size={20} />
                  Activity Logs
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        {/* Logout */}
        <div className="px-4 pb-2">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors w-full"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>

        {/* Sync Status */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {syncStatus.connected ? (
                <Wifi size={16} className="text-green-400" />
              ) : (
                <WifiOff size={16} className="text-red-400" />
              )}
              <span className="text-sm text-gray-400">
                {syncStatus.connected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <button
              onClick={handleManualSync}
              disabled={syncStatus.syncing}
              className="p-2 rounded hover:bg-gray-800 disabled:opacity-50"
              title="Sync now"
            >
              <RefreshCw
                size={16}
                className={`text-gray-400 ${syncStatus.syncing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock size={12} />
            <span>Last sync: {formatLastSync(syncStatus.lastSync)}</span>
          </div>
          {syncStatus.pending > 0 && (
            <div className="mt-2 text-xs text-yellow-400">
              {syncStatus.pending} pending changes
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Page Content */}
        <div className="flex-1 overflow-auto relative">
          <CallRinger
            active={hasIncomingCalls}
            muted={ringMuted}
            onUnmute={toggleRingMute}
          />
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;
