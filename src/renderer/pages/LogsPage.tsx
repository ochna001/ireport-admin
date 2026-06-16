import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileJson,
  FileText,
  History,
  RefreshCw,
  Search,
  Shield,
  Users
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface ActivityLog {
  id: number;
  user_id: string | null;
  user_email: string | null;
  action: string;
  details: any;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string;
  created_at: string;
}

interface ActivityLogFilters {
  fromDate?: string;
  toDate?: string;
  entityType?: string;
  action?: string;
  userEmail?: string;
  search?: string;
  offset?: number;
  limit?: number;
}

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'incident', label: 'Incident' },
  { value: 'user', label: 'User' },
  { value: 'station', label: 'Station' },
  { value: 'resource', label: 'Resource' },
  { value: 'report', label: 'Report' },
  { value: 'media', label: 'Media' },
  { value: 'export', label: 'Export' },
  { value: 'backup_request', label: 'Backup Request' },
  { value: 'agency', label: 'Agency' },
  { value: 'settings', label: 'Settings' },
  { value: 'auth', label: 'Auth' },
];

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'incident_status_changed', label: 'Incident Status Changed' },
  { value: 'incident_officers_assigned', label: 'Officers Assigned' },
  { value: 'incident_status_and_officers_changed', label: 'Status & Officers Changed' },
  { value: 'incident_resources_assigned', label: 'Resources Assigned' },
  { value: 'incident_updated', label: 'Incident Updated' },
  { value: 'user_created', label: 'User Created' },
  { value: 'user_updated', label: 'User Updated' },
  { value: 'user_disabled', label: 'User Disabled' },
  { value: 'password_reset', label: 'Password Reset' },
  { value: 'station_created', label: 'Station Created' },
  { value: 'station_updated', label: 'Station Updated' },
  { value: 'station_deleted', label: 'Station Deleted' },
  { value: 'resource_created', label: 'Resource Created' },
  { value: 'resource_updated', label: 'Resource Updated' },
  { value: 'resource_deleted', label: 'Resource Deleted' },
  { value: 'final_report_created', label: 'Final Report Created' },
  { value: 'media_uploaded', label: 'Media Uploaded' },
  { value: 'media_deleted', label: 'Media Deleted' },
  { value: 'incidents_exported', label: 'Incidents Exported' },
  { value: 'pdf_export_saved', label: 'PDF Saved' },
  { value: 'incident_agency_added', label: 'Agency Added to Incident' },
  { value: 'incident_agency_role_updated', label: 'Agency Role Updated' },
  { value: 'incident_agency_acknowledged', label: 'Agency Acknowledged' },
  { value: 'incident_agency_removed', label: 'Agency Removed' },
  { value: 'backup_request_status_updated', label: 'Backup Request Updated' },
  { value: 'settings_updated', label: 'Settings Updated' },
];

function getActionBadgeColor(action: string): string {
  if (action.includes('created')) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (action.includes('updated') || action.includes('changed')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  if (action.includes('deleted') || action.includes('disabled')) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  if (action.includes('login') || action.includes('auth')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
  if (action.includes('export')) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [filters, setFilters] = useState<ActivityLogFilters>({
    limit: 50,
    offset: 0,
  });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    total: 0,
  });

  async function fetchLogs() {
    try {
      setLoading(true);
      const result = await window.api.getActivityLogs(filters);
      setLogs(result.data);
      setPagination({
        currentPage: Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1,
        totalPages: Math.ceil(result.total / (filters.limit || 50)),
        total: result.total,
      });
      setError(null);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setError('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [filters.offset, filters.limit, filters.entityType, filters.action]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, filters]);

  function toggleRowExpansion(id: number) {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  }

  function handleSearch() {
    setFilters({ ...filters, offset: 0 });
    fetchLogs();
  }

  function handlePageChange(page: number) {
    setFilters({
      ...filters,
      offset: (page - 1) * (filters.limit || 50),
    });
  }

  async function exportToJson() {
    try {
      const allLogs = await window.api.getActivityLogs({ ...filters, limit: 1000, offset: 0 });
      const dataStr = JSON.stringify(allLogs.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export logs:', err);
    }
  }

  // Human-readable field labels mapping
  const fieldLabels: Record<string, string> = {
    incident_id: 'Incident ID',
    user_id: 'User ID',
    email: 'Email',
    role: 'Role',
    new_status: 'New Status',
    old_status: 'Previous Status',
    notes: 'Notes',
    assigned_station_id: 'Assigned Station',
    officer_ids: 'Officer IDs',
    resource_ids: 'Resource IDs',
    primary_officer_id: 'Primary Officer',
    station_id: 'Station ID',
    agency_id: 'Agency ID',
    name: 'Name',
    updates: 'Updates',
    completed_by: 'Completed By',
    file_name: 'File Name',
    media_type: 'Media Type',
    media_id: 'Media ID',
    storage_path: 'Storage Path',
    format: 'Format',
    filters: 'Filters',
    count: 'Count',
    agency_name: 'Agency Name',
    incident_agency_id: 'Incident Agency ID',
    backup_request_id: 'Backup Request ID',
    status: 'Status',
    handled_by_id: 'Handled By',
    target_agency_id: 'Target Agency ID',
    target_station_id: 'Target Station ID',
    settings: 'Settings',
    path: 'Path',
    filename: 'Filename',
    disabled_user_id: 'Disabled User ID',
    new_user_id: 'New User ID',
    station_name: 'Station Name',
    resource_name: 'Resource Name',
    type: 'Type',
    officer_count: 'Number of Officers',
    officer_names: 'Officer Names',
    resource_count: 'Number of Resources',
  };

  // Format value for display
  function formatValue(value: any): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') {
      // Format UUIDs to be shorter
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        return `${value.slice(0, 8)}...${value.slice(-4)}`;
      }
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return 'None';
      return value.map(formatValue).join(', ');
    }
    if (typeof value === 'object') {
      return Object.entries(value)
        .map(([k, v]) => `${fieldLabels[k] || k}: ${formatValue(v)}`)
        .join('; ');
    }
    return String(value);
  }

  // Render details in a user-friendly card format
  function renderDetailsCard(details: any, action: string) {
    if (!details || typeof details !== 'object') {
      return (
        <div className="text-sm text-gray-600 dark:text-gray-400 italic">
          {details || 'No additional details'}
        </div>
      );
    }

    const entries = Object.entries(details).filter(([_, value]) => 
      value !== null && value !== undefined && value !== ''
    );

    if (entries.length === 0) {
      return (
        <div className="text-sm text-gray-600 dark:text-gray-400 italic">
          No additional details
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entries.map(([key, value]) => {
          const label = fieldLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const displayValue = formatValue(value);
          const isLongValue = displayValue.length > 50;

          return (
            <div key={key} className={`${isLongValue ? 'md:col-span-2' : ''}`}>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {label}
              </span>
              <div className={`mt-1 text-sm text-gray-900 dark:text-gray-100 ${isLongValue ? 'font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded' : ''}`}>
                {displayValue}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Get a human-readable summary of the action
  function getActionSummary(log: ActivityLog): string {
    const { action, details, entity_type, entity_id } = log;

    switch (action) {
      case 'login':
        return `User logged in${details?.email ? ` as ${details.email}` : ''}`;
      case 'incident_status_changed':
        return `Changed incident status from "${details?.old_status || '-'}" to "${details?.new_status || '-'}"`;
      case 'incident_officers_assigned':
        const officerNames = details?.officer_names?.join(', ') || `${details?.officer_count || 0} officer(s)`;
        return `Assigned ${officerNames} to incident`;
      case 'incident_status_and_officers_changed':
        const officers = details?.officer_names?.join(', ') || `${details?.officer_count || 0} officer(s)`;
        return `Changed status to "${details?.new_status || '-'}" and assigned ${officers}`;
      case 'incident_resources_assigned':
        return `Assigned ${details?.resource_count || 0} resource(s) to incident`;
      case 'incident_updated':
        return 'Updated incident information';
      case 'user_created':
        return `Created new user account for ${details?.email || 'unknown'}`;
      case 'user_disabled':
        return `Disabled user account`;
      case 'password_reset':
        return `Reset user password`;
      case 'station_created':
        return `Created new station: ${details?.name || 'unknown'}`;
      case 'station_updated':
        return `Updated station information`;
      case 'station_deleted':
        return `Deleted station`;
      case 'resource_created':
        return `Created new resource: ${details?.name || 'unknown'}`;
      case 'resource_updated':
        return `Updated resource information`;
      case 'resource_deleted':
        return `Deleted resource`;
      case 'final_report_created':
        return `Published final report for incident`;
      case 'media_uploaded':
        return `Uploaded ${details?.media_type || 'media'}: ${details?.file_name || 'file'}`;
      case 'media_deleted':
        return `Deleted media file`;
      case 'incidents_exported':
        return `Exported ${details?.count || 0} incidents as ${details?.format?.toUpperCase() || 'file'}`;
      case 'pdf_export_saved':
        return `Saved PDF report: ${details?.filename || 'document'}`;
      case 'incident_agency_added':
        return `Added ${details?.agency_name || 'agency'} to incident as ${details?.role || 'support'}`;
      case 'incident_agency_role_updated':
        return `Updated agency role to ${details?.role || 'new role'}`;
      case 'incident_agency_acknowledged':
        return `Agency acknowledged incident`;
      case 'incident_agency_removed':
        return `Removed agency from incident`;
      case 'backup_request_status_updated':
        return `Updated backup request status to "${details?.status || 'updated'}"`;
      case 'settings_updated':
        return 'Updated application settings';
      default:
        return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
            <History className="w-5 h-5 text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Logs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track all actions performed in the admin application
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Date Range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">From</label>
            <input
              type="date"
              value={filters.fromDate || ''}
              onChange={(e) => setFilters({ ...filters, fromDate: e.target.value || undefined })}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">To</label>
            <input
              type="date"
              value={filters.toDate || ''}
              onChange={(e) => setFilters({ ...filters, toDate: e.target.value || undefined })}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Entity Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Entity Type</label>
            <select
              value={filters.entityType || ''}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value || undefined })}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Action Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Action</label>
            <select
              value={filters.action || ''}
              onChange={(e) => setFilters({ ...filters, action: e.target.value || undefined })}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {ACTION_TYPES.map((action) => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search by action, user, or details..."
                value={filters.search || ''}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Auto-refresh (30s)
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={exportToJson}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <FileJson className="w-4 h-4" />
              Export JSON
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <History className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Logs</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{pagination.total.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Showing</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{logs.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Page</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {pagination.currentPage} <span className="text-sm font-normal text-gray-500">/ {pagination.totalPages}</span>
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Last Update</span>
          </div>
          <p className="text-lg font-medium text-gray-900 dark:text-white">
            {new Date().toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entity Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entity ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                    Loading activity logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <History className="w-6 h-6 mx-auto mb-2" />
                    No activity logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                      onClick={() => toggleRowExpansion(log.id)}
                    >
                      <td className="px-4 py-3">
                        {expandedRows.has(log.id) ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white" title={formatDate(log.created_at)}>
                          {formatRelativeTime(log.created_at)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(log.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {log.user_email || 'System'}
                        </div>
                        {log.user_id && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {log.user_id.slice(0, 8)}...
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getActionBadgeColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                          {log.entity_type || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                          {log.entity_id ? `${log.entity_id.slice(0, 12)}...` : '-'}
                        </span>
                      </td>
                    </tr>
                    {expandedRows.has(log.id) && (
                      <tr className="bg-gray-50 dark:bg-gray-700/30">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="pl-8 space-y-4">
                            {/* Summary Card */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                              <div className="flex items-start gap-2">
                                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">Summary</span>
                                  <p className="text-sm text-blue-900 dark:text-blue-200 mt-1">
                                    {getActionSummary(log)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Details Grid */}
                            {log.details && Object.keys(log.details).length > 0 && (
                              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Details</h4>
                                {renderDetailsCard(log.details, log.action)}
                              </div>
                            )}

                            {/* Metadata */}
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                              <span><span className="font-medium">Log ID:</span> #{log.id}</span>
                              <span><span className="font-medium">Source:</span> {log.ip_address}</span>
                              <span><span className="font-medium">Time:</span> {formatDate(log.created_at)}</span>
                              {log.entity_id && (
                                <span><span className="font-medium">Entity ID:</span> {log.entity_id}</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing <span className="font-medium">{((filters.offset || 0) + 1)}</span> to{' '}
              <span className="font-medium">{Math.min((filters.offset || 0) + logs.length, pagination.total)}</span> of{' '}
              <span className="font-medium">{pagination.total}</span> results
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage === pagination.totalPages}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
