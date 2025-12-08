import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('api', {
  // Database operations
  getIncidents: (filters?: { agency?: string; status?: string; municipality?: string; barangay?: string; incident_type?: string; limit?: number; stationId?: number }) => 
    ipcRenderer.invoke('db:getIncidents', filters),
  
  getIncident: (id: string) => 
    ipcRenderer.invoke('db:getIncident', id),
  
  updateIncidentStatus: (params: { id: string; status: string; notes?: string; updatedBy: string; updatedById?: string; stationId?: number; officerIds?: string[]; resourceIds?: number[] }) => 
    ipcRenderer.invoke('db:updateIncidentStatus', params),
  
  getStats: (filters?: { from?: string; to?: string; skipCache?: boolean; stationId?: number; agency?: string }) => 
    ipcRenderer.invoke('db:getStats', filters),
  
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
  getUsers: (filters?: { role?: string; agency?: string; stationId?: number; search?: string }) =>
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

  // Auth
  loginChief: (params: { email: string; password: string }) =>
    ipcRenderer.invoke('auth:loginChief', params),
  loginOfficer: (params: { email: string; password: string }) =>
    ipcRenderer.invoke('auth:loginOfficer', params),

  logout: () =>
    ipcRenderer.invoke('auth:logout'),

  // Export
  exportIncidents: (params: { format: 'csv' | 'json'; filters?: any }) =>
    ipcRenderer.invoke('export:incidents', params),
  
  savePdf: (params: { html: string; filename: string }) =>
    ipcRenderer.invoke('report:save-pdf', params),
  
  previewPdf: (params: { html: string; filename: string }) =>
    ipcRenderer.invoke('report:preview-pdf', params),
  
  openExternal: (url: string) =>
    ipcRenderer.invoke('app:openExternal', url),

  // Unit Reports
  getUnitReportsByIncident: (incidentId: string) =>
    ipcRenderer.invoke('unitReports:getByIncident', incidentId),

  // Media
  uploadMedia: (params: { incidentId: string; filePath: string; fileName: string; mediaType: 'photo' | 'video' }) =>
    ipcRenderer.invoke('media:upload', params),
  getMediaByIncident: (incidentId: string) =>
    ipcRenderer.invoke('media:getByIncident', incidentId),
  deleteMedia: (params: { mediaId: number; storagePath: string }) =>
    ipcRenderer.invoke('media:delete', params),
  openFileDialog: (options?: { filters?: any[] }) =>
    ipcRenderer.invoke('dialog:openFile', options),

  // Notifications
  getNotificationsByUser: (userId: string) =>
    ipcRenderer.invoke('notifications:getByUser', userId),
  markNotificationAsRead: (notificationId: number) =>
    ipcRenderer.invoke('notifications:markAsRead', notificationId),
  markAllNotificationsAsRead: (userId: string) =>
    ipcRenderer.invoke('notifications:markAllAsRead', userId),
  getUnreadNotificationCount: (userId: string) =>
    ipcRenderer.invoke('notifications:getUnreadCount', userId),

  // Final Report Drafts
  getFinalReportDraft: (incidentId: string) =>
    ipcRenderer.invoke('finalReportDrafts:get', incidentId),
  saveFinalReportDraft: (params: { incidentId: string; agencyType: string; draftDetails: any; status?: string; authorId?: string }) =>
    ipcRenderer.invoke('finalReportDrafts:save', params),
  promoteFinalReportDraft: (params: { incidentId: string; authorId?: string }) =>
    ipcRenderer.invoke('finalReportDrafts:promote', params),
  deleteFinalReportDraft: (incidentId: string) =>
    ipcRenderer.invoke('finalReportDrafts:delete', incidentId),
  listFinalReportDrafts: (filters?: { agencyType?: string; status?: string; stationId?: number }) =>
    ipcRenderer.invoke('finalReportDrafts:list', filters),

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
  getIncidents: (filters?: { agency?: string; status?: string; municipality?: string; barangay?: string; incident_type?: string; limit?: number; stationId?: number }) => Promise<any[]>;
  getIncident: (id: string) => Promise<any>;
  updateIncidentStatus: (params: { id: string; status: string; notes?: string; updatedBy: string; updatedById?: string; stationId?: number; officerIds?: string[]; resourceIds?: number[] }) => Promise<{ success: boolean }>;
  getStats: (filters?: { from?: string; to?: string; skipCache?: boolean; stationId?: number; agency?: string }) => Promise<any>;
  getAuditLog: (incidentId: string) => Promise<any[]>;
  getAgencyStations: () => Promise<any[]>;
  getNearbyServices: (params: { latitude: number; longitude: number; radius?: number }) => Promise<any[]>;
  
  // Sync
  getSyncStatus: () => Promise<{ connected: boolean; lastSync: string | null; pending: number; syncing: boolean }>;
  syncNow: () => Promise<{ success: boolean }>;
  
  // Users
  getUsers: (filters?: { role?: string; agency?: string; stationId?: number; search?: string }) => Promise<any[]>;
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
  
  // Unit Reports
  getUnitReportsByIncident: (incidentId: string) => Promise<any[]>;
  
  // Media
  uploadMedia: (params: { incidentId: string; filePath: string; fileName: string; mediaType: 'photo' | 'video' }) => Promise<{ success: boolean; storagePath: string; publicUrl: string; mediaId?: number }>;
  getMediaByIncident: (incidentId: string) => Promise<any[]>;
  deleteMedia: (params: { mediaId: number; storagePath: string }) => Promise<{ success: boolean }>;
  openFileDialog: (options?: { filters?: any[] }) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  
  // Notifications
  getNotificationsByUser: (userId: string) => Promise<any[]>;
  markNotificationAsRead: (notificationId: number) => Promise<{ success: boolean }>;
  markAllNotificationsAsRead: (userId: string) => Promise<{ success: boolean }>;
  getUnreadNotificationCount: (userId: string) => Promise<number>;
  
  // Final Report Drafts
  getFinalReportDraft: (incidentId: string) => Promise<any | null>;
  saveFinalReportDraft: (params: { incidentId: string; agencyType: string; draftDetails: any; status?: string; authorId?: string }) => Promise<{ success: boolean; draft: any }>;
  promoteFinalReportDraft: (params: { incidentId: string; authorId?: string }) => Promise<{ success: boolean }>;
  deleteFinalReportDraft: (incidentId: string) => Promise<{ success: boolean }>;
  listFinalReportDrafts: (filters?: { agencyType?: string; status?: string; stationId?: number }) => Promise<any[]>;
  
  // Security Logging
  logSecurityAction: (params: { action: string; details: any; userId?: string }) => Promise<{ success: boolean }>;
  getSecurityLogs: (filters?: { limit?: number; action?: string }) => Promise<any[]>;
  
  // User Creation
  createUser: (userData: { email: string; password: string; displayName: string; role: string; agencyId?: number; stationId?: number; phoneNumber?: string; dateOfBirth?: string }) => Promise<{ success: boolean; userId: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean }>;
  resetUserPassword: (params: { userId: string; newPassword: string }) => Promise<{ success: boolean }>;
  
  // Auth
  loginChief: (params: { email: string; password: string }) => Promise<any>;
  loginOfficer: (params: { email: string; password: string }) => Promise<any>;
  logout: () => Promise<{ success: boolean }>;

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
