import Database from 'better-sqlite3';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

let db: Database.Database | null = null;

export function initDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const userDataPath = app.getPath('userData');
    const dbDir = join(userDataPath, 'data');
    
    // Ensure directory exists
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = join(dbDir, 'ireport.db');
    db = new Database(dbPath);

    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');

    // Create tables
    db.exec(`
      -- Incidents table (mirrors Supabase)
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        agency_type TEXT NOT NULL,
        reporter_id TEXT,
        reporter_name TEXT,
        reporter_age INTEGER,
        description TEXT,
        status TEXT DEFAULT 'pending',
        location_lat REAL,
        location_lng REAL,
        location_address TEXT,
        media_urls TEXT, -- JSON array
        created_at TEXT,
        updated_at TEXT,
        updated_by TEXT,
        synced INTEGER DEFAULT 0,
        cloud_updated_at TEXT -- Track cloud version for conflict resolution
      );

      -- Status history (append-only for conflict resolution)
      CREATE TABLE IF NOT EXISTS status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        changed_by TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (incident_id) REFERENCES incidents(id)
      );

      -- Sync queue for pending changes
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        action TEXT NOT NULL, -- 'insert', 'update', 'delete'
        created_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      );

      -- Agency users (for login)
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL, -- 'admin', 'pnp', 'bfp', 'pdrrmo'
        agency_type TEXT,
        created_at TEXT,
        last_login TEXT
      );

      -- Audit log for all actions
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        action TEXT NOT NULL,
        table_name TEXT,
        record_id TEXT,
        old_value TEXT, -- JSON
        new_value TEXT, -- JSON
        created_at TEXT NOT NULL
      );

      -- Sync metadata
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
      CREATE INDEX IF NOT EXISTS idx_incidents_agency ON incidents(agency_type);
      CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);
      CREATE INDEX IF NOT EXISTS idx_status_history_incident ON status_history(incident_id);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(table_name, record_id);
    `);

    console.log('Database initialized at:', dbPath);
    resolve();
  });
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
