import {
    AlertTriangle,
    Bell,
    BrainCircuit,
    Bug,
    CheckCircle,
    Cpu,
    Database,
    Download,
    FileJson,
    FileSpreadsheet,
    Key,
    Lock,
    LogOut,
    Monitor,
    Moon,
    RefreshCw,
    RotateCcw,
    Save,
    Shield,
    Sun,
    Volume2,
    VolumeX,
    Wifi,
    WifiOff
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionScope } from '../utils/sessionScope';

const SETTINGS_KEY = 'ireport_admin_settings';

interface AppSettings {
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
  display: {
    theme: 'light' | 'dark';
    compactMode: boolean;
    autoRefresh: boolean;
    refreshInterval: number;
  };
  sync: {
    autoSync: boolean;
    syncInterval: number;
  };
  security: {
    debugMode: boolean;
  };
  session: {
    role?: string;
    agencyId?: number;
    agencyShortName?: string;
    stationId?: number;
    stationName?: string;
    userId?: string;
  };
}

interface AgencyOption {
  id: number;
  name: string;
  short_name: string;
}

interface StationOption {
  id: number;
  name: string;
  agency_id: number;
  agencies?: { short_name?: string; name?: string };
}

function SessionInfo() {
  const scope = useMemo(() => getSessionScope(), []);
  return (
    <>
      <p><span className="font-semibold">Role:</span> {scope.role || 'None (full access)'}</p>
      <p><span className="font-semibold">Agency:</span> {scope.agencyShortName || '—'}</p>
      <p><span className="font-semibold">Station:</span> {scope.stationName || scope.stationId || '—'}</p>
    </>
  );
}

function Settings() {
  const { role } = useMemo(() => getSessionScope(), []);
  const isAdmin = role === 'Admin';
  const [settings, setSettings] = useState<AppSettings>({
    notifications: { enabled: true, sound: true, desktop: true },
    display: { theme: 'light', compactMode: false, autoRefresh: true, refreshInterval: 30 },
    sync: { autoSync: true, syncInterval: 30 },
    security: { debugMode: false },
    session: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exporting, setExporting] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [stations, setStations] = useState<StationOption[]>([]);
  const navigate = useNavigate();

  // Load settings from localStorage on mount
  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [agencyList, stationList] = await Promise.all([
          window.api.getAgencies(),
          window.api.getAgencyStations(),
        ]);
        setAgencies(agencyList || []);
        setStations(stationList || []);
      } catch (error) {
        console.error('Failed to load agency/station options:', error);
      }
    };

    loadOptions();
  }, []);

  // Auto-save settings when they change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      
      // Apply theme
      if (settings.display.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [settings, loading]);

  const loadSettings = async () => {
    try {
      // First try localStorage
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle missing properties from old saved settings
        const scopedSession = getSessionScope();
        setSettings({
          notifications: { 
            enabled: true, 
            sound: true, 
            desktop: true,
            ...parsed.notifications 
          },
          display: { 
            theme: 'light', 
            compactMode: false, 
            autoRefresh: true, 
            refreshInterval: 30,
            ...parsed.display 
          },
          sync: { 
            autoSync: true, 
            syncInterval: 30,
            ...parsed.sync 
          },
          security: { 
            debugMode: false,
            ...parsed.security 
          },
          session: { ...(scopedSession || {}) },
        });
      } else {
        // Fallback to API defaults
        const data = await window.api.getSettings();
        const scopedSession = getSessionScope();
        setSettings({
          notifications: { enabled: true, sound: true, desktop: true, ...data?.notifications },
          display: { theme: 'light', compactMode: false, autoRefresh: true, refreshInterval: 30, ...data?.display },
          sync: { autoSync: true, syncInterval: 30, ...data?.sync },
          security: { debugMode: false, ...data?.security },
          session: { ...(scopedSession || {}) },
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.api.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const scope = getSessionScope();
      const filters: any = {};
      if (scope.role === 'Chief' && scope.stationId) {
        filters.stationId = scope.stationId;
        if (scope.agencyShortName) {
          filters.agency = scope.agencyShortName.toLowerCase();
        }
      }

      const data = await window.api.exportIncidents({ format: exportFormat, filters });
      
      // Create download
      const blob = new Blob([data], { 
        type: exportFormat === 'csv' ? 'text/csv' : 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incidents_export_${new Date().toISOString().split('T')[0]}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    setSettings({
      notifications: { enabled: true, sound: true, desktop: true },
      display: { theme: 'light', compactMode: false, autoRefresh: true, refreshInterval: 30 },
      sync: { autoSync: true, syncInterval: 30 },
      security: { debugMode: false },
      session: {},
    });
    window.api.logout().catch(() => {});
  };

  // Helper to handle numeric PIN input
  const handlePinInput = (setter: (val: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      setter(val);
    }
  };

  const handlePinChange = () => {
    setPinError('');
    setPinSuccess(false);
    
    // Get stored PIN (default is '1234')
    const storedPin = localStorage.getItem('ireport_admin_pin') || '1234';
    
    if (currentPin !== storedPin) {
      setPinError('Current PIN is incorrect');
      return;
    }
    
    if (newPin.length < 4) {
      setPinError('New PIN must be at least 4 digits');
      return;
    }
    
    if (newPin !== confirmPin) {
      setPinError('New PINs do not match');
      return;
    }
    
    // Save new PIN
    localStorage.setItem('ireport_admin_pin', newPin);
    setPinSuccess(true);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setShowPinChange(false);
    
    setTimeout(() => setPinSuccess(false), 3000);
  };

  const handleLogout = () => {
    window.api.logout().catch(() => {});
    localStorage.removeItem('ireport_admin_auth');
    localStorage.removeItem('ireport_admin_current_user');
    navigate('/login');
  };

  const filteredStations = settings.session?.agencyId
    ? stations.filter((s) => s.agency_id === settings.session?.agencyId)
    : stations;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Settings</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Configure application preferences</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saved ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved!
              </>
            ) : saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Session Scope Section (read-only, driven by login) */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-purple-600" />
              <div>
                <h2 className="font-semibold text-gray-800 dark:text-white">Session Scope</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Scope is set by the logged-in account (Chief with station).</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <SessionInfo />
            <p className="text-gray-500 dark:text-gray-400">To change scope, log out and sign in with a different account.</p>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-gray-800 dark:text-white">Notifications</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <ToggleSetting
              label="Enable Notifications"
              description="Receive notifications for new incidents and updates"
              enabled={settings.notifications.enabled}
              onChange={(enabled) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, enabled }
              })}
            />
            <ToggleSetting
              label="Sound Alerts"
              description="Play sound when new incidents arrive"
              enabled={settings.notifications.sound}
              onChange={(sound) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, sound }
              })}
              icon={settings.notifications.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            />
            <ToggleSetting
              label="Desktop Notifications"
              description="Show system notifications on desktop"
              enabled={settings.notifications.desktop}
              onChange={(desktop) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, desktop }
              })}
            />
          </div>
        </section>

        {/* Display Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <Monitor className="w-5 h-5 text-purple-600" />
              <h2 className="font-semibold text-gray-800 dark:text-white">Display</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-gray-800 dark:text-white">Theme</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Choose your preferred color scheme</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSettings({
                    ...settings,
                    display: { ...settings.display, theme: 'light' }
                  })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    settings.display.theme === 'light'
                      ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                  Light
                </button>
                <button
                  onClick={() => setSettings({
                    ...settings,
                    display: { ...settings.display, theme: 'dark' }
                  })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    settings.display.theme === 'dark'
                      ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                  Dark
                </button>
              </div>
            </div>
            <ToggleSetting
              label="Compact Mode"
              description="Use smaller spacing and fonts for more content"
              enabled={settings.display.compactMode}
              onChange={(compactMode) => setSettings({
                ...settings,
                display: { ...settings.display, compactMode }
              })}
            />
            <ToggleSetting
              label="Auto Refresh"
              description="Automatically refresh data periodically"
              enabled={settings.display.autoRefresh}
              onChange={(autoRefresh) => setSettings({
                ...settings,
                display: { ...settings.display, autoRefresh }
              })}
            />
            {settings.display.autoRefresh && (
              <div className="flex items-center justify-between py-2 pl-8">
                <div>
                  <p className="font-medium text-gray-800 dark:text-white">Refresh Interval</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">How often to refresh data</p>
                </div>
                <select
                  value={settings.display.refreshInterval}
                  onChange={(e) => setSettings({
                    ...settings,
                    display: { ...settings.display, refreshInterval: parseInt(e.target.value) }
                  })}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>1 minute</option>
                  <option value={300}>5 minutes</option>
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Sync Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-green-600" />
              <h2 className="font-semibold text-gray-800 dark:text-white">Data Sync</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <ToggleSetting
              label="Auto Sync"
              description="Automatically sync data with server"
              enabled={settings.sync.autoSync}
              onChange={(autoSync) => setSettings({
                ...settings,
                sync: { ...settings.sync, autoSync }
              })}
            />
            {settings.sync.autoSync && (
              <div className="flex items-center justify-between py-2 pl-8">
                <div>
                  <p className="font-medium text-gray-800 dark:text-white">Sync Interval</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">How often to sync with server</p>
                </div>
                <select
                  value={settings.sync.syncInterval}
                  onChange={(e) => setSettings({
                    ...settings,
                    sync: { ...settings.sync, syncInterval: parseInt(e.target.value) }
                  })}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>1 minute</option>
                  <option value={300}>5 minutes</option>
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Export Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-orange-600" />
              <h2 className="font-semibold text-gray-800 dark:text-white">Export Data</h2>
            </div>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Export all incident data for reporting or backup purposes.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setExportFormat('csv')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    exportFormat === 'csv'
                      ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-400'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV
                </button>
                <button
                  onClick={() => setExportFormat('json')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    exportFormat === 'json'
                      ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-400'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  <FileJson className="w-4 h-4" />
                  JSON
                </button>
              </div>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export Incidents
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Security Section */}
        {isAdmin && (
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-red-600" />
              <h2 className="font-semibold text-gray-800 dark:text-white">Security</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {pinSuccess && (
              <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-green-700 dark:text-green-400 text-sm">PIN changed successfully!</p>
              </div>
            )}
            
            {!showPinChange ? (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-gray-800 dark:text-white">Access PIN</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Change your admin access PIN</p>
                </div>
                <button
                  onClick={() => setShowPinChange(true)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  <Key className="w-4 h-4" />
                  Change PIN
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current PIN</label>
                  <input
                    type="password"
                    value={currentPin}
                    onChange={handlePinInput(setCurrentPin)}
                    maxLength={6}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    placeholder="Enter current PIN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New PIN</label>
                  <input
                    type="password"
                    value={newPin}
                    onChange={handlePinInput(setNewPin)}
                    maxLength={6}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    placeholder="Enter new PIN (4-6 digits)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New PIN</label>
                  <input
                    type="password"
                    value={confirmPin}
                    onChange={handlePinInput(setConfirmPin)}
                    maxLength={6}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    placeholder="Confirm new PIN"
                  />
                </div>
                {pinError && (
                  <p className="text-red-500 text-sm">{pinError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handlePinChange}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Save PIN
                  </button>
                  <button
                    onClick={() => {
                      setShowPinChange(false);
                      setCurrentPin('');
                      setNewPin('');
                      setConfirmPin('');
                      setPinError('');
                    }}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Bug className="w-4 h-4 text-orange-500" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white">Debug Mode</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Enable developer tools for troubleshooting</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const newDebugMode = !settings.security.debugMode;
                    setSettings({
                      ...settings,
                      security: { ...settings.security, debugMode: newDebugMode }
                    });
                    // Notify main process to toggle DevTools
                    try {
                      await window.api.setDebugMode(newDebugMode);
                    } catch (err) {
                      console.error('Failed to set debug mode:', err);
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.security.debugMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.security.debugMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {settings.security.debugMode && (
                <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-orange-800 dark:text-orange-300 font-medium">Debug mode is enabled</p>
                      <p className="text-orange-600 dark:text-orange-400 text-xs mt-1">
                        Press F12 or Ctrl+Shift+I to open Developer Tools. Disable this in production.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-gray-800 dark:text-white">Logout</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Sign out of the admin dashboard</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* AI Worker Connection */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <BrainCircuit className="w-5 h-5 text-purple-600" />
              <h2 className="font-semibold text-gray-800 dark:text-white">AI Worker Connection</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <AIWorkerSettings />
            {isAdmin && (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <AIApiKeysSettings />
              </div>
            )}
          </div>
        </section>

        {/* About Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h2 className="font-semibold text-gray-800 dark:text-white">About</h2>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">iReport Admin Dashboard</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Version 1.2.5</p>
              </div>
              
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Incident reporting and management system for Camarines Norte LGU
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Built with Electron + React</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Multi-agency incident coordination platform
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">© 2025</p>
                  <p className="text-xs text-gray-400">Camarines Norte LGU</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// AI Worker Settings Sub-component
function AIWorkerSettings() {
  const [mode, setMode] = useState<'local' | 'vps'>('local');
  const [localUrl, setLocalUrl] = useState('http://127.0.0.1:8000');
  const [vpsUrl, setVpsUrl] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('http://75.119.142.12:8000');
  const [workerUrl, setWorkerUrl] = useState('http://127.0.0.1:8000');
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [modeSaved, setModeSaved] = useState(false);
  const [fallbackSaved, setFallbackSaved] = useState(false);

  useEffect(() => {
    const loadWorkerSettings = async () => {
      try {
        const rows = await window.api.getSystemSettings();
        const map: Record<string, string> = {};
        rows.forEach((r: any) => {
          map[r.setting_key] = r.setting_value || '';
        });

        const loadedMode = map.ai_worker_mode === 'vps' ? 'vps' : 'local';
        const loadedLocalUrl = map.ai_worker_local_url || 'http://127.0.0.1:8000';
        const loadedVpsUrl = map.ai_worker_vps_url || '';
        const loadedFallbackUrl = map.ai_worker_fallback_url || 'http://75.119.142.12:8000';
        const activeUrl = loadedMode === 'vps' ? loadedVpsUrl : loadedLocalUrl;

        setMode(loadedMode);
        setLocalUrl(loadedLocalUrl);
        setVpsUrl(loadedVpsUrl);
        setFallbackUrl(loadedFallbackUrl);
        setWorkerUrl(activeUrl || 'http://127.0.0.1:8000');

        if (activeUrl) {
          localStorage.setItem('ireport_admin_ai_worker_url', activeUrl);
          await window.api.setAIWorkerUrl(activeUrl);
        }
        if (loadedFallbackUrl) {
          localStorage.setItem('ireport_admin_ai_fallback_worker_url', loadedFallbackUrl);
          try { await window.api.setAIFallbackWorkerUrl(loadedFallbackUrl); } catch {}
        }
      } catch {
        try {
          const url = await window.api.getAIWorkerUrl();
          if (url) {
            setWorkerUrl(url);
            localStorage.setItem('ireport_admin_ai_worker_url', url);
          }
        } catch {
          const saved = localStorage.getItem('ireport_admin_ai_worker_url');
          if (saved) setWorkerUrl(saved);
        }
      }
    };

    loadWorkerSettings();
  }, []);

  const saveUrl = () => {
    localStorage.setItem('ireport_admin_ai_worker_url', workerUrl);
    window.api.setAIWorkerUrl(workerUrl).catch(() => {});
  };

  const saveWorkerMode = async () => {
    setSavingMode(true);
    setHealth(null);
    try {
      const activeUrl = mode === 'vps' ? vpsUrl : localUrl;
      await window.api.upsertSystemSetting('ai_worker_mode', mode);
      await window.api.upsertSystemSetting('ai_worker_local_url', localUrl);
      await window.api.upsertSystemSetting('ai_worker_vps_url', vpsUrl);
      if (activeUrl) {
        const normalized = activeUrl.replace(/\/+$/, '');
        setWorkerUrl(normalized);
        localStorage.setItem('ireport_admin_ai_worker_url', normalized);
        await window.api.setAIWorkerUrl(normalized);
      }
      setModeSaved(true);
      setTimeout(() => setModeSaved(false), 2000);
    } finally {
      setSavingMode(false);
    }
  };

  const saveFallback = async () => {
    const normalized = (fallbackUrl || '').trim().replace(/\/+$/, '');
    setFallbackUrl(normalized);
    localStorage.setItem('ireport_admin_ai_fallback_worker_url', normalized);
    try {
      await window.api.upsertSystemSetting('ai_worker_fallback_url', normalized);
    } catch {}
    try {
      await window.api.setAIFallbackWorkerUrl(normalized);
      setFallbackSaved(true);
      setTimeout(() => setFallbackSaved(false), 2000);
    } catch {}
  };

  const checkHealth = async () => {
    setLoading(true);
    try {
      await window.api.setAIWorkerUrl(workerUrl);
      setHealth(await window.api.checkAIWorkerHealth());
    } catch {
      setHealth(null);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 border border-gray-100 dark:border-gray-700 rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-800 dark:text-white">AI Worker Runtime</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Choose whether this admin app talks to your local worker or the VPS worker.
            </p>
          </div>
          {modeSaved && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Saved
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setMode('local')}
            className={`p-3 text-left rounded-lg border transition-colors ${
              mode === 'local'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-white">
              <Monitor className="w-4 h-4" />
              Local setup
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use the worker running on this machine.</p>
          </button>

          <button
            onClick={() => setMode('vps')}
            className={`p-3 text-left rounded-lg border transition-colors ${
              mode === 'vps'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-white">
              <Wifi className="w-4 h-4" />
              VPS worker
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use the deployed worker URL from Supabase settings.</p>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Local Worker URL</label>
            <input
              type="text"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="http://127.0.0.1:8000"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">VPS Worker URL</label>
            <input
              type="text"
              value={vpsUrl}
              onChange={(e) => setVpsUrl(e.target.value)}
              placeholder="https://your-vps-domain.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Active URL: <span className="font-mono">{mode === 'vps' ? vpsUrl || 'Not set' : localUrl}</span>
          </p>
          <button
            onClick={saveWorkerMode}
            disabled={savingMode || (mode === 'vps' && !vpsUrl.trim())}
            className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {savingMode ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save Runtime
          </button>
        </div>
      </div>

      <div className="p-4 border border-gray-100 dark:border-gray-700 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-800 dark:text-white">VPS Fallback</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              When the active worker is offline or missing cloud API keys, AI calls (incident analysis, call transcription, call summary) automatically retry against this URL. Leave blank to disable.
            </p>
          </div>
          {fallbackSaved && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={fallbackUrl}
            onChange={(e) => setFallbackUrl(e.target.value)}
            placeholder="http://75.119.142.12:8000"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={saveFallback}
            className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Save className="w-3 h-3" /> Save Fallback
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={workerUrl}
          onChange={(e) => setWorkerUrl(e.target.value)}
          onBlur={saveUrl}
          placeholder="http://127.0.0.1:8000"
          className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
        />
        <button
          onClick={checkHealth}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          Test
        </button>
      </div>
      {health && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>Worker connected</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
            <div><Cpu className="w-3 h-3 inline mr-1" />Model: {health.vlm_model}</div>
            <div><BrainCircuit className="w-3 h-3 inline mr-1" />Provider: {health.vlm_provider}</div>
            <div>RAG: {health.rag_enabled ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>
      )}
      {health === null && !loading && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
            <WifiOff className="w-4 h-4" />
            <span>Worker unreachable at {workerUrl}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// AI API Keys Sub-component (admin-only)
function AIApiKeysSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});

  const keysConfig = [
    { key: 'gemini_api_key', label: 'Gemini API Key', placeholder: 'AIza...', help: 'Vision-Language Model (image analysis)' },
    { key: 'groq_api_key', label: 'Groq API Key', placeholder: 'gsk_...', help: 'Whisper transcription + LLM summarization' },
    { key: 'groq_whisper_model', label: 'Groq Whisper Model', placeholder: 'whisper-large-v3', help: 'Voice-to-text model' },
    { key: 'groq_chat_model', label: 'Groq Chat Model', placeholder: 'llama-3.3-70b-versatile', help: 'Call summarization LLM' },
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const rows = await window.api.getSystemSettings();
      const map: Record<string, string> = {};
      rows.forEach((r: any) => {
        map[r.setting_key] = r.setting_value || '';
      });
      setSettings(map);
    } catch (error) {
      console.error('Failed to load system settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateKey = async (key: string, value: string) => {
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await window.api.upsertSystemSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
      setSavedFlash((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => setSavedFlash((prev) => ({ ...prev, [key]: false })), 2000);
    } catch (error) {
      console.error(`Failed to save ${key}:`, error);
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading API configuration...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-800 dark:text-white">AI Worker API Keys</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            These are stored in Supabase and picked up by the AI worker automatically.
            No VPS restart required.
          </p>
        </div>
        <button
          onClick={loadSettings}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {keysConfig.map((cfg) => {
        const value = settings[cfg.key] || '';
        const isKeyField = cfg.key.includes('api_key');
        const isSaving = saving[cfg.key];
        const justSaved = savedFlash[cfg.key];
        const isConfigured = value.length > 0;

        return (
          <div key={cfg.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{cfg.label}</label>
              <div className="flex items-center gap-2">
                {justSaved && (
                  <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Saved
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    isConfigured
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {isConfigured ? 'Set' : 'Not set'}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{cfg.help}</p>
            <div className="flex items-center gap-2">
              <input
                type={isKeyField ? 'password' : 'text'}
                value={value}
                onChange={(e) => setSettings((prev) => ({ ...prev, [cfg.key]: e.target.value }))}
                onBlur={() => {
                  if (settings[cfg.key] !== value) {
                    updateKey(cfg.key, settings[cfg.key]);
                  }
                }}
                placeholder={cfg.placeholder}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={() => updateKey(cfg.key, settings[cfg.key])}
                disabled={isSaving}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </button>
            </div>
          </div>
        );
      })}

      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-xs text-blue-700 dark:text-blue-400">
          <strong>How it works:</strong> The VPS worker polls the Supabase{' '}
          <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">system_settings</code> table every 60 seconds.
          Changes apply automatically — no SSH or restart needed.
        </p>
      </div>
    </div>
  );
}

// Toggle Setting Component
function ToggleSetting({
  label,
  description,
  enabled,
  onChange,
  icon,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        {icon && <span className="text-gray-400 dark:text-gray-500">{icon}</span>}
        <div>
          <p className="font-medium text-gray-800 dark:text-white">{label}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
            enabled ? 'left-7' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}

export default Settings;
