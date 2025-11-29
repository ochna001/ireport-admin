import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { BrowserWindow } from 'electron';
import { existsSync } from 'fs';
import fetch from 'node-fetch';
import { join } from 'path';
import { getDatabase } from './database';

// Load environment variables - try multiple paths
const envPaths = [
  join(__dirname, '../../.env'),
  join(process.cwd(), '.env'),
];
for (const p of envPaths) {
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}

// Use env vars for Supabase config (support both naming conventions)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

interface SyncStatus {
  connected: boolean;
  lastSync: string | null;
  pending: number;
  syncing: boolean;
}

export class SyncManager {
  private supabase: SupabaseClient;
  private syncInterval: NodeJS.Timeout | null = null;
  private status: SyncStatus = {
    connected: false,
    lastSync: null,
    pending: 0,
    syncing: false,
  };

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { fetch: fetch as any }
    });
  }

  async start(): Promise<void> {
    // Initial sync
    await this.syncNow();

    // Set up real-time subscription for new incidents
    this.supabase
      .channel('incidents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, (payload) => {
        this.handleRealtimeChange(payload);
      })
      .subscribe((status) => {
        this.status.connected = status === 'SUBSCRIBED';
        this.notifyRenderer();
      });

    // Periodic sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.syncNow();
    }, 30000);
  }

  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    await this.supabase.removeAllChannels();
  }

  async syncNow(): Promise<void> {
    if (this.status.syncing) return;

    this.status.syncing = true;
    this.notifyRenderer();

    try {
      // 1. Pull new/updated incidents from cloud
      await this.pullFromCloud();

      // 2. Push local changes to cloud
      await this.pushToCloud();

      // 3. Sync status history
      await this.syncStatusHistory();

      this.status.lastSync = new Date().toISOString();
      this.status.connected = true;
    } catch (error) {
      console.error('Sync error:', error);
      this.status.connected = false;
    } finally {
      this.status.syncing = false;
      this.updatePendingCount();
      this.notifyRenderer();
    }
  }

  private async pullFromCloud(): Promise<void> {
    const db = getDatabase();
    
    // Get last sync time
    const lastSyncRow = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_pull'").get() as { value: string } | undefined;
    const lastSync = lastSyncRow?.value || '1970-01-01T00:00:00Z';

    // Fetch updated incidents from Supabase
    const { data: incidents, error } = await this.supabase
      .from('incidents')
      .select('*')
      .gte('updated_at', lastSync)
      .order('updated_at', { ascending: true });

    if (error) throw error;

    if (incidents && incidents.length > 0) {
      const upsert = db.prepare(`
        INSERT INTO incidents (
          id, agency_type, reporter_id, reporter_name, reporter_age,
          description, status, location_lat, location_lng, location_address,
          media_urls, created_at, updated_at, cloud_updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          status = CASE 
            WHEN excluded.cloud_updated_at > cloud_updated_at THEN excluded.status 
            ELSE status 
          END,
          updated_at = CASE 
            WHEN excluded.cloud_updated_at > cloud_updated_at THEN excluded.updated_at 
            ELSE updated_at 
          END,
          cloud_updated_at = excluded.cloud_updated_at,
          synced = 1
        WHERE excluded.cloud_updated_at > incidents.cloud_updated_at OR incidents.synced = 1
      `);

      for (const incident of incidents) {
        upsert.run(
          incident.id,
          incident.agency_type,
          incident.reporter_id,
          incident.reporter_name,
          incident.reporter_age,
          incident.description,
          incident.status,
          incident.latitude,
          incident.longitude,
          incident.location_address,
          JSON.stringify(incident.media_urls || []),
          incident.created_at,
          incident.updated_at,
          incident.updated_at, // cloud_updated_at
        );
      }

      // Update last pull time
      db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_pull', ?)").run(new Date().toISOString());
    }
  }

  private async pushToCloud(): Promise<void> {
    const db = getDatabase();

    // Get pending sync items
    const pendingItems = db.prepare(`
      SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT 50
    `).all() as Array<{ id: number; table_name: string; record_id: string; action: string }>;

    for (const item of pendingItems) {
      try {
        if (item.table_name === 'incidents' && item.action === 'update') {
          const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(item.record_id) as any;
          
          if (incident) {
            // Check for conflict - get cloud version
            const { data: cloudIncident } = await this.supabase
              .from('incidents')
              .select('updated_at')
              .eq('id', item.record_id)
              .single();

            // If cloud is newer, skip this update (cloud wins for same-time conflicts)
            if (cloudIncident && new Date(cloudIncident.updated_at) > new Date(incident.updated_at)) {
              console.log(`Conflict detected for ${item.record_id}, cloud version is newer`);
              // Remove from queue, cloud version will be pulled
              db.prepare('DELETE FROM sync_queue WHERE id = ?').run(item.id);
              continue;
            }

            // Push update to cloud
            const { error } = await this.supabase
              .from('incidents')
              .update({
                status: incident.status,
                updated_at: incident.updated_at,
                updated_by: incident.updated_by,
              })
              .eq('id', item.record_id);

            if (error) throw error;
          }
        }

        // Remove from queue on success
        db.prepare('DELETE FROM sync_queue WHERE id = ?').run(item.id);
        db.prepare('UPDATE incidents SET synced = 1 WHERE id = ?').run(item.record_id);

      } catch (error: any) {
        // Increment attempts and log error
        db.prepare(`
          UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?
        `).run(error.message, item.id);

        // Remove if too many attempts
        if (item.action === 'update') {
          const attempts = db.prepare('SELECT attempts FROM sync_queue WHERE id = ?').get(item.id) as { attempts: number };
          if (attempts && attempts.attempts >= 5) {
            db.prepare('DELETE FROM sync_queue WHERE id = ?').run(item.id);
          }
        }
      }
    }
  }

  private async syncStatusHistory(): Promise<void> {
    const db = getDatabase();

    // Push unsynced status history to cloud
    const unsyncedHistory = db.prepare(`
      SELECT * FROM status_history WHERE synced = 0 ORDER BY changed_at ASC
    `).all() as Array<{ id: number; incident_id: string; status: string; notes: string; changed_by: string; changed_at: string }>;

    for (const entry of unsyncedHistory) {
      try {
        const { error } = await this.supabase
          .from('incident_status_history')
          .insert({
            incident_id: entry.incident_id,
            status: entry.status,
            notes: entry.notes,
            changed_by: entry.changed_by,
            changed_at: entry.changed_at,
          });

        if (!error) {
          db.prepare('UPDATE status_history SET synced = 1 WHERE id = ?').run(entry.id);
        }
      } catch (error) {
        console.error('Failed to sync status history:', error);
      }
    }
  }

  private handleRealtimeChange(payload: any): void {
    const db = getDatabase();
    
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const incident = payload.new;
      
      // Check if we have local changes that are newer
      const local = db.prepare('SELECT updated_at, synced FROM incidents WHERE id = ?').get(incident.id) as { updated_at: string; synced: number } | undefined;
      
      if (!local || local.synced === 1 || new Date(incident.updated_at) > new Date(local.updated_at)) {
        // Cloud version is newer or no local changes, update local
        db.prepare(`
          INSERT INTO incidents (
            id, agency_type, reporter_id, reporter_name, reporter_age,
            description, status, location_lat, location_lng, location_address,
            media_urls, created_at, updated_at, cloud_updated_at, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at,
            cloud_updated_at = excluded.cloud_updated_at,
            synced = 1
        `).run(
          incident.id,
          incident.agency_type,
          incident.reporter_id,
          incident.reporter_name,
          incident.reporter_age,
          incident.description,
          incident.status,
          incident.latitude,
          incident.longitude,
          incident.location_address,
          JSON.stringify(incident.media_urls || []),
          incident.created_at,
          incident.updated_at,
          incident.updated_at,
        );

        // Notify renderer of new data
        this.notifyRenderer('incident-updated', incident);
      }
    }
  }

  private updatePendingCount(): void {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM sync_queue').get() as { count: number };
    this.status.pending = result.count;
  }

  private notifyRenderer(event = 'sync-status', data?: any): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(event, data || this.status);
    }
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }
}
