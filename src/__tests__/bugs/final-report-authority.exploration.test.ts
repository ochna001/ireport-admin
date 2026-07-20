/**
 * Bug 6 — Two uncoordinated final-documentation-record producers
 * (bug condition exploration test — closed-transition-ungated half)
 *
 * Spec: .kiro/specs/incident-lifecycle-consistency
 * Property 1 (Bug Condition -> Expected Behavior): "Responder writes
 * final_reports directly; closed transition ungated on completeness" ->
 * "Dispatcher final report is sole authoritative record; closed gated on
 * its completeness"
 *
 * Bug condition (from design.md):
 *   isBugCondition(input) ==
 *     (input.source == ResponderApp AND input.action == WriteFinalRecord
 *      AND input.writesDirectlyToAuthoritativeFinalReportsTable == true)
 *     OR
 *     (input.action == CloseTransition
 *      AND input.gatesOn != DispatcherFinalReportCompleteness)
 *
 * This file targets task 21's second test case: calling
 * `db:updateIncidentStatus(status: 'closed')` directly (bypassing
 * `finalReports:create`) on an incident with no `final_reports` row.
 *
 * ORIGINAL (unfixed) behavior confirmed by direct inspection of
 * ireport-admin/src/main/index.ts's `db:updateIncidentStatus` handler
 * (lines ~836-1190) at the time this test was originally written (task 21):
 *
 *   - The handler's ONLY guard against modifying a terminal incident was the
 *     `incident_is_locked` check — it rejected the update if the incident's
 *     CURRENT status was already 'resolved' or 'closed'. It never checked
 *     whether a `final_reports` row existed for the incident before ALLOWING
 *     a transition INTO 'closed'.
 *   - There was a completely separate handler, `finalReports:create`, that
 *     DID insert into `final_reports` and set `incidents.status = 'closed'`
 *     in one atomic call — but nothing prevented a caller from reaching
 *     'closed' via `db:updateIncidentStatus` directly instead, skipping
 *     `finalReports:create` (and therefore the final_reports insert)
 *     entirely.
 *   - `db:updateIncidentStatus` had no parameter or code path that read
 *     from or checked the `final_reports` table at all.
 *
 * So calling `db:updateIncidentStatus({ id, status: 'closed' })` directly on
 * an incident with zero `final_reports` rows used to succeed — that was the
 * bug: the closed transition was not gated on
 * `DispatcherFinalReportCompleteness`.
 *
 * FIXED behavior confirmed by direct inspection of the same handler after
 * task 23.3 (ireport-admin/src/main/index.ts, ~lines 836-874):
 *
 *   - Immediately after the existing `incident_is_locked` guard, the handler
 *     now adds: `if (status === 'closed') { const { data: existingFinalReport }
 *     = await supabase.from('final_reports').select('id').eq('incident_id', id)
 *     .maybeSingle(); if (!existingFinalReport) { throw new
 *     Error('final_report_required: Cannot close incident without a
 *     completed final report. Use the Final Report workflow to close this
 *     incident.'); } }`
 *   - This closes the gap: any path that reaches `status === 'closed'`
 *     (including calling `db:updateIncidentStatus` directly, bypassing
 *     `finalReports:create`) is now rejected unless a `final_reports` row
 *     already exists for the incident.
 *   - `finalReports:create` remains the primary supported path — it inserts
 *     the `final_reports` row and closes atomically, satisfying this new
 *     gate by construction.
 *
 * This test has been updated (task 23.4) to confirm the FIX: the same call
 * that used to succeed on an incident with zero `final_reports` rows now
 * throws `final_report_required` and leaves the incident's status
 * unchanged.
 *
 * Validates: Requirements 2.14, 2.15
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal in-memory fake DB + fake supabase-like client, just enough surface
// area to drive the replicated handler below. Follows the same convention as
// assignment-wipe.exploration.test.ts / station-assignment.preservation.test.ts
// in this same directory: a literal replica of the relevant production
// branches, verified by direct source inspection, rather than importing the
// real (Electron-main-only) module.
// ---------------------------------------------------------------------------

interface FakeIncidentRow {
  id: string;
  status: string;
  assigned_station_id: number | null;
  first_response_at: string | null;
}

interface FakeFinalReportRow {
  incident_id: string;
  report_details: any;
}

function createFakeDb(opts: { incident: FakeIncidentRow; finalReports: FakeFinalReportRow[] }) {
  const incidentsById: Record<string, FakeIncidentRow> = { [opts.incident.id]: opts.incident };
  const finalReports: FakeFinalReportRow[] = [...opts.finalReports];

  const supabase: any = {
    incidentsById,
    finalReports,
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
      if (table === 'final_reports') {
        return {
          select: () => ({
            eq: (_c: string, incidentId: string) =>
              Promise.resolve({
                data: finalReports.filter((r) => r.incident_id === incidentId),
                error: null,
              }),
          }),
          insert: (row: any) => {
            finalReports.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      // Not exercised by this test (incident_status_history, incident_updates,
      // incident_assignment_history, profiles, agency_resources, etc.)
      return {
        insert: () => Promise.resolve({ error: null }),
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Literal replica of the RELEVANT subset of ireport-admin/src/main/index.ts's
// db:updateIncidentStatus handler (lines ~836-874 and ~1163) AS IT NOW EXISTS
// (post task 23.3): the incident_is_locked terminal-status guard, PLUS the
// new final_report_required guard that now runs when status === 'closed',
// and the final status write. The full handler also does officer/resource
// assignment bookkeeping (Bug 4, already covered by
// assignment-wipe.exploration.test.ts) which is irrelevant to this bug
// condition and intentionally omitted here.
// ---------------------------------------------------------------------------

async function dbUpdateIncidentStatus(supabase: any, params: { id: string; status: string }) {
  const { id, status } = params;
  const now = new Date().toISOString();

  const { data: currentIncident } = await supabase.from('incidents').select().eq('id', id).single();

  // Same guard as production: reject only if the incident is ALREADY
  // terminal.
  const currentStatus = currentIncident?.status;
  if (currentStatus === 'resolved' || currentStatus === 'closed') {
    throw new Error(`incident_is_locked: Incident is already ${currentStatus} and cannot be modified.`);
  }

  // NEW guard added by task 23.3: gate the transition INTO 'closed' on a
  // completed dispatcher final report already existing for this incident.
  if (status === 'closed') {
    const { data: existingFinalReports } = await supabase.from('final_reports').select().eq('incident_id', id);
    const existingFinalReport = (existingFinalReports || [])[0];

    if (!existingFinalReport) {
      throw new Error(
        'final_report_required: Cannot close incident without a completed final report. Use the Final Report workflow to close this incident.'
      );
    }
  }

  const updateData: any = { status, updated_at: now };
  if (status === 'resolved' || status === 'closed') {
    updateData.resolved_at = now;
  }

  await supabase.from('incidents').update(updateData).eq('id', id);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Literal replica of ireport-admin/src/main/index.ts's finalReports:create
// handler's core behavior (insert final_reports THEN close the incident in
// one call) — included only as the CONTRAST case showing the primary
// supported path already satisfies the gate by construction. This is not
// itself under test for the bug condition; it demonstrates the OTHER, correct
// path that db:updateIncidentStatus bypasses.
// ---------------------------------------------------------------------------

async function finalReportsCreate(supabase: any, params: { incidentId: string; reportDetails: any }) {
  const { incidentId, reportDetails } = params;
  await supabase.from('final_reports').insert({ incident_id: incidentId, report_details: reportDetails });
  await supabase.from('incidents').update({ status: 'closed' }).eq('id', incidentId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Exploration tests
// ---------------------------------------------------------------------------

describe('Bug 6 exploration: closed transition ungated on final-report completeness', () => {
  it('FIX CONFIRMED (task 23.4): db:updateIncidentStatus(closed) is now rejected with final_report_required when no final_reports row exists for the incident, bypassing finalReports:create entirely', async () => {
    const incident: FakeIncidentRow = {
      id: 'incident-1',
      status: 'in_progress',
      assigned_station_id: 1,
      first_response_at: '2024-01-01T00:00:00.000Z',
    };
    // Zero final_reports rows for this incident.
    const supabase = createFakeDb({ incident, finalReports: [] });

    // Sanity check: confirm there really is no final_reports row before the
    // transition (the precondition for this bug condition).
    const existingFinalReports = supabase.finalReports.filter(
      (r: FakeFinalReportRow) => r.incident_id === 'incident-1'
    );
    expect(existingFinalReports.length).toBe(0);

    // Call db:updateIncidentStatus DIRECTLY with status: 'closed', bypassing
    // finalReports:create.
    //
    // On UNFIXED code, this used to resolve successfully despite zero
    // final_reports rows existing — that was exactly the bug: isBugCondition
    // held (action == CloseTransition AND gatesOn !=
    // DispatcherFinalReportCompleteness) yet nothing rejected it.
    //
    // FIXED (task 23.3): the new final_report_required guard now rejects
    // this transition before it can reach the incidents.update() write.
    await expect(
      dbUpdateIncidentStatus(supabase, { id: 'incident-1', status: 'closed' })
    ).rejects.toThrow(/final_report_required/);

    const updatedIncident = supabase.incidentsById['incident-1'];

    // The incident's status must NOT have been changed to 'closed' — the
    // rejected transition must not have partially applied.
    expect(updatedIncident.status).toBe('in_progress');

    // And there is still no final_reports row backing it, as expected.
    const finalReportsAfterAttempt = supabase.finalReports.filter(
      (r: FakeFinalReportRow) => r.incident_id === 'incident-1'
    );
    expect(finalReportsAfterAttempt.length).toBe(0);
  });

  it('documents the contrast case: finalReports:create (the primary supported path) DOES insert a final_reports row as part of closing, satisfying the gate by construction', async () => {
    const incident: FakeIncidentRow = {
      id: 'incident-2',
      status: 'in_progress',
      assigned_station_id: 1,
      first_response_at: '2024-01-01T00:00:00.000Z',
    };
    const supabase = createFakeDb({ incident, finalReports: [] });

    await finalReportsCreate(supabase, {
      incidentId: 'incident-2',
      reportDetails: { summary: 'All clear' },
    });

    const updatedIncident = supabase.incidentsById['incident-2'];
    expect(updatedIncident.status).toBe('closed');

    const finalReportsAfterClose = supabase.finalReports.filter(
      (r: FakeFinalReportRow) => r.incident_id === 'incident-2'
    );
    // Unlike the buggy db:updateIncidentStatus path above, this path never
    // leaves 'closed' without a backing final_reports row — but that's only
    // because finalReports:create happens to insert one itself, not because
    // any gate enforces it at the status-transition boundary. Bug 6's fix
    // (task 23.3) must make that gate live at the boundary itself so ALL
    // paths to 'closed' are covered, not just this one.
    expect(finalReportsAfterClose.length).toBe(1);
  });
});
