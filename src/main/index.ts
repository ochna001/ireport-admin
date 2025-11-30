import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { existsSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import { join } from 'path';

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

function createWindow() {
  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          process.env.NODE_ENV === 'development'
            ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://exp.host ws://localhost:*; frame-src 'self' https://www.openstreetmap.org https://maps.google.com;"
            : "default-src 'self'; script-src 'self' https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://exp.host; frame-src 'self' https://www.openstreetmap.org https://maps.google.com;"
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
    mainWindow.loadURL('http://localhost:5173');
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
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
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

// IPC Handlers - using Supabase directly
ipcMain.handle('db:getIncidents', async (_event, filters: { agency?: string; status?: string; limit?: number } = {}) => {
  let query = supabase.from('incidents').select('*');

  if (filters.agency) {
    query = query.eq('agency_type', filters.agency);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  query = query.order('created_at', { ascending: false });
  
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
});

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

ipcMain.handle('db:updateIncidentStatus', async (_event, { id, status, notes, updatedBy, stationId, officerIds }: { id: string; status: string; notes?: string; updatedBy: string; stationId?: number; officerIds?: string[] }) => {
  const now = new Date().toISOString();

  try {
    // Get current incident to check if station assignment is needed
    const { data: currentIncident } = await supabase
      .from('incidents')
      .select('agency_type, assigned_station_id, status')
      .eq('id', id)
      .single();

    // Build update object
    const updateData: any = { 
      status, 
      updated_at: now,
      updated_by: updatedBy  // Sync with incident_status_history
    };

    // Handle officer assignment (multiple officers supported)
    // Store as array - primary officer is first in list
    if (officerIds && officerIds.length > 0) {
      updateData.assigned_officer_id = officerIds[0]; // Primary officer for backward compatibility
      updateData.assigned_officer_ids = officerIds; // All assigned officers
    }

    // Set resolved_at when status changes to resolved or closed
    if (status === 'resolved' || status === 'closed') {
      updateData.resolved_at = now;
    }

    // Set first_response_at when first moving from pending
    if (currentIncident?.status === 'pending' && status !== 'pending') {
      updateData.first_response_at = now;
    }

    // Handle station assignment
    if (stationId) {
      // Explicit station assignment provided by admin
      updateData.assigned_station_id = stationId;
    } else if (!currentIncident?.assigned_station_id && status !== 'pending') {
      // Auto-assign to CLOSEST station of matching agency if not already assigned
      const agencyNameMap: Record<string, string> = {
        'pnp': 'PNP',
        'bfp': 'BFP', 
        'pdrrmo': 'PDRRMO'
      };
      const agencyShortName = agencyNameMap[currentIncident?.agency_type?.toLowerCase()] || currentIncident?.agency_type?.toUpperCase();
      
      // Find agency by short_name (matches agency_type)
      const { data: agency } = await supabase
        .from('agencies')
        .select('id')
        .eq('short_name', agencyShortName)
        .single();
      
      if (agency) {
        // Get incident coordinates for distance calculation
        const { data: incident } = await supabase
          .from('incidents')
          .select('latitude, longitude')
          .eq('id', id)
          .single();
        
        if (incident?.latitude && incident?.longitude) {
          // Get all stations for this agency
          const { data: stations } = await supabase
            .from('agency_stations')
            .select('id, latitude, longitude')
            .eq('agency_id', agency.id);
          
          if (stations && stations.length > 0) {
            // Calculate distance to each station and find closest
            const incLat = parseFloat(incident.latitude);
            const incLng = parseFloat(incident.longitude);
            
            let closestStation = stations[0];
            let minDistance = Infinity;
            
            for (const station of stations) {
              const stationLat = parseFloat(station.latitude);
              const stationLng = parseFloat(station.longitude);
              // Haversine formula for distance
              const R = 6371; // Earth's radius in km
              const dLat = (stationLat - incLat) * Math.PI / 180;
              const dLng = (stationLng - incLng) * Math.PI / 180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(incLat * Math.PI / 180) * Math.cos(stationLat * Math.PI / 180) *
                        Math.sin(dLng/2) * Math.sin(dLng/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const distance = R * c;
              
              if (distance < minDistance) {
                minDistance = distance;
                closestStation = station;
              }
            }
            
            updateData.assigned_station_id = closestStation.id;
            console.log(`[Admin] Auto-assigned to closest station ${closestStation.id} (${minDistance.toFixed(2)}km away)`);
          }
        }
      }
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

    // Insert into incident_status_history (this syncs with incidents.updated_by and resolved_at)
    const { error: historyError } = await supabase
      .from('incident_status_history')
      .insert({
        incident_id: id,
        status: status,
        notes: notes || null,
        changed_by: updatedBy,
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
          update_text: `Status changed to ${status}: ${notes}`,
          created_at: now
        });
        
      if (noteError) {
        console.error('[Admin] Failed to save note:', noteError);
      }
    }

    // Create notifications for assigned officers
    if (officerIds && officerIds.length > 0) {
      const notifications = officerIds.map(officerId => ({
        recipient_id: officerId,
        incident_id: id,
        title: 'New Incident Assignment',
        body: `You have been assigned to incident #${id.slice(0, 8)}. Status: ${status}`,
        is_read: false,
        created_at: now
      }));

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifError) {
        console.error('[Admin] Failed to create officer notifications:', notifError);
      } else {
        console.log(`[Admin] Created notifications for ${officerIds.length} officer(s)`);
      }
    }

    // Invalidate stats cache since status changed
    clearCache('stats');

    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Error in updateIncidentStatus:', error);
    throw new Error(error.message || 'Failed to update incident status');
  }
});

ipcMain.handle('db:getStats', async () => {
  // Check cache first
  const cached = getCached<any>('stats');
  if (cached) {
    return cached;
  }

  console.log('[Admin] Fetching stats from Supabase...');
  console.log('[Admin] Using URL:', supabaseUrl);
  
  try {
    // Get all incidents for stats including location_address for area aggregation and created_at for trends
    const { data: incidents, error, count } = await supabase
      .from('incidents')
      .select('status, agency_type, location_address, created_at', { count: 'exact' });
    
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
      if (i.location_address) {
        // Extract municipality/barangay from address (last 2-3 parts typically)
        const parts = i.location_address.split(',').map((p: string) => p.trim());
        // Use the municipality part (usually 2nd to last or last meaningful part)
        const area = parts.length >= 2 ? parts.slice(-2).join(', ') : i.location_address;
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

    // Fetch recent activity from incident_status_history
    let recentActivity: any[] = [];
    try {
      const { data: historyData, error: historyError } = await supabase
        .from('incident_status_history')
        .select('incident_id, status, changed_by, changed_at')
        .order('changed_at', { ascending: false })
        .limit(10);
      
      if (!historyError && historyData) {
        recentActivity = historyData.map(h => ({
          incident_id: h.incident_id,
          status: h.status,
          changed_by: h.changed_by || 'System',
          changed_at: h.changed_at,
        }));
      }
    } catch (e) {
      console.error('[Admin] Failed to fetch recent activity:', e);
    }

    // Calculate performance metrics from incident_status_history
    let avgResponseTime: number | null = null;
    let avgResolutionTime: number | null = null;
    
    try {
      // Get incidents with their status history for time calculations
      const { data: incidentsWithTime, error: timeError } = await supabase
        .from('incidents')
        .select('id, created_at, status')
        .in('status', ['assigned', 'in_progress', 'responding', 'resolved', 'closed']);
      
      if (!timeError && incidentsWithTime && incidentsWithTime.length > 0) {
        // Get first response times (time from created to first non-pending status)
        const { data: firstResponses } = await supabase
          .from('incident_status_history')
          .select('incident_id, status, changed_at')
          .in('status', ['assigned', 'in_progress', 'responding'])
          .order('changed_at', { ascending: true });
        
        // Get resolution times
        const { data: resolutions } = await supabase
          .from('incident_status_history')
          .select('incident_id, status, changed_at')
          .in('status', ['resolved', 'closed'])
          .order('changed_at', { ascending: true });
        
        // Calculate average response time
        if (firstResponses && firstResponses.length > 0) {
          const responseTimes: number[] = [];
          const seenIncidents = new Set<string>();
          
          for (const response of firstResponses) {
            if (seenIncidents.has(response.incident_id)) continue;
            seenIncidents.add(response.incident_id);
            
            const incident = incidentsWithTime.find(i => i.id === response.incident_id);
            if (incident) {
              const createdAt = new Date(incident.created_at).getTime();
              const respondedAt = new Date(response.changed_at).getTime();
              const diffMinutes = (respondedAt - createdAt) / (1000 * 60);
              if (diffMinutes >= 0 && diffMinutes < 60 * 24 * 7) { // Ignore outliers > 7 days
                responseTimes.push(diffMinutes);
              }
            }
          }
          
          if (responseTimes.length > 0) {
            avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
          }
        }
        
        // Calculate average resolution time
        if (resolutions && resolutions.length > 0) {
          const resolutionTimes: number[] = [];
          const seenIncidents = new Set<string>();
          
          for (const resolution of resolutions) {
            if (seenIncidents.has(resolution.incident_id)) continue;
            seenIncidents.add(resolution.incident_id);
            
            const incident = incidentsWithTime.find(i => i.id === resolution.incident_id);
            if (incident) {
              const createdAt = new Date(incident.created_at).getTime();
              const resolvedAt = new Date(resolution.changed_at).getTime();
              const diffMinutes = (resolvedAt - createdAt) / (1000 * 60);
              if (diffMinutes >= 0 && diffMinutes < 60 * 24 * 30) { // Ignore outliers > 30 days
                resolutionTimes.push(diffMinutes);
              }
            }
          }
          
          if (resolutionTimes.length > 0) {
            avgResolutionTime = Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length);
          }
        }
      }
    } catch (e) {
      console.error('[Admin] Failed to calculate performance metrics:', e);
    }

    // Calculate daily incident trend (last 7 days)
    const dailyTrend: { date: string; count: number }[] = [];
    try {
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const count = incidents?.filter(inc => {
          const incDate = new Date(inc.created_at).toISOString().split('T')[0];
          return incDate === dateStr;
        }).length || 0;
        dailyTrend.push({ date: dateStr, count });
      }
    } catch (e) {
      console.error('[Admin] Failed to calculate daily trend:', e);
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
    };
    
    console.log('[Admin] Stats result:', result);
    setCache('stats', result); // Cache the result
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
        { agency_type: 'pdrrmo', count: 1 },
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
    const { data, error } = await supabase
      .from('incident_status_history')
      .select('id, status, notes, changed_by, changed_at')
      .eq('incident_id', incidentId)
      .order('changed_at', { ascending: false });

    if (error) {
      console.error('[Admin] Failed to fetch audit log:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Admin] Error in getAuditLog:', err);
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
      agencies (name, short_name)
    `)
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

ipcMain.handle('users:getAll', async (_event, filters: { role?: string; agency?: string; search?: string } = {}) => {
  const cached = getCached<any>('users');
  if (cached && !filters.search) {
    return cached;
  }

  let query = supabase.from('profiles').select(`
    *,
    agencies (name, short_name)
  `);

  if (filters.role) {
    query = query.eq('role', filters.role);
  }
  if (filters.agency) {
    query = query.eq('agency_id', filters.agency);
  }
  if (filters.search) {
    query = query.or(`display_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  
  if (!filters.search) {
    setCache('users', data || []);
  }
  return data || [];
});

ipcMain.handle('users:getById', async (_event, id: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`*, agencies (name, short_name)`)
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
});

ipcMain.handle('users:update', async (_event, { id, updates }: { id: string; updates: any }) => {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
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
  clearCache('agencyStations');
  return data;
});

ipcMain.handle('stations:update', async (_event, { id, updates }: { id: number; updates: any }) => {
  const { error } = await supabase
    .from('agency_stations')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
  clearCache('agencyStations');
  return { success: true };
});

ipcMain.handle('stations:delete', async (_event, id: number) => {
  const { error } = await supabase
    .from('agency_stations')
    .delete()
    .eq('id', id);

  if (error) throw error;
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
  clearCache('resources');
  return data;
});

ipcMain.handle('resources:update', async (_event, { id, updates }: { id: number; updates: any }) => {
  const { error } = await supabase
    .from('agency_resources')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
  clearCache('resources');
  return { success: true };
});

ipcMain.handle('resources:delete', async (_event, id: number) => {
  const { error } = await supabase
    .from('agency_resources')
    .delete()
    .eq('id', id);

  if (error) throw error;
  clearCache('resources');
  return { success: true };
});

// ============================================
// EXPORT & REPORTS IPC HANDLERS
// ============================================

ipcMain.handle('export:incidents', async (_event, { format, filters }: { format: 'csv' | 'json'; filters?: any }) => {
  let query = supabase.from('incidents').select('*');
  
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.agency) query = query.eq('agency_type', filters.agency);
  if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('created_at', filters.dateTo);
  
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  if (format === 'csv') {
    const headers = ['ID', 'Agency', 'Status', 'Description', 'Reporter', 'Location', 'Created At'];
    const rows = (data || []).map(i => [
      i.id,
      i.agency_type.toUpperCase(),
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
            // Signal main process to save
            window.close();
            // The main process will handle saving after window closes
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

    // Handle window close - prompt to save
    previewWindow.on('closed', async () => {
      if (pendingPdfData) {
        const result = await dialog.showSaveDialog(mainWindow!, {
          defaultPath: pendingPdfData.filename,
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        });

        if (!result.canceled && result.filePath) {
          writeFileSync(result.filePath, pendingPdfData.pdfBuffer);
          console.log('[Admin] PDF saved to:', result.filePath);
        }
        pendingPdfData = null;
      }
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
      'pdrrmo': 'PDRRMO'
    };
    const shortName = agencyMap[agencyType?.toLowerCase()] || agencyType?.toUpperCase();
    
    // Get agency ID first
    const { data: agency } = await supabase
      .from('agencies')
      .select('id')
      .eq('short_name', shortName)
      .single();
    
    if (!agency) return [];
    
    // Get officers (Desk Officer, Field Officer, or Chief) for this agency
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email, role, phone_number')
      .eq('agency_id', agency.id)
      .in('role', ['Desk Officer', 'Field Officer', 'Chief'])
      .order('display_name');
    
    if (error) throw error;
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
    const { data, error } = await supabase
      .from('final_reports')
      .insert({
        incident_id: incidentId,
        report_details: reportDetails,
        completed_by_user_id: completedBy,
        completed_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Log security action
    await logSecurityAction('final_report_created', { incident_id: incidentId });
    
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

// ============================================
// SECURITY LOGGING
// ============================================

async function logSecurityAction(action: string, details: any, userId?: string) {
  try {
    await supabase
      .from('security_logs')
      .insert({
        user_id: userId || null,
        action,
        details,
        ip_address: 'admin-app',
        created_at: new Date().toISOString()
      });
    console.log(`[Security] Logged action: ${action}`);
  } catch (error) {
    console.error('[Security] Failed to log action:', error);
  }
}

ipcMain.handle('security:log', async (_event, { action, details, userId }: { action: string; details: any; userId?: string }) => {
  await logSecurityAction(action, details, userId);
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
    await logSecurityAction('user_created', { 
      new_user_id: authData.user.id, 
      email: userData.email, 
      role: userData.role 
    });
    
    clearCache('users');
    return { success: true, userId: authData.user.id };
  } catch (error: any) {
    console.error('[Admin] Failed to create user:', error);
    throw new Error(error.message || 'Failed to create user');
  }
});

ipcMain.handle('users:delete', async (_event, userId: string) => {
  try {
    // Delete from auth (this will cascade to profiles due to FK)
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    
    await logSecurityAction('user_deleted', { deleted_user_id: userId });
    clearCache('users');
    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to delete user:', error);
    throw new Error(error.message || 'Failed to delete user');
  }
});

ipcMain.handle('users:resetPassword', async (_event, { userId, newPassword }: { userId: string; newPassword: string }) => {
  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });
    if (error) throw error;
    
    await logSecurityAction('password_reset', { user_id: userId });
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
      return { success: true, path: result.filePath };
    }

    return { success: false, canceled: true };
  } catch (error) {
    console.error('[Admin] Failed to save PDF:', error);
    throw error;
  }
});
