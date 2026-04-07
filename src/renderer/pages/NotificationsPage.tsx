import { Bell, Check, CheckCheck, Shield, Flame, Waves, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionScope } from '../utils/sessionScope';

interface Notification {
  id: number;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  incident_id?: string;
  incidents?: {
    id: string;
    agency_type: string;
    description: string;
  };
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const scope = getSessionScope();
      if (!scope.userId) return;

      const data = await window.api.getNotificationsByUser(scope.userId);
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const scope = getSessionScope();
      if (!scope.userId) return;

      const count = await window.api.getUnreadNotificationCount(scope.userId);
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  const handleMarkAsRead = async (notificationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.api.markNotificationAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const scope = getSessionScope();
      if (!scope.userId) return;

      await window.api.markAllNotificationsAsRead(scope.userId);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id, { stopPropagation: () => {} } as any);
    }

    if (notification.incident_id) {
      navigate(`/incidents/${notification.incident_id}`);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getAgencyIcon = (agency?: string) => {
    switch (agency?.toLowerCase()) {
      case 'pnp': return <Shield size={16} className="text-blue-600" />;
      case 'bfp': return <Flame size={16} className="text-red-600" />;
      case 'pdrrmo': return <Waves size={16} className="text-cyan-600" />;
      default: return null;
    }
  };

  const getAgencyBg = (agency?: string) => {
    switch (agency?.toLowerCase()) {
      case 'pnp': return 'bg-blue-50 dark:bg-blue-900/20';
      case 'bfp': return 'bg-red-50 dark:bg-red-900/20';
      case 'pdrrmo': return 'bg-cyan-50 dark:bg-cyan-900/20';
      default: return 'bg-gray-50 dark:bg-gray-800';
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="text-gray-800 dark:text-white" size={28} />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
              {unreadCount} Unread
            </span>
          )}
        </div>
        <div className="flex gap-3">
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
              Mark all as read
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500 dark:text-gray-400">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-16 text-center text-gray-500 dark:text-gray-400">
            <Bell size={64} className="mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium">No notifications yet</h3>
            <p className="text-sm">When you receive alerts, they will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {notifications.map(notification => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors relative ${
                  !notification.is_read ? 'bg-blue-50/50 dark:bg-blue-900/5' : ''
                }`}
              >
                {!notification.is_read && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>
                )}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-800 dark:text-white">
                        {notification.title}
                      </h3>
                      {!notification.is_read && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 mb-3">
                      {notification.body}
                    </p>
                    
                    {notification.incidents && (
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700 ${getAgencyBg(notification.incidents.agency_type)}`}>
                        {getAgencyIcon(notification.incidents.agency_type)}
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          {notification.incidents.agency_type?.toUpperCase()} #{notification.incident_id?.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                    )}
                    
                    <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                       <AlertCircle size={12} />
                       {formatTime(notification.created_at)}
                    </div>
                  </div>
                  
                  {!notification.is_read && (
                    <button
                      onClick={(e) => handleMarkAsRead(notification.id, e)}
                      className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-full shadow-sm transition-all"
                      title="Mark as read"
                    >
                      <Check size={18} className="text-gray-600 dark:text-gray-300" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
