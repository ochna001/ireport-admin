import { SupabaseClient } from '@supabase/supabase-js';

interface PendingNotification {
  id: number;
  recipient_id: string;
  incident_id: string | null;
  title: string;
  body: string;
  created_at: string;
}

interface PushToken {
  token: string;
  platform: string | null;
  app_type: string | null;
}

const EDGE_FUNCTION_URL = 'https://agghqjkyzpkxvlvurjpj.functions.supabase.co/send-fcm';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHECK_INTERVAL = 5000; // Check every 5 seconds
const PROCESSED_NOTIFICATIONS = new Set<number>();

export class PushNotificationService {
  private supabase: SupabaseClient;
  private supabaseAnonKey: string;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(supabase: SupabaseClient, supabaseAnonKey: string) {
    this.supabase = supabase;
    this.supabaseAnonKey = supabaseAnonKey;
  }

  start() {
    if (this.intervalId) {
      console.log('[PushService] Already running');
      return;
    }

    console.log('[PushService] Starting background push notification service');
    this.intervalId = setInterval(() => this.checkAndSendNotifications(), CHECK_INTERVAL);
    
    // Run immediately on start
    this.checkAndSendNotifications();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[PushService] Stopped');
    }
  }

  private async checkAndSendNotifications() {
    if (this.isProcessing) {
      return; // Skip if already processing
    }

    this.isProcessing = true;

    try {
      // Fetch notifications created in the last 30 seconds that haven't been processed
      const { data: notifications, error } = await this.supabase
        .from('notifications')
        .select('id, recipient_id, incident_id, title, body, created_at')
        .gte('created_at', new Date(Date.now() - 30000).toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[PushService] Error fetching notifications:', error);
        return;
      }

      if (!notifications || notifications.length === 0) {
        return;
      }

      // Filter out already processed notifications
      const pendingNotifications = notifications.filter(
        (n: PendingNotification) => !PROCESSED_NOTIFICATIONS.has(n.id)
      );

      if (pendingNotifications.length === 0) {
        return;
      }

      console.log(`[PushService] Found ${pendingNotifications.length} pending notifications`);

      for (const notif of pendingNotifications) {
        await this.sendPushForNotification(notif);
        PROCESSED_NOTIFICATIONS.add(notif.id);
        
        // Clean up old entries to prevent memory leak
        if (PROCESSED_NOTIFICATIONS.size > 1000) {
          const toDelete = Array.from(PROCESSED_NOTIFICATIONS).slice(0, 500);
          toDelete.forEach(id => PROCESSED_NOTIFICATIONS.delete(id));
        }
      }
    } catch (error) {
      console.error('[PushService] Error in checkAndSendNotifications:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendPushForNotification(notif: PendingNotification) {
    try {
      console.log(`[PushService] Processing notification ${notif.id} for recipient ${notif.recipient_id}`);
      
      // Get push tokens for this recipient
      const { data: tokens, error } = await this.supabase
        .from('push_tokens')
        .select('token, platform, app_type')
        .eq('user_id', notif.recipient_id);

      if (error) {
        console.error('[PushService] Error fetching tokens:', error);
        return;
      }

      if (!tokens || tokens.length === 0) {
        console.warn(`[PushService] No push tokens found for recipient ${notif.recipient_id}`);
        return;
      }

      console.log(`[PushService] Found ${tokens.length} token(s) for recipient ${notif.recipient_id}`);

      for (const tokenData of tokens as PushToken[]) {
        const platform = tokenData.platform || '';
        const appType = tokenData.app_type || 'responder'; // Default to responder for backward compatibility
        
        // Determine if this is an Expo token or FCM token
        const isExpo = tokenData.token.startsWith('ExponentPushToken');
        
        console.log(`[PushService] Sending to token (platform: ${platform || 'unknown'}, app_type: ${appType}, isExpo: ${isExpo})`);
        
        // Smart detection: if platform is missing, detect from token format
        if (isExpo || platform === 'ios') {
          // Send via Expo
          await this.sendExpoNotification(tokenData.token, notif);
        } else {
          // Send via FCM Edge Function (for Android/FCM tokens)
          await this.sendFCMNotification(tokenData.token, appType, notif);
        }
      }
    } catch (error) {
      console.error('[PushService] Error sending push for notification:', notif.id, error);
    }
  }

  private async sendFCMNotification(token: string, appType: string, notif: PendingNotification) {
    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseAnonKey}` // Required for Supabase edge functions
        },
        body: JSON.stringify({
          token,
          title: notif.title,
          body: notif.body,
          app_type: appType, // NEW: Tell edge function which Firebase project to use
          data: {
            incident_id: notif.incident_id || '',
            notification_id: notif.id.toString(),
            title: notif.title,
            body: notif.body,
          },
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        console.error('[PushService] FCM push failed:', response.status, responseText);
        
        // Remove stale tokens on SENDER_ID_MISMATCH
        if (responseText.includes('SENDER_ID_MISMATCH')) {
          await this.supabase
            .from('push_tokens')
            .delete()
            .eq('token', token);
          console.warn('[PushService] Removed stale FCM token');
        }
      } else {
        console.log('[PushService] FCM push sent for notification:', notif.id);
      }
    } catch (error) {
      console.error('[PushService] FCM push error:', error);
    }
  }

  private async sendExpoNotification(token: string, notif: PendingNotification) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: token,
          title: notif.title,
          body: notif.body,
          sound: 'default',
          priority: 'high',
          channelId: 'status-updates',
          data: {
            incident_id: notif.incident_id || '',
            notification_id: notif.id.toString(),
          },
        }),
      });

      const responseData = await response.json();

      if (!response.ok || responseData.data?.[0]?.status === 'error') {
        console.error('[PushService] Expo push failed:', responseData);
      } else {
        console.log('[PushService] Expo push sent for notification:', notif.id);
      }
    } catch (error) {
      console.error('[PushService] Expo push error:', error);
    }
  }
}
