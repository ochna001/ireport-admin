import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const hasPendingAssignmentConflict = (input: {
  status: string;
  stationId?: number | null;
  officerIds?: string[];
  resourceIds?: number[];
}) => input.status === 'pending' && Boolean(
  input.stationId || input.officerIds?.length || input.resourceIds?.length,
);

describe('incident status and assignment consistency', () => {
  it('rejects every operational assignment while the status is pending', () => {
    expect(hasPendingAssignmentConflict({ status: 'pending', stationId: 5 })).toBe(true);
    expect(hasPendingAssignmentConflict({ status: 'pending', officerIds: ['officer-1'] })).toBe(true);
    expect(hasPendingAssignmentConflict({ status: 'pending', resourceIds: [12] })).toBe(true);
    expect(hasPendingAssignmentConflict({ status: 'pending' })).toBe(false);
    expect(hasPendingAssignmentConflict({ status: 'assigned', stationId: 5 })).toBe(false);
  });

  it('guards the backend before changing personnel or resource availability', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../main/index.ts'), 'utf-8');
    const handlerStart = source.indexOf("ipcMain.handle('db:updateIncidentStatus'");
    const conflictGuard = source.indexOf('status_assignment_conflict:', handlerStart);
    const profileAvailabilityUpdate = source.indexOf("from('profiles').update({ status: 'available' })", handlerStart);
    const resourceAvailabilityUpdate = source.indexOf("from('agency_resources').update({ status: 'available'", handlerStart);

    expect(conflictGuard).toBeGreaterThan(handlerStart);
    expect(conflictGuard).toBeLessThan(profileAvailabilityUpdate);
    expect(conflictGuard).toBeLessThan(resourceAvailabilityUpdate);
  });

  it('surfaces the conflict and a direct repair action in the overview', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../renderer/pages/IncidentDetail.tsx'), 'utf-8');

    expect(source).toContain('Status does not match the response assignment');
    expect(source).toContain('Set status to Assigned');
    expect(source).toContain("if (nextStationId !== null && newStatus === 'pending')");
  });
});
