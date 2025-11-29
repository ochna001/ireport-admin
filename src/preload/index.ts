import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('api', {
  // Database operations
  getIncidents: (filters?: { agency?: string; status?: string; limit?: number }) => 
    ipcRenderer.invoke('db:getIncidents', filters),
  
  getIncident: (id: string) => 
    ipcRenderer.invoke('db:getIncident', id),
  
  updateIncidentStatus: (params: { id: string; status: string; notes?: string; updatedBy: string }) => 
    ipcRenderer.invoke('db:updateIncidentStatus', params),
  
  getStats: () => 
    ipcRenderer.invoke('db:getStats'),
  
  getAuditLog: (incidentId: string) => 
    ipcRenderer.invoke('db:getAuditLog', incidentId),

  getAgencyStations: () =>
    ipcRenderer.invoke('db:getAgencyStations'),

  getNearbyServices: (params: { latitude: number; longitude: number; radius?: number }) =>
    ipcRenderer.invoke('db:getNearbyServices', params),

  // Sync operations
  getSyncStatus: () => 
    ipcRenderer.invoke('sync:status'),
  
  syncNow: () => 
    ipcRenderer.invoke('sync:now'),

  // User management
  getUsers: (filters?: { role?: string; agency?: string; search?: string }) =>
    ipcRenderer.invoke('users:getAll', filters),
  
  getUserById: (id: string) =>
    ipcRenderer.invoke('users:getById', id),
  
  updateUser: (params: { id: string; updates: any }) =>
    ipcRenderer.invoke('users:update', params),
  
  getAgencies: () =>
    ipcRenderer.invoke('users:getAgencies'),

  // Export
  exportIncidents: (params: { format: 'csv' | 'json'; filters?: any }) =>
    ipcRenderer.invoke('export:incidents', params),
  
  savePdf: (params: { html: string; filename: string }) =>
    ipcRenderer.invoke('report:save-pdf', params),
  
  previewPdf: (params: { html: string; filename: string }) =>
    ipcRenderer.invoke('report:preview-pdf', params),
  
  openExternal: (url: string) =>
    ipcRenderer.invoke('app:openExternal', url),

  // Settings
  getSettings: () =>
    ipcRenderer.invoke('settings:get'),
  
  updateSettings: (settings: any) =>
    ipcRenderer.invoke('settings:update', settings),

  // Event listeners
  onSyncStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('sync-status', (_, status) => callback(status));
  },
  
  onIncidentUpdated: (callback: (incident: any) => void) => {
    ipcRenderer.on('incident-updated', (_, incident) => callback(incident));
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Type definitions for renderer
export interface ElectronAPI {
  // Incidents
  getIncidents: (filters?: { agency?: string; status?: string; limit?: number }) => Promise<any[]>;
  getIncident: (id: string) => Promise<any>;
  updateIncidentStatus: (params: { id: string; status: string; notes?: string; updatedBy: string }) => Promise<{ success: boolean }>;
  getStats: () => Promise<any>;
  getAuditLog: (incidentId: string) => Promise<any[]>;
  getAgencyStations: () => Promise<any[]>;
  getNearbyServices: (params: { latitude: number; longitude: number; radius?: number }) => Promise<any[]>;
  
  // Sync
  getSyncStatus: () => Promise<{ connected: boolean; lastSync: string | null; pending: number; syncing: boolean }>;
  syncNow: () => Promise<{ success: boolean }>;
  
  // Users
  getUsers: (filters?: { role?: string; agency?: string; search?: string }) => Promise<any[]>;
  getUserById: (id: string) => Promise<any>;
  updateUser: (params: { id: string; updates: any }) => Promise<{ success: boolean }>;
  getAgencies: () => Promise<any[]>;
  
  // Export
  exportIncidents: (params: { format: 'csv' | 'json'; filters?: any }) => Promise<string>;
  savePdf: (params: { html: string; filename: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
  previewPdf: (params: { html: string; filename: string }) => Promise<{ success: boolean; previewing?: boolean }>;
  openExternal: (url: string) => Promise<void>;
  
  // Settings
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<{ success: boolean }>;
  
  // Events
  onSyncStatus: (callback: (status: any) => void) => void;
  onIncidentUpdated: (callback: (incident: any) => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
