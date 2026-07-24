import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../../renderer/pages/Dashboard';
import { mockApi } from '../setup';

vi.mock('../../renderer/components/DashboardMap', () => ({
  DashboardMap: () => <div data-testid="dashboard-map">Map placeholder</div>,
}));

vi.mock('../../renderer/utils/sessionScope', () => ({
  getSessionScope: () => ({ role: 'Admin' }),
  isStationScoped: () => false,
}));

const stats = {
  active: 10,
  unassigned: 4,
  overdue: 3,
  casualtyAlerts: 1,
  avgResponseTime: 210,
  activeQueue: [
    {
      id: 'incident-1',
      short_code: 'AB12',
      agency_type: 'pnp',
      status: 'pending',
      description: 'Road obstruction',
      location_address: 'Barangay Bagasbas, Daet',
      created_at: '2026-07-20T00:00:00.000Z',
      age_minutes: 22,
      is_unassigned: true,
      is_overdue: true,
      casualties_count: 0,
    },
  ],
  byAgency: [
    { agency_type: 'pnp', count: 7 },
    { agency_type: 'bfp', count: 4 },
    { agency_type: 'mdrrmo', count: 3 },
  ],
  recentActivity: [],
  multiAgencyCount: 2,
};

describe('Dashboard operations workspace', () => {
  beforeEach(() => {
    mockApi.getStats.mockResolvedValue(stats);
    mockApi.onIncidentUpdated.mockReturnValue(() => undefined);
  });

  it('explains metric scope and queue priority reason', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText('Priority response queue')).toBeTruthy();
    expect(screen.getByText('Of 10 active incidents')).toBeTruthy();
    expect(screen.getByText('Needs assignment')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review incident AB12' })).toBeTruthy();
    expect(screen.getByText('Assignments in the current scope; incidents may appear more than once.')).toBeTruthy();
  });

  it('provides queue and map tabs for constrained layouts', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect((await screen.findByRole('tab', { name: 'Priority queue' })).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Live map' }));

    expect(screen.getByRole('tab', { name: 'Live map' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('dashboard-map')).toBeTruthy();
  });

  it('labels an unapproved agency decision without implying MDRRMO assignment', async () => {
    mockApi.getStats.mockResolvedValue({
      ...stats,
      activeQueue: [{ ...stats.activeQueue[0], agency_type: 'unknown' }],
    });

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText('AWAITING AGENCY APPROVAL')).toBeTruthy();
    expect(screen.queryByTitle('Municipal Disaster Risk Reduction Management Office')).toBeNull();
  });
});
