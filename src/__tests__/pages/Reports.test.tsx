import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Reports from '../../renderer/pages/Reports';
import { mockApi } from '../setup';

vi.mock('../../renderer/utils/sessionScope', () => ({
  getSessionScope: () => ({ role: 'Admin' }),
  isStationScoped: () => false,
}));

describe('Reports analytics workspace', () => {
  beforeEach(() => {
    mockApi.getStats.mockResolvedValue({
      total: 5,
      pending: 2,
      responding: 1,
      resolved: 2,
      active: 3,
      unassigned: 1,
      overdue: 1,
      awaitingDispatchDecision: 1,
      byAgency: [
        { agency_type: 'pnp', count: 3 },
        { agency_type: 'bfp', count: 2 },
      ],
      byStatus: [
        { status: 'pending', count: 2 },
        { status: 'assigned', count: 1 },
        { status: 'resolved', count: 2 },
      ],
      dailyTrend: [{ date: '2026-07-24', count: 5 }],
      trendGranularity: 'day',
      avgResponseTime: 14,
      responseSampleSize: 3,
      avgResolutionTime: 60,
      resolutionSampleSize: 2,
      mostActiveArea: null,
      recentActivity: [],
    });
  });

  it('shows operational KPIs and makes them actionable', async () => {
    render(<MemoryRouter><Reports /></MemoryRouter>);

    expect(await screen.findByText('Incidents in scope')).toBeInTheDocument();
    expect(screen.getByText('Awaiting assignment')).toBeInTheDocument();
    expect(screen.getByText('Overdue first response')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PNP 3/i })).toBeInTheDocument();
  });

  it('opens the export builder from the current analytics scope', async () => {
    render(<MemoryRouter><Reports /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Create export' }));
    expect(screen.getByText('Custom Report Builder')).toBeInTheDocument();
    expect(screen.getByText(/Export scope starts from the visible analytics filters/)).toBeInTheDocument();
  });
});
