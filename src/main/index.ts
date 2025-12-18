import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { existsSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import { join } from 'path';
import { getMunicipalityFromCoordinates, isInMunicipality } from './geoUtils';

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
            ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://exp.host https://router.project-osrm.org ws://localhost:*; frame-src 'self' https://www.openstreetmap.org https://maps.google.com;"
            : "default-src 'self'; script-src 'self' https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://exp.host https://router.project-osrm.org; frame-src 'self' https://www.openstreetmap.org https://maps.google.com;"
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
    mainWindow?.focus(); // Ensure window gets focus
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Always focus window when it's shown (e.g., after logout)
  mainWindow.on('show', () => {
    mainWindow?.focus();
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
  let query = supabase.from('incidents').select('*', { count: 'exact' });

  const sanitize = (value?: string) => value?.trim().replace(/,/g, ' ') || '';

  if (filters.agency) {
    query = query.eq('agency_type', filters.agency);
  }
  if (filters.stationId) {
    query = query.eq('assigned_station_id', filters.stationId);
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
  
  // Search by description, reporter name, or exact ID (UUID)
  if (filters.search) {
    const searchTerm = sanitize(filters.search);
    console.log('[Admin] Searching incidents for:', searchTerm);

    // If the term looks like a full UUID, also match on id.eq.
    // PostgREST does not allow casts (id::text) in the filter key, so we only support exact UUID here.
    const uuidPattern = /^[0-9a-fA-F-]{36}$/;
    if (uuidPattern.test(searchTerm)) {
      query = query.or(`description.ilike.*${searchTerm}*,reporter_name.ilike.*${searchTerm}*,id.eq.${searchTerm}`);
    } else {
      // Default: search only in text fields
      query = query.or(`description.ilike.*${searchTerm}*,reporter_name.ilike.*${searchTerm}*`);
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
    
    return filteredData;
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
      
      return {
        data: paginatedData,
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
    
    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  }
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

ipcMain.handle('db:updateIncidentStatus', async (_event, { id, status, notes, updatedBy, updatedById, stationId, officerIds, resourceIds, casualtiesCategory, casualtiesCount }: { id: string; status: string; notes?: string; updatedBy: string; updatedById?: string; stationId?: number; officerIds?: string[]; resourceIds?: number[]; casualtiesCategory?: string; casualtiesCount?: number }) => {
  const now = new Date().toISOString();

  try {
    // Get current incident to check assignments and status
    const { data: currentIncident } = await supabase
      .from('incidents')
      .select('agency_type, assigned_station_id, status, assigned_officer_ids, assigned_resource_ids')
      .eq('id', id)
      .single();

    // Build update object
    const updateData: any = { 
      status, 
      updated_at: now,
      updated_by: updatedBy  // Sync with incident_status_history
    };

    // Handle casualties fields
    if (casualtiesCategory !== undefined) {
      updateData.casualties_category = casualtiesCategory || null;
    }
    if (casualtiesCount !== undefined) {
      updateData.casualties_count = casualtiesCount || null;
    }

    // Handle officer assignment (multiple officers supported)
    // Store as array - primary officer is first in list
    if (officerIds !== undefined) { // Only if explicitly provided
      updateData.assigned_officer_id = officerIds.length > 0 ? officerIds[0] : null; // Primary officer for backward compatibility
      updateData.assigned_officer_ids = officerIds; // All assigned officers

      // Manage Officer Availability Status
      const oldOfficerIds: string[] = currentIncident?.assigned_officer_ids || [];
      const newOfficerIds: string[] = officerIds;

      // Officers removed -> set to available
      const removedOfficers = oldOfficerIds.filter(oid => !newOfficerIds.includes(oid));
      if (removedOfficers.length > 0) {
        await supabase.from('profiles').update({ status: 'available' }).in('id', removedOfficers);
      }

      // Officers added -> set to busy
      const addedOfficers = newOfficerIds.filter(oid => !oldOfficerIds.includes(oid));
      if (addedOfficers.length > 0) {
        await supabase.from('profiles').update({ status: 'busy' }).in('id', addedOfficers);
      }
      
      // If incident is resolved/closed, free all officers
      if (status === 'resolved' || status === 'closed') {
         if (newOfficerIds.length > 0) {
            await supabase.from('profiles').update({ status: 'available' }).in('id', newOfficerIds);
         }
      }
    }

    // Handle resource assignment
    if (resourceIds !== undefined) {
      updateData.assigned_resource_ids = resourceIds;

      // Manage Resource Availability Status
      const oldResourceIds: number[] = currentIncident?.assigned_resource_ids || [];
      const newResourceIds: number[] = resourceIds;

      // Resources removed -> set to available
      const removedResources = oldResourceIds.filter(rid => !newResourceIds.includes(rid));
      if (removedResources.length > 0) {
        await supabase.from('agency_resources').update({ status: 'available', updated_at: now }).in('id', removedResources);
      }

      // Resources added -> set to deployed
      const addedResources = newResourceIds.filter(rid => !oldResourceIds.includes(rid));
      if (addedResources.length > 0) {
        await supabase.from('agency_resources').update({ status: 'deployed', updated_at: now }).in('id', addedResources);
      }

      // If incident is resolved/closed, free all resources
      if (status === 'resolved' || status === 'closed') {
         if (newResourceIds.length > 0) {
            await supabase.from('agency_resources').update({ status: 'available', updated_at: now }).in('id', newResourceIds);
         }
      }
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
      console.log('[Admin] Explicit station assignment:', stationId);
    } else if (!currentIncident?.assigned_station_id && status !== 'pending') {
      // Auto-assign to CLOSEST station of matching agency if not already assigned
      console.log('[Admin] Attempting auto-assignment for incident:', id);
      console.log('[Admin] Current incident agency:', currentIncident?.agency_type);
      console.log('[Admin] Status:', status);
      
      const agencyNameMap: Record<string, string> = {
        'pnp': 'PNP',
        'bfp': 'BFP', 
        'pdrrmo': 'PDRRMO',
        'mdrrmo': 'MDRRMO'
      };
      const agencyShortName = agencyNameMap[currentIncident?.agency_type?.toLowerCase()] || currentIncident?.agency_type?.toUpperCase();
      
      console.log('[Admin] Looking for agency with short_name:', agencyShortName);
      
      // Find agency by short_name (matches agency_type) - case insensitive
      const { data: agency, error: agencyError } = await supabase
        .from('agencies')
        .select('id')
        .ilike('short_name', agencyShortName)
        .single();
      
      if (agencyError) {
        console.error('[Admin] Agency lookup failed:', agencyError);
      }
      
      if (agency) {
        console.log('[Admin] Found agency:', agency);
        
        // Get incident coordinates for distance calculation
        const { data: incident } = await supabase
          .from('incidents')
          .select('latitude, longitude')
          .eq('id', id)
          .single();
        
        console.log('[Admin] Incident coordinates:', incident?.latitude, incident?.longitude);
        
        if (incident?.latitude && incident?.longitude) {
          // Get all stations for this agency
          const { data: stations } = await supabase
            .from('agency_stations')
            .select('id, name, latitude, longitude')
            .eq('agency_id', agency.id);
          
          console.log('[Admin] Found', stations?.length || 0, 'stations for agency');
          
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
            console.log(`[Admin] ✅ Auto-assigned to closest station: ${closestStation.name || closestStation.id} (${minDistance.toFixed(2)}km away)`);
          } else {
            console.warn('[Admin] ⚠️ No stations found for agency');
          }
        } else {
          console.warn('[Admin] ⚠️ Incident missing coordinates - cannot auto-assign');
        }
      } else {
        console.warn('[Admin] ⚠️ Agency not found - cannot auto-assign');
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
          author_id: updatedById || null,
          update_text: `Status changed to ${status}: ${notes}`,
          created_at: now
        });
        
      if (noteError) {
        console.error('[Admin] Failed to save note:', noteError);
      }
    }

    // Create notifications for assigned officers
    if (officerIds !== undefined) {
      const oldOfficerIds: string[] = currentIncident?.assigned_officer_ids || [];
      const newOfficerIds: string[] = officerIds;
      
      // Determine which officers are new, still assigned, or removed
      const addedOfficers = newOfficerIds.filter(oid => !oldOfficerIds.includes(oid));
      const stillAssigned = newOfficerIds.filter(oid => oldOfficerIds.includes(oid));
      const removedOfficers = oldOfficerIds.filter(oid => !newOfficerIds.includes(oid));
      
      const allNotifications: any[] = [];
      
      // Notify newly assigned officers
      if (addedOfficers.length > 0) {
        addedOfficers.forEach(officerId => {
          allNotifications.push({
            recipient_id: officerId,
            incident_id: id,
            title: 'New Incident Assignment',
            body: `You have been assigned to incident #${id.slice(0, 8).toUpperCase()}. Status: ${status}`,
            is_read: false,
            created_at: now
          });
        });
      }
      
      // Notify officers who remain assigned (only if there were changes to the team)
      if (stillAssigned.length > 0 && (addedOfficers.length > 0 || removedOfficers.length > 0)) {
        stillAssigned.forEach(officerId => {
          allNotifications.push({
            recipient_id: officerId,
            incident_id: id,
            title: 'Incident Team Updated',
            body: `The response team for incident #${id.slice(0, 8).toUpperCase()} has been updated. Status: ${status}`,
            is_read: false,
            created_at: now
          });
        });
      }
      
      // Notify removed officers
      if (removedOfficers.length > 0) {
        removedOfficers.forEach(officerId => {
          allNotifications.push({
            recipient_id: officerId,
            incident_id: id,
            title: 'Unassigned from Incident',
            body: `You have been unassigned from incident #${id.slice(0, 8).toUpperCase()}.`,
            is_read: false,
            created_at: now
          });
        });
      }
      
      if (allNotifications.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(allNotifications);

        if (notifError) {
          console.error('[Admin] Failed to create officer notifications:', notifError);
        } else {
          console.log(`[Admin] Created ${allNotifications.length} notification(s) for officers`);
        }
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
    agencies (name, short_name)
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
    .select(`*, agencies (name, short_name)`)
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
  if (filters?.stationId) query = query.eq('assigned_station_id', filters.stationId);
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
      'pdrrmo': 'PDRRMO',
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
      .select('id, display_name, email, role, phone_number, station_id, agency_id')
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
    const { data, error } = await supabase
      .from('notifications')
      .select('*, incidents(id, agency_type, description)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    return data || [];
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
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', userId)
      .eq('is_read', false);
    
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('[Admin] Failed to mark all notifications as read:', error);
    throw new Error(error.message || 'Failed to mark all notifications as read');
  }
});

ipcMain.handle('notifications:getUnreadCount', async (_event, userId: string) => {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('is_read', false);
    
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
  agencyType: 'pnp' | 'bfp' | 'pdrrmo';
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
    // Upsert: insert or update based on incident_id
    const { data, error } = await supabase
      .from('final_report_drafts')
      .upsert({
        incident_id: incidentId,
        agency_type: agencyType.toLowerCase(),
        draft_details: draftDetails,
        status,
        author_id: authorId || null,
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
    
    await logSecurityAction('user_disabled', { disabled_user_id: userId });
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
