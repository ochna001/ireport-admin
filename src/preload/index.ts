import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('api', {
  // Database operations
  getIncidents: (filters?: { agency?: string; status?: string; municipality?: string; barangay?: string; incident_type?: string; limit?: number }) => 
    ipcRenderer.invoke('db:getIncidents', filters),
  
  getIncident: (id: string) => 
    ipcRenderer.invoke('db:getIncident', id),
  
  updateIncidentStatus: (params: { id: string; status: string; notes?: string; updatedBy: string; stationId?: number; officerIds?: string[] }) => 
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

  // Stations
  createStation: (data: any) =>
    ipcRenderer.invoke('stations:create', data),
  
  updateStation: (params: { id: number; updates: any }) =>
    ipcRenderer.invoke('stations:update', params),
  
  deleteStation: (id: number) =>
    ipcRenderer.invoke('stations:delete', id),

  // Resources
  getResources: () =>
    ipcRenderer.invoke('resources:getAll'),
  
  createResource: (data: any) =>
    ipcRenderer.invoke('resources:create', data),
  
  updateResource: (params: { id: number; updates: any }) =>
    ipcRenderer.invoke('resources:update', params),
  
  deleteResource: (id: number) =>
    ipcRenderer.invoke('resources:delete', id),

  // Officers
  getOfficersByAgency: (agencyType: string) =>
    ipcRenderer.invoke('officers:getByAgency', agencyType),

  // Final Reports
  createFinalReport: (params: { incidentId: string; reportDetails: any; completedBy: string }) =>
    ipcRenderer.invoke('finalReports:create', params),
  
  getFinalReport: (incidentId: string) =>
    ipcRenderer.invoke('finalReports:get', incidentId),

  // Security Logging
  logSecurityAction: (params: { action: string; details: any; userId?: string }) =>
    ipcRenderer.invoke('security:log', params),
  
  getSecurityLogs: (filters?: { limit?: number; action?: string }) =>
    ipcRenderer.invoke('security:getLogs', filters),

  // User Creation
  createUser: (userData: { email: string; password: string; displayName: string; role: string; agencyId?: number; stationId?: number; phoneNumber?: string; dateOfBirth?: string }) =>
    ipcRenderer.invoke('users:create', userData),
  
  deleteUser: (userId: string) =>
    ipcRenderer.invoke('users:delete', userId),
  
  resetUserPassword: (params: { userId: string; newPassword: string }) =>
    ipcRenderer.invoke('users:resetPassword', params),

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

  // Debug Mode
  setDebugMode: (enabled: boolean) =>
    ipcRenderer.invoke('app:setDebugMode', enabled),
  
  getDebugMode: () =>
    ipcRenderer.invoke('app:getDebugMode'),

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
  getIncidents: (filters?: { agency?: string; status?: string; municipality?: string; barangay?: string; incident_type?: string; limit?: number }) => Promise<any[]>;
  getIncident: (id: string) => Promise<any>;
  updateIncidentStatus: (params: { id: string; status: string; notes?: string; updatedBy: string; stationId?: number; officerIds?: string[] }) => Promise<{ success: boolean }>;
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
  
  // Stations
  createStation: (data: any) => Promise<any>;
  updateStation: (params: { id: number; updates: any }) => Promise<{ success: boolean }>;
  deleteStation: (id: number) => Promise<{ success: boolean }>;
  
  // Resources
  getResources: () => Promise<any[]>;
  createResource: (data: any) => Promise<any>;
  updateResource: (params: { id: number; updates: any }) => Promise<{ success: boolean }>;
  deleteResource: (id: number) => Promise<{ success: boolean }>;
  
  // Officers
  getOfficersByAgency: (agencyType: string) => Promise<any[]>;
  
  // Final Reports
  createFinalReport: (params: { incidentId: string; reportDetails: any; completedBy: string }) => Promise<any>;
  getFinalReport: (incidentId: string) => Promise<any>;
  
  // Security Logging
  logSecurityAction: (params: { action: string; details: any; userId?: string }) => Promise<{ success: boolean }>;
  getSecurityLogs: (filters?: { limit?: number; action?: string }) => Promise<any[]>;
  
  // User Creation
  createUser: (userData: { email: string; password: string; displayName: string; role: string; agencyId?: number; stationId?: number; phoneNumber?: string; dateOfBirth?: string }) => Promise<{ success: boolean; userId: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean }>;
  resetUserPassword: (params: { userId: string; newPassword: string }) => Promise<{ success: boolean }>;
  
  // Export
  exportIncidents: (params: { format: 'csv' | 'json'; filters?: any }) => Promise<string>;
  savePdf: (params: { html: string; filename: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
  previewPdf: (params: { html: string; filename: string }) => Promise<{ success: boolean; previewing?: boolean }>;
  openExternal: (url: string) => Promise<void>;
  
  // Settings
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<{ success: boolean }>;
  
  // Debug Mode
  setDebugMode: (enabled: boolean) => Promise<{ success: boolean; debugMode: boolean }>;
  getDebugMode: () => Promise<{ debugMode: boolean }>;
  
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
