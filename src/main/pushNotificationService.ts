import { SupabaseClient } from '@supabase/supabase-js';
import { app, BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

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

type PushDeliveryOutcome = 'sent' | 'no-token' | 'retry';

const EDGE_FUNCTION_URL = 'https://agghqjkyzpkxvlvurjpj.functions.supabase.co/send-fcm';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHECK_INTERVAL = 15000;
const LOOKBACK_WINDOW = 24 * 60 * 60 * 1000;
const PROCESSED_RETENTION = 7 * 24 * 60 * 60 * 1000;
const PROCESSED_STATE_FILE = 'push-notification-state.json';

export class PushNotificationService {
  private supabase: SupabaseClient;
  private supabaseAnonKey: string;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private mainWindow: BrowserWindow | null = null;
  private processedNotifications = new Map<number, number>();
  private stateReady = false;

  constructor(supabase: SupabaseClient, supabaseAnonKey: string) {
    this.supabase = supabase;
    this.supabaseAnonKey = supabaseAnonKey;
  }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  start() {
    if (this.intervalId) {
      console.log('[PushService] Already running');
      return;
    }

    console.log('[PushService] Starting background push notification service');
    this.intervalId = setInterval(() => this.checkAndSendNotifications(), CHECK_INTERVAL);

    void this.loadState().then(() => this.checkAndSendNotifications());
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[PushService] Stopped');
    }
  }

  private async checkAndSendNotifications() {
    if (this.isProcessing || !this.stateReady) {
      return; // Skip if already processing
    }

    this.isProcessing = true;

    try {
      // Use a durable lookback window so app restarts do not lose notifications.
      const { data: notifications, error } = await this.supabase
        .from('notifications')
        .select('id, recipient_id, incident_id, title, body, created_at')
        .gte('created_at', new Date(Date.now() - LOOKBACK_WINDOW).toISOString())
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('[PushService] Error fetching notifications:', error);
        return;
      }

      if (!notifications || notifications.length === 0) {
        return;
      }

      // Filter out already processed notifications
      const pendingNotifications = notifications.filter(
        (n: PendingNotification) => !this.processedNotifications.has(n.id)
      );

      if (pendingNotifications.length === 0) {
        return;
      }

      console.log(`[PushService] Found ${pendingNotifications.length} pending notifications`);

      for (const notif of pendingNotifications) {
        const outcome = await this.sendPushForNotification(notif);
        if (outcome !== 'retry') {
          if (outcome === 'sent') this.notifyRenderer(notif);
          this.processedNotifications.set(notif.id, Date.now());
          await this.persistState();
        }
      }
    } catch (error) {
      console.error('[PushService] Error in checkAndSendNotifications:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendPushForNotification(notif: PendingNotification): Promise<PushDeliveryOutcome> {
    try {
      console.log(`[PushService] Processing notification ${notif.id} for recipient ${notif.recipient_id}`);

      // Get push tokens for this recipient
      const { data: tokens, error } = await this.supabase
        .from('push_tokens')
        .select('token, platform, app_type')
        .eq('user_id', notif.recipient_id);

      if (error) {
        console.error('[PushService] Error fetching tokens:', error);
        return 'retry';
      }

      if (!tokens || tokens.length === 0) {
        console.log(`[PushService] Skipping notification ${notif.id}; recipient has no push token`);
        return 'no-token';
      }

      console.log(`[PushService] Found ${tokens.length} token(s) for recipient ${notif.recipient_id}`);

      let allSent = true;
      for (const tokenData of tokens as PushToken[]) {
        const platform = tokenData.platform || '';
        const appType = tokenData.app_type || 'responder'; // Default to responder for backward compatibility

        const claimed = await this.claimDelivery(notif, tokenData.token, appType);
        if (!claimed) {
          continue;
        }

        // Determine if this is an Expo token or FCM token
        const isExpo = tokenData.token.startsWith('ExponentPushToken');

        console.log(`[PushService] Sending to token (platform: ${platform || 'unknown'}, app_type: ${appType}, isExpo: ${isExpo})`);

        // Smart detection: if platform is missing, detect from token format
        if (isExpo || platform === 'ios') {
          // Send via Expo
          const sent = await this.sendExpoNotification(tokenData.token, notif);
          await this.completeDelivery(notif, tokenData.token, appType, sent);
          allSent = sent && allSent;
        } else {
          // Send via FCM Edge Function (for Android/FCM tokens)
          const sent = await this.sendFCMNotification(tokenData.token, appType, notif);
          await this.completeDelivery(notif, tokenData.token, appType, sent);
          allSent = sent && allSent;
        }
      }
      return allSent ? 'sent' : 'retry';
    } catch (error) {
      console.error('[PushService] Error sending push for notification:', notif.id, error);
      return 'retry';
    }
  }

  private async claimDelivery(
    notif: PendingNotification,
    token: string,
    appType: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('claim_notification_push_delivery', {
      p_notification_id: notif.id,
      p_token: token,
      p_app_type: appType,
    });
    if (error) {
      console.error('[PushService] Failed to claim delivery:', error);
      return false;
    }
    return data === true;
  }

  private async completeDelivery(
    notif: PendingNotification,
    token: string,
    appType: string,
    success: boolean
  ): Promise<void> {
    const { error } = await this.supabase.rpc('complete_notification_push_delivery', {
      p_notification_id: notif.id,
      p_token: token,
      p_app_type: appType,
      p_success: success,
      p_error: success ? null : 'Push provider rejected or failed the request',
      p_retry_delay_seconds: 60,
    });
    if (error) {
      console.error('[PushService] Failed to complete delivery:', error);
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
            app_type: appType,
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
        return false;
      } else {
        console.log('[PushService] FCM push sent for notification:', notif.id);
        return true;
      }
    } catch (error) {
      console.error('[PushService] FCM push error:', error);
      return false;
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
        return false;
      } else {
        console.log('[PushService] Expo push sent for notification:', notif.id);
        return true;
      }
    } catch (error) {
      console.error('[PushService] Expo push error:', error);
      return false;
    }
  }

  private async loadState(): Promise<void> {
    try {
      const statePath = join(app.getPath('userData'), PROCESSED_STATE_FILE);
      const raw = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(raw) as { processed?: Record<string, number> };
      const cutoff = Date.now() - PROCESSED_RETENTION;
      Object.entries(state.processed || {}).forEach(([id, timestamp]) => {
        if (timestamp >= cutoff) this.processedNotifications.set(Number(id), timestamp);
      });
    } catch {
      // First run or corrupt state: the server lookback window remains recoverable.
    } finally {
      this.stateReady = true;
    }
  }

  private async persistState(): Promise<void> {
    const statePath = join(app.getPath('userData'), PROCESSED_STATE_FILE);
    const tempPath = `${statePath}.tmp`;
    await fs.writeFile(
      tempPath,
      JSON.stringify({ processed: Object.fromEntries(this.processedNotifications.entries()) }),
      'utf8'
    );
    await fs.rename(tempPath, statePath);
  }

  /**
   * Send a new-notification IPC event to the renderer window so the
   * admin UI can update its badge and show a desktop toast in real-time.
   */
  private notifyRenderer(notif: PendingNotification) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }
    try {
      this.mainWindow.webContents.send('new-notification', {
        id: notif.id,
        recipient_id: notif.recipient_id,
        title: notif.title,
        body: notif.body,
        incident_id: notif.incident_id,
        created_at: notif.created_at,
      });
      console.log('[PushService] Sent new-notification IPC for notification:', notif.id);
    } catch (error) {
      console.error('[PushService] Failed to send IPC notification:', error);
    }
  }
}
