import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { existsSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import { join } from 'path';
import { getMunicipalityFromCoordinates, isInMunicipality } from './geoUtils';
import { PushNotificationService } from './pushNotificationService';

// ============================================
// OBFUSCATED CONFIGURATION
// Keys are encoded and split for security
// ============================================

// Decode function - assembles key at runtime
const _d = (e: string): string => Buffer.from(e, 'base64').toString('utf-8');

// Split and encoded parts (not readable as plain text)
const _p1 = 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemQ=';
const _p2 = 'WEJoWW1GelpTSXNJbkpsWmlJNkltRm5aMmh4YW10NWVuQnJlSFpzZG5WeWFuQnFJaXdpY205c1pTSTZJbk5sY25acFkyVmZjbTlzWlNJc0ltbGhkQ0k2TVRjMk1qSXhPVEU0T0N3aVpYaHdJam95TURjM056azFNVGc0ZlEubHZ0X21remhadC0tcEFFaGM3QTFSNF9jN01STDJsUzZaeTNZaFFfclhzWQ==';
const _u1 = 'aHR0cHM6Ly9hZ2docWpreXpwa3h2bHZ1cmpwai5zdXBhYmFzZS5jbw==';
const _g1 = 'QUl6YVN5QnV5bG5PZGtZbnRzSUZZVkRic1FGZW1leXF5YTFUYVRj';

// Assemble at runtime - harder to find in binary
const getConfig = () => ({
  SUPABASE_URL: _d(_u1),
  SUPABASE_KEY: _d(_p1) + _d(_p2),
  GOOGLE_PLACES_API_KEY: _d(_g1),
});

const EMBEDDED_CONFIG = getConfig();

// Try to load .env file (for development or if user provides one)
const possibleEnvPaths = [
  join(__dirname, '.env'),
  join(__dirname, '../.env'),
  join(__dirname, '../../.env'),
  join(process.cwd(), '.env'),
  join(app.getPath('userData'), '.env'), // User data folder
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    console.log('[Admin] Loading .env from:', envPath);
    config({ path: envPath });
    envLoaded = true;
    break;
  }
}

// Polyfill fetch for Supabase
if (!global.fetch) {
  (global as any).fetch = fetch;
}

// Always use embedded config, but allow .env to override if values are present
const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || EMBEDDED_CONFIG.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || EMBEDDED_CONFIG.SUPABASE_KEY;
const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || EMBEDDED_CONFIG.GOOGLE_PLACES_API_KEY;

// Store for use in handlers
(global as any).GOOGLE_PLACES_API_KEY = googlePlacesKey;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Admin] Missing Supabase credentials!');
  console.error('[Admin] Either set EMBEDDED_CONFIG in source or provide .env file');
}

console.log('[Admin] Supabase URL:', supabaseUrl);
console.log('[Admin] Supabase Key length:', supabaseKey?.length || 0);
console.log('[Admin] Config source:', envLoaded ? '.env file' : 'embedded');
console.log('[Admin] EMBEDDED_CONFIG.SUPABASE_URL:', EMBEDDED_CONFIG.SUPABASE_URL);
console.log('[Admin] EMBEDDED_CONFIG.SUPABASE_KEY length:', EMBEDDED_CONFIG.SUPABASE_KEY?.length || 0);

const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: fetch as any,
  }
});

ipcMain.handle('calls:listSessions', async (_event, payload?: {
  status?: string;
  limit?: number;
}) => {
  try {
    const limit = Math.min(Math.max(Number(payload?.limit) || 50, 1), 200);
    const status = String(payload?.status || '').trim().toLowerCase();

    let query = supabase
      .from('call_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('[Admin] Failed to list call sessions:', error);
    throw new Error(error.message || 'Failed to list call sessions');
  }
});

ipcMain.handle('calls:updateSessionStatus', async (_event, payload: {
  sessionId: string;
  status: 'initiated' | 'ringing' | 'active' | 'ended' | 'cancelled' | 'failed';
  receiverUserId?: string;
}) => {
  try {
    const sessionId = String(payload?.sessionId || '').trim();
    const status = String(payload?.status || '').trim().toLowerCase();
    const receiverUserId = String(payload?.receiverUserId || '').trim() || null;
    const allowedStatuses = new Set(['initiated', 'ringing', 'active', 'ended', 'cancelled', 'failed']);
    if (!sessionId) throw new Error('Missing sessionId');
    if (!status) throw new Error('Missing status');
    if (!allowedStatuses.has(status)) throw new Error('Invalid status');

    const { data: currentSession, error: currentError } = await supabase
      .from('call_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    if (currentError) throw currentError;
    if (!currentSession) throw new Error('Call session not found');

    const currentReceiver = String(currentSession.receiver_user_id || '').trim() || null;

    if (status === 'active') {
      if (!receiverUserId) {
        throw new Error('receiverUserId is required to accept a call');
      }

      if (currentSession.status === 'active' && currentReceiver === receiverUserId) {
        return currentSession;
      }

      if (currentReceiver && currentReceiver !== receiverUserId) {
        throw new Error('Call already claimed by another dispatcher');
      }

      if (!['initiated', 'ringing', 'active'].includes(String(currentSession.status || ''))) {
        throw new Error(`Cannot accept call in status ${currentSession.status}`);
      }
    }

    if (['ended', 'cancelled', 'failed'].includes(status) && receiverUserId && currentReceiver && currentReceiver !== receiverUserId) {
      throw new Error('Only the assigned dispatcher can end this call');
    }

    const updates: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'active') {
      updates.receiver_user_id = receiverUserId;
      updates.started_at = currentSession.started_at || new Date().toISOString();
    }
    if (status === 'ended' || status === 'cancelled' || status === 'failed') {
      updates.ended_at = new Date().toISOString();
    }

    let result = await supabase
      .from('call_sessions')
      .update(updates)
      .eq('id', sessionId)
      .eq('updated_at', currentSession.updated_at)
      .select('*')
      .single();

    // If FK fails (e.g. Admin PIN user not in auth.users), retry without receiver_user_id
    // and store dispatcher identity in metadata instead.
    if (result.error && result.error.message?.includes('violates foreign key constraint')) {
      console.warn('[Admin] FK violation on receiver_user_id; falling back to metadata for dispatcher:', receiverUserId);
      delete updates.receiver_user_id;

      const meta = { ...(currentSession.metadata || {}) };
      meta.dispatcher_id = receiverUserId;
      meta.dispatcher_role = 'Admin PIN';
      meta.claimed_at = new Date().toISOString();
      updates.metadata = meta;

      result = await supabase
        .from('call_sessions')
        .update(updates)
        .eq('id', sessionId)
        .eq('updated_at', currentSession.updated_at)
        .select('*')
        .single();
    }

    if (result.error) {
      if (result.error.code === 'PGRST116') {
        throw new Error('Call state changed by another dispatcher. Refresh and retry.');
      }
      throw result.error;
    }
    return result.data;
  } catch (error: any) {
    console.error('[Admin] Failed to update call session status:', error);
    throw new Error(error.message || 'Failed to update call session status');
  }
});

ipcMain.handle('calls:listTranscripts', async (_event, payload: {
  sessionId: string;
}) => {
  try {
    const sessionId = String(payload?.sessionId || '').trim();
    if (!sessionId) throw new Error('Missing sessionId');

    const { data, error } = await supabase
      .from('call_transcripts')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(2000);

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('[Admin] Failed to list call transcripts:', error);
    throw new Error(error.message || 'Failed to list call transcripts');
  }
});

ipcMain.handle('calls:addTranscriptLine', async (_event, payload: {
  sessionId: string;
  room?: string;
  speaker: 'caller' | 'receiver' | 'dispatcher' | 'system';
  text: string;
  isFinal?: boolean;
}) => {
  try {
    const sessionId = String(payload?.sessionId || '').trim();
    const speaker = String(payload?.speaker || '').trim().toLowerCase();
    const text = String(payload?.text || '').trim();
    const allowedSpeakers = new Set(['caller', 'receiver', 'dispatcher', 'system']);
    if (!sessionId) throw new Error('Missing sessionId');
    if (!speaker || !allowedSpeakers.has(speaker)) throw new Error('Invalid speaker');
    if (!text) throw new Error('Missing text');
    if (text.length > 3000) throw new Error('Transcript line exceeds 3000 characters');

    let room = String(payload?.room || '').trim();
    if (!room) {
      const { data: sessionData, error: sessionError } = await supabase
        .from('call_sessions')
        .select('room')
        .eq('id', sessionId)
        .single();
      if (sessionError) throw sessionError;
      room = String(sessionData?.room || '').trim();
    }

    const { data, error } = await supabase
      .from('call_transcripts')
      .insert({
        session_id: sessionId,
        room,
        speaker,
        text,
        is_final: payload?.isFinal !== false,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('[Admin] Failed to add call transcript line:', error);
    throw new Error(error.message || 'Failed to add call transcript line');
  }
});

ipcMain.handle('calls:getTranscriptText', async (_event, payload: {
  sessionId: string;
}) => {
  try {
    const sessionId = String(payload?.sessionId || '').trim();
    if (!sessionId) throw new Error('Missing sessionId');

    const { data, error } = await supabase
      .from('call_transcripts')
      .select('speaker,text,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(4000);

    if (error) throw error;

    const transcript = (data || [])
      .map((line: any) => `${String(line.speaker || 'caller')}: ${String(line.text || '').trim()}`)
      .filter((line: string) => line.trim().length > 0)
      .join('\n');

    return {
      sessionId,
      transcript,
      lines: data || [],
    };
  } catch (error: any) {
    console.error('[Admin] Failed to build call transcript text:', error);
    throw new Error(error.message || 'Failed to build call transcript text');
  }
});

// Initialize push notification service
const pushService = new PushNotificationService(supabase, supabaseKey);

let mainWindow: BrowserWindow | null = null;
let debugModeEnabled = false;

// Simple cache to reduce API calls
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache: Map<string, CacheEntry<any>> = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    console.log(`[Admin] Cache hit for ${key}`);
    return entry.data;
  }
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function clearCache(key: string): void {
  cache.delete(key);
}

function clearAllCaches(): void {
  cache.clear();
}

function createWindow() {
  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          process.env.NODE_ENV === 'development'
            ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://exp.host https://router.project-osrm.org https://*.ochana0101.click https://call.ochana0101.click https://ireport-call-test.onrender.com https://*.onrender.com wss://*.livekit.cloud https://*.livekit.cloud ws://localhost:* http://75.119.142.12:* http://127.0.0.1:* http://localhost:*; frame-src 'self' https://www.openstreetmap.org https://maps.google.com; media-src 'self' blob: mediastream:;"
            : "default-src 'self'; script-src 'self' https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://exp.host https://router.project-osrm.org https://*.ochana0101.click https://call.ochana0101.click https://ireport-call-test.onrender.com https://*.onrender.com wss://*.livekit.cloud https://*.livekit.cloud http://75.119.142.12:* http://127.0.0.1:* http://localhost:*; frame-src 'self' https://www.openstreetmap.org https://maps.google.com; media-src 'self' blob: mediastream:;"
        ]
      }
    });
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    autoHideMenuBar: true,  // Hide menu bar (Alt to show)
    frame: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,       // Isolate renderer from Node.js
      nodeIntegration: false,       // Disable Node.js in renderer
      sandbox: true,                // Enable sandbox for extra security
      webSecurity: true,            // Enable web security (CORS, etc.)
      allowRunningInsecureContent: false,  // Block mixed content
    },
    show: false,
  });

  // Remove menu bar completely on Windows
  mainWindow.setMenuBarVisibility(false);

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://127.0.0.1:5174');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

    // In production, disable DevTools by default
    // Block keyboard shortcuts for DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U (view source)
      if (!debugModeEnabled) {
        if (input.key === 'F12' ||
          (input.control && input.shift && (input.key === 'I' || input.key === 'i' || input.key === 'J' || input.key === 'j')) ||
          (input.control && (input.key === 'U' || input.key === 'u'))) {
          event.preventDefault();
        }
      }
    });

    // Disable right-click context menu in production (unless debug mode)
    mainWindow.webContents.on('context-menu', (event) => {
      if (!debugModeEnabled) {
        event.preventDefault();
      }
    });
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus(); // Ensure window gets focus
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    pushService.setMainWindow(null);
  });

  // Wire push service to this window so it can send IPC events
  pushService.setMainWindow(mainWindow);

  // Always focus window when it's shown (e.g., after logout)
  mainWindow.on('show', () => {
    mainWindow?.focus();
  });
}

app.whenReady().then(async () => {
  createWindow();

  // Start the push notification service
  pushService.start();
  console.log('[Admin] Push notification service started');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Stop the push notification service
  pushService.stop();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers - Debug Mode
ipcMain.handle('app:setDebugMode', async (_event, enabled: boolean) => {
  debugModeEnabled = enabled;

  if (mainWindow) {
    if (enabled) {
      // Open DevTools when debug mode is enabled
      mainWindow.webContents.openDevTools();
    } else {
      // Close DevTools when debug mode is disabled
      mainWindow.webContents.closeDevTools();
    }
  }

  return { success: true, debugMode: enabled };
});

ipcMain.handle('app:getDebugMode', async () => {
  return { debugMode: debugModeEnabled };
});

// Force window focus (for login after logout)
ipcMain.handle('app:focusWindow', async () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.focus();
    mainWindow.moveTop();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('app:confirm', async (_event, params: { message: string; detail?: string; title?: string }) => {
  const options = {
    type: 'question' as const,
    buttons: ['Cancel', 'Confirm'],
    defaultId: 1,
    cancelId: 0,
    title: params.title || 'Confirm',
    message: params.message,
    detail: params.detail,
    normalizeAccessKeys: true,
  };

  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);

  return { confirmed: result.response === 1 };
});

// IPC Handlers - using Supabase directly
// Municipality detection now uses GeoJSON polygons via geoUtils.ts for accurate boundary detection

ipcMain.handle('db:getIncidents', async (_event, filters: {
  agency?: string;
  status?: string;
  municipality?: string;
  barangay?: string;
  incident_type?: string;
  limit?: number;
  stationId?: number;
  page?: number;
  pageSize?: number;
  search?: string;
} = {}) => {
  const pageSize = filters.pageSize || 20;
  const page = filters.page || 1;
  const offset = (page - 1) * pageSize;

  // Build query with count - include lat/lng for coordinate-based filtering
  // Always exclude ai_routing incidents (fast reports awaiting AI triage)
  let query = supabase.from('incidents').select('*', { count: 'exact' }).neq('status', 'ai_routing');

  const sanitize = (value?: string) => value?.trim().replace(/,/g, ' ') || '';

  // Variables to track multi-agency incidents for later use
  let multiAgencyIncidentIds: string[] = [];
  let multiAgencyCountMap: Record<string, number> = {};

  // Handle agency filter - include both primary agency and multi-agency incidents
  if (filters.agency) {
    console.log('[Admin] Filtering incidents for agency:', filters.agency);

    // Get agency ID from short_name
    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('id')
      .ilike('short_name', filters.agency)
      .single();

    console.log('[Admin] Agency lookup result:', agencyData, 'error:', agencyError);

    if (agencyData) {
      // Get incident IDs where this agency is a supporting/lead agency
      const { data: multiAgencyIncidents, error: multiError } = await supabase
        .from('incident_agencies')
        .select('incident_id')
        .eq('agency_id', agencyData.id)
        .not('acknowledged_at', 'is', null); // Only include acknowledged agencies

      console.log('[Admin] Multi-agency incidents for agency ID', agencyData.id, ':', multiAgencyIncidents, 'error:', multiError);

      multiAgencyIncidentIds = multiAgencyIncidents?.map(ia => ia.incident_id) || [];

      // Filter to include: primary agency OR in multi-agency list
      if (multiAgencyIncidentIds.length > 0) {
        const orFilter = `agency_type.eq.${filters.agency},id.in.(${multiAgencyIncidentIds.join(',')})`;
        console.log('[Admin] Using OR filter:', orFilter);
        query = query.or(orFilter);
      } else {
        console.log('[Admin] No multi-agency incidents, using primary agency filter only');
        query = query.eq('agency_type', filters.agency);
      }
    } else {
      // Fallback to primary agency only if agency not found
      console.log('[Admin] Agency not found, using primary agency filter');
      query = query.eq('agency_type', filters.agency);
    }
  }
  if (filters.stationId) {
    // For station filtering, include incidents assigned to this station OR multi-agency incidents
    // This ensures supporting agencies can see multi-agency incidents even if not assigned to their station
    if (multiAgencyIncidentIds.length > 0) {
      // Include: assigned to this station OR is a multi-agency incident for this agency
      console.log('[Admin] Station filter with multi-agency support');
      query = query.or(`assigned_station_id.eq.${filters.stationId},id.in.(${multiAgencyIncidentIds.join(',')})`);
    } else {
      query = query.eq('assigned_station_id', filters.stationId);
    }
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  // For municipality/barangay filtering, we need to handle both address-based and coordinate-based
  // First, apply address-based filter if barangay is specified
  if (filters.barangay) {
    const barangay = sanitize(filters.barangay);
    query = query.ilike('location_address', `%${barangay}%`);
  }

  // Full-text search using search_vector column
  if (filters.search) {
    let searchTerm = sanitize(filters.search);
    console.log('[Admin] Full-text searching incidents for:', searchTerm);

    // Check if search starts with # (short code search)
    const shortCodePattern = /^#?([0-9a-fA-F]{2,8})$/;
    const shortCodeMatch = searchTerm.match(shortCodePattern);

    if (shortCodeMatch) {
      // Short code search (e.g., #1f, #1f2a, 1f, 1f2a)
      const code = shortCodeMatch[1].toLowerCase();
      console.log('[Admin] Short code search:', code);

      // Search by short_code column (hex approach) with prefix matching
      // This allows typing "75" to find "75ec"
      query = query.ilike('short_code', `${code}%`);
    } else {
      // Check if it's a UUID pattern (full or partial)
      const fullUuidPattern = /^[0-9a-fA-F-]{36}$/;
      const partialUuidPattern = /^[0-9a-fA-F-]{8,}$/;

      if (fullUuidPattern.test(searchTerm)) {
        // Exact UUID match - use direct ID filter
        console.log('[Admin] Exact UUID search:', searchTerm);
        query = query.eq('id', searchTerm);
      } else if (partialUuidPattern.test(searchTerm)) {
        // Partial UUID - use ILIKE on id field
        console.log('[Admin] Partial UUID search:', searchTerm);
        query = query.ilike('id', `${searchTerm}%`);
      } else {
        // Full-text search using search_vector
        // Use websearch_to_tsquery for natural language queries
        // This supports: phrases ("fire incident"), AND (fire daet), OR (fire | water)
        console.log('[Admin] Full-text search:', searchTerm);

        try {
          // Use textSearch method with websearch type for natural language
          query = query.textSearch('search_vector', searchTerm, {
            type: 'websearch',
            config: 'english'
          });
        } catch (error) {
          // Fallback to ILIKE if full-text search fails
          console.warn('[Admin] Full-text search failed, falling back to ILIKE:', error);
          query = query.or(`description.ilike.*${searchTerm}*,reporter_name.ilike.*${searchTerm}*,location_address.ilike.*${searchTerm}*`);
        }
      }
    }
  }

  query = query.order('created_at', { ascending: false });

  // Apply pagination or limit
  if (filters.limit) {
    // Legacy support for limit-only queries (used by Reports)
    query = query.limit(filters.limit);
    const { data, error } = await query;
    if (error) {
      console.error('[Admin] getIncidents error', error);
      throw new Error(error.message || 'Failed to get incidents');
    }

    // For municipality filtering with coordinates, filter in memory using GeoJSON polygons
    let filteredData = data || [];
    if (filters.municipality && !filters.barangay) {
      const municipality = filters.municipality;
      filteredData = filteredData.filter((incident: any) => {
        // Check if address contains municipality name
        if (incident.location_address?.toLowerCase().includes(municipality.toLowerCase())) {
          return true;
        }
        // Check if coordinates fall within municipality polygon using GeoJSON
        if (incident.latitude && incident.longitude) {
          const lat = parseFloat(incident.latitude);
          const lng = parseFloat(incident.longitude);
          if (isInMunicipality(lat, lng, municipality)) {
            return true;
          }
        }
        return false;
      });
    }

    // Enrich with multi-agency information
    const enrichedData = await enrichIncidentsWithMultiAgency(filteredData);
    return enrichedData;
  } else {
    // Paginated query - need to handle municipality filtering differently
    // If municipality filter is active, we need to fetch more and filter in memory
    if (filters.municipality && !filters.barangay) {
      // Fetch all matching incidents first (up to reasonable limit)
      query = query.limit(1000);
      const { data, error } = await query;
      if (error) {
        console.error('[Admin] getIncidents error', error);
        throw new Error(error.message || 'Failed to get incidents');
      }

      // Filter by municipality (address or coordinates) using GeoJSON polygons
      const municipality = filters.municipality;
      const filteredData = (data || []).filter((incident: any) => {
        // Check if address contains municipality name
        if (incident.location_address?.toLowerCase().includes(municipality.toLowerCase())) {
          return true;
        }
        // Check if coordinates fall within municipality polygon using GeoJSON
        if (incident.latitude && incident.longitude) {
          const lat = parseFloat(incident.latitude);
          const lng = parseFloat(incident.longitude);
          if (isInMunicipality(lat, lng, municipality)) {
            return true;
          }
        }
        return false;
      });

      // Apply pagination in memory
      const total = filteredData.length;
      const paginatedData = filteredData.slice(offset, offset + pageSize);

      // Enrich with multi-agency information
      const enrichedData = await enrichIncidentsWithMultiAgency(paginatedData);

      return {
        data: enrichedData,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    }

    // Standard paginated query without municipality filter
    query = query.range(offset, offset + pageSize - 1);
    const { data, error, count } = await query;
    if (error) {
      console.error('[Admin] getIncidents error', error);
      throw new Error(error.message || 'Failed to get incidents');
    }

    // Enrich incidents with multi-agency information
    const enrichedData = await enrichIncidentsWithMultiAgency(data || []);

    return {
      data: enrichedData,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  }
});

// Helper function to enrich incidents with multi-agency info
async function enrichIncidentsWithMultiAgency(incidents: any[]): Promise<any[]> {
  if (incidents.length === 0) return incidents;

  const incidentIds = incidents.map(i => i.id);

  // Get agency counts for all incidents
  const { data: agencyCounts } = await supabase
    .from('incident_agencies')
    .select('incident_id')
    .in('incident_id', incidentIds)
    .not('acknowledged_at', 'is', null);

  // Count agencies per incident
  const countMap: Record<string, number> = {};
  agencyCounts?.forEach(ia => {
    countMap[ia.incident_id] = (countMap[ia.incident_id] || 0) + 1;
  });

  // Enrich incidents
  return incidents.map(incident => ({
    ...incident,
    is_multi_agency: (countMap[incident.id] || 0) > 0,
    agencies_count: (countMap[incident.id] || 0) + 1 // +1 for primary agency
  }));
}

ipcMain.handle('db:getIncident', async (_event, id: string) => {
  try {
    // Fetch incident first
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single();

    if (incidentError) {
      console.error('[Admin] Failed to get incident:', incidentError);
      throw new Error(incidentError.message || 'Failed to get incident');
    }

    // If reporter_id exists, fetch reporter profile separately
    let reporter = null;
    if (incident?.reporter_id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email, phone_number')
        .eq('id', incident.reporter_id)
        .single();
      reporter = profileData;
    }

    return { ...incident, reporter };
  } catch (error: any) {
    console.error('[Admin] Error in getIncident:', error);
    throw new Error(error.message || 'Failed to get incident');
  }
});

ipcMain.handle('db:getIncidentAIReport', async (_event, incidentId: string) => {
  try {
    const { data: aiReport, error } = await supabase
      .from('incident_ai_reports')
      .select('*')
      .eq('incident_id', incidentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Zero rows = no AI report yet
      console.error('[Admin] Failed to get AI Report:', error);
      return null;
    }
    return aiReport;
  } catch (error: any) {
    console.error('[Admin] Error in getIncidentAIReport:', error);
    return null;
  }
});

ipcMain.handle('db:updateIncidentStatus', async (_event, { id, status, notes, updatedBy, updatedById, stationId, officerIds, primaryOfficerId, resourceIds, casualtiesCategory, casualtiesCount, releaseAssignments }: { id: string; status: string; notes?: string; updatedBy: string; updatedById?: string; stationId?: number; officerIds?: string[]; primaryOfficerId?: string | null; resourceIds?: number[]; casualtiesCategory?: string; casualtiesCount?: number; releaseAssignments?: boolean }) => {
  const now = new Date().toISOString();

  try {
    // Admin PIN logins generate a random UUID that is NOT in profiles.
    // FK-constrained columns must use NULL when the UUID is invalid.
    const validUserId = await resolveValidProfileId(updatedById);

    const isTerminalStatus = status === 'resolved' || status === 'closed';

    // Get current incident to check assignments and status
    const { data: currentIncident } = await supabase
      .from('incidents')
      .select('agency_type, assigned_station_id, status, first_response_at, assigned_officer_ids, assigned_resource_ids')
      .eq('id', id)
      .single();

    // Check if current incident is already terminal (resolved or closed)
    // Terminal incidents cannot be modified without being explicitly re-opened
    const currentStatus = currentIncident?.status;
    if (currentStatus === 'resolved' || currentStatus === 'closed') {
      console.warn(`[Admin] Rejected update attempt on terminal incident ${id} (current status: ${currentStatus})`);
      throw new Error(`incident_is_locked: Incident is already ${currentStatus} and cannot be modified.`);
    }

    // Gate the transition INTO 'closed' on a completed dispatcher final report
    // already existing for this incident. This closes the gap where some path
    // other than `finalReports:create` (which inserts the final_reports row and
    // closes atomically) could set status = 'closed' with no dispatcher-authored
    // final report at all. Mirrors the `incident_is_locked` error pattern above.
    if (status === 'closed') {
      const { data: existingFinalReport } = await supabase
        .from('final_reports')
        .select('id')
        .eq('incident_id', id)
        .maybeSingle();

      if (!existingFinalReport) {
        console.warn(`[Admin] Rejected close attempt on incident ${id}: no final report exists`);
        throw new Error('final_report_required: Cannot close incident without a completed final report. Use the Final Report workflow to close this incident.');
      }
    }

    // Build update object
    const updateData: any = {
      status,
      updated_at: now,
      updated_by: updatedBy  // Sync with incident_status_history
    };
    const oldOfficerIds: string[] = currentIncident?.assigned_officer_ids || [];
    const oldResourceIds: number[] = currentIncident?.assigned_resource_ids || [];

    // Handle casualties fields
    if (casualtiesCategory !== undefined) {
      updateData.casualties_category = casualtiesCategory || null;
    }
    if (casualtiesCount !== undefined) {
      updateData.casualties_count = casualtiesCount || null;
    }

    // Handle officer assignment (multiple officers supported)
    if (isTerminalStatus && releaseAssignments === true) {
      const oldOfficerIds: string[] = currentIncident?.assigned_officer_ids || [];
      const providedOfficerIds: string[] = officerIds || [];
      const officerIdsToRelease = Array.from(new Set([...oldOfficerIds, ...providedOfficerIds]));

      updateData.assigned_officer_id = null;
      updateData.assigned_officer_ids = [];

      if (officerIdsToRelease.length > 0) {
        await supabase.from('profiles').update({ status: 'available' }).in('id', officerIdsToRelease);
      }
    } else if (isTerminalStatus) {
      // Terminal status but release was not explicitly requested — leave
      // assignments untouched (Bug 4 fix). No-op: updateData is left without
      // assignment fields so the existing row values are preserved.
    } else if (officerIds !== undefined) { // Only if explicitly provided
      const leadOfficerId = primaryOfficerId && officerIds.includes(primaryOfficerId)
        ? primaryOfficerId
        : officerIds.length > 0 ? officerIds[0] : null;
      updateData.assigned_officer_id = leadOfficerId;
      updateData.assigned_officer_ids = officerIds; // All assigned officers

      // Manage Officer Availability Status
      const oldOfficerIds: string[] = currentIncident?.assigned_officer_ids || [];
      const newOfficerIds: string[] = officerIds;

      // Officers removed -> set to available
      const removedOfficers = oldOfficerIds.filter(oid => !newOfficerIds.includes(oid));
      if (removedOfficers.length > 0) {
        await supabase.from('profiles').update({ status: 'available' }).in('id', removedOfficers);
      }

      // Officers added -> set to busy (only if currently available)
      const addedOfficers = newOfficerIds.filter(oid => !oldOfficerIds.includes(oid));
      if (addedOfficers.length > 0) {
        const { data: addedProfiles } = await supabase
          .from('profiles')
          .select('id, status')
          .in('id', addedOfficers);
        const availableToBusy = (addedProfiles || [])
          .filter((p: any) => p.status === 'available')
          .map((p: any) => p.id);
        if (availableToBusy.length > 0) {
          await supabase.from('profiles').update({ status: 'busy' }).in('id', availableToBusy);
        }
      }

    }

    // Handle resource assignment
    if (isTerminalStatus && releaseAssignments === true) {
      const oldResourceIds: number[] = currentIncident?.assigned_resource_ids || [];
      const providedResourceIds: number[] = resourceIds || [];
      const resourceIdsToRelease = Array.from(new Set([...oldResourceIds, ...providedResourceIds]));

      updateData.assigned_resource_ids = [];

      if (resourceIdsToRelease.length > 0) {
        await supabase.from('agency_resources').update({ status: 'available', updated_at: now }).in('id', resourceIdsToRelease);
      }
    } else if (isTerminalStatus) {
      // Terminal status but release was not explicitly requested — leave
      // assignments untouched (Bug 4 fix). No-op: updateData is left without
      // assignment fields so the existing row values are preserved.
    } else if (resourceIds !== undefined) {
      updateData.assigned_resource_ids = resourceIds;

      // Manage Resource Availability Status
      const oldResourceIds: number[] = currentIncident?.assigned_resource_ids || [];
      const newResourceIds: number[] = resourceIds;

      // Resources removed -> set to available
      const removedResources = oldResourceIds.filter(rid => !newResourceIds.includes(rid));
      if (removedResources.length > 0) {
        await supabase.from('agency_resources').update({ status: 'available', updated_at: now }).in('id', removedResources);
      }

      // Resources added -> set to deployed (only if currently available)
      const addedResources = newResourceIds.filter(rid => !oldResourceIds.includes(rid));
      if (addedResources.length > 0) {
        const { data: addedResStatuses } = await supabase
          .from('agency_resources')
          .select('id, status')
          .in('id', addedResources);
        const availableToDeploy = (addedResStatuses || [])
          .filter((r: any) => r.status === 'available')
          .map((r: any) => r.id);
        if (availableToDeploy.length > 0) {
          await supabase.from('agency_resources').update({ status: 'deployed', updated_at: now }).in('id', availableToDeploy);
        }
      }

    }

    // Set resolved_at when status changes to resolved or closed
    if (isTerminalStatus) {
      updateData.resolved_at = now;
    }

    // Set first_response_at only on first responder arrival state transition
    if (!currentIncident?.first_response_at && (status === 'in_progress' || status === 'responding')) {
      updateData.first_response_at = now;
    }

    // Handle station assignment
    if (stationId) {
      // Explicit station assignment provided by admin
      updateData.assigned_station_id = stationId;
      console.log('[Admin] Explicit station assignment:', stationId);
    } else if (!currentIncident?.assigned_station_id && status !== 'pending' && !isTerminalStatus) {
      // Auto-assign via the single authoritative DB-side function, which internally
      // defers to find_nearest_station and guards against overwriting an existing
      // assignment (Bug 1 fix — see assign_station_if_unset migration).
      console.log('[Admin] Attempting auto-assignment for incident:', id);

      const { data: assignedStationId, error: assignError } = await supabase
        .rpc('assign_station_if_unset', { incident_id: id });

      if (assignError) {
        console.error('[Admin] Auto-assignment via assign_station_if_unset failed:', assignError);
      } else if (assignedStationId) {
        updateData.assigned_station_id = assignedStationId;
        console.log(`[Admin] Auto-assigned to station id: ${assignedStationId}`);
      }
    } else if (currentIncident?.assigned_station_id) {
      console.log('[Admin] Station already assigned:', currentIncident.assigned_station_id);
    } else if (status === 'pending') {
      console.log('[Admin] Status is pending - skipping auto-assignment');
    }

    // Update incident
    const { error: updateError } = await supabase
      .from('incidents')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('[Admin] Failed to update incident:', updateError);
      throw new Error(updateError.message || 'Failed to update incident status');
    }

    // Derive the post-update officer/resource assignments directly from
    // updateData — the single source of truth for what was actually written
    // to the incidents row above. This mirrors the terminal+releaseAssignments
    // gating so the assignment-history row (written below) never records a
    // clear that didn't actually happen (Bug 4 fix).
    const newOfficerIds: string[] = updateData.assigned_officer_ids !== undefined
      ? updateData.assigned_officer_ids
      : oldOfficerIds;
    const newResourceIds: number[] = updateData.assigned_resource_ids !== undefined
      ? updateData.assigned_resource_ids
      : oldResourceIds;
    const newStationId = updateData.assigned_station_id !== undefined
      ? updateData.assigned_station_id
      : currentIncident?.assigned_station_id || null;

    const sameItems = <T,>(a: T[], b: T[]) => {
      if (a.length !== b.length) return false;
      return a.every(item => b.includes(item));
    };

    const officersChanged = (officerIds !== undefined || isTerminalStatus) && !sameItems(oldOfficerIds, newOfficerIds);
    const resourcesChanged = (resourceIds !== undefined || isTerminalStatus) && !sameItems(oldResourceIds, newResourceIds);
    const stationChanged = updateData.assigned_station_id !== undefined &&
      updateData.assigned_station_id !== currentIncident?.assigned_station_id;

    if (status !== currentIncident?.status || officersChanged || resourcesChanged || stationChanged) {
      const { data: incidentAgencies } = await supabase
        .from('incident_agencies')
        .select('agency_id')
        .eq('incident_id', id);

      const agencyIds = Array.from(new Set((incidentAgencies || [])
        .map((record: any) => record.agency_id)
        .filter((agencyId: any) => agencyId !== null && agencyId !== undefined)));

      const historyReasons = [
        (isTerminalStatus && releaseAssignments === true) ? 'terminal_release' : null,
        officersChanged ? 'officers_changed' : null,
        resourcesChanged ? 'resources_changed' : null,
        stationChanged ? 'station_changed' : null
      ].filter(Boolean);

      const { error: assignmentHistoryError } = await supabase
        .from('incident_assignment_history')
        .insert({
          incident_id: id,
          from_status: currentIncident?.status || null,
          to_status: status,
          previous_station_id: currentIncident?.assigned_station_id || null,
          new_station_id: newStationId,
          previous_officer_ids: oldOfficerIds,
          new_officer_ids: newOfficerIds,
          previous_resource_ids: oldResourceIds,
          new_resource_ids: newResourceIds,
          agency_ids: agencyIds,
          reason: historyReasons.length > 0 ? historyReasons.join(',') : 'status_changed',
          changed_by: validUserId,
          changed_by_label: updatedBy,
          notes: notes || null,
          created_at: now
        });

      if (assignmentHistoryError) {
        console.error('[Admin] Failed to save assignment history:', assignmentHistoryError);
      }
    }

    // Insert into incident_status_history (this syncs with incidents.updated_by and resolved_at)
    const { error: historyError } = await supabase
      .from('incident_status_history')
      .insert({
        incident_id: id,
        status: status,
        notes: notes || null,
        changed_by: updatedById || updatedBy,
        changed_at: now
      });

    if (historyError) {
      console.error('[Admin] Failed to save status history:', historyError);
    }

    // If notes are provided, also insert into incident_updates
    if (notes && notes.trim()) {
      const { error: noteError } = await supabase
        .from('incident_updates')
        .insert({
          incident_id: id,
          author_id: validUserId,
          update_text: `Status changed to ${status}: ${notes}`,
          created_at: now
        });

      if (noteError) {
        console.error('[Admin] Failed to save note:', noteError);
      }
    }

    // Officer notifications are now handled by:
    // 1. SQL trigger (notify_officers_on_assignment) creates notification rows
    // 2. Background PushNotificationService automatically sends pushes for all new notifications

    // Invalidate stats cache since status changed
    clearCache('stats');

    // Determine what actually changed for better logging
    const statusChanged = status !== currentIncident?.status;

    // Fetch officer names if officers were changed
    let officerNames: string[] = [];
    if (officersChanged && officerIds && officerIds.length > 0) {
      const { data: officers } = await supabase
        .from('profiles')
        .select('display_name')
        .in('id', officerIds);
      officerNames = officers?.map(o => o.display_name) || [];
    }

    // Determine the most specific action type
    let actionType = 'incident_updated';
    let actionDescription: any = {
      incident_id: id,
      notes: notes || undefined
    };

    if (statusChanged) {
      actionType = 'incident_status_changed';
      actionDescription.old_status = currentIncident?.status;
      actionDescription.new_status = status;
    }

    if (officersChanged) {
      actionType = statusChanged ? 'incident_status_and_officers_changed' : 'incident_officers_assigned';
      actionDescription.officer_count = newOfficerIds.length;
      actionDescription.officer_names = officerNames;
      actionDescription.officer_ids = newOfficerIds;
      actionDescription.primary_officer_id = primaryOfficerId;
    }

    if (resourcesChanged) {
      actionType = 'incident_resources_assigned';
      actionDescription.resource_count = newResourceIds.length;
      actionDescription.resource_ids = newResourceIds;
    }

    if (stationChanged) {
      actionDescription.assigned_station_id = updateData.assigned_station_id;
      // Fetch station name
      const { data: station } = await supabase
        .from('agency_stations')
        .select('name')
        .eq('id', updateData.assigned_station_id)
        .single();
      if (station) {
        actionDescription.station_name = station.name;
      }
    }

    // Log security action with specific type
    await logSecurityAction(
      actionType,
      actionDescription,
      updatedById,
      updatedBy,
      'incident',
      id
    );

    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Error in updateIncidentStatus:', error);
    throw new Error(error.message || 'Failed to update incident status');
  }
});

ipcMain.handle('incidents:reopen', async (_event, { id, updatedBy, updatedById, notes }: { id: string; updatedBy: string; updatedById?: string; notes?: string }) => {
  const now = new Date().toISOString();
  try {
    // 1. Validate permissions - MUST be an Admin
    // Admin PIN logins generate a UUID that is NOT in profiles, so a missing
    // profile is expected for admin users and should not block the action.
    const validUserId = await resolveValidProfileId(updatedById);
    if (updatedById && validUserId) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', updatedById).single();
      if (profile && profile.role !== 'Admin') {
        throw new Error('Permission denied: Only administrators can re-open incidents.');
      }
    }

    // 2. Get current incident
    const { data: incident, error: fetchError } = await supabase
      .from('incidents')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !incident) {
      throw new Error('Incident not found');
    }

    const currentStatus = incident.status;
    if (currentStatus !== 'closed' && currentStatus !== 'resolved') {
      throw new Error(`Only closed or resolved incidents can be re-opened. Current status: ${currentStatus}`);
    }

    // 3. Update incident status
    const { error: updateError } = await supabase
      .from('incidents')
      .update({
        status: 'in_progress',
        updated_at: now,
        updated_by: updatedBy,
        resolved_at: null // Clear resolved timestamp
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // 4. Record status history
    await supabase.from('incident_status_history').insert({
      incident_id: id,
      status: 'in_progress',
      notes: notes || 'Incident explicitly re-opened by administrator.',
      changed_by: updatedById || updatedBy,
      changed_at: now
    });

    // 5. Attempt to restore the prior officer/resource assignment (Bug 4 fix).
    // Find the most recent assignment-history row that recorded the
    // transition INTO the terminal status being reopened from — that row's
    // previous_officer_ids/previous_resource_ids hold what was assigned
    // immediately before the terminal release (the restore source).
    let restoredOfficerIds: string[] = [];
    let restoredResourceIds: number[] = [];
    let unavailableOfficerIds: string[] = [];
    let unavailableResourceIds: number[] = [];

    const { data: lastTerminalHistory, error: historyFetchError } = await supabase
      .from('incident_assignment_history')
      .select('previous_officer_ids, previous_resource_ids')
      .eq('incident_id', id)
      .in('to_status', ['resolved', 'closed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (historyFetchError) {
      console.error('[Admin] Failed to fetch prior assignment history for reopen restore:', historyFetchError);
    }

    const priorOfficerIds: string[] = lastTerminalHistory?.previous_officer_ids || [];
    const priorResourceIds: number[] = lastTerminalHistory?.previous_resource_ids || [];

    if (priorOfficerIds.length > 0 || priorResourceIds.length > 0) {
      // Check current availability of the previously-assigned officers/resources.
      const [officersResult, resourcesResult] = await Promise.all([
        priorOfficerIds.length > 0
          ? supabase.from('profiles').select('id, status').in('id', priorOfficerIds)
          : Promise.resolve({ data: [], error: null }),
        priorResourceIds.length > 0
          ? supabase.from('agency_resources').select('id, status').in('id', priorResourceIds)
          : Promise.resolve({ data: [], error: null })
      ]);

      const officerStatusMap = new Map((officersResult.data || []).map((p: any) => [p.id, p.status]));
      const resourceStatusMap = new Map((resourcesResult.data || []).map((r: any) => [r.id, r.status]));

      restoredOfficerIds = priorOfficerIds.filter(oid => officerStatusMap.get(oid) === 'available');
      unavailableOfficerIds = priorOfficerIds.filter(oid => officerStatusMap.get(oid) !== 'available');

      restoredResourceIds = priorResourceIds.filter(rid => resourceStatusMap.get(rid) === 'available');
      unavailableResourceIds = priorResourceIds.filter(rid => resourceStatusMap.get(rid) !== 'available');

      if (restoredOfficerIds.length > 0 || restoredResourceIds.length > 0) {
        const restoreUpdate: any = {};
        if (restoredOfficerIds.length > 0) {
          restoreUpdate.assigned_officer_id = restoredOfficerIds[0];
          restoreUpdate.assigned_officer_ids = restoredOfficerIds;
        }
        if (restoredResourceIds.length > 0) {
          restoreUpdate.assigned_resource_ids = restoredResourceIds;
        }

        const { error: restoreError } = await supabase
          .from('incidents')
          .update(restoreUpdate)
          .eq('id', id);

        if (restoreError) {
          console.error('[Admin] Failed to restore prior assignments on reopen:', restoreError);
          // Roll back what we thought we restored so history/response stay accurate.
          restoredOfficerIds = [];
          restoredResourceIds = [];
          unavailableOfficerIds = priorOfficerIds;
          unavailableResourceIds = priorResourceIds;
        } else {
          if (restoredOfficerIds.length > 0) {
            await supabase.from('profiles').update({ status: 'busy' }).in('id', restoredOfficerIds);
          }
          if (restoredResourceIds.length > 0) {
            await supabase.from('agency_resources').update({ status: 'deployed', updated_at: now }).in('id', restoredResourceIds);
          }
        }
      }
    }

    const hasUnavailable = unavailableOfficerIds.length > 0 || unavailableResourceIds.length > 0;

    // 6. Record assignment history for the reopen itself, reflecting whatever
    // was actually restored above.
    await supabase.from('incident_assignment_history').insert({
      incident_id: id,
      from_status: currentStatus,
      to_status: 'in_progress',
      previous_officer_ids: [],
      new_officer_ids: restoredOfficerIds,
      previous_resource_ids: [],
      new_resource_ids: restoredResourceIds,
      reason: hasUnavailable ? 'reopened_partial_restore' : (restoredOfficerIds.length > 0 || restoredResourceIds.length > 0) ? 'reopened_restored' : 'reopened',
      changed_by: validUserId,
      changed_by_label: updatedBy,
      notes: notes || 'Incident explicitly re-opened by administrator.',
      created_at: now
    });

    // 7. Invalidate cache
    clearCache('stats');

    // 8. Log security action
    await logSecurityAction(
      'incident_reopened',
      {
        incident_id: id,
        old_status: currentStatus,
        notes: notes || 'Administrative re-opening',
        restored_officer_ids: restoredOfficerIds,
        restored_resource_ids: restoredResourceIds,
        unavailable_officer_ids: unavailableOfficerIds,
        unavailable_resource_ids: unavailableResourceIds
      },
      updatedById,
      updatedBy,
      'incident',
      id
    );

    return {
      success: true,
      restoredOfficerIds,
      restoredResourceIds,
      unavailableOfficerIds,
      unavailableResourceIds
    };
  } catch (error: any) {
    console.error('[Admin] Error reopening incident:', error);
    throw new Error(error.message || 'Failed to re-open incident');
  }
});

ipcMain.handle('db:getStats', async (_event, filters?: { from?: string; to?: string; skipCache?: boolean; stationId?: number; agency?: string }) => {
  const hasFilters = !!(filters?.from || filters?.to || filters?.stationId || filters?.agency);
  const cacheKey = hasFilters
    ? `stats:${filters?.from || 'none'}:${filters?.to || 'none'}:${filters?.stationId || 'all'}:${filters?.agency || 'all'}`
    : 'stats';

  // Check cache first (skip if requested)
  if (!filters?.skipCache) {
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  console.log('[Admin] Fetching stats from Supabase...');
  console.log('[Admin] Using URL:', supabaseUrl);

  try {
    // Get incidents for stats including location_address for area aggregation and created_at for trends
    let query = supabase
      .from('incidents')
      .select('id, status, agency_type, location_address, latitude, longitude, created_at, first_response_at, resolved_at, assigned_station_id, casualties_category, casualties_count', { count: 'exact' });

    if (filters?.from) {
      query = query.gte('created_at', filters.from);
    }
    if (filters?.to) {
      query = query.lte('created_at', filters.to);
    }
    if (filters?.stationId) {
      query = query.eq('assigned_station_id', filters.stationId);
    }
    if (filters?.agency) {
      query = query.eq('agency_type', filters.agency);
    }

    const { data: incidents, error, count } = await query;

    console.log('[Admin] Query result - data:', incidents?.length, 'error:', error, 'count:', count);

    if (error) {
      console.error('[Admin] Supabase error:', error);
      throw new Error(`Supabase error: ${error.message}`);
    }

    console.log(`[Admin] Fetched ${incidents?.length || 0} incidents`);

    const total = incidents?.length || 0;
    const pending = incidents?.filter(i => i.status === 'pending').length || 0;
    // Map 'assigned' and 'in_progress' to 'responding' for dashboard compatibility or count separately
    const responding = incidents?.filter(i => i.status === 'assigned' || i.status === 'in_progress' || i.status === 'responding').length || 0;
    // Map 'closed' to 'resolved' or keep separate
    const resolved = incidents?.filter(i => i.status === 'resolved' || i.status === 'closed').length || 0;

    // Group by agency
    const agencyMap = new Map<string, number>();
    incidents?.forEach(i => {
      const count = agencyMap.get(i.agency_type) || 0;
      agencyMap.set(i.agency_type, count + 1);
    });
    const byAgency = Array.from(agencyMap.entries()).map(([agency_type, count]) => ({ agency_type, count }));

    // Find most active area by location_address
    const areaMap = new Map<string, number>();
    incidents?.forEach(i => {
      let area: string | null = null;

      if (i.location_address && i.location_address.trim()) {
        const addr = i.location_address.trim();
        // Check if address looks like coordinates (starts with numbers and contains comma)
        const looksLikeCoords = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(addr);

        if (!looksLikeCoords) {
          // Extract municipality/barangay from address (last 2-3 parts typically)
          const parts = addr.split(',').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
          // Use the municipality part (usually 2nd to last or last meaningful part)
          area = parts.length >= 2 ? parts.slice(-2).join(', ') : addr;
        }
      }

      // Fallback: group by rounded coordinates if no valid address
      if (!area && i.latitude != null && i.longitude != null) {
        // Round to 2 decimal places for grouping nearby incidents
        const lat = parseFloat(i.latitude).toFixed(2);
        const lng = parseFloat(i.longitude).toFixed(2);
        area = `Near ${lat}°N, ${lng}°E`;
      }

      if (area) {
        const count = areaMap.get(area) || 0;
        areaMap.set(area, count + 1);
      }
    });

    // Find the area with most incidents
    let mostActiveArea = null;
    let maxCount = 0;
    areaMap.forEach((count, area) => {
      if (count > maxCount) {
        maxCount = count;
        mostActiveArea = area;
      }
    });

    const incidentIds = (incidents || []).map(i => i.id).filter(Boolean);
    const incidentMetaMap = new Map(
      (incidents || []).map(i => [
        i.id,
        {
          agency_type: i.agency_type,
        }
      ])
    );

    // Fetch recent activity from incident_status_history
    let recentActivity: any[] = [];
    try {
      if (incidentIds.length === 0) {
        recentActivity = [];
      } else {
        let historyQuery = supabase
          .from('incident_status_history')
          .select('incident_id, status, changed_by, changed_at')
          .in('incident_id', incidentIds)
          .order('changed_at', { ascending: false })
          .limit(10);

        const { data: historyData, error: historyError } = await historyQuery;

        if (!historyError && historyData) {
          // Fetch profiles for UUIDs in changed_by
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const userIds = [...new Set(
            historyData
              .map(h => String(h.changed_by).trim())
              .filter(id => uuidRegex.test(id))
          )];

          let profileMap = new Map<string, string>();
          if (userIds.length > 0) {
            const { data: profilesData } = await supabase
              .from('profiles')
              .select('id, display_name')
              .in('id', userIds);

            if (profilesData) {
              profileMap = new Map(
                profilesData.map(p => [String(p.id).toLowerCase(), p.display_name])
              );
            }
          }

          recentActivity = historyData.map(h => {
            const incidentMeta = incidentMetaMap.get(h.incident_id);
            const changedBy = String(h.changed_by || 'System').trim();
            const changedByLower = changedBy.toLowerCase();

            // Use display name if UUID found in profiles, otherwise use the value as-is
            const displayName = uuidRegex.test(changedBy) && profileMap.has(changedByLower)
              ? profileMap.get(changedByLower)
              : changedBy;

            return {
              incident_id: h.incident_id,
              status: h.status,
              changed_by: displayName,
              changed_at: h.changed_at,
              agency_type: incidentMeta?.agency_type || null,
            };
          });
        }
      }
    } catch (e) {
      console.error('[Admin] Failed to fetch recent activity:', e);
    }

    // Calculate performance metrics directly from incidents table (more reliable)
    let avgResponseTime: number | null = null;
    let avgResolutionTime: number | null = null;

    try {
      // Use first_response_at and resolved_at from incidents table directly
      const responseTimes: number[] = [];
      const resolutionTimes: number[] = [];

      // Get ALL resolved/closed incidents to check for resolution times
      const resolvedIncidents = incidents?.filter(i => i.status === 'resolved' || i.status === 'closed') || [];
      const resolvedIncidentIds = resolvedIncidents.map(i => i.id);

      // Fetch resolution times from status history for ALL resolved incidents (as primary or fallback)
      let statusHistoryMap = new Map<string, string>();
      if (resolvedIncidentIds.length > 0) {
        const { data: historyData } = await supabase
          .from('incident_status_history')
          .select('incident_id, changed_at')
          .in('incident_id', resolvedIncidentIds)
          .in('status', ['resolved', 'closed'])
          .order('changed_at', { ascending: true });

        if (historyData) {
          // Get first resolution time for each incident
          historyData.forEach(h => {
            if (!statusHistoryMap.has(h.incident_id)) {
              statusHistoryMap.set(h.incident_id, h.changed_at);
            }
          });
        }
      }

      incidents?.forEach(i => {
        // Calculate response time (created_at to first_response_at)
        if (i.first_response_at && i.created_at) {
          const createdAt = new Date(i.created_at).getTime();
          const respondedAt = new Date(i.first_response_at).getTime();
          const diffMinutes = (respondedAt - createdAt) / (1000 * 60);
          // Only include reasonable times (0 to 24 hours)
          if (diffMinutes >= 0 && diffMinutes <= 60 * 24) {
            responseTimes.push(diffMinutes);
          }
        }

        // Calculate resolution time (created_at to resolved_at)
        // Prefer status history (more reliable), fallback to resolved_at column
        let resolvedAt: string | null = null;
        if (i.status === 'resolved' || i.status === 'closed') {
          resolvedAt = statusHistoryMap.get(i.id) || i.resolved_at || null;
        }

        if (resolvedAt && i.created_at) {
          const createdAt = new Date(i.created_at).getTime();
          const resolvedTime = new Date(resolvedAt).getTime();
          const diffMinutes = (resolvedTime - createdAt) / (1000 * 60);
          // Only include reasonable times (0 to 7 days)
          if (diffMinutes >= 0 && diffMinutes <= 60 * 24 * 7) {
            resolutionTimes.push(diffMinutes);
          }
        }
      });

      if (responseTimes.length > 0) {
        avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
      }

      if (resolutionTimes.length > 0) {
        avgResolutionTime = Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length);
      }
    } catch (e) {
      console.error('[Admin] Failed to calculate performance metrics:', e);
    }

    // Calculate daily incident trend based on the selected window (capped to 60 days for readability)
    const dailyTrend: { date: string; count: number }[] = [];
    try {
      const toLocalDateStr = (date: Date) => {
        const y = date.getFullYear();
        const m = `${date.getMonth() + 1}`.padStart(2, '0');
        const d = `${date.getDate()}`.padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      const end = filters?.to ? new Date(filters.to) : new Date();
      const start = filters?.from ? new Date(filters.from) : new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);

      let startDate = start;
      let endDate = end;
      const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      // Cap to last 60 days for UI readability
      if (diffDays > 59) {
        startDate = new Date(endDate.getTime() - 59 * 24 * 60 * 60 * 1000);
      }

      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        const dateStr = toLocalDateStr(cursor);
        const count = incidents?.filter(inc => {
          const incDate = toLocalDateStr(new Date(inc.created_at));
          return incDate === dateStr;
        }).length || 0;
        dailyTrend.push({ date: dateStr, count });
        cursor.setDate(cursor.getDate() + 1);
      }
    } catch (e) {
      console.error('[Admin] Failed to calculate daily trend:', e);
    }

    // Count multi-agency incidents (where this agency is a supporting agency)
    let multiAgencyCount = 0;
    if (filters?.agency) {
      try {
        // Get agency ID from short_name
        const { data: agencyData } = await supabase
          .from('agencies')
          .select('id')
          .ilike('short_name', filters.agency)
          .single();

        if (agencyData) {
          // Count incidents where this agency is a supporting/lead agency
          const { data: multiAgencyIncidents } = await supabase
            .from('incident_agencies')
            .select('incident_id', { count: 'exact' })
            .eq('agency_id', agencyData.id)
            .not('acknowledged_at', 'is', null);

          multiAgencyCount = multiAgencyIncidents?.length || 0;
        }
      } catch (e) {
        console.error('[Admin] Failed to count multi-agency incidents:', e);
      }
    }

    const result = {
      total,
      pending,
      responding,
      resolved,
      byAgency,
      mostActiveArea: mostActiveArea ? { area: mostActiveArea, count: maxCount } : null,
      recentActivity,
      avgResponseTime,    // in minutes
      avgResolutionTime,  // in minutes
      dailyTrend,
      multiAgencyCount,   // count of multi-agency incidents for this agency
    };

    console.log('[Admin] Stats result:', result);
    if (!filters?.skipCache) {
      setCache(cacheKey, result); // Cache the result
    }
    return result;
  } catch (err: any) {
    console.error('[Admin] Error in getStats:', err);
    // Return mock data when offline for testing
    console.log('[Admin] Returning mock data for offline testing');
    return {
      total: 5,
      pending: 2,
      responding: 1,
      resolved: 2,
      byAgency: [
        { agency_type: 'pnp', count: 2 },
        { agency_type: 'bfp', count: 2 },
        { agency_type: 'mdrrmo', count: 1 },
      ],
      mostActiveArea: null,
      recentActivity: [],
      _offline: true,
      _error: err.message,
    };
  }
});

ipcMain.handle('db:getAuditLog', async (_event, incidentId: string) => {
  try {
    const { data: historyData, error: historyError } = await supabase
      .from('incident_status_history')
      .select('id, status, notes, changed_by, changed_at')
      .eq('incident_id', incidentId)
      .order('changed_at', { ascending: false });

    if (historyError) {
      console.error('[Admin] Failed to fetch audit log:', historyError);
      return [];
    }

    if (!historyData || historyData.length === 0) {
      return [];
    }

    // Check if changed_by values are UUIDs or display names
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const userIds = [...new Set(
      historyData
        .map(h => String(h.changed_by).trim())
        .filter(id => uuidRegex.test(id))
    )];

    console.log('[Admin] Found UUIDs in history:', userIds);

    // Only fetch profiles if we have valid UUIDs
    let profileMap = new Map<string, string>();
    if (userIds.length > 0) {
      // Cast UUIDs explicitly for Supabase
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);

      console.log('[Admin] Profiles query error:', profilesError);
      console.log('[Admin] Profiles data:', profilesData);

      if (!profilesError && profilesData) {
        profileMap = new Map(
          profilesData.map(p => [String(p.id).toLowerCase(), p.display_name])
        );
      }
    }

    // Merge the data
    const enrichedHistory = historyData.map(entry => {
      const changedBy = String(entry.changed_by).trim();
      const changedByLower = changedBy.toLowerCase();

      // If changed_by is a UUID and we have a profile, use the display_name
      if (uuidRegex.test(changedBy) && profileMap.has(changedByLower)) {
        return {
          ...entry,
          profiles: { display_name: profileMap.get(changedByLower)! }
        };
      }
      // If changed_by is already a display name (legacy data), use it directly
      return {
        ...entry,
        profiles: { display_name: changedBy }
      };
    });

    console.log('[Admin] Profile map:', Array.from(profileMap.entries()));
    console.log('[Admin] Enriched history sample:', enrichedHistory[0]);
    return enrichedHistory;
  } catch (err) {
    console.error('[Admin] Error in getAuditLog:', err);
    return [];
  }
});

ipcMain.handle('db:getIncidentAssignmentHistory', async (_event, incidentId: string) => {
  try {
    const { data, error } = await supabase
      .from('incident_assignment_history')
      .select('*')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin] Failed to fetch assignment history:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const stationIds = Array.from(new Set(
      data
        .flatMap((entry: any) => [entry.previous_station_id, entry.new_station_id])
        .filter((stationId: any) => stationId !== null && stationId !== undefined)
    ));
    const officerIds = Array.from(new Set(
      data
        .flatMap((entry: any) => [...(entry.previous_officer_ids || []), ...(entry.new_officer_ids || [])])
        .filter(Boolean)
    ));
    const resourceIds = Array.from(new Set(
      data
        .flatMap((entry: any) => [...(entry.previous_resource_ids || []), ...(entry.new_resource_ids || [])])
        .filter((resourceId: any) => resourceId !== null && resourceId !== undefined)
    ));
    const agencyIds = Array.from(new Set(
      data
        .flatMap((entry: any) => entry.agency_ids || [])
        .filter((agencyId: any) => agencyId !== null && agencyId !== undefined)
    ));

    const [stationsResult, officersResult, resourcesResult, agenciesResult] = await Promise.all([
      stationIds.length > 0
        ? supabase.from('agency_stations').select('id, name').in('id', stationIds)
        : Promise.resolve({ data: [], error: null }),
      officerIds.length > 0
        ? supabase.from('profiles').select('id, display_name, email, role').in('id', officerIds)
        : Promise.resolve({ data: [], error: null }),
      resourceIds.length > 0
        ? supabase.from('agency_resources').select('id, name, type').in('id', resourceIds)
        : Promise.resolve({ data: [], error: null }),
      agencyIds.length > 0
        ? supabase.from('agencies').select('id, name, short_name').in('id', agencyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (stationsResult.error) console.error('[Admin] Failed to enrich assignment history stations:', stationsResult.error);
    if (officersResult.error) console.error('[Admin] Failed to enrich assignment history officers:', officersResult.error);
    if (resourcesResult.error) console.error('[Admin] Failed to enrich assignment history resources:', resourcesResult.error);
    if (agenciesResult.error) console.error('[Admin] Failed to enrich assignment history agencies:', agenciesResult.error);

    const stationMap = new Map((stationsResult.data || []).map((station: any) => [station.id, station]));
    const officerMap = new Map((officersResult.data || []).map((officer: any) => [officer.id, officer]));
    const resourceMap = new Map((resourcesResult.data || []).map((resource: any) => [resource.id, resource]));
    const agencyMap = new Map((agenciesResult.data || []).map((agency: any) => [agency.id, agency]));

    return data.map((entry: any) => ({
      ...entry,
      previous_station: entry.previous_station_id ? stationMap.get(entry.previous_station_id) || null : null,
      new_station: entry.new_station_id ? stationMap.get(entry.new_station_id) || null : null,
      previous_officers: (entry.previous_officer_ids || []).map((officerId: string) => officerMap.get(officerId) || { id: officerId }),
      new_officers: (entry.new_officer_ids || []).map((officerId: string) => officerMap.get(officerId) || { id: officerId }),
      previous_resources: (entry.previous_resource_ids || []).map((resourceId: number) => resourceMap.get(resourceId) || { id: resourceId }),
      new_resources: (entry.new_resource_ids || []).map((resourceId: number) => resourceMap.get(resourceId) || { id: resourceId }),
      agencies: (entry.agency_ids || []).map((agencyId: number) => agencyMap.get(agencyId) || { id: agencyId }),
    }));
  } catch (err) {
    console.error('[Admin] Error in getIncidentAssignmentHistory:', err);
    return [];
  }
});

ipcMain.handle('db:getAgencyStations', async () => {
  // First try to get from database
  const cached = getCached<any>('agencyStations');
  if (cached) {
    return cached;
  }

  const { data, error } = await supabase
    .from('agency_stations')
    .select(`
      *,
      agencies!inner (name, short_name)
    `)
    .neq('agencies.short_name', 'pdrrmo')
    .order('name');

  if (error) throw error;

  if (data && data.length > 0) {
    setCache('agencyStations', data);
    return data;
  }

  return []; // Return empty if no stations in DB
});

// Fetch nearby emergency services from Google Places API
ipcMain.handle('db:getNearbyServices', async (_event, { latitude, longitude, radius = 10000 }: { latitude: number; longitude: number; radius?: number }) => {
  const cacheKey = `nearbyServices_${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return cached;
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!GOOGLE_API_KEY) {
    console.warn('[Admin] No Google Maps API key found. Add GOOGLE_MAPS_API_KEY to .env');
    return [];
  }

  try {
    const allStations: any[] = [];

    // Search for different types of emergency services
    const placeTypes = [
      { type: 'police', agencyType: 'PNP', icon: '🚔' },
      { type: 'fire_station', agencyType: 'BFP', icon: '🚒' },
      { type: 'hospital', agencyType: 'MEDICAL', icon: '🏥' },
      { type: 'local_government_office', agencyType: 'LGU', icon: '🏛️' },
    ];

    for (const { type, agencyType, icon } of placeTypes) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${type}&key=${GOOGLE_API_KEY}`;

      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();

      if (data.results) {
        const stations = data.results.map((place: any) => ({
          id: place.place_id,
          name: place.name,
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
          address: place.vicinity || '',
          contact_number: '',
          agencies: { short_name: agencyType, name: agencyType },
          icon,
          source: 'google',
          rating: place.rating,
          open_now: place.opening_hours?.open_now
        }));

        allStations.push(...stations);
      }
    }

    console.log(`[Admin] Found ${allStations.length} nearby services from Google Places`);
    setCache(cacheKey, allStations);
    return allStations;
  } catch (error: any) {
    console.error('[Admin] Error fetching nearby services:', error);
    return [];
  }
});

ipcMain.handle('sync:status', async () => {
  return { connected: true, lastSync: new Date().toISOString(), pending: 0, syncing: false };
});

ipcMain.handle('sync:now', async () => {
  console.log('[Admin] Manual sync triggered - clearing all caches');

  // Clear all caches to force fresh data
  cache.clear();

  // Notify renderer that sync is complete
  if (mainWindow) {
    mainWindow.webContents.send('sync-status', {
      connected: true,
      lastSync: new Date().toISOString(),
      pending: 0,
      syncing: false
    });
  }

  console.log('[Admin] Sync complete - caches cleared');
  return { success: true };
});

// ============================================
// USER MANAGEMENT IPC HANDLERS
// ============================================

// Auth logout - clear in-memory caches to avoid cross-user scope bleed
ipcMain.handle('auth:logout', async () => {
  clearAllCaches();
  await supabase.auth.signOut();
  return { success: true };
});

// Chief auth via Supabase
ipcMain.handle('auth:loginChief', async (_event, { email, password }: { email: string; password: string }) => {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    console.error('[Admin] Chief login failed:', authError);
    throw new Error(authError?.message || 'Invalid credentials');
  }

  // Fetch profile to ensure role and station (include address for municipality detection)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(`
      *,
      agencies (name, short_name),
      agency_stations:station_id (id, name, agency_id, address, latitude, longitude)
    `)
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    console.error('[Admin] Chief profile fetch failed:', profileError);
    throw new Error(profileError?.message || 'Profile not found');
  }

  if (profile.role !== 'Chief') {
    throw new Error(`Access denied: only Chief accounts can use this login`);
  }

  // Extract municipality from station address or coordinates
  const stationAddress = profile.agency_stations?.address || '';
  console.log(`[Admin] Station address from DB: "${stationAddress}"`);
  const municipalities = ['Basud', 'Capalonga', 'Daet', 'Jose Panganiban', 'Labo', 'Mercedes', 'Paracale', 'San Lorenzo Ruiz', 'San Vicente', 'Santa Elena', 'Talisay', 'Vinzons'];
  let stationMunicipality = '';

  // First try to extract from address
  for (const muni of municipalities) {
    if (stationAddress.toLowerCase().includes(muni.toLowerCase())) {
      stationMunicipality = muni;
      console.log(`[Admin] Extracted municipality from address: ${muni}`);
      break;
    }
  }

  // If not found in address, try using coordinates with GeoJSON
  if (!stationMunicipality && profile.agency_stations?.latitude && profile.agency_stations?.longitude) {
    const lat = parseFloat(profile.agency_stations.latitude);
    const lng = parseFloat(profile.agency_stations.longitude);
    const detectedMuni = getMunicipalityFromCoordinates(lat, lng);
    if (detectedMuni) {
      stationMunicipality = detectedMuni;
      console.log(`[Admin] Detected municipality from station coordinates: ${detectedMuni}`);
    }
  }

  // Log security action
  await logSecurityAction(
    'login',
    { role: profile.role, email: profile.email, agency: profile.agencies?.short_name },
    authData.user.id,
    profile.email,
    'auth',
    authData.user.id
  );

  return {
    ...profile,
    agencyShortName: profile.agencies?.short_name,
    stationName: profile.agency_stations?.name,
    stationAddress: stationAddress,
    stationMunicipality: stationMunicipality,
  };
});

// Desk Officer auth via Supabase
ipcMain.handle('auth:loginOfficer', async (_event, { email, password }: { email: string; password: string }) => {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    console.error('[Admin] Officer login failed:', authError);
    throw new Error(authError?.message || 'Invalid credentials');
  }

  // Log security action
  await logSecurityAction(
    'login',
    { email },
    authData.user.id,
    email,
    'auth',
    authData.user.id
  );

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(`
      *,
      agencies (name, short_name),
      agency_stations:station_id (id, name, agency_id, address, latitude, longitude)
    `)
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    console.error('[Admin] Officer profile fetch failed:', profileError);
    throw new Error(profileError?.message || 'Profile not found');
  }

  if (profile.role !== 'Desk Officer') {
    throw new Error(`Access denied: only Desk Officer accounts can use this login`);
  }

  const stationAddress = profile.agency_stations?.address || '';
  const municipalities = ['Basud', 'Capalonga', 'Daet', 'Jose Panganiban', 'Labo', 'Mercedes', 'Paracale', 'San Lorenzo Ruiz', 'San Vicente', 'Santa Elena', 'Talisay', 'Vinzons'];
  let stationMunicipality = '';

  for (const muni of municipalities) {
    if (stationAddress.toLowerCase().includes(muni.toLowerCase())) {
      stationMunicipality = muni;
      break;
    }
  }

  if (!stationMunicipality && profile.agency_stations?.latitude && profile.agency_stations?.longitude) {
    const lat = parseFloat(profile.agency_stations.latitude);
    const lng = parseFloat(profile.agency_stations.longitude);
    const detectedMuni = getMunicipalityFromCoordinates(lat, lng);
    if (detectedMuni) {
      stationMunicipality = detectedMuni;
    }
  }

  return {
    ...profile,
    agencyShortName: profile.agencies?.short_name,
    stationName: profile.agency_stations?.name,
    stationAddress: stationAddress,
    stationMunicipality: stationMunicipality,
  };
});

ipcMain.handle('users:getAll', async (_event, filters: { role?: string; agency?: string; stationId?: number; search?: string } = {}) => {
  let query = supabase.from('profiles').select(`
    *,
    agencies (name, short_name),
    agency_stations:station_id (id, name, agency_id)
  `);

  if (filters.role) {
    query = query.eq('role', filters.role);
  }
  if (filters.agency) {
    query = query.eq('agency_id', filters.agency);
  }
  if (filters.stationId) {
    query = query.eq('station_id', filters.stationId);
  }
  if (filters.search) {
    query = query.or(`display_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
});

ipcMain.handle('users:getById', async (_event, id: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`*, agencies (name, short_name), agency_stations:station_id (id, name, agency_id)`)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
});

ipcMain.handle('users:update', async (_event, { id, updates }: { id: string; updates: any }) => {
  // Calculate age from date_of_birth if provided
  const finalUpdates = { ...updates };

  if (updates.date_of_birth) {
    const today = new Date();
    const birthDate = new Date(updates.date_of_birth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    finalUpdates.age = age;
  }

  const { error } = await supabase
    .from('profiles')
    .update(finalUpdates)
    .eq('id', id);

  if (error) throw error;
  cache.delete('users'); // Invalidate cache
  return { success: true };
});

ipcMain.handle('users:getAgencies', async () => {
  const cached = getCached<any>('agencies');
  if (cached) return cached;

  const { data, error } = await supabase
    .from('agencies')
    .select('*')
    .neq('short_name', 'pdrrmo')
    .order('name');

  if (error) throw error;
  setCache('agencies', data || []);
  return data || [];
});

// ============================================
// AGENCY STATIONS IPC HANDLERS
// ============================================

ipcMain.handle('stations:create', async (_event, stationData: any) => {
  const { data, error } = await supabase
    .from('agency_stations')
    .insert(stationData)
    .select()
    .single();

  if (error) throw error;

  // Log security action
  await logSecurityAction(
    'station_created',
    { station_id: data.id, name: stationData.name, agency_id: stationData.agency_id },
    undefined,
    undefined,
    'station',
    String(data.id)
  );

  clearCache('agencyStations');
  return data;
});

ipcMain.handle('stations:update', async (_event, { id, updates }: { id: number; updates: any }) => {
  const { error } = await supabase
    .from('agency_stations')
    .update(updates)
    .eq('id', id);

  if (error) throw error;

  // Log security action
  await logSecurityAction(
    'station_updated',
    { station_id: id, updates },
    undefined,
    undefined,
    'station',
    String(id)
  );

  clearCache('agencyStations');
  return { success: true };
});

ipcMain.handle('stations:delete', async (_event, id: number) => {
  const { error } = await supabase
    .from('agency_stations')
    .delete()
    .eq('id', id);

  if (error) throw error;

  // Log security action
  await logSecurityAction(
    'station_deleted',
    { station_id: id },
    undefined,
    undefined,
    'station',
    String(id)
  );

  clearCache('agencyStations');
  return { success: true };
});

// ============================================
// RESOURCES IPC HANDLERS
// ============================================

ipcMain.handle('resources:getAll', async () => {
  const cached = getCached<any>('resources');
  if (cached) return cached;

  const { data, error } = await supabase
    .from('agency_resources')
    .select('*')
    .order('name');

  if (error) {
    console.error('[Admin] Failed to fetch resources:', error);
    return [];
  }

  setCache('resources', data || []);
  return data || [];
});

ipcMain.handle('resources:create', async (_event, resourceData: any) => {
  const { data, error } = await supabase
    .from('agency_resources')
    .insert(resourceData)
    .select()
    .single();

  if (error) throw error;

  // Log security action
  await logSecurityAction(
    'resource_created',
    { resource_id: data.id, name: resourceData.name, type: resourceData.type },
    undefined,
    undefined,
    'resource',
    String(data.id)
  );

  clearCache('resources');
  return data;
});

ipcMain.handle('resources:update', async (_event, { id, updates }: { id: number; updates: any }) => {
  const { error } = await supabase
    .from('agency_resources')
    .update(updates)
    .eq('id', id);

  if (error) throw error;

  // Log security action
  await logSecurityAction(
    'resource_updated',
    { resource_id: id, updates },
    undefined,
    undefined,
    'resource',
    String(id)
  );

  clearCache('resources');
  return { success: true };
});

ipcMain.handle('resources:delete', async (_event, id: number) => {
  const { error } = await supabase
    .from('agency_resources')
    .delete()
    .eq('id', id);

  if (error) throw error;

  // Log security action
  await logSecurityAction(
    'resource_deleted',
    { resource_id: id },
    undefined,
    undefined,
    'resource',
    String(id)
  );

  clearCache('resources');
  return { success: true };
});

// ============================================
// EXPORT & REPORTS IPC HANDLERS
// ============================================

ipcMain.handle('export:incidents', async (_event, { format, filters }: { format: 'csv' | 'json'; filters?: any }) => {
  let query = supabase.from('incidents').select('*').neq('status', 'ai_routing');

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.agency) query = query.eq('agency_type', filters.agency);
  if (filters?.stationId) query = query.eq('assigned_station_id', filters.stationId);
  if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('created_at', filters.dateTo);

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  // Log security action
  await logSecurityAction(
    'incidents_exported',
    { format, filters, count: data?.length || 0 },
    undefined,
    undefined,
    'export',
    undefined
  );

  if (format === 'csv') {
    const headers = ['ID', 'Agency', 'Status', 'Description', 'Reporter', 'Location', 'Created At'];
    const rows = (data || []).map(i => [
      i.id,
      (i.agency_type?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : i.agency_type).toUpperCase(),
      i.status,
      `"${(i.description || '').replace(/"/g, '""')}"`,
      i.reporter_name,
      i.location_address || `${i.latitude},${i.longitude}`,
      i.created_at
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  return JSON.stringify(data, null, 2);
});

ipcMain.handle('app:openExternal', async (_event, url: string) => {
  await shell.openExternal(url);
});

// ============================================
// SETTINGS IPC HANDLERS
// ============================================

import { promises as fsPromises } from 'fs';

// Settings file path
const SETTINGS_FILE = join(app.getPath('userData'), 'admin-settings.json');

// Default settings
const DEFAULT_SETTINGS = {
  notifications: { enabled: true, sound: true, desktop: true },
  display: { theme: 'light', compactMode: false, autoRefresh: true, refreshInterval: 30 },
  sync: { autoSync: true, syncInterval: 30 }
};

// Ensure settings file exists
async function loadSettings() {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const data = await fsPromises.readFile(SETTINGS_FILE, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return DEFAULT_SETTINGS;
}

ipcMain.handle('settings:get', async () => {
  return await loadSettings();
});

ipcMain.handle('settings:update', async (_event, settings) => {
  try {
    await fsPromises.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log('[Admin] Settings saved to:', SETTINGS_FILE);

    // Notify windows of update if needed
    if (mainWindow) {
      mainWindow.webContents.send('settings-updated', settings);
    }

    // Log security action
    await logSecurityAction(
      'settings_updated',
      { settings },
      undefined,
      undefined,
      'settings',
      undefined
    );

    return { success: true };
  } catch (error) {
    console.error('[Admin] Failed to save settings:', error);
    throw error;
  }
});

// ============================================
// REPORT EXPORT IPC HANDLERS
// ============================================

let previewWindow: BrowserWindow | null = null;
let pendingPdfData: { html: string; filename: string; pdfBuffer: Buffer } | null = null;
let userClickedSave = false;

ipcMain.handle('report:preview-pdf', async (_event, { html, filename }) => {
  try {
    // Close existing preview window if any
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
    }

    // Create preview window
    previewWindow = new BrowserWindow({
      width: 900,
      height: 700,
      title: `Preview: ${filename}`,
      parent: mainWindow!,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    previewWindow.setMenuBarVisibility(false);

    // Add save/cancel buttons to the HTML
    const previewHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Preview: ${filename}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: #1a1a2e; }
          .toolbar { 
            position: fixed; top: 0; left: 0; right: 0; 
            background: #16213e; padding: 12px 20px; 
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #0f3460; z-index: 100;
          }
          .toolbar h3 { color: #e94560; font-size: 14px; }
          .toolbar-buttons { display: flex; gap: 10px; }
          .btn { 
            padding: 8px 20px; border: none; border-radius: 6px; 
            cursor: pointer; font-weight: 500; transition: all 0.2s;
          }
          .btn-save { background: #4ade80; color: #000; }
          .btn-save:hover { background: #22c55e; }
          .btn-cancel { background: #64748b; color: #fff; }
          .btn-cancel:hover { background: #475569; }
          .preview-frame {
            margin-top: 60px; padding: 20px; 
            display: flex; justify-content: center;
          }
          .preview-content {
            background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 800px; width: 100%; padding: 40px;
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <h3>📄 Report Preview</h3>
          <div class="toolbar-buttons">
            <button class="btn btn-cancel" onclick="window.close()">Cancel</button>
            <button class="btn btn-save" onclick="savePdf()">💾 Save as PDF</button>
          </div>
        </div>
        <div class="preview-frame">
          <div class="preview-content">
            ${html.replace(/<html>|<\/html>|<head>.*?<\/head>|<!DOCTYPE html>/gs, '').replace(/<body>|<\/body>/g, '')}
          </div>
        </div>
        <script>
          function savePdf() {
            // Set hash to signal save intent before closing
            location.hash = 'save';
            window.close();
          }
        </script>
      </body>
      </html>
    `;

    // Generate PDF in background for when user clicks save
    const pdfGenWindow = new BrowserWindow({
      width: 800, height: 600, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    await pdfGenWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    const pdfBuffer = await pdfGenWindow.webContents.printToPDF({
      printBackground: true, pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });
    pdfGenWindow.close();

    // Store pending PDF data
    pendingPdfData = { html, filename, pdfBuffer };

    // Load preview
    await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewHtml)}`);
    previewWindow.show();

    // Handle window close - only save if user clicked Save button
    previewWindow.on('close', () => {
      // Check URL hash before window is destroyed
      try {
        const currentUrl = previewWindow?.webContents?.getURL() || '';
        if (currentUrl.includes('#save')) {
          userClickedSave = true;
        }
      } catch (e) {
        // Window may already be destroyed
      }
    });

    previewWindow.on('closed', async () => {
      if (pendingPdfData && userClickedSave) {
        const result = await dialog.showSaveDialog(mainWindow!, {
          defaultPath: pendingPdfData.filename,
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        });

        if (!result.canceled && result.filePath) {
          writeFileSync(result.filePath, pendingPdfData.pdfBuffer);
          console.log('[Admin] PDF saved to:', result.filePath);
        }
      }
      pendingPdfData = null;
      userClickedSave = false;
      previewWindow = null;
    });

    return { success: true, previewing: true };
  } catch (error) {
    console.error('[Admin] Failed to preview PDF:', error);
    throw error;
  }
});

// ============================================
// OFFICERS IPC HANDLERS
// ============================================

ipcMain.handle('officers:getByAgency', async (_event, agencyType: string) => {
  try {
    // Map agency_type to agency short_name
    const agencyMap: Record<string, string> = {
      'pnp': 'PNP',
      'bfp': 'BFP',
      'mdrrmo': 'MDRRMO'
    };
    const shortName = agencyMap[agencyType?.toLowerCase()] || agencyType?.toUpperCase();

    console.log('[Main] Loading officers for agency type:', agencyType, '→ short_name:', shortName);

    // Get agency ID first (case-insensitive match)
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('id, name, short_name')
      .ilike('short_name', shortName)
      .single();

    if (agencyError) {
      console.error('[Main] Agency lookup error:', agencyError);
      return [];
    }

    if (!agency) {
      console.warn('[Main] ⚠️ No agency found for short_name:', shortName);
      return [];
    }

    console.log('[Main] Found agency:', agency);

    // Get officers (Desk Officer, Field Officer, or Chief) for this agency
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email, role, phone_number, station_id, agency_id, status')
      .eq('agency_id', agency.id)
      .in('role', ['Desk Officer', 'Field Officer', 'Chief'])
      .order('display_name');

    if (error) {
      console.error('[Main] Officers query error:', error);
      throw error;
    }

    console.log('[Main] Found', data?.length || 0, 'officers for agency', shortName);
    if (data && data.length > 0) {
      console.log('[Main] Officers:', data.map(o => ({
        name: o.display_name,
        role: o.role,
        station_id: o.station_id,
        agency_id: o.agency_id
      })));
    } else {
      console.warn('[Main] ⚠️ No officers found with roles [Desk Officer, Field Officer, Chief] for agency_id:', agency.id);
    }

    return data || [];
  } catch (error) {
    console.error('[Admin] Failed to get officers:', error);
    return [];
  }
});

// ============================================
// FINAL REPORTS IPC HANDLERS
// ============================================

ipcMain.handle('finalReports:create', async (_event, { incidentId, reportDetails, completedBy }: { incidentId: string; reportDetails: any; completedBy: string }) => {
  try {
    const now = new Date().toISOString();

    // Check if incident is already terminal
    const { data: statusCheck } = await supabase.from('incidents').select('status').eq('id', incidentId).single();
    if (statusCheck?.status === 'closed' || statusCheck?.status === 'resolved') {
      throw new Error(`incident_is_locked: Cannot create final report for incident that is already ${statusCheck.status}.`);
    }

    const { data, error } = await supabase
      .from('final_reports')
      .insert({
        incident_id: incidentId,
        report_details: reportDetails,
        completed_by_user_id: completedBy,
        completed_at: now
      })
      .select()
      .single();

    if (error) throw error;

    // Update incident status to 'closed' and set resolved_at
    await supabase
      .from('incidents')
      .update({
        status: 'closed',
        resolved_at: now,
        updated_at: now,
        updated_by: 'System'
      })
      .eq('id', incidentId);

    // Add to incident_status_history
    await supabase
      .from('incident_status_history')
      .insert({
        incident_id: incidentId,
        status: 'closed',
        notes: 'Final report published',
        changed_by: 'System',
        changed_at: now
      });

    // Log security action
    await logSecurityAction(
      'final_report_created',
      { incident_id: incidentId, completed_by: completedBy },
      completedBy,
      undefined,
      'report',
      incidentId
    );

    return data;
  } catch (error: any) {
    console.error('[Admin] Failed to create final report:', error);
    throw new Error(error.message || 'Failed to create final report');
  }
});

ipcMain.handle('finalReports:get', async (_event, incidentId: string) => {
  try {
    const { data, error } = await supabase
      .from('final_reports')
      .select('*')
      .eq('incident_id', incidentId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  } catch (error) {
    console.error('[Admin] Failed to get final report:', error);
    return null;
  }
});

ipcMain.handle('unitReports:getByIncident', async (_event, incidentId: string) => {
  try {
    const { data, error } = await supabase
      .from('unit_reports')
      .select('*, profiles!unit_reports_responder_id_fkey(display_name, email)')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[Admin] Failed to get unit reports:', error);
    return [];
  }
});

// ============================================
// NOTIFICATIONS
// ============================================

ipcMain.handle('notifications:getByUser', async (_event, userId: string) => {
  try {
    // Admin PIN logins generate a UUID that is NOT in profiles, so they should
    // see ALL notifications (not just ones addressed to their generated ID).
    const isAdmin = await isAdminGeneratedId(userId);
    const baseQuery = !isAdmin && userId
      ? supabase.from('notifications').select('*, incidents(id, agency_type, description)').eq('recipient_id', userId)
      : supabase.from('notifications').select('*, incidents(id, agency_type, description)');

    const { data, error } = await baseQuery
      .order('created_at', { ascending: false })
      .limit(50);

    // If join query returned rows, use them; otherwise fall back to simple query
    // (RLS on incidents can silently filter rows via inner join behaviour)
    if (!error && data && data.length > 0) {
      return data;
    }

    if (error) {
      console.warn('[Admin] notifications:getByUser join query error:', error);
    }

    // Fallback: query without join in case incidents RLS blocks it
    const simpleBase = !isAdmin && userId
      ? supabase.from('notifications').select('*').eq('recipient_id', userId)
      : supabase.from('notifications').select('*');

    const { data: simpleData, error: simpleError } = await simpleBase
      .order('created_at', { ascending: false })
      .limit(50);

    if (simpleError) throw simpleError;
    return simpleData || [];
  } catch (error) {
    console.error('[Admin] Failed to get notifications:', error);
    return [];
  }
});

ipcMain.handle('notifications:markAsRead', async (_event, notificationId: number) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to mark notification as read:', error);
    throw new Error(error.message || 'Failed to mark notification as read');
  }
});

ipcMain.handle('notifications:markAllAsRead', async (_event, userId: string) => {
  try {
    const isAdmin = await isAdminGeneratedId(userId);
    const query = !isAdmin && userId
      ? supabase.from('notifications').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false)
      : supabase.from('notifications').update({ is_read: true }).eq('is_read', false);

    const { error } = await query;
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to mark all notifications as read:', error);
    throw new Error(error.message || 'Failed to mark all notifications as read');
  }
});

ipcMain.handle('notifications:getUnreadCount', async (_event, userId: string) => {
  try {
    const isAdmin = await isAdminGeneratedId(userId);
    const query = !isAdmin && userId
      ? supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('recipient_id', userId).eq('is_read', false)
      : supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false);

    const { count, error } = await query;

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('[Admin] Failed to get unread count:', error);
    return 0;
  }
});

// ============================================
// FINAL REPORT DRAFTS
// ============================================

interface DraftSaveParams {
  incidentId: string;
  agencyType: 'pnp' | 'bfp' | 'mdrrmo';
  draftDetails: any;
  status?: 'draft' | 'ready_for_review';
  authorId?: string;
}

ipcMain.handle('finalReportDrafts:get', async (_event, incidentId: string) => {
  try {
    const { data, error } = await supabase
      .from('final_report_drafts')
      .select('*, profiles!final_report_drafts_author_id_fkey(display_name, email)')
      .eq('incident_id', incidentId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  } catch (error) {
    console.error('[Admin] Failed to get draft:', error);
    return null;
  }
});

ipcMain.handle('finalReportDrafts:save', async (_event, params: DraftSaveParams) => {
  const { incidentId, agencyType, draftDetails, status = 'draft', authorId } = params;

  try {
    // Check if incident is already terminal
    const { data: statusCheck } = await supabase.from('incidents').select('status').eq('id', incidentId).single();
    if (statusCheck?.status === 'closed' || statusCheck?.status === 'resolved') {
      throw new Error(`incident_is_locked: Cannot save draft for incident that is already ${statusCheck.status}.`);
    }

    // Admin PIN logins generate a UUID that is NOT in profiles.
    const validAuthorId = await resolveValidProfileId(authorId);

    // Upsert: insert or update based on incident_id
    const { data, error } = await supabase
      .from('final_report_drafts')
      .upsert({
        incident_id: incidentId,
        agency_type: agencyType.toLowerCase(),
        draft_details: draftDetails,
        status,
        author_id: validAuthorId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'incident_id'
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, draft: data };
  } catch (error: any) {
    console.error('[Admin] Failed to save draft:', error);
    throw new Error(error.message || 'Failed to save draft');
  }
});

ipcMain.handle('finalReportDrafts:promote', async (_event, { incidentId, authorId }: { incidentId: string; authorId?: string }) => {
  try {
    const now = new Date().toISOString();

    // Check if incident is already terminal
    const { data: statusCheck } = await supabase.from('incidents').select('status').eq('id', incidentId).single();
    if (statusCheck?.status === 'closed' || statusCheck?.status === 'resolved') {
      throw new Error(`incident_is_locked: Cannot promote draft for incident that is already ${statusCheck.status}.`);
    }

    // 1. Get the draft
    const { data: draft, error: draftError } = await supabase
      .from('final_report_drafts')
      .select('*')
      .eq('incident_id', incidentId)
      .single();

    if (draftError || !draft) {
      throw new Error('Draft not found');
    }

    // Use draft author_id as fallback if authorId not provided
    let completedByUserId = authorId || draft.author_id;

    // If still missing (e.g. Admin PIN login), try to get from incident's assigned officer
    if (!completedByUserId) {
      const { data: incidentData } = await supabase
        .from('incidents')
        .select('assigned_officer_id')
        .eq('id', incidentId)
        .single();

      if (incidentData?.assigned_officer_id) {
        completedByUserId = incidentData.assigned_officer_id;
        console.log('[Admin] Using incident assigned officer as report author:', completedByUserId);
      }
    }

    // If still missing, try to find ANY valid officer profile to use as system fallback
    // This is required because the database enforces a valid user ID for the report
    if (!completedByUserId) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['Chief', 'Field Officer', 'Desk Officer'])
        .limit(1);

      if (profiles && profiles.length > 0) {
        completedByUserId = profiles[0].id;
        console.log('[Admin] Using fallback profile as report author:', completedByUserId);
      }
    }

    if (!completedByUserId) {
      throw new Error('Author ID is required to publish the report. Please ensure there is at least one registered officer in the system.');
    }

    // 2. Upsert into final_reports
    const { error: finalError } = await supabase
      .from('final_reports')
      .upsert({
        incident_id: incidentId,
        report_details: draft.draft_details,
        completed_by_user_id: completedByUserId,
        completed_at: now
      }, {
        onConflict: 'incident_id'
      });

    if (finalError) throw finalError;

    // 3. Update incident status to 'closed' and set resolved_at
    await supabase
      .from('incidents')
      .update({
        status: 'closed',
        resolved_at: now,
        updated_at: now,
        updated_by: 'System'
      })
      .eq('id', incidentId);

    // 4. Add to incident_status_history
    await supabase
      .from('incident_status_history')
      .insert({
        incident_id: incidentId,
        status: 'closed',
        notes: 'Final report published',
        changed_by: 'System',
        changed_at: now
      });

    // 5. Delete the draft
    await supabase
      .from('final_report_drafts')
      .delete()
      .eq('incident_id', incidentId);

    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to promote draft:', error);
    throw new Error(error.message || 'Failed to publish final report');
  }
});

ipcMain.handle('finalReportDrafts:delete', async (_event, incidentId: string) => {
  try {
    const { error } = await supabase
      .from('final_report_drafts')
      .delete()
      .eq('incident_id', incidentId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to delete draft:', error);
    throw new Error(error.message || 'Failed to delete draft');
  }
});

ipcMain.handle('finalReportDrafts:list', async (_event, filters?: { agencyType?: string; status?: string; stationId?: number }) => {
  try {
    let query = supabase
      .from('final_report_drafts')
      .select(`
        *,
        incidents!inner(id, agency_type, description, location_address, assigned_station_id, status),
        profiles!final_report_drafts_author_id_fkey(display_name, email)
      `)
      .order('updated_at', { ascending: false });

    if (filters?.agencyType) {
      query = query.eq('agency_type', filters.agencyType.toLowerCase());
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.stationId) {
      query = query.eq('incidents.assigned_station_id', filters.stationId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[Admin] Failed to list drafts:', error);
    return [];
  }
});

// ============================================
// MEDIA UPLOAD
// ============================================

ipcMain.handle('media:upload', async (_event, { incidentId, filePath, fileName, mediaType }: { incidentId: string; filePath: string; fileName: string; mediaType: 'photo' | 'video' }) => {
  try {
    // Check if incident is already terminal
    const { data: statusCheck } = await supabase.from('incidents').select('status').eq('id', incidentId).single();
    if (statusCheck?.status === 'closed' || statusCheck?.status === 'resolved') {
      throw new Error(`incident_is_locked: Cannot upload media for incident that is already ${statusCheck.status}.`);
    }

    const fs = await import('fs');
    const path = await import('path');

    // Read file as buffer
    const fileBuffer = fs.readFileSync(filePath);

    // Generate unique storage path
    const ext = path.extname(fileName).toLowerCase();
    const timestamp = Date.now();
    const storagePath = `incidents/${incidentId}/${timestamp}_${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('incident-media')
      .upload(storagePath, fileBuffer, {
        contentType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      console.error('[Admin] Storage upload error:', uploadError);
      throw new Error(uploadError.message || 'Failed to upload file to storage');
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('incident-media')
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl;

    // Insert into media table
    const { data: mediaRecord, error: mediaError } = await supabase
      .from('media')
      .insert({
        incident_id: incidentId,
        storage_path: storagePath,
        media_type: mediaType,
        uploaded_at: new Date().toISOString()
      })
      .select()
      .single();

    if (mediaError) {
      console.error('[Admin] Media record insert error:', mediaError);
      // Don't throw - file is uploaded, just log the error
    }

    // Also append to incidents.media_urls array for backward compatibility
    const { data: incident } = await supabase
      .from('incidents')
      .select('media_urls')
      .eq('id', incidentId)
      .single();

    const currentUrls = incident?.media_urls || [];
    const updatedUrls = Array.isArray(currentUrls) ? [...currentUrls, publicUrl] : [publicUrl];

    await supabase
      .from('incidents')
      .update({ media_urls: updatedUrls })
      .eq('id', incidentId);

    console.log(`[Admin] Media uploaded: ${storagePath}`);

    // Log security action
    await logSecurityAction(
      'media_uploaded',
      { incident_id: incidentId, media_type: mediaType, file_name: fileName, media_id: mediaRecord?.id },
      undefined,
      undefined,
      'media',
      String(mediaRecord?.id || storagePath)
    );

    return {
      success: true,
      storagePath,
      publicUrl,
      mediaId: mediaRecord?.id
    };
  } catch (error: any) {
    console.error('[Admin] Media upload failed:', error);
    throw new Error(error.message || 'Failed to upload media');
  }
});

ipcMain.handle('media:getByIncident', async (_event, incidentId: string) => {
  try {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .eq('incident_id', incidentId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    // Get public URLs for each media item
    const mediaWithUrls = (data || []).map(item => {
      const { data: urlData } = supabase.storage
        .from('incident-media')
        .getPublicUrl(item.storage_path);
      return {
        ...item,
        publicUrl: urlData?.publicUrl
      };
    });

    return mediaWithUrls;
  } catch (error) {
    console.error('[Admin] Failed to get media:', error);
    return [];
  }
});

ipcMain.handle('media:delete', async (_event, { mediaId, storagePath }: { mediaId: number; storagePath: string }) => {
  try {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('incident-media')
      .remove([storagePath]);

    if (storageError) {
      console.error('[Admin] Storage delete error:', storageError);
    }

    // Delete from media table
    const { error: dbError } = await supabase
      .from('media')
      .delete()
      .eq('id', mediaId);

    if (dbError) throw dbError;

    // Log security action
    await logSecurityAction(
      'media_deleted',
      { media_id: mediaId, storage_path: storagePath },
      undefined,
      undefined,
      'media',
      String(mediaId)
    );

    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Media delete failed:', error);
    throw new Error(error.message || 'Failed to delete media');
  }
});

ipcMain.handle('dialog:openFile', async (_event, options?: { filters?: any[] }) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: options?.filters || [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    return {
      canceled: false,
      filePath: result.filePaths[0]
    };
  } catch (error) {
    console.error('[Admin] File dialog error:', error);
    return { canceled: true, error: 'Failed to open file dialog' };
  }
});

// ============================================
// SECURITY LOGGING
// ============================================

interface LogSecurityParams {
  action: string;
  details: any;
  userId?: string;
  userEmail?: string;
  entityType?: string;
  entityId?: string;
}

async function logSecurityAction(
  action: string,
  details: any,
  userId?: string,
  userEmail?: string,
  entityType?: string,
  entityId?: string
) {
  try {
    const { error } = await supabase
      .from('security_logs')
      .insert({
        user_id: userId || null,
        user_email: userEmail || null,
        action,
        details,
        entity_type: entityType || null,
        entity_id: entityId || null,
        ip_address: 'admin-app',
        created_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }

    console.log(`[Security] Logged action: ${action}`);
  } catch (error) {
    console.error('[Security] Failed to log action:', error);
  }
}

// ---------------------------------------------------------------------------
// Profile validation helpers (admin PIN logins use generated UUIDs that
// are NOT in the profiles table, so FK-constrained columns must fall back
// to NULL and notification queries must fall back to "all recipients".)
// ---------------------------------------------------------------------------

async function resolveValidProfileId(userId?: string): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase.from('profiles').select('id').eq('id', userId).single();
  return data ? userId : null;
}

async function isAdminGeneratedId(userId?: string): Promise<boolean> {
  if (!userId) return true; // No userId => legacy admin mode, treat as admin
  const { data } = await supabase.from('profiles').select('id').eq('id', userId).single();
  return !data; // If UUID is NOT in profiles, it's an admin-generated ID
}

ipcMain.handle('security:log', async (_event, params: LogSecurityParams) => {
  await logSecurityAction(
    params.action,
    params.details,
    params.userId,
    params.userEmail,
    params.entityType,
    params.entityId
  );
  return { success: true };
});

ipcMain.handle('security:getLogs', async (_event, filters: { limit?: number; action?: string } = {}) => {
  try {
    let query = supabase
      .from('security_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    } else {
      query = query.limit(100);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[Admin] Failed to get security logs:', error);
    return [];
  }
});

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

ipcMain.handle('security:getActivityLogs', async (_event, filters: ActivityLogFilters = {}) => {
  try {
    let query = supabase
      .from('security_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.fromDate) {
      query = query.gte('created_at', filters.fromDate);
    }
    if (filters.toDate) {
      query = query.lte('created_at', filters.toDate);
    }
    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }
    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.userEmail) {
      query = query.ilike('user_email', `%${filters.userEmail}%`);
    }
    if (filters.search) {
      query = query.or(`action.ilike.%${filters.search}%,details::text.ilike.%${filters.search}%,user_email.ilike.%${filters.search}%`);
    }

    const offset = filters.offset || 0;
    const limit = Math.min(filters.limit || 50, 100);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], total: count || 0 };
  } catch (error) {
    console.error('[Admin] Failed to get activity logs:', error);
    return { data: [], total: 0 };
  }
});

// ============================================
// USER/OFFICER CREATION
// ============================================

ipcMain.handle('users:create', async (_event, userData: {
  email: string;
  password: string;
  displayName: string;
  role: string;
  agencyId?: number;
  stationId?: number;
  phoneNumber?: string;
  dateOfBirth?: string;
}) => {
  try {
    // Check if email already exists in profiles
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', userData.email.toLowerCase())
      .single();

    if (existingProfile) {
      throw new Error('A user with this email already exists');
    }

    // Create auth user using Supabase Admin API
    // Note: This requires service_role key which we're using
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: userData.displayName,
        role: userData.role
      }
    });

    if (authError) {
      // Check if user exists in auth but not in profiles (orphaned auth user)
      if (authError.message?.includes('already been registered')) {
        throw new Error('This email is already registered. Please use a different email.');
      }
      throw authError;
    }
    if (!authData.user) throw new Error('Failed to create user');

    // Calculate age from date of birth
    let age: number | null = null;
    if (userData.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(userData.dateOfBirth);
      age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
    }

    // Create profile using upsert to handle edge cases
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        display_name: userData.displayName,
        email: userData.email.toLowerCase(),
        role: userData.role,
        agency_id: userData.agencyId || null,
        station_id: userData.stationId || null,
        phone_number: userData.phoneNumber || null,
        date_of_birth: userData.dateOfBirth || null,
        age: age,
        created_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (profileError) {
      // Rollback: delete auth user if profile creation fails
      console.error('[Admin] Profile creation failed, rolling back auth user:', profileError);
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    // Log security action
    await logSecurityAction(
      'user_created',
      {
        new_user_id: authData.user.id,
        email: userData.email,
        role: userData.role
      },
      undefined,
      userData.email,
      'user',
      authData.user.id
    );

    clearCache('users');
    return { success: true, userId: authData.user.id };
  } catch (error: any) {
    console.error('[Admin] Failed to create user:', error);
    throw new Error(error.message || 'Failed to create user');
  }
});

ipcMain.handle('users:delete', async (_event, userId: string) => {
  try {
    // Soft delete: Ban user in Auth and mark as Disabled in profiles
    // 1. Ban in Auth (100 years)
    const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: '876600h' // ~100 years
    });
    if (banError) throw banError;

    // 2. Update profile role to 'Disabled'
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role: 'Disabled' })
      .eq('id', userId);

    if (profileError) throw profileError;

    // Get user email before logging
    const { data: userData } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    await logSecurityAction(
      'user_disabled',
      { disabled_user_id: userId },
      userId,
      userData?.email,
      'user',
      userId
    );
    clearCache('users');
    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to delete (disable) user:', error);
    throw new Error(error.message || 'Failed to disable user');
  }
});
ipcMain.handle('users:resetPassword', async (_event, { userId, newPassword }: { userId: string; newPassword: string }) => {
  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });
    if (error) throw error;

    // Get user email before logging
    const { data: userData } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    await logSecurityAction(
      'password_reset',
      { user_id: userId },
      userId,
      userData?.email,
      'user',
      userId
    );
    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to reset password:', error);
    throw new Error(error.message || 'Failed to reset password');
  }
});

ipcMain.handle('report:save-pdf', async (_event, { html, filename }) => {
  try {
    // Create a hidden window to render the HTML
    const pdfWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load the HTML content
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Wait for content to render
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate PDF
    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5,
      },
    });

    pdfWindow.close();

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: filename,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (!result.canceled && result.filePath) {
      writeFileSync(result.filePath, pdfData);
      console.log('[Admin] PDF saved to:', result.filePath);

      // Log security action
      await logSecurityAction(
        'pdf_export_saved',
        { filename, path: result.filePath },
        undefined,
        undefined,
        'export',
        undefined
      );

      return { success: true, path: result.filePath };
    }

    return { success: false, canceled: true };
  } catch (error) {
    console.error('[Admin] Failed to save PDF:', error);
    throw error;
  }
});

// ============================================
// INCIDENT AGENCIES (Multi-Agency Coordination)
// ============================================

ipcMain.handle('incidentAgencies:get', async (_event, incidentId: string) => {
  try {
    const { data, error } = await supabase
      .from('incident_agencies')
      .select(`
        *,
        agencies:agency_id (id, name, short_name)
      `)
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('[Admin] Failed to get incident agencies:', error);
    throw new Error(error.message || 'Failed to get incident agencies');
  }
});

ipcMain.handle('incidentAgencies:add', async (_event, { incidentId, agencyId, role }: { incidentId: string; agencyId: number; role: 'primary' | 'lead' | 'supporting' }) => {
  try {
    const now = new Date().toISOString();

    // Check if this agency is already added to this incident
    const { data: existing } = await supabase
      .from('incident_agencies')
      .select('id')
      .eq('incident_id', incidentId)
      .eq('agency_id', agencyId)
      .single();

    if (existing) {
      throw new Error('This agency is already involved in this incident');
    }

    // If adding as 'lead', remove lead role from any other agency
    if (role === 'lead') {
      await supabase
        .from('incident_agencies')
        .update({ role: 'supporting' })
        .eq('incident_id', incidentId)
        .eq('role', 'lead');
    }

    // Add the agency
    const { data, error } = await supabase
      .from('incident_agencies')
      .insert({
        incident_id: incidentId,
        agency_id: agencyId,
        role: role,
        requested_at: now,
        created_at: now
      })
      .select(`
        *,
        agencies:agency_id (id, name, short_name)
      `)
      .single();

    if (error) throw error;

    // Create notifications for all officers of the requested agency
    const { data: agency } = await supabase
      .from('agencies')
      .select('short_name')
      .eq('id', agencyId)
      .single();

    if (agency) {
      // Get all officers (Desk Officer, Field Officer, Chief) from this agency
      const { data: officers } = await supabase
        .from('profiles')
        .select('id')
        .eq('agency_id', agencyId)
        .in('role', ['Desk Officer', 'Field Officer', 'Chief']);

      if (officers && officers.length > 0) {
        const notifications = officers.map(officer => ({
          recipient_id: officer.id,
          incident_id: incidentId,
          title: 'Multi-Agency Support Request',
          body: `Your agency (${agency.short_name}) has been requested to support incident #${incidentId.slice(0, 8).toUpperCase()}`,
          is_read: false,
          created_at: now
        }));

        await supabase.from('notifications').insert(notifications);
        console.log(`[Admin] Created ${notifications.length} notifications for agency ${agency.short_name}`);
      }
    }

    // Log security action
    await logSecurityAction(
      'incident_agency_added',
      { incident_id: incidentId, agency_id: agencyId, role, agency_name: agency?.short_name },
      undefined,
      undefined,
      'agency',
      incidentId
    );

    return data;
  } catch (error: any) {
    console.error('[Admin] Failed to add incident agency:', error);
    throw new Error(error.message || 'Failed to add agency to incident');
  }
});

ipcMain.handle('incidentAgencies:updateRole', async (_event, { id, role }: { id: number; role: 'primary' | 'lead' | 'supporting' }) => {
  try {
    // If setting as lead, first get the incident_id
    const { data: current } = await supabase
      .from('incident_agencies')
      .select('incident_id')
      .eq('id', id)
      .single();

    if (current && role === 'lead') {
      // Remove lead from other agencies in this incident
      await supabase
        .from('incident_agencies')
        .update({ role: 'supporting' })
        .eq('incident_id', current.incident_id)
        .eq('role', 'lead');
    }

    const { error } = await supabase
      .from('incident_agencies')
      .update({ role })
      .eq('id', id);

    if (error) throw error;

    // Log security action
    await logSecurityAction(
      'incident_agency_role_updated',
      { incident_agency_id: id, role, incident_id: current?.incident_id },
      undefined,
      undefined,
      'agency',
      String(id)
    );

    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to update incident agency role:', error);
    throw new Error(error.message || 'Failed to update agency role');
  }
});

ipcMain.handle('incidentAgencies:acknowledge', async (_event, id: number) => {
  try {
    const { error } = await supabase
      .from('incident_agencies')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    // Log security action
    await logSecurityAction(
      'incident_agency_acknowledged',
      { incident_agency_id: id },
      undefined,
      undefined,
      'agency',
      String(id)
    );

    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to acknowledge incident agency:', error);
    throw new Error(error.message || 'Failed to acknowledge');
  }
});

ipcMain.handle('incidentAgencies:remove', async (_event, id: number) => {
  try {
    const { error } = await supabase
      .from('incident_agencies')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Log security action
    await logSecurityAction(
      'incident_agency_removed',
      { incident_agency_id: id },
      undefined,
      undefined,
      'agency',
      String(id)
    );

    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to remove incident agency:', error);
    throw new Error(error.message || 'Failed to remove agency from incident');
  }
});

// Get all agencies for multi-agency selection (excludes already added ones)
ipcMain.handle('incidentAgencies:getAvailable', async (_event, incidentId: string) => {
  try {
    // Get all agencies
    const { data: allAgencies, error: agenciesError } = await supabase
      .from('agencies')
      .select('id, name, short_name')
      .order('name');

    if (agenciesError) throw agenciesError;

    // Get already added agencies for this incident
    const { data: addedAgencies } = await supabase
      .from('incident_agencies')
      .select('agency_id')
      .eq('incident_id', incidentId);

    const addedIds = new Set((addedAgencies || []).map(a => a.agency_id));

    // Filter out already added agencies
    const available = (allAgencies || []).filter(a => !addedIds.has(a.id));

    return available;
  } catch (error: any) {
    console.error('[Admin] Failed to get available agencies:', error);
    throw new Error(error.message || 'Failed to get available agencies');
  }
});

// ============================================
// BACKUP REQUESTS (Phase 2 Workflow)
// ============================================

ipcMain.handle('backupRequests:getByIncident', async (_event, incidentId: string) => {
  try {
    const { data, error } = await supabase
      .from('backup_requests')
      .select(`
        *,
        requester:requested_by (id, display_name, email, role),
        acknowledged_user:acknowledged_by (id, display_name),
        assigned_user:assigned_by (id, display_name),
        resolved_user:resolved_by (id, display_name),
        cancelled_user:cancelled_by (id, display_name),
        requested_agency:requested_agency_id (id, name, short_name),
        target_agency:target_agency_id (id, name, short_name),
        requested_station:requested_station_id (id, name),
        target_station:target_station_id (id, name)
      `)
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('[Admin] Failed to get backup requests:', error);
    throw new Error(error.message || 'Failed to get backup requests');
  }
});

ipcMain.handle(
  'backupRequests:updateStatus',
  async (
    _event,
    {
      id,
      status,
      handledById,
      notes,
      targetAgencyId,
      targetStationId,
    }: {
      id: number;
      status: 'pending' | 'acknowledged' | 'assigned' | 'resolved' | 'cancelled' | 'rejected';
      handledById?: string;
      notes?: string;
      targetAgencyId?: number | null;
      targetStationId?: number | null;
    }
  ) => {
    try {
      const now = new Date().toISOString();
      const updateData: any = {
        status,
      };

      if (notes !== undefined) {
        updateData.admin_notes = notes;
      }

      if (targetAgencyId !== undefined) {
        updateData.target_agency_id = targetAgencyId;
      }

      if (targetStationId !== undefined) {
        updateData.target_station_id = targetStationId;
      }

      if (status === 'acknowledged') {
        updateData.acknowledged_at = now;
        updateData.acknowledged_by = handledById || null;
      }

      if (status === 'assigned') {
        updateData.assigned_at = now;
        updateData.assigned_by = handledById || null;
      }

      if (status === 'resolved') {
        updateData.resolved_at = now;
        updateData.resolved_by = handledById || null;
      }

      if (status === 'cancelled' || status === 'rejected') {
        updateData.cancelled_at = now;
        updateData.cancelled_by = handledById || null;
      }

      const { error } = await supabase
        .from('backup_requests')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Log security action
      await logSecurityAction(
        'backup_request_status_updated',
        {
          backup_request_id: id,
          status,
          handled_by_id: handledById,
          notes,
          target_agency_id: targetAgencyId,
          target_station_id: targetStationId
        },
        handledById,
        undefined,
        'backup_request',
        String(id)
      );

      return { success: true };
    } catch (error: any) {
      console.error('[Admin] Failed to update backup request status:', error);
      throw new Error(error.message || 'Failed to update backup request status');
    }
  }
);

// ============================================
// AI WORKER IPC HANDLERS
// ============================================

let aiWorkerUrl = process.env.AI_WORKER_URL || 'http://127.0.0.1:8000';
// VPS fallback: when the primary worker is offline, unreachable, or missing
// cloud API keys (GROQ etc.), call endpoints transparently retry against this
// host. Keeps the apps usable when the operator's local PC drops off.
//
// IMPORTANT: this MUST be the FastAPI AI worker (ireport-vps/ai_worker.py),
// NOT the Express LiveKit bridge at call.ochana0101.click — the bridge only
// implements /token and /transcribe and 404s on /call/summarize, /analyze,
// /chat, /config, /health.
let aiFallbackWorkerUrl = process.env.AI_FALLBACK_WORKER_URL || 'http://75.119.142.12:8000';

const normalizeAIWorkerUrl = (url: string) => {
  const trimmed = (url || '').trim();
  if (!trimmed) return 'http://127.0.0.1:8000';
  return trimmed.replace(/\/+$/, '');
};

const normalizeFallbackUrl = (url: string) => (url || '').trim().replace(/\/+$/, '');

/**
 * Decide whether a response from the primary worker warrants retrying on the
 * fallback. Network errors and 5xx are always retried. 4xx responses are also
 * retried when they look like a missing-key / not-configured failure, since
 * the fallback (VPS) usually has the cloud keys.
 */
const shouldFailoverOnResponse = async (response: Response): Promise<boolean> => {
  if (response.status >= 500) return true;
  if (response.status === 503 || response.status === 502 || response.status === 504) return true;
  if (response.status >= 400 && response.status < 500) {
    try {
      const cloned = response.clone();
      const text = await cloned.text();
      const lower = text.toLowerCase();
      if (
        lower.includes('not configured') ||
        lower.includes('not set') ||
        lower.includes('groq_api_key') ||
        lower.includes('gemini_api_key') ||
        lower.includes('ollama') ||
        lower.includes('model unavailable')
      ) {
        return true;
      }
    } catch {}
  }
  return false;
};

interface FetchWithFallbackOptions {
  /**
   * When true (default), failures on the primary trigger a retry on the
   * fallback URL. Disable for handlers where a remote fallback would be wrong
   * (e.g. /config writes that must hit the user's local worker).
   */
  allowFallback?: boolean;
  /** Per-attempt timeout in milliseconds. Defaults to 90 s. */
  timeoutMs?: number;
}

interface FetchWithFallbackResult {
  response: Response;
  usedFallback: boolean;
  origin: string;
}

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Build the URL list to try for a given path. Always primary first, then
 * fallback if it's set and different from primary.
 */
const buildWorkerUrls = (path: string, allowFallback: boolean): string[] => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const urls = [`${aiWorkerUrl}${cleanPath}`];
  if (allowFallback) {
    const fallback = normalizeFallbackUrl(aiFallbackWorkerUrl);
    if (fallback && fallback !== aiWorkerUrl) {
      urls.push(`${fallback}${cleanPath}`);
    }
  }
  return urls;
};

const fetchWithFallback = async (
  path: string,
  init: RequestInit,
  options: FetchWithFallbackOptions = {},
): Promise<FetchWithFallbackResult> => {
  const allowFallback = options.allowFallback !== false;
  const timeoutMs = options.timeoutMs ?? 90000;
  const urls = buildWorkerUrls(path, allowFallback);
  let lastError: any = null;
  let lastResponse: Response | null = null;
  let lastOrigin = '';

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const isFallback = i > 0;
    let origin = url;
    try {
      origin = new URL(url).origin;
    } catch {}
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (response.ok) {
        return { response, usedFallback: isFallback, origin };
      }
      // Non-ok: decide whether to try the next URL
      if (i < urls.length - 1) {
        const failover = await shouldFailoverOnResponse(response);
        if (failover) {
          lastResponse = response;
          lastOrigin = origin;
          console.warn(`[Admin][AI] primary ${origin} returned ${response.status}, trying fallback`);
          continue;
        }
      }
      return { response, usedFallback: isFallback, origin };
    } catch (err: any) {
      lastError = err;
      lastOrigin = origin;
      console.warn(`[Admin][AI] request to ${origin} failed: ${err?.message || err}`);
      if (i === urls.length - 1) break;
      // network error or timeout — try the next URL
    }
  }

  if (lastResponse) {
    return { response: lastResponse, usedFallback: urls.length > 1, origin: lastOrigin };
  }
  throw lastError || new Error('AI worker unreachable');
};

ipcMain.handle('ai:getWorkerUrl', async () => aiWorkerUrl);

ipcMain.handle('ai:setWorkerUrl', async (_event, url: string) => {
  aiWorkerUrl = normalizeAIWorkerUrl(url);
  return { success: true };
});

ipcMain.handle('ai:getFallbackWorkerUrl', async () => aiFallbackWorkerUrl);

ipcMain.handle('ai:setFallbackWorkerUrl', async (_event, url: string) => {
  aiFallbackWorkerUrl = normalizeFallbackUrl(url);
  return { success: true };
});

ipcMain.handle('ai:checkWorkerHealth', async () => {
  try {
    const { response, usedFallback, origin } = await fetchWithFallback('/health', { method: 'GET' }, { timeoutMs: 8000 });
    if (!response.ok) throw new Error(`AI worker error ${response.status}`);
    const body = await response.json();
    return { ...body, _origin: origin, _usedFallback: usedFallback };
  } catch (error: any) {
    console.error('[Admin] Failed to check AI worker health:', error);
    throw new Error(error.message || 'Failed to check AI worker health');
  }
});

ipcMain.handle('ai:getRecords', async (_event, filters: { status?: string; search?: string; page?: number; limit?: number } = {}) => {
  try {
    const { status, search, page = 1, limit = 20 } = filters;
    let query = supabase
      .from('incident_ai_reports')
      .select('*, incidents!inner(description, location_address, status, created_at)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(`incident_id.ilike.%${search}%,summary.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], total: count || 0 };
  } catch (error: any) {
    console.error('[Admin] Failed to get AI records:', error);
    throw new Error(error.message || 'Failed to get AI records');
  }
});

ipcMain.handle('ai:listIncidents', async (_event, filters: { search?: string; limit?: number } = {}) => {
  try {
    const { search, limit = 50 } = filters;
    let query = supabase
      .from('incidents')
      .select('id, description, location_address, agency_type, status, created_at, is_fast_report')
      .neq('status', 'ai_routing')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search?.trim()) {
      const term = search.trim();
      query = query.or(`id.ilike.%${term}%,description.ilike.%${term}%,location_address.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('[Admin] Failed to list incidents for AI manual analysis:', error);
    throw new Error(error.message || 'Failed to list incidents');
  }
});

ipcMain.handle('ai:triggerReanalysis', async (_event, incidentId: string) => {
  try {
    const { response } = await fetchWithFallback('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_id: incidentId, force: true }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI worker error ${response.status}: ${text}`);
    }
    const result = await response.json().catch(() => ({}));
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[Admin] Failed to trigger reanalysis:', error);
    throw new Error(error.message || 'Failed to trigger reanalysis');
  }
});

ipcMain.handle('ai:getModelConfig', async () => {
  try {
    // Read should never silently fall back — operator wants to see the local
    // worker's config when local is selected. Try fallback only on hard failure.
    const { response, usedFallback, origin } = await fetchWithFallback('/config', { method: 'GET' }, { timeoutMs: 10000 });
    if (!response.ok) throw new Error(`AI worker error ${response.status}`);
    const body = await response.json();
    return { ...body, _origin: origin, _usedFallback: usedFallback };
  } catch (error: any) {
    console.error('[Admin] Failed to get model config:', error);
    throw new Error(error.message || 'Failed to get model config');
  }
});

ipcMain.handle('ai:setModelConfig', async (_event, config: any) => {
  try {
    // Writing config must hit the primary worker only — falling back would
    // silently update a different machine.
    const { response } = await fetchWithFallback('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }, { allowFallback: false });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI worker error ${response.status}: ${text}`);
    }
    const result = await response.json().catch(() => ({}));
    if (result?.status === 'error') {
      throw new Error(result.reason || 'AI worker rejected config update');
    }
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[Admin] Failed to set model config:', error);
    throw new Error(error.message || 'Failed to set model config');
  }
});

ipcMain.handle('ai:sendChatPrompt', async (_event, payload: any) => {
  try {
    const { response } = await fetchWithFallback('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI worker error ${response.status}: ${text}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('[Admin] Failed to send chat prompt:', error);
    throw new Error(error.message || 'Failed to send chat prompt');
  }
});

ipcMain.handle('ai:summarizeCallTranscript', async (_event, payload: {
  transcript: Array<{ speaker?: string; text?: string }> | string;
  reporter_name?: string;
  reporter_phone?: string;
  incident_location?: string;
  reporter_location?: string;
  dispatcher_notes?: string;
  call_started_at?: string;
  call_ended_at?: string;
}) => {
  try {
    const { response, usedFallback, origin } = await fetchWithFallback('/call/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI worker error ${response.status}: ${text}`);
    }
    const result = await response.json();
    return { ...result, _origin: origin, _usedFallback: usedFallback };
  } catch (error: any) {
    console.error('[Admin] Failed to summarize call transcript:', error);
    throw new Error(error.message || 'Failed to summarize call transcript');
  }
});

ipcMain.handle('ai:createIncidentFromCallDraft', async (_event, payload: {
  summary: {
    description?: string;
    recommended_agency?: string;
    hazards?: string[];
    severity?: number;
    confidence?: number;
    missing_info?: string[];
  };
  reporter_id?: string | null;
  reporter_name?: string;
  reporter_age?: number;
  reporter_phone?: string;
  incident_latitude?: number;
  incident_longitude?: number;
  reporter_latitude?: number;
  reporter_longitude?: number;
  location_address?: string;
  dispatcher_notes?: string;
}) => {
  try {
    const summary = payload?.summary || {};
    const description = String(summary.description || '').trim();
    if (!description) {
      throw new Error('Missing summary.description');
    }

    const allowedAgencies = new Set(['pnp', 'bfp', 'mdrrmo']);
    const requestedAgency = String(summary.recommended_agency || '').toLowerCase();
    const agencyType = allowedAgencies.has(requestedAgency) ? requestedAgency : 'mdrrmo';

    // Schema requires reporter_age NOT NULL and a trigger enforces 13–120.
    // Call drafts often don't capture the caller's age, so default to 18
    // (a valid sentinel meaning "unknown"). The dispatcher can override later
    // if they collected the real age.
    const ageInput = Number(payload?.reporter_age);
    const ageProvided = Number.isFinite(ageInput) && ageInput >= 13 && ageInput <= 120;
    const reporterAge = ageProvided ? Math.floor(ageInput) : 18;

    // The validate_incident_data() Postgres trigger enforces:
    //   reporter_name 2–100 chars, description 10–5000 chars,
    //   latitude 4.0–22.0, longitude 116.0–127.0, media_urls ≤ 10.
    // Call drafts frequently lack precise GPS (caller never granted location,
    // or only the dispatcher's voice was on the line), so we fall back to a
    // Camarines Norte LGU centroid. This keeps the row valid; the dispatcher
    // can refine the location once on-scene units report back.
    const PH_LAT_MIN = 4.0;
    const PH_LAT_MAX = 22.0;
    const PH_LON_MIN = 116.0;
    const PH_LON_MAX = 127.0;
    // Daet, Camarines Norte (provincial capital) — within the LGU service area.
    const DEFAULT_LAT = 14.1124;
    const DEFAULT_LON = 122.9550;

    const isInPhBounds = (lat: number, lon: number): boolean =>
      Number.isFinite(lat) && Number.isFinite(lon)
        && lat >= PH_LAT_MIN && lat <= PH_LAT_MAX
        && lon >= PH_LON_MIN && lon <= PH_LON_MAX;

    const incidentLatRaw = Number(payload?.incident_latitude);
    const incidentLonRaw = Number(payload?.incident_longitude);
    const reporterLatRaw = Number(payload?.reporter_latitude);
    const reporterLonRaw = Number(payload?.reporter_longitude);

    let incidentLat: number;
    let incidentLon: number;
    let locationFallbackUsed = false;
    if (isInPhBounds(incidentLatRaw, incidentLonRaw)) {
      incidentLat = incidentLatRaw;
      incidentLon = incidentLonRaw;
    } else if (isInPhBounds(reporterLatRaw, reporterLonRaw)) {
      // No incident GPS, but we have the reporter's GPS — best available proxy.
      incidentLat = reporterLatRaw;
      incidentLon = reporterLonRaw;
      locationFallbackUsed = true;
    } else {
      incidentLat = DEFAULT_LAT;
      incidentLon = DEFAULT_LON;
      locationFallbackUsed = true;
    }

    const reporterLat: number | null = isInPhBounds(reporterLatRaw, reporterLonRaw)
      ? reporterLatRaw
      : null;
    const reporterLon: number | null = isInPhBounds(reporterLatRaw, reporterLonRaw)
      ? reporterLonRaw
      : null;

    const missingInfo = Array.isArray(summary.missing_info) ? summary.missing_info.filter(Boolean) : [];
    const hazards = Array.isArray(summary.hazards) ? summary.hazards.filter(Boolean) : [];
    const dispatcherNotes = String(payload?.dispatcher_notes || '').trim();

    const descriptionSuffixParts: string[] = [];
    if (hazards.length > 0) {
      descriptionSuffixParts.push(`Hazards: ${hazards.join(', ')}`);
    }
    if (missingInfo.length > 0) {
      descriptionSuffixParts.push(`Missing info: ${missingInfo.join(', ')}`);
    }
    if (!ageProvided) {
      // Make it explicit in the description that the age is a placeholder so
      // dispatchers know to follow up.
      descriptionSuffixParts.push('Reporter age: unknown (default 18 used)');
    }
    if (locationFallbackUsed) {
      descriptionSuffixParts.push(
        `Location: approximate (${incidentLat.toFixed(4)}, ${incidentLon.toFixed(4)}) — refine when known`,
      );
    }
    if (dispatcherNotes) {
      descriptionSuffixParts.push(`Dispatcher notes: ${dispatcherNotes}`);
    }

    let finalDescription = descriptionSuffixParts.length > 0
      ? `${description}\n\n${descriptionSuffixParts.join('\n')}`
      : description;
    // The trigger requires description ≥ 10 chars after TRIM. Pad if the AI
    // somehow produced something shorter.
    if (finalDescription.trim().length < 10) {
      finalDescription = (finalDescription.trim() + ' (call summary too brief; review transcript).').trim();
    }
    if (finalDescription.length > 5000) {
      finalDescription = finalDescription.slice(0, 4990) + '… [truncated]';
    }

    // reporter_name: 2–100 chars after TRIM.
    let reporterName = String(payload?.reporter_name || '').trim();
    if (reporterName.length < 2) reporterName = 'Call Reporter';
    if (reporterName.length > 100) reporterName = reporterName.slice(0, 100);

    const incidentInsert: any = {
      agency_type: agencyType,
      reporter_id: payload?.reporter_id || null,
      reporter_name: reporterName,
      reporter_age: reporterAge,
      reporter_phone: payload?.reporter_phone ? String(payload.reporter_phone).trim() : null,
      description: finalDescription,
      latitude: incidentLat,
      longitude: incidentLon,
      reporter_latitude: reporterLat,
      reporter_longitude: reporterLon,
      location_address: payload?.location_address ? String(payload.location_address).trim() : null,
      media_urls: [],
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { data: createdIncident, error } = await supabase
      .from('incidents')
      .insert(incidentInsert)
      .select('*')
      .single();

    if (error) throw error;

    return {
      success: true,
      incident: createdIncident,
      draft_meta: {
        severity: summary.severity,
        confidence: summary.confidence,
        missing_info: missingInfo,
      },
    };
  } catch (error: any) {
    console.error('[Admin] Failed to create incident from call draft:', error);
    throw new Error(error.message || 'Failed to create incident from call draft');
  }
});

// System Settings (AI Worker API keys + tunables stored in Supabase)
ipcMain.handle('systemSettings:getAll', async () => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_key,setting_value,updated_at')
      .order('setting_key');
    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('[Admin] Failed to get system settings:', error);
    throw new Error(error.message || 'Failed to get system settings');
  }
});

ipcMain.handle('systemSettings:upsert', async (_event, { key, value }: { key: string; value: string }) => {
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert({ setting_key: key, setting_value: value, updated_at: new Date().toISOString() }, { onConflict: 'setting_key' });
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to update system setting:', error);
    throw new Error(error.message || 'Failed to update system setting');
  }
});
