/**
 * Real component test (Vitest + @testing-library/react) for the AI Analysis
 * role-gating change. Renders the actual <AIAnalysis> page through react-router
 * and asserts:
 *   - non-Admin roles are redirected to /dashboard (route guard)
 *   - Admins see the page, but the removed "Model Settings" / "Prompt Lab"
 *     tabs are gone while the kept tabs remain.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIAnalysis from '../../renderer/pages/AIAnalysis';

// In-memory localStorage stub (setup.ts replaces window with a bare object)
function installLocalStorage(user: unknown | null) {
  const store: Record<string, string> = {};
  if (user !== null) store['ireport_admin_current_user'] = JSON.stringify(user);
  const ls = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
  (globalThis as any).localStorage = ls;
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.localStorage = ls;
}

beforeEach(() => {
  // Minimal window.api so the Admin-path effects don't throw
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.api = {
    getAIWorkerUrl: vi.fn().mockResolvedValue('http://127.0.0.1:8000'),
    setAIWorkerUrl: vi.fn().mockResolvedValue({ success: true }),
    getAIAnalysisRecords: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    listAIAnalysisIncidents: vi.fn().mockResolvedValue([]),
    getIncidentAIReport: vi.fn().mockResolvedValue(null),
  };
});

function renderAt(route = '/ai-analysis') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/ai-analysis" element={<AIAnalysis />} />
        <Route path="/dashboard" element={<div>DASHBOARD PLACEHOLDER</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AIAnalysis role gating', () => {
  it('redirects a Desk Officer away from the AI Analysis page', () => {
    installLocalStorage({ role: 'Officer', display_name: 'Desk Officer' });
    renderAt();
    expect(screen.getByText('DASHBOARD PLACEHOLDER')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AI Analysis' })).not.toBeInTheDocument();
  });

  it('redirects an Agency Chief away from the AI Analysis page', () => {
    installLocalStorage({ role: 'Chief' });
    renderAt();
    expect(screen.getByText('DASHBOARD PLACEHOLDER')).toBeInTheDocument();
  });

  it('redirects when no user is stored', () => {
    installLocalStorage(null);
    renderAt();
    expect(screen.getByText('DASHBOARD PLACEHOLDER')).toBeInTheDocument();
  });

  it('renders the page for an Admin', () => {
    installLocalStorage({ role: 'Admin' });
    renderAt();
    expect(screen.getByRole('heading', { name: 'AI Analysis' })).toBeInTheDocument();
    expect(screen.queryByText('DASHBOARD PLACEHOLDER')).not.toBeInTheDocument();
  });

  it('no longer exposes Model Settings or Prompt Lab tabs to Admin', () => {
    installLocalStorage({ role: 'Admin' });
    renderAt();
    // Removed (moved to ireport-service-manager)
    expect(screen.queryByText('Model Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Prompt Lab')).not.toBeInTheDocument();
    // Kept
    expect(screen.getByText('Records')).toBeInTheDocument();
    expect(screen.getByText('Manual Analysis')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Log')).toBeInTheDocument();
  });
});
