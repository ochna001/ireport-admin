import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Agencies from '../../renderer/pages/Agencies';
import { mockApi } from '../setup';

vi.mock('../../renderer/utils/sessionScope', () => ({
  getSessionScope: () => ({ role: 'Admin' }),
  isStationScoped: () => false,
}));

const agencies = [
  { id: 1, name: 'Philippine National Police', short_name: 'PNP' },
  { id: 2, name: 'Bureau of Fire Protection', short_name: 'BFP' },
  { id: 3, name: 'Municipal Disaster Risk Reduction and Management Office', short_name: 'MDRRMO' },
];

describe('Agency management workspace', () => {
  beforeEach(() => {
    mockApi.createAgency.mockResolvedValue({ id: 4, name: 'Philippine Coast Guard', short_name: 'PCG' });
    mockApi.updateAgency.mockResolvedValue({ success: true });
    mockApi.deleteAgency.mockResolvedValue({ success: true });
    mockApi.createStation.mockResolvedValue({ id: 2 });
    mockApi.updateStation.mockResolvedValue({ success: true });
    mockApi.createResource.mockResolvedValue({ id: 3 });
    mockApi.updateResource.mockResolvedValue({ success: true });
    mockApi.getAgencies.mockResolvedValue(agencies);
    mockApi.getAgencyStations.mockResolvedValue([
      {
        id: 1,
        agency_id: 1,
        name: 'Daet Municipal Police Station',
        latitude: 14.1,
        longitude: 122.9,
        contact_number: null,
        address: 'Daet, Camarines Norte',
      },
    ]);
    mockApi.getResources.mockResolvedValue([
      {
        id: 1,
        station_id: 1,
        name: 'Patrol Vehicle 1',
        type: 'vehicle',
        status: 'available',
        description: null,
      },
      {
        id: 2,
        station_id: 1,
        name: 'Patrol Vehicle 2',
        type: 'vehicle',
        status: 'deployed',
        description: null,
      },
    ]);
  });

  it('renders shared operations context and accessible tabs', async () => {
    render(<Agencies />);

    expect(await screen.findByText('Operations directory')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Agencies/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Stations/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Resources/ })).toBeTruthy();
    expect(screen.getByText('Philippine National Police')).toBeTruthy();
  });

  it('switches to stations and resources with labeled controls', async () => {
    render(<Agencies />);

    fireEvent.click(await screen.findByRole('tab', { name: /Stations/ }));
    expect(screen.getByRole('textbox', { name: 'Search stations' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Filter stations by agency' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Station' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Resources/ }));
    expect(screen.getByRole('textbox', { name: 'Search resources' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Filter resources by agency' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Resource' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit resource Patrol Vehicle 1' })).toBeTruthy();
  });

  it('connects an agency summary card to filtered station operations', async () => {
    render(<Agencies />);

    fireEvent.click(await screen.findByRole('button', { name: /Philippine National Police.*View stations/i }));

    expect(screen.getByText(/scope active/)).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Filter stations by agency' }) as HTMLSelectElement).value).toBe('1');
    expect(screen.getByRole('button', { name: 'Clear scope' })).toBeTruthy();
  });

  it('makes batch import unavailable until an agency is selected', async () => {
    render(<Agencies />);
    fireEvent.click(await screen.findByRole('tab', { name: /Resources/ }));

    const importInput = screen.getByLabelText('Batch Import') as HTMLInputElement;
    expect(importInput.disabled).toBe(true);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter resources by agency' }), { target: { value: '1' } });
    expect(importInput.disabled).toBe(false);
  });

  it('uses an in-app confirmation modal before deleting a resource', async () => {
    render(<Agencies />);
    fireEvent.click(await screen.findByRole('tab', { name: /Resources/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit resource Patrol Vehicle 1' }).nextElementSibling as HTMLElement);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Delete resource?')).toBeTruthy();
    expect(screen.getAllByText('Patrol Vehicle 1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(mockApi.deleteResource).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('groups resources by station by default and preserves the flat view', async () => {
    render(<Agencies />);
    fireEvent.click(await screen.findByRole('tab', { name: /Resources/ }));

    expect(screen.getByRole('button', { name: /Daet Municipal Police Station/ })).toBeTruthy();
    expect(screen.getByText('1 available')).toBeTruthy();
    expect(screen.getByText('1 deployed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All resources' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'All resources' }));
    expect(screen.getByRole('columnheader', { name: 'Resource' })).toBeTruthy();
    expect(screen.getByText('Patrol Vehicle 1')).toBeTruthy();
  });

  it('filters grouped resources by status', async () => {
    render(<Agencies />);
    fireEvent.click(await screen.findByRole('tab', { name: /Resources/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter resources by status' }), { target: { value: 'deployed' } });

    expect(screen.getByText('Patrol Vehicle 2')).toBeTruthy();
    expect(screen.queryByText('Patrol Vehicle 1')).toBeNull();
  });

  it('creates an agency from an accessible modal', async () => {
    render(<Agencies />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add Agency' }));
    const dialog = screen.getByRole('dialog', { name: 'Add Agency' });
    fireEvent.change(within(dialog).getByLabelText(/Agency name/), { target: { value: 'Philippine Coast Guard' } });
    fireEvent.change(within(dialog).getByLabelText(/Agency code/), { target: { value: 'pcg' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Agency' }));

    await waitFor(() => expect(mockApi.createAgency).toHaveBeenCalledWith({
      name: 'Philippine Coast Guard',
      short_name: 'PCG',
    }));
  });

  it('locks the dispatch code while editing an agency', async () => {
    render(<Agencies />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit agency Bureau of Fire Protection' }));
    const codeInput = within(screen.getByRole('dialog', { name: 'Edit Agency' })).getByLabelText(/Agency code/) as HTMLInputElement;

    expect(codeInput.readOnly).toBe(true);
    expect(screen.getByText(/dispatch and historical records depend on it/i)).toBeTruthy();
  });

  it('blocks deleting an agency that still owns stations', async () => {
    render(<Agencies />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete agency Philippine National Police' }));

    expect(screen.getByText(/Cannot delete PNP while it has 1 station/)).toBeTruthy();
    expect(mockApi.deleteAgency).not.toHaveBeenCalled();
  });

  it('blocks deleting a deployed resource before confirmation', async () => {
    render(<Agencies />);
    fireEvent.click(await screen.findByRole('tab', { name: /Resources/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete resource Patrol Vehicle 2' }));

    expect(screen.getByText(/Cannot delete Patrol Vehicle 2 while it is deployed/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockApi.deleteResource).not.toHaveBeenCalled();
  });
});
