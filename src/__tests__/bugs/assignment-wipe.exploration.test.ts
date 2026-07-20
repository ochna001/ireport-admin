/**
 * Bug 4 — Officer/resource wipe on terminal status with no reopen restore
 * (bug condition exploration test)
 *
 * Spec: .kiro/specs/incident-lifecycle-consistency
 * Property 1 (Bug Condition): "Unconditional assignment clearing on
 * resolve/close, no restore on reopen"
 *
 * Bug condition (from design.md):
 *   isBugCondition(input) == input.newStatus IN ['resolved', 'closed']
 *                            AND input.explicitReleaseRequested == false
 *                            AND (input.currentOfficerIds.length > 0
 *                                 OR input.currentResourceIds.length > 0)
 *
 * ORIGINAL (unfixed) behavior confirmed by direct inspection of
 * ireport-admin/src/main/index.ts at the time this test was first written
 * (task 13):
 *
 *   - `db:updateIncidentStatus`'s `isTerminalStatus` branches unconditionally
 *     cleared `assigned_officer_id`/`assigned_officer_ids`/`assigned_resource_ids`
 *     and flipped officers/resources to `'available'` whenever `status` was
 *     `'resolved'` or `'closed'`, with no parameter letting the caller express
 *     "resolve WITHOUT releasing the team."
 *   - `incidents:reopen` flipped `status` back to `'in_progress'` but never
 *     read back prior assignments from `incident_assignment_history` and never
 *     restored `assigned_officer_id`/`assigned_officer_ids`/`assigned_resource_ids`,
 *     returning only `{ success: true }` with no restore-prompt data.
 *
 * UPDATE (task 15.4): tasks 15.1-15.3 have since fixed both handlers in
 * ireport-admin/src/main/index.ts (verified by direct source inspection of the
 * handlers as they exist now):
 *
 *   - `db:updateIncidentStatus` now takes a `releaseAssignments?: boolean`
 *     param. The officer/resource-clearing branches only run when
 *     `isTerminalStatus && releaseAssignments === true`; when terminal but not
 *     releasing, there's a dedicated no-op `else if (isTerminalStatus)` branch
 *     that leaves `updateData` (and therefore the existing row) untouched.
 *     The assignment-history write's `new_officer_ids`/`new_resource_ids` are
 *     now derived from `updateData.assigned_officer_ids`/
 *     `updateData.assigned_resource_ids` (what was actually written) instead
 *     of being unconditionally forced to `[]` whenever `isTerminalStatus`.
 *   - `incidents:reopen` now queries the most recent
 *     `incident_assignment_history` row with `to_status IN ('resolved',
 *     'closed')`, checks current availability of `previous_officer_ids`/
 *     `previous_resource_ids` via `profiles`/`agency_resources` status, and
 *     auto-restores whichever are still `'available'` (writing them back onto
 *     the incident and flipping their status to `'busy'`/`'deployed'`). It
 *     returns `{ success, restoredOfficerIds, restoredResourceIds,
 *     unavailableOfficerIds, unavailableResourceIds }` instead of just
 *     `{ success: true }`.
 *
 * Per task 15.4's instructions, this SAME test is re-run — only the two
 * replica functions below have been updated to be literal replications of the
 * NEW production logic, so they continue to mirror real production code
 * rather than the removed old implementation. Assertions that specifically
 * asserted the OLD buggy behavior have been flipped to assert the NEW fixed
 * behavior instead. This follows the same convention established by Bug 1's
 * `station-assignment.exploration.test.ts` (in `ireport_v1`, task 3.5) and
 * this workspace's own `status-vocabulary.exploration.test.ts`.
 *
 * DO NOT fix the implementation here — this test only demonstrates the (now
 * fixed) behavior.
 *
 * Validates: Requirements 1.10, 1.11, 2.10, 2.11
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal in-memory fake DB + fake supabase-like client, just enough surface
// area to drive the two replicated handlers below (from/select/update/eq/in/
// single/insert).
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
// "Handle officer assignment" + "Handle resource assignment" blocks AS THEY
// NOW EXIST (post task 15.1/15.2), scoped to only the parts relevant to the
// wipe-on-terminal-status bug condition. The handler now takes a
// `releaseAssignments?: boolean` param: the clearing branches only run when
// `isTerminalStatus && releaseAssignments === true`; otherwise a no-op
// `else if (isTerminalStatus)` branch leaves assignment fields untouched.
// The assignment-history write's new_officer_ids/new_resource_ids are now
// derived from updateData (what was actually written) rather than forced to
// `[]` whenever terminal.
// ---------------------------------------------------------------------------

interface UpdateIncidentStatusParams {
  id: string;
  status: string;
  officerIds?: string[];
  primaryOfficerId?: string | null;
  resourceIds?: number[];
  releaseAssignments?: boolean;
}

async function dbUpdateIncidentStatus(supabase: any, params: UpdateIncidentStatusParams) {
  const { id, status, officerIds, primaryOfficerId, resourceIds, releaseAssignments } = params;
  const isTerminalStatus = status === 'resolved' || status === 'closed';

  const { data: currentIncident } = await supabase.from('incidents').select().eq('id', id).single();

  const updateData: any = { status };
  const oldOfficerIds: string[] = currentIncident?.assigned_officer_ids || [];
  const oldResourceIds: number[] = currentIncident?.assigned_resource_ids || [];

  // --- Handle officer assignment (verbatim structure from real handler, now
  // gated on releaseAssignments) ---
  if (isTerminalStatus && releaseAssignments === true) {
    const providedOfficerIds: string[] = officerIds || [];
    const officerIdsToRelease = Array.from(new Set([...oldOfficerIds, ...providedOfficerIds]));

    updateData.assigned_officer_id = null;
    updateData.assigned_officer_ids = [];

    if (officerIdsToRelease.length > 0) {
      await supabase.from('profiles').update({ status: 'available' }).in('id', officerIdsToRelease);
    }
  } else if (isTerminalStatus) {
    // Terminal status but release was not explicitly requested — leave
    // assignments untouched (Bug 4 fix). No-op: updateData is left without
    // assignment fields so the existing row values are preserved.
  } else if (officerIds !== undefined) {
    const leadOfficerId =
      primaryOfficerId && officerIds.includes(primaryOfficerId)
        ? primaryOfficerId
        : officerIds.length > 0
          ? officerIds[0]
          : null;
    updateData.assigned_officer_id = leadOfficerId;
    updateData.assigned_officer_ids = officerIds;
  }

  // --- Handle resource assignment (verbatim structure from real handler, now
  // gated on releaseAssignments) ---
  if (isTerminalStatus && releaseAssignments === true) {
    const providedResourceIds: number[] = resourceIds || [];
    const resourceIdsToRelease = Array.from(new Set([...oldResourceIds, ...providedResourceIds]));

    updateData.assigned_resource_ids = [];

    if (resourceIdsToRelease.length > 0) {
      await supabase.from('agency_resources').update({ status: 'available' }).in('id', resourceIdsToRelease);
    }
  } else if (isTerminalStatus) {
    // Terminal status but release was not explicitly requested — leave
    // assignments untouched (Bug 4 fix). No-op.
  } else if (resourceIds !== undefined) {
    updateData.assigned_resource_ids = resourceIds;
  }

  if (isTerminalStatus) {
    updateData.resolved_at = new Date().toISOString();
  }

  await supabase.from('incidents').update(updateData).eq('id', id);

  // Assignment history write — new_officer_ids/new_resource_ids now derive
  // from updateData (what was actually written to the incidents row) instead
  // of being unconditionally forced to [] whenever isTerminalStatus (Bug 4 fix).
  const newOfficerIds: string[] =
    updateData.assigned_officer_ids !== undefined ? updateData.assigned_officer_ids : oldOfficerIds;
  const newResourceIds: number[] =
    updateData.assigned_resource_ids !== undefined ? updateData.assigned_resource_ids : oldResourceIds;

  await supabase.from('incident_assignment_history').insert({
    incident_id: id,
    from_status: currentIncident?.status || null,
    to_status: status,
    previous_officer_ids: oldOfficerIds,
    new_officer_ids: newOfficerIds,
    previous_resource_ids: oldResourceIds,
    new_resource_ids: newResourceIds,
    reason: isTerminalStatus && releaseAssignments === true ? 'terminal_release' : 'status_changed',
    created_at: new Date().toISOString(),
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Literal replica of ireport-admin/src/main/index.ts incidents:reopen AS IT
// NOW EXISTS (post task 15.3). It now queries the most recent
// incident_assignment_history row with to_status IN ('resolved','closed'),
// checks current availability of previous_officer_ids/previous_resource_ids
// via profiles/agency_resources status, auto-restores whichever are still
// 'available' (writing them back onto the incident and flipping their status
// to 'busy'/'deployed'), and returns
// { success, restoredOfficerIds, restoredResourceIds, unavailableOfficerIds,
// unavailableResourceIds } instead of just { success: true }.
// ---------------------------------------------------------------------------

async function incidentsReopen(supabase: any, params: { id: string }) {
  const { id } = params;
  const now = new Date().toISOString();

  const { data: incident } = await supabase.from('incidents').select().eq('id', id).single();
  const currentStatus = incident.status;
  if (currentStatus !== 'closed' && currentStatus !== 'resolved') {
    throw new Error(`Only closed or resolved incidents can be re-opened. Current status: ${currentStatus}`);
  }

  await supabase
    .from('incidents')
    .update({ status: 'in_progress', updated_at: now, resolved_at: null })
    .eq('id', id);

  await supabase.from('incident_status_history').insert({
    incident_id: id,
    status: 'in_progress',
    created_at: now,
  });

  // Attempt to restore the prior officer/resource assignment (Bug 4 fix).
  // Find the most recent assignment-history row that recorded the transition
  // INTO the terminal status being reopened from — its
  // previous_officer_ids/previous_resource_ids hold what was assigned
  // immediately before the terminal release (the restore source).
  let restoredOfficerIds: string[] = [];
  let restoredResourceIds: number[] = [];
  let unavailableOfficerIds: string[] = [];
  let unavailableResourceIds: number[] = [];

  const { data: history } = await supabase
    .from('incident_assignment_history')
    .select()
    .eq('incident_id', id)
    .order()
    .limit();

  const lastTerminalHistory = (history || []).find((r: any) =>
    r.to_status === 'resolved' || r.to_status === 'closed'
  );

  const priorOfficerIds: string[] = lastTerminalHistory?.previous_officer_ids || [];
  const priorResourceIds: number[] = lastTerminalHistory?.previous_resource_ids || [];

  if (priorOfficerIds.length > 0 || priorResourceIds.length > 0) {
    // Check current availability of the previously-assigned officers/resources.
    const officersResult =
      priorOfficerIds.length > 0
        ? await supabase.from('profiles').select().in('id', priorOfficerIds)
        : { data: [] };
    const resourcesResult =
      priorResourceIds.length > 0
        ? await supabase.from('agency_resources').select().in('id', priorResourceIds)
        : { data: [] };

    const officerStatusMap = new Map((officersResult.data || []).map((p: any) => [p.id, p.status]));
    const resourceStatusMap = new Map((resourcesResult.data || []).map((r: any) => [r.id, r.status]));

    restoredOfficerIds = priorOfficerIds.filter((oid) => officerStatusMap.get(oid) === 'available');
    unavailableOfficerIds = priorOfficerIds.filter((oid) => officerStatusMap.get(oid) !== 'available');

    restoredResourceIds = priorResourceIds.filter((rid) => resourceStatusMap.get(rid) === 'available');
    unavailableResourceIds = priorResourceIds.filter((rid) => resourceStatusMap.get(rid) !== 'available');

    if (restoredOfficerIds.length > 0 || restoredResourceIds.length > 0) {
      const restoreUpdate: any = {};
      if (restoredOfficerIds.length > 0) {
        restoreUpdate.assigned_officer_id = restoredOfficerIds[0];
        restoreUpdate.assigned_officer_ids = restoredOfficerIds;
      }
      if (restoredResourceIds.length > 0) {
        restoreUpdate.assigned_resource_ids = restoredResourceIds;
      }

      await supabase.from('incidents').update(restoreUpdate).eq('id', id);

      if (restoredOfficerIds.length > 0) {
        await supabase.from('profiles').update({ status: 'busy' }).in('id', restoredOfficerIds);
      }
      if (restoredResourceIds.length > 0) {
        await supabase.from('agency_resources').update({ status: 'deployed' }).in('id', restoredResourceIds);
      }
    }
  }

  const hasUnavailable = unavailableOfficerIds.length > 0 || unavailableResourceIds.length > 0;

  await supabase.from('incident_assignment_history').insert({
    incident_id: id,
    from_status: currentStatus,
    to_status: 'in_progress',
    previous_officer_ids: [],
    new_officer_ids: restoredOfficerIds,
    previous_resource_ids: [],
    new_resource_ids: restoredResourceIds,
    reason: hasUnavailable
      ? 'reopened_partial_restore'
      : restoredOfficerIds.length > 0 || restoredResourceIds.length > 0
        ? 'reopened_restored'
        : 'reopened',
    created_at: now,
  });

  return {
    success: true,
    restoredOfficerIds,
    restoredResourceIds,
    unavailableOfficerIds,
    unavailableResourceIds,
  };
}

// ---------------------------------------------------------------------------
// Exploration tests
// ---------------------------------------------------------------------------

describe('Bug 4 exploration: officer/resource wipe on terminal status, no reopen restore', () => {
  it('EXPECTED (fixed) BEHAVIOR: resolving an incident with assigned officers/resources with NO releaseAssignments param should NOT wipe assigned_officer_id/assigned_officer_ids/assigned_resource_ids or touch officer/resource availability — now passes on fixed code', async () => {
    const incident: FakeIncidentRow = {
      id: 'incident-1',
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

    // Dispatcher resolves the incident. NO release-intent parameter is passed
    // (releaseAssignments is left undefined) — this is the "resolve WITHOUT
    // releasing the team" case Bug 4 fixed.
    await dbUpdateIncidentStatus(supabase, { id: 'incident-1', status: 'resolved' });

    const updatedIncident = supabase.incidentsById['incident-1'];

    // On the OLD unfixed code these assertions used to fail (assignments were
    // unconditionally wiped). Now: resolving with no release intent leaves
    // assigned_officer_id/assigned_officer_ids/assigned_resource_ids exactly
    // as they were before the status change.
    expect(updatedIncident.assigned_officer_id).toBe('officer-1');
    expect(updatedIncident.assigned_officer_ids).toEqual(['officer-1', 'officer-2']);
    expect(updatedIncident.assigned_resource_ids).toEqual([10, 20]);

    // The officers/resources that are still physically assigned are NOT
    // flipped to 'available' as a side effect of resolving, since release
    // was never explicitly requested.
    expect(supabase.officersById['officer-1'].status).toBe('busy');
    expect(supabase.officersById['officer-2'].status).toBe('busy');
    expect(supabase.resourcesById[10].status).toBe('deployed');
    expect(supabase.resourcesById[20].status).toBe('deployed');
  });

  it('EXPECTED (fixed) BEHAVIOR: resolving WITH releaseAssignments: true still clears assignments and marks officers/resources available (release path continues to work)', async () => {
    const incident: FakeIncidentRow = {
      id: 'incident-2',
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

    await dbUpdateIncidentStatus(supabase, { id: 'incident-2', status: 'closed', releaseAssignments: true });

    const updatedIncident = supabase.incidentsById['incident-2'];
    expect(updatedIncident.assigned_officer_ids).toEqual([]);
    expect(updatedIncident.assigned_resource_ids).toEqual([]);
    expect(supabase.officersById['officer-9'].status).toBe('available');
  });

  it('EXPECTED (fixed) BEHAVIOR: reopening an incident whose assignments WERE released (releaseAssignments: true) auto-restores officers/resources that are still available — now passes on fixed code', async () => {
    const incident: FakeIncidentRow = {
      id: 'incident-3',
      status: 'in_progress',
      assigned_officer_id: 'officer-5',
      assigned_officer_ids: ['officer-5'],
      assigned_resource_ids: [42],
      resolved_at: null,
      first_response_at: '2024-01-01T00:00:00.000Z',
    };
    const officers: FakeProfileRow[] = [{ id: 'officer-5', status: 'busy' }];
    const resources: FakeResourceRow[] = [{ id: 42, status: 'deployed' }];
    const supabase = createFakeDb({ incident, officers, resources });

    // 1) Resolve the incident WITH explicit release intent — clears
    // assignments and marks officer-5/resource-42 available, and records
    // previous_officer_ids/previous_resource_ids in the history row (the
    // restore source for reopen).
    await dbUpdateIncidentStatus(supabase, { id: 'incident-3', status: 'resolved', releaseAssignments: true });
    expect(supabase.incidentsById['incident-3'].assigned_officer_ids).toEqual([]);
    expect(supabase.incidentsById['incident-3'].assigned_resource_ids).toEqual([]);
    expect(supabase.officersById['officer-5'].status).toBe('available');
    expect(supabase.resourcesById[42].status).toBe('available');

    // 2) Dispatcher later reopens the incident. officer-5/resource-42 are
    // still 'available' (nothing else claimed them in the meantime), so they
    // SHOULD be auto-restored.
    const reopenResult: any = await incidentsReopen(supabase, { id: 'incident-3' });

    const reopenedIncident = supabase.incidentsById['incident-3'];

    // Status correctly flips back to a non-terminal value.
    expect(reopenedIncident.status).toBe('in_progress');

    // On the OLD unfixed code these assertions used to fail (assignments were
    // never restored). Now: the previously-assigned officer/resource are
    // restored onto the incident.
    expect(reopenedIncident.assigned_officer_ids).toEqual(['officer-5']);
    expect(reopenedIncident.assigned_resource_ids).toEqual([42]);

    // The restored officer/resource are flipped back to busy/deployed.
    expect(supabase.officersById['officer-5'].status).toBe('busy');
    expect(supabase.resourcesById[42].status).toBe('deployed');

    // The reopen result now reports what was restored (and nothing
    // unavailable, since both were still free).
    expect(reopenResult.success).toBe(true);
    expect(reopenResult.restoredOfficerIds).toEqual(['officer-5']);
    expect(reopenResult.restoredResourceIds).toEqual([42]);
    expect(reopenResult.unavailableOfficerIds).toEqual([]);
    expect(reopenResult.unavailableResourceIds).toEqual([]);
  });

  it('EXPECTED (fixed) BEHAVIOR: reopening an incident whose released officers/resources are no longer available reports them as unavailable instead of restoring them', async () => {
    const incident: FakeIncidentRow = {
      id: 'incident-4',
      status: 'in_progress',
      assigned_officer_id: 'officer-7',
      assigned_officer_ids: ['officer-7'],
      assigned_resource_ids: [77],
      resolved_at: null,
      first_response_at: '2024-01-01T00:00:00.000Z',
    };
    const officers: FakeProfileRow[] = [{ id: 'officer-7', status: 'busy' }];
    const resources: FakeResourceRow[] = [{ id: 77, status: 'deployed' }];
    const supabase = createFakeDb({ incident, officers, resources });

    // 1) Resolve with explicit release — officer-7/resource-77 become available.
    await dbUpdateIncidentStatus(supabase, { id: 'incident-4', status: 'resolved', releaseAssignments: true });
    expect(supabase.officersById['officer-7'].status).toBe('available');
    expect(supabase.resourcesById[77].status).toBe('available');

    // 2) Before the incident is reopened, officer-7 and resource-77 get
    // claimed by something else (e.g. dispatched to a different incident),
    // so they're no longer available.
    supabase.officersById['officer-7'].status = 'busy';
    supabase.resourcesById[77].status = 'deployed';

    // 3) Dispatcher reopens the incident. Since officer-7/resource-77 are no
    // longer available, they should NOT be silently restored — they should
    // be reported as unavailable instead.
    const reopenResult: any = await incidentsReopen(supabase, { id: 'incident-4' });

    const reopenedIncident = supabase.incidentsById['incident-4'];
    expect(reopenedIncident.status).toBe('in_progress');

    // Not restored onto the incident, since they're unavailable.
    expect(reopenedIncident.assigned_officer_ids).toEqual([]);
    expect(reopenedIncident.assigned_resource_ids).toEqual([]);

    // Reported back as unavailable rather than silently dropped.
    expect(reopenResult.restoredOfficerIds).toEqual([]);
    expect(reopenResult.restoredResourceIds).toEqual([]);
    expect(reopenResult.unavailableOfficerIds).toEqual(['officer-7']);
    expect(reopenResult.unavailableResourceIds).toEqual([77]);

    // Sanity: the restore source data still exists in assignment history —
    // proving the gap (when there was one) was a missing read/restore step,
    // not a total absence of historical data.
    const relevantHistory = supabase.assignmentHistory.filter((r: any) => r.incident_id === 'incident-4');
    const resolveHistoryRow = relevantHistory.find((r: any) => r.reason === 'terminal_release');
    expect(resolveHistoryRow?.previous_officer_ids).toEqual(['officer-7']);
    expect(resolveHistoryRow?.previous_resource_ids).toEqual([77]);
  });
});
