import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Flame,
  Shield,
  TrendingUp,
  Waves
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionScope, isChiefScoped, SessionScope } from '../utils/sessionScope';

interface Stats {
  total: number;
  pending: number;
  responding: number;
  resolved: number;
  byAgency: Array<{ agency_type: string; count: number }>;
  recentActivity: Array<{
    incident_id: string;
    status: string;
    changed_by: string;
    changed_at: string;
    agency_type?: string | null;
  }>;
  avgResponseTime?: number | null;
  avgResolutionTime?: number | null;
}

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionScope, setSessionScope] = useState<SessionScope>({});
  const [activityVisibleCount, setActivityVisibleCount] = useState(5);

  useEffect(() => {
    if (!window.api) {
      setError('window.api not available - preload script may not be loaded');
      setLoading(false);
      return;
    }

    loadStats();
    
    // Listen for updates
    window.api.onIncidentUpdated(() => {
      loadStats();
    });

    // Setup auto-refresh based on settings
    let refreshTimer: NodeJS.Timeout;
    
    const setupAutoRefresh = async () => {
      try {
        // Try to get settings from localStorage first (faster)
        const savedSettings = localStorage.getItem('ireport_admin_settings');
        let settings;
        
        if (savedSettings) {
          settings = JSON.parse(savedSettings);
        } else {
          // Fallback to API defaults
          settings = await window.api.getSettings();
        }
        
        if (settings?.display?.autoRefresh) {
          const interval = (settings.display.refreshInterval || 30) * 1000;
          console.log(`[Dashboard] Auto-refresh enabled: ${interval}ms`);
          refreshTimer = setInterval(loadStats, interval);
        }
      } catch (error) {
        console.error('Failed to setup auto-refresh:', error);
      }
    };
    
    setupAutoRefresh();

    return () => {
      window.api?.removeAllListeners('incident-updated');
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, []);

  const loadStats = async () => {
    try {
      const scope = getSessionScope();
      setSessionScope(scope);

      const filters: any = {};
      // Filter for any non-admin user if they have station/agency scope
      if (scope.role !== 'Admin') {
        if (scope.stationId) {
          filters.stationId = scope.stationId;
        }
        if (scope.agencyShortName) {
          filters.agency = scope.agencyShortName.toLowerCase();
        }
      }

      const data = await window.api.getStats(Object.keys(filters).length ? filters : undefined);
      setStats(data);
      setActivityVisibleCount(5); // Reset to default when data refreshes
      setError(null);
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      setError(`Failed to load stats: ${errorMsg}`);
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAgencyCount = (agency: string) => {
    return stats?.byAgency.find(a => a.agency_type === agency)?.count || 0;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-500';
      case 'assigned': return 'bg-blue-500';
      case 'in_progress': return 'bg-orange-500';
      case 'responding': return 'bg-orange-500';
      case 'resolved': return 'bg-green-500';
      case 'closed': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getAgencyBadgeColor = (agency?: string | null) => {
    switch (agency?.toLowerCase()) {
      case 'pnp':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200';
      case 'bfp':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
      case 'pdrrmo':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const displayedActivity = stats?.recentActivity
    ? stats.recentActivity.slice(0, activityVisibleCount)
    : [];

  const canShowMore = (stats?.recentActivity?.length || 0) > displayedActivity.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 dark:bg-gray-950">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Dashboard</h1>

      {isChiefScoped(sessionScope) && (
        <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-100">
          Data scoped to Station {sessionScope.stationName || sessionScope.stationId} ({sessionScope.agencyShortName || 'Agency'} • Chief)
        </div>
      )}

      {/* Offline Warning */}
      {(stats as any)?._offline && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-700 font-medium">⚠️ Offline Mode</p>
          <p className="text-yellow-600 text-sm">Cannot connect to server. Showing mock data.</p>
          <p className="text-yellow-500 text-xs mt-1">Error: {(stats as any)?._error}</p>
        </div>
      )}
      
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Incidents</p>
              <p className="text-3xl font-bold text-gray-800 dark:text-white">{stats?.total || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <TrendingUp className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pending</p>
              <p className="text-3xl font-bold text-yellow-600">{stats?.pending || 0}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <Clock className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">In Progress</p>
              <p className="text-3xl font-bold text-orange-600">{stats?.responding || 0}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="text-orange-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Resolved / Closed</p>
              <p className="text-3xl font-bold text-green-600">{stats?.resolved || 0}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="text-green-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Agency Breakdown */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div 
          className="bg-blue-600 rounded-xl p-6 text-white cursor-pointer hover:bg-blue-700 transition-colors"
          onClick={() => navigate('/incidents?agency=pnp')}
        >
          <div className="flex items-center gap-4">
            <Shield size={32} />
            <div>
              <p className="text-blue-100">PNP Reports</p>
              <p className="text-3xl font-bold">{getAgencyCount('pnp')}</p>
            </div>
          </div>
        </div>

        <div 
          className="bg-red-600 rounded-xl p-6 text-white cursor-pointer hover:bg-red-700 transition-colors"
          onClick={() => navigate('/incidents?agency=bfp')}
        >
          <div className="flex items-center gap-4">
            <Flame size={32} />
            <div>
              <p className="text-red-100">BFP Reports</p>
              <p className="text-3xl font-bold">{getAgencyCount('bfp')}</p>
            </div>
          </div>
        </div>

        <div 
          className="bg-cyan-600 rounded-xl p-6 text-white cursor-pointer hover:bg-cyan-700 transition-colors"
          onClick={() => navigate('/incidents?agency=pdrrmo')}
        >
          <div className="flex items-center gap-4">
            <Waves size={32} />
            <div>
              <p className="text-cyan-100">PDRRMO Reports</p>
              <p className="text-3xl font-bold">{getAgencyCount('pdrrmo')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Recent Activity</h2>
            {stats?.recentActivity?.length ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Showing {Math.min(displayedActivity.length, stats.recentActivity.length)} of {stats.recentActivity.length}
              </span>
            ) : null}
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {displayedActivity.length > 0 ? (
            displayedActivity.map((activity, index) => (
              <div
                key={`${activity.incident_id}-${activity.changed_at}-${index}`}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                onClick={() => navigate(`/incidents/${activity.incident_id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium text-white ${getStatusBadgeColor(activity.status)}`}>
                      {activity.status.toUpperCase().replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      by {activity.changed_by || 'System'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(activity.changed_at)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-gray-800 dark:text-white">
                    Incident #{activity.incident_id?.slice(0, 8)?.toUpperCase()}
                  </span>
                  {activity.agency_type && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getAgencyBadgeColor(activity.agency_type)}`}>
                      {activity.agency_type.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No recent activity
            </div>
          )}
        </div>
        {stats?.recentActivity && stats.recentActivity.length > 5 && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-center gap-3">
              {canShowMore && (
                <button
                  onClick={() => setActivityVisibleCount(prev => prev + 5)}
                  className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  Load more
                </button>
              )}
              {activityVisibleCount > 5 && (
                <button
                  onClick={() => setActivityVisibleCount(5)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                >
                  Show less
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
