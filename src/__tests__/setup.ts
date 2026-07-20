/**
 * Test Setup for iReport Admin
 * Configures the testing environment with mocks and utilities
 */

import { vi, beforeEach } from 'vitest';

// Mock Electron IPC
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

// Mock window.api for renderer tests
const mockApi = {
  getIncidents: vi.fn(),
  getIncident: vi.fn(),
  updateIncidentStatus: vi.fn(),
  getUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  resetUserPassword: vi.fn(),
  getAgencies: vi.fn(),
  getAgencyStations: vi.fn(),
  logSecurityAction: vi.fn(),
  getSecurityLogs: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
  getStats: vi.fn(),
  getAuditLog: vi.fn(),
  getNearbyServices: vi.fn(),
  getSyncStatus: vi.fn(),
};

// Attach the mock api to the EXISTING jsdom window rather than replacing it.
// Replacing window with a bare object breaks react-dom's renderer (component
// tests fail with "Should not already be working."). Augmenting preserves the
// real DOM while still exposing window.api for renderer tests.
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {};
}
(globalThis as any).window.api = mockApi;

export { mockApi };

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
