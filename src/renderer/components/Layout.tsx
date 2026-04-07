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
    WifiOff,
    LogOut,
    UserCircle,
    MapPin,
    Shield,
    Bell
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Notifications } from './Notifications';

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    connected: false,
    lastSync: null,
    pending: 0,
    syncing: false,
  });

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
    window.api.onSyncStatus((status) => {
      setSyncStatus(status);
    });

    // Get initial unread count
    const loadUnread = async () => {
      const userStr = localStorage.getItem('ireport_admin_current_user');
      if (userStr) {
        const u = JSON.parse(userStr);
        if (u.id || u.userId) {
          try {
            const count = await window.api.getUnreadNotificationCount(u.id || u.userId);
            setUnreadCount(count);
          } catch (e) {
            console.error('Failed to load unread count', e);
          }
        }
      }
    };
    loadUnread();

    // Poll for unread count every 30s
    const pollInterval = setInterval(loadUnread, 30000);

    return () => {
      window.api?.removeAllListeners('sync-status');
      clearInterval(pollInterval);
    };
  }, []);

  const handleManualSync = async () => {
    setSyncStatus(prev => ({ ...prev, syncing: true }));
    try {
      await window.api.syncNow();
      // Status will be updated via the sync-status event
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  const handleLogout = async () => {
    if (!window.api?.confirm) {
      console.error('[LOGOUT] window.api.confirm not available');
      return;
    }

    const confirmed = (await window.api.confirm({
      message: 'Are you sure you want to logout?',
      detail: 'You will need to sign in again to continue.'
    })).confirmed;

    if (confirmed) {
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
    } else {
      console.log('[LOGOUT] Logout cancelled by user');
    }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleTimeString();
  };

  const getAgencyTheme = (shortName?: string) => {
    switch (shortName?.toUpperCase()) {
      case 'PNP': return 'blue';
      case 'BFP': return 'red';
      case 'PDRRMO': return 'orange';
      default: return 'blue';
    }
  };

  const themeColor = getAgencyTheme(user?.agencyShortName || user?.agencies?.short_name);
  const activeClass = `bg-${themeColor}-600 text-white`;
  const logoBgClass = `bg-${themeColor}-600`;

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
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
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
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
                  `flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                    isActive
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
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
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
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
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
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
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
                to="/users"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
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
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <Settings size={20} />
                Settings
              </NavLink>
            </li>
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
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;
