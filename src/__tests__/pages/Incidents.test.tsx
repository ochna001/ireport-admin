import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Incidents from '../../renderer/pages/Incidents';
import { mockApi } from '../setup';

vi.mock('../../renderer/utils/sessionScope', () => ({
  getSessionScope: () => ({ role: 'Admin' }),
  isStationScoped: () => false,
}));

describe('Incidents operations register', () => {
  beforeEach(() => {
    mockApi.getIncidents.mockResolvedValue({
      data: [
        {
          id: 'incident-1',
          short_code: 'AB12',
          agency_type: 'pnp',
          reporter_name: 'Marin',
          description: 'Road obstruction',
          status: 'pending',
          location_address: 'Barangay Bagasbas, Daet',
          created_at: '2026-07-20T00:00:00.000Z',
          is_multi_agency: false,
          assigned_station_id: undefined,
        },
      ],
      total: 1,
      totalPages: 1,
    });
    mockApi.onIncidentUpdated.mockReturnValue(() => undefined);
  });

  it('uses direct operations language and accessible filter labels', async () => {
    render(<MemoryRouter><Incidents /></MemoryRouter>);

    expect(await screen.findByText('Operations register')).toBeTruthy();
    expect(screen.getByText('Search, filter, and review all incident reports in your current scope.')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Filter incidents by agency' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Filter incidents by status' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Filter incidents by municipality' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Filter incidents by barangay' })).toBeTruthy();
  });

  it('offers a clear filters action when a filter is active', async () => {
    render(<MemoryRouter><Incidents /></MemoryRouter>);

    await screen.findByText('Road obstruction');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter incidents by status' }), { target: { value: 'pending' } });

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('separates the pending agency decision from AI advice', async () => {
    mockApi.getIncidents.mockResolvedValue({
      data: [{
        id: 'incident-2',
        short_code: 'FIRE',
        agency_type: 'unknown',
        reporter_name: 'Marin',
        description: 'Visible structure fire',
        status: 'pending',
        location_address: 'Daet',
        created_at: '2026-07-22T00:00:00.000Z',
        recommended_agency_type: 'BFP',
        triage_severity: 4,
        triage_urgency: 'U2',
      }],
      total: 1,
      totalPages: 1,
    });

    render(<MemoryRouter><Incidents /></MemoryRouter>);

    expect((await screen.findAllByText('Agency not assigned')).length).toBeGreaterThan(0);
    expect(screen.getByText('AI recommends BFP')).toBeTruthy();
    expect(screen.getByText('Severity 4 · U2')).toBeTruthy();
  });
});
