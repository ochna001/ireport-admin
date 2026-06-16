import { Bell, Check, CheckCheck, Shield, Flame, Waves, AlertCircle, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionScope } from '../utils/sessionScope';

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
    agency_type: string;
    description: string;
  };
}

interface IncidentGroup {
  incident_id: string | null;
  agency_type?: string;
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const scope = getSessionScope();
      const raw = await window.api.getNotificationsByUser(scope.userId || '');
      const adminRelevant = raw.filter(isAdminRelevant).map(rephraseForAdmin);
      setNotifications(dedupeNotifications(adminRelevant));
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
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
  }, []);

  // Group notifications by incident_id, sort groups by most recent
  const groups = useMemo<IncidentGroup[]>(() => {
    const map = new Map<string, IncidentGroup>();

    for (const n of notifications) {
      const key = n.incident_id || `standalone-${n.id}`;
      if (!map.has(key)) {
        map.set(key, {
          incident_id: n.incident_id || null,
          agency_type: n.incidents?.agency_type,
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
      default: return <AlertCircle size={14} className="text-gray-400" />;
    }
  };

  const getAgencyAccent = (agency?: string) => {
    switch (agency?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : agency?.toLowerCase()) {
      case 'pnp': return 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-900/10';
      case 'bfp': return 'border-l-red-500 bg-red-50/30 dark:bg-red-900/10';
      case 'mdrrmo': return 'border-l-cyan-500 bg-cyan-50/30 dark:bg-cyan-900/10';
      default: return 'border-l-gray-400 bg-gray-50/30 dark:bg-gray-800/30';
    }
  };

  const getAgencyBadge = (agency?: string) => {
    switch (agency?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : agency?.toLowerCase()) {
      case 'pnp': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'bfp': return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
      case 'mdrrmo': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const formatAgency = (agency?: string) => {
    return (agency?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : agency)?.toUpperCase();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="text-gray-800 dark:text-white" size={28} />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-bold animate-pulse">
              {unreadCount} Unread
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadNotifications}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium dark:text-white"
          >
            Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
            >
              <CheckCheck size={16} />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-16 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">Loading notifications...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="p-20 text-center text-gray-500 dark:text-gray-400">
          <Bell size={64} className="mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-semibold mb-1">No notifications yet</h3>
          <p className="text-sm">When you receive alerts, they will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, idx) => {
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
                className={`rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm transition-all duration-200 ${hasUnread ? 'border-l-4 ' + getAgencyAccent(group.agency_type) : 'bg-white dark:bg-gray-800'
                  }`}
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleGroup(key)}
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleGroup(key);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Agency icon */}
                    <div className="flex-shrink-0">
                      {getAgencyIcon(group.agency_type)}
                    </div>

                    {/* Main info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Incident ID */}
                        {group.incident_id ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${getAgencyBadge(group.agency_type)}`}>
                            {formatAgency(group.agency_type) || 'INC'} #{group.incident_id.slice(0, 8).toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            System
                          </span>
                        )}

                        {/* Unread badge */}
                        {hasUnread && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {group.unreadCount} new
                          </span>
                        )}

                        {/* Update count */}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {group.notifications.length} update{group.notifications.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Latest notification preview */}
                      <p className="text-sm font-medium text-gray-800 dark:text-white mt-0.5 truncate">
                        {latest.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {latest.body}
                      </p>
                    </div>
                  </div>

                  {/* Right side: time + mark read + chevron */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Clock size={11} />
                      {formatTime(group.latestAt)}
                    </div>

                    {hasUnread && (
                      <button
                        onClick={(e) => handleMarkGroupRead(group, e)}
                        title="Mark all in group as read"
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors"
                      >
                        <Check size={14} className="text-gray-500 dark:text-gray-400" />
                      </button>
                    )}

                    <div className="text-gray-400 dark:text-gray-500">
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Accordion Body — chronological timeline */}
                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 px-5 py-3">
                    {/* Click to view incident */}
                    {group.incident_id && (
                      <button
                        onClick={() => navigate(`/incidents/${group.incident_id}`)}
                        className="mb-3 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
                      >
                        <AlertCircle size={12} />
                        View full incident →
                      </button>
                    )}

                    {/* Timeline */}
                    <div className="relative">
                      {/* Vertical line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

                      <div className="space-y-3">
                        {visibleNotifs.map((notif, nIdx) => {
                          const isFirst = nIdx === 0;
                          return (
                            <div
                              key={notif.id}
                              className="flex gap-3 items-start cursor-pointer group/item"
                              onClick={() => handleNotificationClick(notif)}
                            >
                              {/* Timeline dot */}
                              <div className={`relative z-10 flex-shrink-0 w-[15px] h-[15px] rounded-full border-2 mt-0.5 ${!notif.is_read
                                ? 'bg-blue-500 border-blue-500'
                                : isFirst
                                  ? 'bg-gray-400 border-gray-400'
                                  : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                                }`} />

                              {/* Content */}
                              <div className={`flex-1 pb-1 ${!notif.is_read ? 'opacity-100' : 'opacity-75'
                                }`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <p className={`text-sm ${!notif.is_read
                                      ? 'font-semibold text-gray-800 dark:text-white'
                                      : 'font-medium text-gray-600 dark:text-gray-300'
                                      }`}>
                                      {notif.title}
                                      {!notif.is_read && (
                                        <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full ml-2 mb-0.5 align-middle" />
                                      )}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                                      {notif.body}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className="text-[11px] text-gray-400" title={formatFullTime(notif.created_at)}>
                                      {formatTime(notif.created_at)}
                                    </span>
                                    {!notif.is_read && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notif.id); }}
                                        title="Mark as read"
                                        className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-all"
                                      >
                                        <Check size={12} className="text-gray-500" />
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
                            className="ml-[23px] mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >
                            {isExpanded ? '↑ Show less' : `↓ Show ${hiddenCount} older update${hiddenCount !== 1 ? 's' : ''}`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
