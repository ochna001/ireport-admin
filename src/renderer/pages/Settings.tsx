import {
    Bell,
    CheckCircle,
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
    VolumeX
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
}

function Settings() {
  const [settings, setSettings] = useState<AppSettings>({
    notifications: { enabled: true, sound: true, desktop: true },
    display: { theme: 'light', compactMode: false, autoRefresh: true, refreshInterval: 30 },
    sync: { autoSync: true, syncInterval: 30 },
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
  const navigate = useNavigate();

  // Load settings from localStorage on mount
  useEffect(() => {
    loadSettings();
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
        setSettings(JSON.parse(saved));
      } else {
        // Fallback to API defaults
        const data = await window.api.getSettings();
        setSettings(data);
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
      const data = await window.api.exportIncidents({ format: exportFormat });
      
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
    });
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
    localStorage.removeItem('ireport_admin_auth');
    navigate('/login');
  };

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

        {/* About Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h2 className="font-semibold text-gray-800 dark:text-white">About</h2>
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white">iReport Admin Dashboard</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Version 1.0.0</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Incident reporting and management system for Camarines Norte LGU
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Built with Electron + React</p>
                <p className="text-xs text-gray-400">© 2024 Camarines Norte LGU</p>
              </div>
            </div>
          </div>
        </section>
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
