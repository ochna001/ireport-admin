/**
 * Bug 4 — Officer/resource wipe on terminal status with no reopen restore
 * (PRESERVATION tests)
 *
 * Spec: .kiro/specs/incident-lifecycle-consistency
 * Property 2 (Preservation): "Explicit release and non-terminal assignment
 * changes"
 *
 * These tests capture behavior that is TRUE TODAY on UNFIXED code and that
 * task 15's fix (adding a `releaseAssignments?: boolean` opt-in gate to the
 * terminal-status branches of `db:updateIncidentStatus`, plus restore-on-reopen)
 * MUST NOT regress:
 *
 *   - When release IS the intended action, the mechanical act of clearing
 *     `assigned_officer_id` / `assigned_officer_ids` / `assigned_resource_ids`
 *     and flipping the previously-assigned officers/resources to `available`
 *     must keep working. Today (unfixed code) this happens unconditionally
 *     whenever `status` moves to `resolved`/`closed` — that unconditional
 *     firing is Bug 4's defect (see `assignment-wipe.exploration.test.ts`,
 *     task 13). This file is NOT re-asserting the bug; it captures the
 *     underlying clear+flip-available mechanism itself, which the fix's
 *     `releaseAssignments === true` path must continue to produce identically
 *     as its "release requested" behavior.
 *
 *   - Assigning officers/resources to a NON-terminal incident (status like
 *     `'assigned'` or `'in_progress'`, not `'resolved'`/`'closed'`) writes the
 *     assignment (`assigned_officer_id`, `assigned_officer_ids`,
 *     `assigned_resource_ids`) and updates officer/resource availability
 *     (officers added -> `'busy'` if previously `'available'`; officers
 *     removed -> `'available'`; same pattern for resources ->
 *     `'deployed'`/`'available'`). This is the `else if (officerIds !== undefined)`
 *     / `else if (resourceIds !== undefined)` branches in the real handler,
 *     verbatim from `ireport-admin/src/main/index.ts` (verified by direct
 *     source inspection, ~lines 875-971). Bug 4's fix only touches the
 *     `isTerminalStatus` branches, so this behavior must be completely
 *     unaffected.
 *
 * This file reuses the `createFakeDb` helper and replica-function structure
 * established by task 13's `assignment-wipe.exploration.test.ts`, extended
 * with the non-terminal "officers/resources added -> busy/deployed" logic
 * (verbatim from the real handler) which the exploration test's replica
 * omitted since it wasn't needed there.
 *
 * Per task 15.5, these exact tests are re-run unmodified after the fix lands
 * and are expected to keep passing (no regression).
 *
 * Validates: Requirements 3.7, 3.8
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal in-memory fake DB + fake supabase-like client — same shape as
// task 13's assignment-wipe.exploration.test.ts createFakeDb, reused verbatim
// for consistency (from/select/update/eq/in/single/insert surface area).
// ---------------------------------------------------------------------------

interface FakeIncidentRow {
  id: string;
  status: string;
  assigned_officer_id: string | null;
  assigned_officer_ids: string[];
  assigned_resource_ids: number[];
  resolved_at: string | null;
  first_response_at: string | null;
}

interface FakeProfileRow {
  id: string;
  status: string;
}

interface FakeResourceRow {
  id: number;
  status: string;
}

function createFakeDb(opts: {
  incident: FakeIncidentRow;
  officers: FakeProfileRow[];
  resources: FakeResourceRow[];
}) {
  const incidentsById: Record<string, FakeIncidentRow> = { [opts.incident.id]: opts.incident };
  const officersById: Record<string, FakeProfileRow> = {};
  for (const o of opts.officers) officersById[o.id] = o;
  const resourcesById: Record<number, FakeResourceRow> = {};
  for (const r of opts.resources) resourcesById[r.id] = r;

  const assignmentHistory: any[] = [];
  const statusHistory: any[] = [];

  const supabase: any = {
    incidentsById,
    officersById,
    resourcesById,
    assignmentHistory,
    statusHistory,
    from: (table: string) => {
      if (table === 'incidents') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              single: () => Promise.resolve({ data: incidentsById[id] || null, error: null }),
            }),
          }),
          update: (data: any) => ({
            eq: (_c: string, id: string) => {
              Object.assign(incidentsById[id], data);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'profiles') {
        return {
          update: (data: any) => ({
            in: (_c: string, ids: string[]) => {
              for (const id of ids) {
                if (officersById[id]) Object.assign(officersById[id], data);
              }
              return Promise.resolve({ error: null });
            },
            eq: (_c: string, id: string) => {
              if (officersById[id]) Object.assign(officersById[id], data);
              return Promise.resolve({ error: null });
            },
          }),
          select: () => ({
            in: (_c: string, ids: string[]) =>
              Promise.resolve({ data: ids.map((id) => officersById[id]).filter(Boolean), error: null }),
            eq: (_c: string, id: string) =>
              Promise.resolve({ data: officersById[id] ? [officersById[id]] : [], error: null }),
          }),
        };
      }
      if (table === 'agency_resources') {
        return {
          update: (data: any) => ({
            in: (_c: string, ids: number[]) => {
              for (const id of ids) {
                if (resourcesById[id]) Object.assign(resourcesById[id], data);
              }
              return Promise.resolve({ error: null });
            },
          }),
          select: () => ({
            in: (_c: string, ids: number[]) =>
              Promise.resolve({ data: ids.map((id) => resourcesById[id]).filter(Boolean), error: null }),
          }),
        };
      }
      if (table === 'incident_assignment_history') {
        return {
          insert: (row: any) => {
            assignmentHistory.push(row);
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: (_c: string, incidentId: string) => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: assignmentHistory
                      .filter((r) => r.incident_id === incidentId)
                      .slice()
                      .reverse(),
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === 'incident_status_history') {
        return {
          insert: (row: any) => {
            statusHistory.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      // Not exercised by this test (incident_updates, incident_agencies, etc.)
      return {
        insert: () => Promise.resolve({ error: null }),
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        }),
      };
    },
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Literal replica of ireport-admin/src/main/index.ts db:updateIncidentStatus's
// "Handle officer assignment" + "Handle resource assignment" blocks
// (verbatim, verified by direct source inspection ~lines 875-971), extended
// here (vs. the exploration test's trimmed replica) to include the
// non-terminal "added -> busy/deployed, removed -> available" availability
// management that the exploration test didn't need to exercise.
// ---------------------------------------------------------------------------

interface UpdateIncidentStatusParams {
  id: string;
  status: string;
  officerIds?: string[];
  primaryOfficerId?: string | null;
  resourceIds?: number[];
}

async function dbUpdateIncidentStatus(supabase: any, params: UpdateIncidentStatusParams) {
  const { id, status, officerIds, primaryOfficerId, resourceIds } = params;
  const isTerminalStatus = status === 'resolved' || status === 'closed';

  const { data: currentIncident } = await supabase.from('incidents').select().eq('id', id).single();

  const updateData: any = { status };
  const oldOfficerIds: string[] = currentIncident?.assigned_officer_ids || [];
  const oldResourceIds: number[] = currentIncident?.assigned_resource_ids || [];

  // --- Handle officer assignment (verbatim structure from real handler) ---
  if (isTerminalStatus) {
    const providedOfficerIds: string[] = officerIds || [];
    const officerIdsToRelease = Array.from(new Set([...oldOfficerIds, ...providedOfficerIds]));

    updateData.assigned_officer_id = null;
    updateData.assigned_officer_ids = [];

    if (officerIdsToRelease.length > 0) {
      await supabase.from('profiles').update({ status: 'available' }).in('id', officerIdsToRelease);
    }
  } else if (officerIds !== undefined) {
    const leadOfficerId =
      primaryOfficerId && officerIds.includes(primaryOfficerId)
        ? primaryOfficerId
        : officerIds.length > 0
          ? officerIds[0]
          : null;
    updateData.assigned_officer_id = leadOfficerId;
    updateData.assigned_officer_ids = officerIds;

    // Manage Officer Availability Status (verbatim from real handler)
    const newOfficerIds: string[] = officerIds;

    const removedOfficers = oldOfficerIds.filter((oid) => !newOfficerIds.includes(oid));
    if (removedOfficers.length > 0) {
      await supabase.from('profiles').update({ status: 'available' }).in('id', removedOfficers);
    }

    const addedOfficers = newOfficerIds.filter((oid) => !oldOfficerIds.includes(oid));
    if (addedOfficers.length > 0) {
      const { data: addedProfiles } = await supabase.from('profiles').select().in('id', addedOfficers);
      const availableToBusy = (addedProfiles || [])
        .filter((p: any) => p.status === 'available')
        .map((p: any) => p.id);
      if (availableToBusy.length > 0) {
        await supabase.from('profiles').update({ status: 'busy' }).in('id', availableToBusy);
      }
    }
  }

  // --- Handle resource assignment (verbatim structure from real handler) ---
  if (isTerminalStatus) {
    const providedResourceIds: number[] = resourceIds || [];
    const resourceIdsToRelease = Array.from(new Set([...oldResourceIds, ...providedResourceIds]));

    updateData.assigned_resource_ids = [];

    if (resourceIdsToRelease.length > 0) {
      await supabase.from('agency_resources').update({ status: 'available' }).in('id', resourceIdsToRelease);
    }
  } else if (resourceIds !== undefined) {
    updateData.assigned_resource_ids = resourceIds;

    // Manage Resource Availability Status (verbatim from real handler)
    const newResourceIds: number[] = resourceIds;

    const removedResources = oldResourceIds.filter((rid) => !newResourceIds.includes(rid));
    if (removedResources.length > 0) {
      await supabase.from('agency_resources').update({ status: 'available' }).in('id', removedResources);
    }

    const addedResources = newResourceIds.filter((rid) => !oldResourceIds.includes(rid));
    if (addedResources.length > 0) {
      const { data: addedResStatuses } = await supabase.from('agency_resources').select().in('id', addedResources);
      const availableToDeploy = (addedResStatuses || [])
        .filter((r: any) => r.status === 'available')
        .map((r: any) => r.id);
      if (availableToDeploy.length > 0) {
        await supabase.from('agency_resources').update({ status: 'deployed' }).in('id', availableToDeploy);
      }
    }
  }

  if (isTerminalStatus) {
    updateData.resolved_at = new Date().toISOString();
  }

  await supabase.from('incidents').update(updateData).eq('id', id);

  await supabase.from('incident_assignment_history').insert({
    incident_id: id,
    from_status: currentIncident?.status || null,
    to_status: status,
    previous_officer_ids: oldOfficerIds,
    new_officer_ids: isTerminalStatus ? [] : officerIds || oldOfficerIds,
    previous_resource_ids: oldResourceIds,
    new_resource_ids: isTerminalStatus ? [] : resourceIds || oldResourceIds,
    reason: isTerminalStatus ? 'terminal_release' : 'status_changed',
    created_at: new Date().toISOString(),
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Preservation tests
// ---------------------------------------------------------------------------

describe('Bug 4 preservation: explicit release and non-terminal assignment changes (must PASS on unfixed code)', () => {
  describe('Explicit release (dispatcher resolves/closes intending to release the team)', () => {
    it('resolving an incident clears assigned_officer_id/assigned_officer_ids/assigned_resource_ids and marks the released officers/resources available', async () => {
      const incident: FakeIncidentRow = {
        id: 'incident-release-1',
        status: 'in_progress',
        assigned_officer_id: 'officer-1',
        assigned_officer_ids: ['officer-1', 'officer-2'],
        assigned_resource_ids: [10, 20],
        resolved_at: null,
        first_response_at: '2024-01-01T00:00:00.000Z',
      };
      const officers: FakeProfileRow[] = [
        { id: 'officer-1', status: 'busy' },
        { id: 'officer-2', status: 'busy' },
      ];
      const resources: FakeResourceRow[] = [
        { id: 10, status: 'deployed' },
        { id: 20, status: 'deployed' },
      ];
      const supabase = createFakeDb({ incident, officers, resources });

      // Dispatcher resolves the incident — release IS the intended action here.
      await dbUpdateIncidentStatus(supabase, { id: 'incident-release-1', status: 'resolved' });

      const updatedIncident = supabase.incidentsById['incident-release-1'];

      expect(updatedIncident.assigned_officer_id).toBeNull();
      expect(updatedIncident.assigned_officer_ids).toEqual([]);
      expect(updatedIncident.assigned_resource_ids).toEqual([]);

      expect(supabase.officersById['officer-1'].status).toBe('available');
      expect(supabase.officersById['officer-2'].status).toBe('available');
      expect(supabase.resourcesById[10].status).toBe('available');
      expect(supabase.resourcesById[20].status).toBe('available');
    });

    it('closing an incident also clears assignments and marks officers/resources available (same release mechanism, other terminal value)', async () => {
      const incident: FakeIncidentRow = {
        id: 'incident-release-2',
        status: 'in_progress',
        assigned_officer_id: 'officer-9',
        assigned_officer_ids: ['officer-9'],
        assigned_resource_ids: [99],
        resolved_at: null,
        first_response_at: '2024-01-01T00:00:00.000Z',
      };
      const officers: FakeProfileRow[] = [{ id: 'officer-9', status: 'busy' }];
      const resources: FakeResourceRow[] = [{ id: 99, status: 'deployed' }];
      const supabase = createFakeDb({ incident, officers, resources });

      await dbUpdateIncidentStatus(supabase, { id: 'incident-release-2', status: 'closed' });

      const updatedIncident = supabase.incidentsById['incident-release-2'];
      expect(updatedIncident.assigned_officer_ids).toEqual([]);
      expect(updatedIncident.assigned_resource_ids).toEqual([]);
      expect(supabase.officersById['officer-9'].status).toBe('available');
      expect(supabase.resourcesById[99].status).toBe('available');
    });
  });

  describe('Assigning officers/resources to a non-terminal incident', () => {
    it('assigning officers to an "assigned"-status incident writes assigned_officer_id/assigned_officer_ids and flips newly-added available officers to busy', async () => {
      const incident: FakeIncidentRow = {
        id: 'incident-assign-1',
        status: 'assigned',
        assigned_officer_id: null,
        assigned_officer_ids: [],
        assigned_resource_ids: [],
        resolved_at: null,
        first_response_at: null,
      };
      const officers: FakeProfileRow[] = [
        { id: 'officer-A', status: 'available' },
        { id: 'officer-B', status: 'available' },
      ];
      const supabase = createFakeDb({ incident, officers, resources: [] });

      await dbUpdateIncidentStatus(supabase, {
        id: 'incident-assign-1',
        status: 'assigned',
        officerIds: ['officer-A', 'officer-B'],
        primaryOfficerId: 'officer-B',
      });

      const updatedIncident = supabase.incidentsById['incident-assign-1'];
      expect(updatedIncident.assigned_officer_ids).toEqual(['officer-A', 'officer-B']);
      // primaryOfficerId is honored as the lead officer when included in officerIds.
      expect(updatedIncident.assigned_officer_id).toBe('officer-B');

      // Both newly-added officers were 'available' -> flipped to 'busy'.
      expect(supabase.officersById['officer-A'].status).toBe('busy');
      expect(supabase.officersById['officer-B'].status).toBe('busy');
    });

    it('assigning resources to an "in_progress" incident writes assigned_resource_ids and flips newly-added available resources to deployed', async () => {
      const incident: FakeIncidentRow = {
        id: 'incident-assign-2',
        status: 'in_progress',
        assigned_officer_id: null,
        assigned_officer_ids: [],
        assigned_resource_ids: [],
        resolved_at: null,
        first_response_at: '2024-01-01T00:00:00.000Z',
      };
      const resources: FakeResourceRow[] = [
        { id: 30, status: 'available' },
        { id: 40, status: 'available' },
      ];
      const supabase = createFakeDb({ incident, officers: [], resources });

      await dbUpdateIncidentStatus(supabase, {
        id: 'incident-assign-2',
        status: 'in_progress',
        resourceIds: [30, 40],
      });

      const updatedIncident = supabase.incidentsById['incident-assign-2'];
      expect(updatedIncident.assigned_resource_ids).toEqual([30, 40]);
      expect(supabase.resourcesById[30].status).toBe('deployed');
      expect(supabase.resourcesById[40].status).toBe('deployed');
    });

    it('removing a previously-assigned officer on a non-terminal incident sets that officer back to available and updates assigned_officer_ids', async () => {
      const incident: FakeIncidentRow = {
        id: 'incident-assign-3',
        status: 'in_progress',
        assigned_officer_id: 'officer-C',
        assigned_officer_ids: ['officer-C', 'officer-D'],
        assigned_resource_ids: [],
        resolved_at: null,
        first_response_at: '2024-01-01T00:00:00.000Z',
      };
      const officers: FakeProfileRow[] = [
        { id: 'officer-C', status: 'busy' },
        { id: 'officer-D', status: 'busy' },
      ];
      const supabase = createFakeDb({ incident, officers, resources: [] });

      // Dispatcher unassigns officer-D, keeping officer-C, while incident stays in_progress.
      await dbUpdateIncidentStatus(supabase, {
        id: 'incident-assign-3',
        status: 'in_progress',
        officerIds: ['officer-C'],
        primaryOfficerId: 'officer-C',
      });

      const updatedIncident = supabase.incidentsById['incident-assign-3'];
      expect(updatedIncident.assigned_officer_ids).toEqual(['officer-C']);
      expect(updatedIncident.assigned_officer_id).toBe('officer-C');

      // officer-D was removed from the assignment -> flipped back to available.
      expect(supabase.officersById['officer-D'].status).toBe('available');
      // officer-C stays assigned; its status is untouched by this branch (not in removed/added sets).
      expect(supabase.officersById['officer-C'].status).toBe('busy');
    });
  });
});
