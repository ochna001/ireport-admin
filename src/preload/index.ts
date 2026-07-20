import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('api', {
  // Database operations
  getIncidents: (filters?: { agency?: string; status?: string; municipality?: string; barangay?: string; incident_type?: string; limit?: number; stationId?: number }) =>
    ipcRenderer.invoke('db:getIncidents', filters),

  getIncident: (id: string) =>
    ipcRenderer.invoke('db:getIncident', id),

  getIncidentAIReport: (incidentId: string) =>
    ipcRenderer.invoke('db:getIncidentAIReport', incidentId),

  updateIncidentStatus: (params: { id: string; status: string; notes?: string; updatedBy: string; updatedById?: string; stationId?: number; officerIds?: string[]; primaryOfficerId?: string | null; resourceIds?: number[]; casualtiesCategory?: string; casualtiesCount?: number }) =>
    ipcRenderer.invoke('db:updateIncidentStatus', params),

  reopenIncident: (params: { id: string; updatedBy: string; updatedById?: string; notes?: string }) =>
    ipcRenderer.invoke('incidents:reopen', params),

  getStats: (filters?: { from?: string; to?: string; skipCache?: boolean; stationId?: number; agency?: string }) =>
    ipcRenderer.invoke('db:getStats', filters),

  getAuditLog: (incidentId: string) =>
    ipcRenderer.invoke('db:getAuditLog', incidentId),

  getIncidentAssignmentHistory: (incidentId: string) =>
    ipcRenderer.invoke('db:getIncidentAssignmentHistory', incidentId),

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
  logSecurityAction: (params: { action: string; details: any; userId?: string; userEmail?: string; entityType?: string; entityId?: string }) =>
    ipcRenderer.invoke('security:log', params),

  getSecurityLogs: (filters?: { limit?: number; action?: string }) =>
    ipcRenderer.invoke('security:getLogs', filters),

  getActivityLogs: (filters?: { fromDate?: string; toDate?: string; entityType?: string; action?: string; userEmail?: string; search?: string; offset?: number; limit?: number }) =>
    ipcRenderer.invoke('security:getActivityLogs', filters),

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

  // Incident Agencies (Multi-Agency Coordination)
  getIncidentAgencies: (incidentId: string) =>
    ipcRenderer.invoke('incidentAgencies:get', incidentId),
  addIncidentAgency: (params: { incidentId: string; agencyId: number; role: 'primary' | 'lead' | 'supporting' }) =>
    ipcRenderer.invoke('incidentAgencies:add', params),
  updateIncidentAgencyRole: (params: { id: number; role: 'primary' | 'lead' | 'supporting' }) =>
    ipcRenderer.invoke('incidentAgencies:updateRole', params),
  acknowledgeIncidentAgency: (id: number) =>
    ipcRenderer.invoke('incidentAgencies:acknowledge', id),
  removeIncidentAgency: (id: number) =>
    ipcRenderer.invoke('incidentAgencies:remove', id),
  getAvailableAgencies: (incidentId: string) =>
    ipcRenderer.invoke('incidentAgencies:getAvailable', incidentId),

  // Backup Requests (Phase 2 Workflow)
  getBackupRequestsByIncident: (incidentId: string) =>
    ipcRenderer.invoke('backupRequests:getByIncident', incidentId),
  updateBackupRequestStatus: (params: { id: number; status: 'pending' | 'acknowledged' | 'assigned' | 'resolved' | 'cancelled' | 'rejected'; handledById?: string; notes?: string; targetAgencyId?: number | null; targetStationId?: number | null }) =>
    ipcRenderer.invoke('backupRequests:updateStatus', params),

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

  // Window Focus
  focusWindow: () =>
    ipcRenderer.invoke('app:focusWindow'),

  confirm: (params: { message: string; detail?: string; title?: string }) =>
    ipcRenderer.invoke('app:confirm', params),

  // Event listeners
  onSyncStatus: (callback: (status: any) => void) => {
    const listener = (_: any, status: any) => callback(status);
    ipcRenderer.on('sync-status', listener);
    return () => ipcRenderer.removeListener('sync-status', listener);
  },

  onIncidentUpdated: (callback: (incident: any) => void) => {
    const listener = (_: any, incident: any) => callback(incident);
    ipcRenderer.on('incident-updated', listener);
    return () => ipcRenderer.removeListener('incident-updated', listener);
  },

  onNewNotification: (callback: (notification: { id: number; title: string; body: string; incident_id?: string; created_at: string }) => void) => {
    const listener = (_: any, notification: any) => callback(notification);
    ipcRenderer.on('new-notification', listener);
    return () => ipcRenderer.removeListener('new-notification', listener);
  },

  // Remove listeners
  off: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, listener);
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // AI Worker
  getAIWorkerUrl: () => ipcRenderer.invoke('ai:getWorkerUrl'),
  setAIWorkerUrl: (url: string) => ipcRenderer.invoke('ai:setWorkerUrl', url),
  getAIFallbackWorkerUrl: () => ipcRenderer.invoke('ai:getFallbackWorkerUrl'),
  setAIFallbackWorkerUrl: (url: string) => ipcRenderer.invoke('ai:setFallbackWorkerUrl', url),
  checkAIWorkerHealth: () => ipcRenderer.invoke('ai:checkWorkerHealth'),
  getAIAnalysisRecords: (filters?: { status?: string; search?: string; page?: number; limit?: number }) =>
    ipcRenderer.invoke('ai:getRecords', filters),
  listAIAnalysisIncidents: (filters?: { search?: string; limit?: number }) =>
    ipcRenderer.invoke('ai:listIncidents', filters),
  triggerAIReanalysis: (incidentId: string) => ipcRenderer.invoke('ai:triggerReanalysis', incidentId),
  getAIModelConfig: () => ipcRenderer.invoke('ai:getModelConfig'),
  setAIModelConfig: (config: any) => ipcRenderer.invoke('ai:setModelConfig', config),
  sendAIChatPrompt: (payload: any) => ipcRenderer.invoke('ai:sendChatPrompt', payload),
  summarizeCallTranscript: (payload: {
    transcript: Array<{ speaker?: string; text?: string }> | string;
    reporter_name?: string;
    reporter_phone?: string;
    incident_location?: string;
    reporter_location?: string;
    dispatcher_notes?: string;
    call_started_at?: string;
    call_ended_at?: string;
  }) => ipcRenderer.invoke('ai:summarizeCallTranscript', payload),
  createIncidentFromCallDraft: (payload: {
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
  }) => ipcRenderer.invoke('ai:createIncidentFromCallDraft', payload),

  // Call pipeline
  listCallSessions: (filters?: { status?: string; limit?: number }) =>
    ipcRenderer.invoke('calls:listSessions', filters),
  updateCallSessionStatus: (payload: {
    sessionId: string;
    status: 'initiated' | 'ringing' | 'active' | 'ended' | 'cancelled' | 'failed';
    receiverUserId?: string;
  }) => ipcRenderer.invoke('calls:updateSessionStatus', payload),
  listCallTranscripts: (payload: { sessionId: string }) =>
    ipcRenderer.invoke('calls:listTranscripts', payload),
  addCallTranscriptLine: (payload: {
    sessionId: string;
    room?: string;
    speaker: 'caller' | 'receiver' | 'dispatcher' | 'system';
    text: string;
    isFinal?: boolean;
  }) => ipcRenderer.invoke('calls:addTranscriptLine', payload),
  getCallTranscriptText: (payload: { sessionId: string }) =>
    ipcRenderer.invoke('calls:getTranscriptText', payload),

  // System Settings (AI Worker dynamic config)
  getSystemSettings: () => ipcRenderer.invoke('systemSettings:getAll'),
  upsertSystemSetting: (key: string, value: string) => ipcRenderer.invoke('systemSettings:upsert', { key, value }),
});

// Type definitions for renderer
export interface ElectronAPI {
  // Incidents
  getIncidents: (filters?: { agency?: string; status?: string; municipality?: string; barangay?: string; incident_type?: string; limit?: number; stationId?: number }) => Promise<any[]>;
  getIncident: (id: string) => Promise<any>;
  getIncidentAIReport: (id: string) => Promise<any>;
  updateIncidentStatus: (params: { id: string; status: string; notes?: string; updatedBy: string; updatedById?: string; stationId?: number; officerIds?: string[]; primaryOfficerId?: string | null; resourceIds?: number[]; casualtiesCategory?: string; casualtiesCount?: number }) => Promise<{ success: boolean }>;
  reopenIncident: (params: { id: string; updatedBy: string; updatedById?: string; notes?: string }) => Promise<{ success: boolean; restoredOfficerIds?: string[]; restoredResourceIds?: number[]; unavailableOfficerIds?: string[]; unavailableResourceIds?: number[] }>;
  getStats: (filters?: { from?: string; to?: string; skipCache?: boolean; stationId?: number; agency?: string }) => Promise<any>;
  getAuditLog: (incidentId: string) => Promise<any[]>;
  getIncidentAssignmentHistory: (incidentId: string) => Promise<any[]>;
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

  // Incident Agencies (Multi-Agency Coordination)
  getIncidentAgencies: (incidentId: string) => Promise<any[]>;
  addIncidentAgency: (params: { incidentId: string; agencyId: number; role: 'primary' | 'lead' | 'supporting' }) => Promise<any>;
  updateIncidentAgencyRole: (params: { id: number; role: 'primary' | 'lead' | 'supporting' }) => Promise<{ success: boolean }>;
  acknowledgeIncidentAgency: (id: number) => Promise<{ success: boolean }>;
  removeIncidentAgency: (id: number) => Promise<{ success: boolean }>;
  getAvailableAgencies: (incidentId: string) => Promise<any[]>;

  // Backup Requests (Phase 2 Workflow)
  getBackupRequestsByIncident: (incidentId: string) => Promise<any[]>;
  updateBackupRequestStatus: (params: { id: number; status: 'pending' | 'acknowledged' | 'assigned' | 'resolved' | 'cancelled' | 'rejected'; handledById?: string; notes?: string; targetAgencyId?: number | null; targetStationId?: number | null }) => Promise<{ success: boolean }>;

  // Final Report Drafts
  getFinalReportDraft: (incidentId: string) => Promise<any | null>;
  saveFinalReportDraft: (params: { incidentId: string; agencyType: string; draftDetails: any; status?: string; authorId?: string }) => Promise<{ success: boolean; draft: any }>;
  promoteFinalReportDraft: (params: { incidentId: string; authorId?: string }) => Promise<{ success: boolean }>;
  deleteFinalReportDraft: (incidentId: string) => Promise<{ success: boolean }>;
  listFinalReportDrafts: (filters?: { agencyType?: string; status?: string; stationId?: number }) => Promise<any[]>;

  // Security Logging
  logSecurityAction: (params: { action: string; details: any; userId?: string; userEmail?: string; entityType?: string; entityId?: string }) => Promise<{ success: boolean }>;
  getSecurityLogs: (filters?: { limit?: number; action?: string }) => Promise<any[]>;
  getActivityLogs: (filters?: { fromDate?: string; toDate?: string; entityType?: string; action?: string; userEmail?: string; search?: string; offset?: number; limit?: number }) => Promise<{ data: any[]; total: number }>;

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

  // AI Worker
  getAIWorkerUrl: () => Promise<string>;
  setAIWorkerUrl: (url: string) => Promise<{ success: boolean }>;
  getAIFallbackWorkerUrl: () => Promise<string>;
  setAIFallbackWorkerUrl: (url: string) => Promise<{ success: boolean }>;
  checkAIWorkerHealth: () => Promise<any>;
  getAIAnalysisRecords: (filters?: { status?: string; search?: string; page?: number; limit?: number }) => Promise<{ data: any[]; total: number }>;
  listAIAnalysisIncidents: (filters?: { search?: string; limit?: number }) => Promise<any[]>;
  triggerAIReanalysis: (incidentId: string) => Promise<{ success: boolean }>;
  getAIModelConfig: () => Promise<any>;
  setAIModelConfig: (config: any) => Promise<{ success: boolean }>;
  sendAIChatPrompt: (payload: any) => Promise<any>;
  summarizeCallTranscript: (payload: {
    transcript: Array<{ speaker?: string; text?: string }> | string;
    reporter_name?: string;
    reporter_phone?: string;
    incident_location?: string;
    reporter_location?: string;
    dispatcher_notes?: string;
    call_started_at?: string;
    call_ended_at?: string;
  }) => Promise<any>;
  createIncidentFromCallDraft: (payload: {
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
  }) => Promise<any>;

  // Calls
  listCallSessions: (filters?: { status?: string; limit?: number }) => Promise<any[]>;
  updateCallSessionStatus: (payload: {
    sessionId: string;
    status: 'initiated' | 'ringing' | 'active' | 'ended' | 'cancelled' | 'failed';
    receiverUserId?: string;
  }) => Promise<any>;
  listCallTranscripts: (payload: { sessionId: string }) => Promise<any[]>;
  addCallTranscriptLine: (payload: {
    sessionId: string;
    room?: string;
    speaker: 'caller' | 'receiver' | 'dispatcher' | 'system';
    text: string;
    isFinal?: boolean;
  }) => Promise<any>;
  getCallTranscriptText: (payload: { sessionId: string }) => Promise<{
    sessionId: string;
    transcript: string;
    lines: Array<{ speaker?: string; text?: string; created_at?: string }>;
  }>;

  // System Settings (AI Worker dynamic config)
  getSystemSettings: () => Promise<Array<{ setting_key: string; setting_value: string; updated_at: string }>>;
  upsertSystemSetting: (key: string, value: string) => Promise<{ success: boolean }>;

  // Window Focus
  focusWindow: () => Promise<{ success: boolean }>;

  confirm: (params: { message: string; detail?: string; title?: string }) => Promise<{ confirmed: boolean }>;

  // Events
  onSyncStatus: (callback: (status: any) => void) => () => void;
  onIncidentUpdated: (callback: (incident: any) => void) => () => void;
  onNewNotification: (callback: (notification: { id: number; recipient_id?: string; title: string; body: string; incident_id?: string; created_at: string }) => void) => () => void;
  off: (channel: string, listener: (...args: any[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
