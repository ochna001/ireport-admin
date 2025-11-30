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
    WifiOff
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

interface SyncStatus {
  connected: boolean;
  lastSync: string | null;
  pending: number;
  syncing: boolean;
}

function Layout() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    connected: false,
    lastSync: null,
    pending: 0,
    syncing: false,
  });

  useEffect(() => {
    // Check if API is available
    if (!window.api) {
      console.error('window.api not available');
      return;
    }

    // Get initial sync status
    window.api.getSyncStatus().then(setSyncStatus).catch(console.error);

    // Listen for sync status updates
    window.api.onSyncStatus((status) => {
      setSyncStatus(status);
    });

    return () => {
      window.api?.removeAllListeners('sync-status');
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

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleTimeString();
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 dark:bg-gray-900 text-white flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold">iReport Admin</h1>
          <p className="text-xs text-gray-400 mt-1">Camarines Norte LGU</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
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
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
