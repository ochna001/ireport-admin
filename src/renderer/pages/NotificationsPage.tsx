import { AlertCircle, ArrowRight, Bell, Check, CheckCheck, ChevronDown, ChevronUp, Clock, Flame, Inbox, RefreshCw, Search, Shield, Waves, X } from 'lucide-react';
import { useDeferredValue, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAgencyPresentation } from '../utils/agencyPresentation';
import { getSessionScope } from '../utils/sessionScope';
import { getIncidentReference } from '../utils/incidentReference';

interface Notification {
  id: number;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  incident_id?: string;
  recipient_id?: string;
  incidents?: {
    id: string;
    incident_reference?: string | null;
    reference_year?: number | null;
    reference_number?: number | null;
    agency_type: string;
    description: string;
  };
}

interface IncidentGroup {
  incident_id: string | null;
  agency_type?: string;
  incident_reference?: string;
  notifications: Notification[];
  latestAt: string;
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Notification filtering & rephrasing for admin context
// ---------------------------------------------------------------------------

/** Returns false for notifications that are purely personal to a resident/responder */
function isAdminRelevant(n: Notification): boolean {
  const body = n.body?.toLowerCase() ?? '';
  const title = n.title?.toLowerCase() ?? '';
  // Resident-facing status change messages
  if (body.startsWith('your incident report status has been changed')) return false;
  if (body.startsWith('your incident status has been updated')) return false;
  if (body.startsWith('your report has been')) return false;
  // Pure "you have been assigned" responder messages (already shown as group context)
  if (title === 'new incident assignment' && body.startsWith('you have been assigned')) return false;
  return true;
}

/** Rephrase notification content from responder/resident POV to admin POV */
function rephraseForAdmin(n: Notification): Notification {
  // Backup request — already clear, keep as-is
  if (n.title?.toLowerCase().includes('backup request')) return n;

  // "New [Agency] Report" → keep, it's already admin-facing
  if (n.title?.toLowerCase().startsWith('new') && n.title?.toLowerCase().includes('report')) return n;

  // Generic incident assignment (if not filtered above)
  if (n.title === 'New Incident Assignment') {
    return {
      ...n,
      title: 'Responder Assigned',
      body: n.body?.replace(/^you have been assigned/i, 'Officer assigned') ?? n.body,
    };
  }

  // Status updates that slipped through — rephrase to admin style
  if (n.title === 'Incident Status Updated' || n.title === 'Incident Update') {
    const statusMatch = n.body?.match(/:\s*(\w+)/);
    const status = statusMatch ? statusMatch[1] : 'updated';
    return { ...n, title: 'Status Changed', body: `Incident status changed to: ${status}` };
  }

  return n;
}

function dedupeNotifications(items: Notification[]): Notification[] {
  const sorted = [...items].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const seen = new Set<string>();
  const result: Notification[] = [];

  for (const n of sorted) {
    const minuteBucket = Math.floor(+new Date(n.created_at) / 60000);
    const key = `${n.incident_id || 'none'}|${n.title}|${n.body}|${minuteBucket}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(n);
  }

  return result;
}

export default function NotificationsPage() {
  const PAGE_SIZE = 50;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const navigate = useNavigate();

  const loadNotifications = async (append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const scope = getSessionScope();
      const result = typeof window.api.getNotificationsPage === 'function'
        ? await window.api.getNotificationsPage({
            userId: scope.userId || '',
            offset: append ? nextOffset : 0,
            limit: PAGE_SIZE,
            search: deferredSearch || undefined,
          })
        : {
            data: await window.api.getNotificationsByUser(scope.userId || ''),
            hasMore: false,
          };
      const adminRelevant = result.data.filter(isAdminRelevant).map(rephraseForAdmin);
      setNotifications(previous => dedupeNotifications(append ? [...previous, ...adminRelevant] : adminRelevant));
      setHasMore(result.hasMore);
      setNextOffset(previous => append ? previous + result.data.length : result.data.length);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
      // Always tell the sidebar to re-sync its badge after we load
      window.dispatchEvent(new Event('notifications-read'));
    }
  };

  const loadUnreadCount = async () => {
    try {
      const scope = getSessionScope();
      const count = await window.api.getUnreadNotificationCount(scope.userId || '');
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();

    const unsubscribe = window.api.onNewNotification(() => {
      loadNotifications();
      loadUnreadCount();
    });

    return () => { unsubscribe(); };
  }, [deferredSearch]);

  // Group notifications by incident_id, sort groups by most recent
  const groups = useMemo<IncidentGroup[]>(() => {
    const map = new Map<string, IncidentGroup>();

    for (const n of notifications) {
      const key = n.incident_id || `standalone-${n.id}`;
      if (!map.has(key)) {
        map.set(key, {
          incident_id: n.incident_id || null,
          agency_type: n.incidents?.agency_type,
          incident_reference: n.incidents ? getIncidentReference(n.incidents) : undefined,
          notifications: [],
          latestAt: n.created_at,
          unreadCount: 0,
        });
      }
      const group = map.get(key)!;
      group.notifications.push(n);
      if (n.created_at > group.latestAt) group.latestAt = n.created_at;
      if (!n.is_read) group.unreadCount++;
      if (n.incidents?.agency_type && !group.agency_type) {
        group.agency_type = n.incidents.agency_type;
      }
    }

    // Sort each group's notifications newest-first for display
    for (const group of map.values()) {
      group.notifications.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    // Sort groups by most recent notification descending
    return Array.from(map.values()).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  }, [notifications]);

  const priorityGroups = useMemo(() => {
    const getPriority = (notification: Notification) => {
      const title = notification.title.toLowerCase();
      if (title.includes('backup')) return 4;
      if (title.includes('new') && title.includes('report')) return 3;
      if (title.includes('assigned')) return 2;
      if (title.includes('status')) return 1;
      return 0;
    };

    return groups
      .map(group => {
        const priorityNotification = group.notifications.find(notification => getPriority(notification) > 0);
        if (!priorityNotification || group.unreadCount === 0) return null;
        return { group, notification: priorityNotification, priority: getPriority(priorityNotification) };
      })
      .filter((item): item is { group: IncidentGroup; notification: Notification; priority: number } => item !== null)
      .sort((a, b) => b.priority - a.priority || b.group.latestAt.localeCompare(a.group.latestAt))
      .slice(0, 3);
  }, [groups]);

  // Auto-open the 2 most recent groups on first load
  useEffect(() => {
    if (groups.length === 0) return;
    const top2Keys = groups.slice(0, 2).map(g => g.incident_id || `standalone-${g.notifications[0]?.id}`);
    setOpenGroups(prev => {
      const next = new Set(prev);
      top2Keys.forEach(k => next.add(k));
      return next;
    });
  }, [groups.length > 0 && groups[0]?.incident_id]); // Only run when groups first populate

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleExpanded = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await window.api.markNotificationAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      // Notify Layout to refresh its badge immediately
      window.dispatchEvent(new Event('notifications-read'));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkGroupRead = async (group: IncidentGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    const unread = group.notifications.filter(n => !n.is_read);
    await Promise.all(unread.map(n => handleMarkAsRead(n.id)));
  };

  const handleMarkAllAsRead = async () => {
    try {
      const scope = getSessionScope();
      await window.api.markAllNotificationsAsRead(scope.userId || '');
      // Reload from DB to ensure visual state matches server
      await loadNotifications();
      setUnreadCount(0);
      window.dispatchEvent(new Event('notifications-read'));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) await handleMarkAsRead(notification.id);
    if (notification.incident_id) navigate(`/incidents/${notification.incident_id}`);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatFullTime = (dateStr: string) => new Date(dateStr).toLocaleString();

  const getAgencyIcon = (agency?: string) => {
    switch (agency?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : agency?.toLowerCase()) {
      case 'pnp': return <Shield size={14} className="text-blue-500" />;
      case 'bfp': return <Flame size={14} className="text-red-500" />;
      case 'mdrrmo': return <Waves size={14} className="text-cyan-500" />;
      default: return <AlertCircle size={14} className="text-slate-400" />;
    }
  };

  const getAgencyAccent = (agency?: string) => {
    switch (agency?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : agency?.toLowerCase()) {
      case 'pnp': return 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-900/10';
      case 'bfp': return 'border-l-red-500 bg-red-50/30 dark:bg-red-900/10';
      case 'mdrrmo': return 'border-l-cyan-500 bg-cyan-50/30 dark:bg-cyan-900/10';
      default: return agency ? 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-900/10' : 'border-l-slate-400 bg-slate-50/30 dark:bg-slate-800/30';
    }
  };

  const getAgencyBadge = (agency?: string) => {
    switch (agency?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : agency?.toLowerCase()) {
      case 'pnp': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'bfp': return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
      case 'mdrrmo': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300';
      default: return agency ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    }
  };

  const formatAgency = (agency?: string) => {
    return agency ? getAgencyPresentation(agency).shortLabel : undefined;
  };

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
              <Bell size={14} />
              Operations activity
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Notifications</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Incident updates grouped into a chronological activity record.</p>
          </div>
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadNotifications()}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <CheckCheck size={16} />
              Mark all read
            </button>
          )}
          </div>
        </header>

        <section className="mb-5 grid min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-3" aria-label="Notification summary">
          <div className="flex min-w-0 items-center gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-slate-700 sm:border-b-0 sm:border-r">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${unreadCount > 0 ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'}`}>
              {unreadCount > 0 ? <Bell size={17} /> : <CheckCheck size={17} />}
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-slate-950 dark:text-white">{unreadCount}</p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Unread updates</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-slate-700 sm:border-b-0 sm:border-r">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Inbox size={17} />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-slate-950 dark:text-white">{groups.length}</p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Incident threads</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 px-4 py-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Clock size={17} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-950 dark:text-white">{groups[0] ? formatTime(groups[0].latestAt) : 'No activity'}</p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Latest update</p>
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900" aria-label="Search notifications">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <label htmlFor="notification-search" className="sr-only">Search notifications</label>
              <input
                id="notification-search"
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search incident updates, assignments, or report text"
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear notification search" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700 dark:hover:text-white">
                  <X size={15} />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:max-w-[13rem] sm:shrink-0">
              {deferredSearch ? `Results for “${deferredSearch}”` : 'Searches title and message text'}
            </p>
          </div>
        </section>

        <section className={`mb-5 rounded-xl border p-4 ${priorityGroups.length > 0 ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`} aria-labelledby="needs-attention-heading">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${priorityGroups.length > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                    {priorityGroups.length > 0 ? <AlertCircle size={15} /> : <CheckCheck size={15} />}
                  </div>
                  <h2 id="needs-attention-heading" className={`text-sm font-semibold ${priorityGroups.length > 0 ? 'text-amber-950 dark:text-amber-100' : 'text-slate-900 dark:text-white'}`}>Needs attention</h2>
                </div>
                <p className={`mt-1 pl-9 text-xs ${priorityGroups.length > 0 ? 'text-amber-800/75 dark:text-amber-200/75' : 'text-slate-500 dark:text-slate-400'}`}>
                  {priorityGroups.length > 0 ? 'Start here for unread requests and assignments that may need action.' : 'No unread requests or assignments need action right now.'}
                </p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${priorityGroups.length > 0 ? 'border-amber-300 bg-white/70 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>{priorityGroups.length > 0 ? `${priorityGroups.length} to review` : 'Clear'}</span>
            </div>
            {priorityGroups.length > 0 && <div className="grid min-w-0 gap-2 lg:grid-cols-3">
              {priorityGroups.map(({ group, notification }) => {
                const key = group.incident_id || `standalone-${group.notifications[0]?.id}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (!notification.is_read) handleMarkAsRead(notification.id);
                      if (group.incident_id) navigate(`/incidents/${group.incident_id}`);
                    }}
                    className="group flex min-h-[92px] min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-amber-200 bg-white p-3 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-900/70 dark:bg-slate-900 dark:hover:border-amber-700 dark:hover:bg-amber-950/30"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ${getAgencyBadge(group.agency_type)}`}>
                        {group.incident_reference || (group.incident_id ? `#${group.incident_id.slice(0, 8).toUpperCase()}` : 'SYSTEM')}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500">{formatTime(group.latestAt)}</span>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{notification.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{notification.body}</p>
                      </div>
                      <ArrowRight size={15} className="shrink-0 text-amber-600 transition-transform group-hover:translate-x-0.5 dark:text-amber-300" />
                    </div>
                  </button>
                );
              })}
            </div>}
        </section>

        {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading notifications">
          {[0, 1, 2].map(item => (
            <div key={item} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              </div>
            </div>
          ))}
          <span className="sr-only">Loading notifications</span>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCheck size={22} />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Activity queue is clear</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">New incident assignments and operational updates will appear here automatically.</p>
        </div>
      ) : (
        <section aria-labelledby="all-activity-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1 pt-1">
            <div>
              <h2 id="all-activity-heading" className="text-base font-semibold text-slate-950 dark:text-white">All activity</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Complete incident notification history, newest first.</p>
            </div>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{groups.length} threads{deferredSearch ? ' · filtered' : ''}</span>
          </div>
          {groups.map((group) => {
            const key = group.incident_id || `standalone-${group.notifications[0]?.id}`;
            const isOpen = openGroups.has(key);
            const isExpanded = expandedGroups.has(key);
            const latest = group.notifications[0]; // newest first
            const hasUnread = group.unreadCount > 0;
            const VISIBLE_CAP = 6;
            const visibleNotifs = isExpanded ? group.notifications : group.notifications.slice(0, VISIBLE_CAP);
            const hiddenCount = group.notifications.length - VISIBLE_CAP;

            return (
              <div
                key={key}
                className={`overflow-hidden rounded-xl border transition-colors duration-200 ${hasUnread ? 'border-l-4 border-y-slate-200 border-r-slate-200 shadow-sm ' + getAgencyAccent(group.agency_type) : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleGroup(key)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-slate-800/60 sm:px-5"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleGroup(key);
                    }
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3.5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getAgencyBadge(group.agency_type)}`}>
                      {getAgencyIcon(group.agency_type)}
                    </div>

                    {/* Main info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Incident ID */}
                        {group.incident_id ? (
                          <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${getAgencyBadge(group.agency_type)}`}>
                            {group.incident_reference || `${formatAgency(group.agency_type) || 'INC'} #${group.incident_id.slice(0, 8).toUpperCase()}`}
                          </span>
                        ) : (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            System
                          </span>
                        )}

                        {/* Unread badge */}
                        {hasUnread && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            {group.unreadCount} unread
                          </span>
                        )}

                        {/* Update count */}
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {group.notifications.length} update{group.notifications.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Latest notification preview */}
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {latest.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {latest.body}
                      </p>
                    </div>
                  </div>

                  {/* Right side: time + mark read + chevron */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <div className="hidden items-center gap-1 text-xs font-medium text-slate-400 dark:text-slate-500 sm:flex">
                      <Clock size={11} />
                      {formatTime(group.latestAt)}
                    </div>

                    {hasUnread && (
                      <button
                        onClick={(e) => handleMarkGroupRead(group, e)}
                        title="Mark all in group as read"
                        aria-label={`Mark ${group.unreadCount} updates as read`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                      >
                        <Check size={14} className="text-slate-500 dark:text-slate-400" />
                      </button>
                    )}

                    <div className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500">
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Accordion Body — chronological timeline */}
                {isOpen && (
                  <div className="border-t border-slate-200 bg-slate-50/70 px-4 pb-4 pt-3 dark:border-slate-700 dark:bg-slate-950/35 sm:px-5">
                    {/* Click to view incident */}
                    {group.incident_id && (
                      <button
                        onClick={() => navigate(`/incidents/${group.incident_id}`)}
                        className="mb-3 flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/40"
                      >
                        Open incident record
                        <ArrowRight size={13} />
                      </button>
                    )}

                    {/* Timeline */}
                    <div className="relative">
                      {/* Vertical line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />

                      <div className="space-y-1">
                        {visibleNotifs.map((notif, nIdx) => {
                          const isFirst = nIdx === 0;
                          return (
                            <div
                              key={notif.id}
                              role="button"
                              tabIndex={0}
                              className="group/item flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-900"
                              onClick={() => handleNotificationClick(notif)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  handleNotificationClick(notif);
                                }
                              }}
                            >
                              {/* Timeline dot */}
                              <div className={`relative z-10 mt-0.5 h-[15px] w-[15px] flex-shrink-0 rounded-full border-2 ${!notif.is_read
                                ? 'bg-blue-500 border-blue-500'
                                : isFirst
                                  ? 'bg-slate-400 border-slate-400'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                }`} />

                              {/* Content */}
                              <div className={`min-w-0 flex-1 pb-1 ${!notif.is_read ? 'opacity-100' : 'opacity-75'
                                }`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <p className={`text-sm leading-5 ${!notif.is_read
                                      ? 'font-semibold text-slate-800 dark:text-white'
                                      : 'font-medium text-slate-600 dark:text-slate-300'
                                      }`}>
                                      {notif.title}
                                      {!notif.is_read && (
                                        <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full ml-2 mb-0.5 align-middle" />
                                      )}
                                    </p>
                                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                      {notif.body}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className="text-[11px] text-slate-400" title={formatFullTime(notif.created_at)}>
                                      {formatTime(notif.created_at)}
                                    </span>
                                    {!notif.is_read && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notif.id); }}
                                        title="Mark as read"
                                        aria-label="Mark update as read"
                                        className="flex h-8 w-8 items-center justify-center rounded-lg opacity-0 transition-all hover:bg-slate-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500 group-hover/item:opacity-100 dark:hover:bg-slate-700"
                                      >
                                        <Check size={12} className="text-slate-500" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Show more / show less */}
                        {hiddenCount > 0 && (
                          <button
                            onClick={(e) => toggleExpanded(key, e)}
                            className="ml-[23px] mt-1 min-h-9 rounded-lg px-3 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/30"
                          >
                            {isExpanded ? 'Show fewer updates' : `Show ${hiddenCount} older update${hiddenCount !== 1 ? 's' : ''}`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(hasMore || loadingMore) && (
            <div className="flex flex-col items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => loadNotifications(true)}
                disabled={loadingMore}
                className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw size={15} className={loadingMore ? 'animate-spin' : ''} />
                {loadingMore ? 'Loading older updates...' : 'Load more updates'}
              </button>
              <span className="text-xs text-slate-400 dark:text-slate-500">Older activity will be added below without changing the current sort.</span>
            </div>
          )}
          {!hasMore && notifications.length > 0 && !deferredSearch && (
            <p className="border-t border-slate-200 pt-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">You have reached the end of the notification history.</p>
          )}
        </section>
      )}
      </div>
    </div>
  );
}
