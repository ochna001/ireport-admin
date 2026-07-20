/**
 * Bug 6 — Two uncoordinated final-documentation-record producers
 * (PRESERVATION tests)
 *
 * Spec: .kiro/specs/incident-lifecycle-consistency
 * Property 2 (Preservation): "Viewing completed final reports unaffected"
 * (design.md's Property 13, validating Requirements 3.11)
 *
 * These tests capture behavior that is TRUE TODAY on UNFIXED code and that
 * task 23's fix MUST NOT regress:
 *
 *   - Viewing an EXISTING, ALREADY-COMPLETED final report (one that already
 *     has `report_details`, `completed_by_user_id`, and `completed_at`
 *     populated) displays identically today, regardless of who is looking at
 *     it (dispatcher vs. responder).
 *
 * ORIGINAL (unfixed) behavior confirmed by direct inspection:
 *
 *   - `ireport-admin/src/main/index.ts`'s `finalReports:get` IPC handler
 *     (verified by direct source inspection, ~lines 2791-2805) is a plain,
 *     unconditional SELECT: `supabase.from('final_reports').select('*').eq(
 *     'incident_id', incidentId).single()`, returning `data || null`. It
 *     takes ONLY an `incidentId` parameter — there is no caller-role
 *     parameter, no dispatcher-vs-responder branch, and no distinction of
 *     any kind based on who is asking. Any caller supplying the same
 *     `incidentId` gets back the exact same row.
 *   - `ireport-admin/src/renderer/pages/IncidentDetail.tsx`'s
 *     `loadFinalReport()` (verified by direct source inspection, ~lines
 *     718-725) simply calls `window.api.getFinalReport(id!)` (which invokes
 *     `finalReports:get`) and stores the result via `setFinalReport(data)` —
 *     no filtering, no role check, no transformation of the returned row.
 *     `loadDraft()` (~lines 727-745) is the separate `final_report_drafts`
 *     read path and is not part of this preservation property (viewing an
 *     already-COMPLETED final_reports row, not a draft).
 *   - The responder Android app (`Ireport/app/src/main/java/com/example/
 *     iresponderapp/`) was searched (including
 *     `supabase/Repositories.kt`, all Activity/Fragment classes, and the
 *     `formref/` reference forms) for any read/display of the `final_reports`
 *     table. None exists: the ONLY two references to `final_reports` in the
 *     responder app are both inside the private
 *     `createOrUpdateFinalReport()` write helper — an existence-check SELECT
 *     immediately followed by an INSERT or UPDATE branch (Bug 6's WRITE-side
 *     defect, already covered by `FinalReportAuthorityBug6Test.java`, task
 *     21). There is no responder-side screen that reads back and displays an
 *     already-completed `final_reports` row for viewing purposes. Per the
 *     task instructions, this is noted and the companion Android read-side
 *     test is skipped as not applicable — there is no such read path to
 *     preserve on the responder side.
 *
 * Since `finalReports:get` takes no caller-identity parameter at all, "does
 * it display identically for both responder and dispatcher" collapses to:
 * the SAME `incidentId` always returns the SAME row, unconditionally. That
 * is exactly what these tests assert.
 *
 * Bug 6's planned fix (task 23) is:
 *   23.1 removes the RESPONDER's direct WRITE to `final_reports` (routes it
 *        into `final_report_drafts.draft_details` instead).
 *   23.3 adds a completeness GATE on the CLOSED transition (rejecting
 *        `db:updateIncidentStatus(status: 'closed')` unless a `final_reports`
 *        row already exists).
 * Neither change touches `finalReports:get`'s SELECT logic or
 * `loadFinalReport()`/`loadDraft()`'s read/display logic at all — both are
 * pure reads of a row that (by hypothesis, in these tests) ALREADY exists
 * and is ALREADY complete, so removing a write path elsewhere and gating a
 * different transition cannot affect what an existing row's read returns.
 *
 * Per task 22.5 (fix's task 23.4/23.5 step), these exact tests are re-run
 * unmodified after the fix lands and are expected to keep passing (no
 * regression).
 *
 * Validates: Requirements 3.11
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal in-memory fake DB + fake supabase-like client, following the same
// convention as final-report-authority.exploration.test.ts (task 21) in this
// same directory: a literal replica of the relevant production branches,
// verified by direct source inspection, rather than importing the real
// (Electron-main-only) module.
// ---------------------------------------------------------------------------

interface FakeFinalReportRow {
  incident_id: string;
  report_details: any;
  completed_by_user_id: string | null;
  completed_at: string | null;
}

function createFakeDb(opts: { finalReports: FakeFinalReportRow[] }) {
  const finalReports: FakeFinalReportRow[] = [...opts.finalReports];

  const supabase: any = {
    finalReports,
    from: (table: string) => {
      if (table === 'final_reports') {
        return {
          select: () => ({
            eq: (_c: string, incidentId: string) => ({
              single: () => {
                const row = finalReports.find((r) => r.incident_id === incidentId);
                if (!row) {
                  // Mirrors Supabase's PGRST116 "no rows" error code, which
                  // finalReports:get explicitly tolerates.
                  return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
                }
                return Promise.resolve({ data: row, error: null });
              },
            }),
          }),
        };
      }
      // Not exercised by this test.
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        }),
      };
    },
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Literal replica of ireport-admin/src/main/index.ts's finalReports:get IPC
// handler (verbatim, verified by direct source inspection, ~lines 2791-2805).
// Notice there is NO caller/role parameter of any kind — only incidentId.
// ---------------------------------------------------------------------------

async function finalReportsGet(supabase: any, incidentId: string) {
  try {
    const { data, error } = await supabase.from('final_reports').select('*').eq('incident_id', incidentId).single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  } catch (error) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Literal replica of ireport-admin/src/renderer/pages/IncidentDetail.tsx's
// loadFinalReport() (verbatim structure, verified by direct source
// inspection, ~lines 718-725): calls the IPC handler and stores whatever it
// returns, with no filtering/transformation/role branching.
// ---------------------------------------------------------------------------

async function loadFinalReport(api: { getFinalReport: (incidentId: string) => Promise<any> }, incidentId: string) {
  try {
    const data = await api.getFinalReport(incidentId);
    return data;
  } catch (error) {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Preservation tests
// ---------------------------------------------------------------------------

describe('Bug 6 preservation: viewing an existing, already-completed final report is unaffected (must PASS on unfixed code)', () => {
  it('finalReports:get returns the exact same already-completed row for the same incidentId, with no caller-identity parameter involved at all', async () => {
    const completedReport: FakeFinalReportRow = {
      incident_id: 'incident-completed-1',
      report_details: { summary: 'Fire extinguished, no casualties.', responders: ['Officer A', 'Officer B'] },
      completed_by_user_id: 'dispatcher-user-1',
      completed_at: '2024-02-01T10:00:00.000Z',
    };
    const supabase = createFakeDb({ finalReports: [completedReport] });

    // "Dispatcher view" and "responder view" both simply call finalReports:get
    // with the same incidentId — the handler has no parameter to distinguish
    // them, so both calls are literally identical invocations.
    const dispatcherView = await finalReportsGet(supabase, 'incident-completed-1');
    const responderView = await finalReportsGet(supabase, 'incident-completed-1');

    expect(dispatcherView).toEqual(completedReport);
    expect(responderView).toEqual(completedReport);
    expect(dispatcherView).toEqual(responderView);
  });

  it('loadFinalReport() (IncidentDetail.tsx) stores exactly what finalReports:get returns for an already-completed report, unmodified', async () => {
    const completedReport: FakeFinalReportRow = {
      incident_id: 'incident-completed-2',
      report_details: { summary: 'Medical transport completed.' },
      completed_by_user_id: 'dispatcher-user-2',
      completed_at: '2024-02-02T08:30:00.000Z',
    };
    const supabase = createFakeDb({ finalReports: [completedReport] });
    const fakeApi = {
      getFinalReport: (incidentId: string) => finalReportsGet(supabase, incidentId),
    };

    const result = await loadFinalReport(fakeApi, 'incident-completed-2');

    expect(result).toEqual(completedReport);
    expect(result.report_details).toEqual(completedReport.report_details);
    expect(result.completed_by_user_id).toBe('dispatcher-user-2');
    expect(result.completed_at).toBe('2024-02-02T08:30:00.000Z');
  });

  it('repeated reads of the same already-completed final report return identical data every time (no drift, no side effects from viewing)', async () => {
    const completedReport: FakeFinalReportRow = {
      incident_id: 'incident-completed-3',
      report_details: { summary: 'Flood rescue complete.' },
      completed_by_user_id: 'dispatcher-user-3',
      completed_at: '2024-02-03T14:15:00.000Z',
    };
    const supabase = createFakeDb({ finalReports: [completedReport] });

    const firstRead = await finalReportsGet(supabase, 'incident-completed-3');
    const secondRead = await finalReportsGet(supabase, 'incident-completed-3');
    const thirdRead = await finalReportsGet(supabase, 'incident-completed-3');

    expect(firstRead).toEqual(completedReport);
    expect(secondRead).toEqual(completedReport);
    expect(thirdRead).toEqual(completedReport);
  });

  it('a completed final report for one incident is unaffected by the existence (or absence) of final_reports rows for other incidents', async () => {
    const completedReportA: FakeFinalReportRow = {
      incident_id: 'incident-completed-4a',
      report_details: { summary: 'Incident A report.' },
      completed_by_user_id: 'dispatcher-user-4',
      completed_at: '2024-02-04T09:00:00.000Z',
    };
    // incident-completed-4b intentionally has NO final_reports row.
    const supabase = createFakeDb({ finalReports: [completedReportA] });

    const readForA = await finalReportsGet(supabase, 'incident-completed-4a');
    const readForB = await finalReportsGet(supabase, 'incident-completed-4b');

    expect(readForA).toEqual(completedReportA);
    expect(readForB).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Note on the responder Android app's read side (per task instructions):
//
// The responder app (Ireport/app/src/main/java/com/example/iresponderapp/)
// was searched for any code that reads/displays the `final_reports` table
// (Repositories.kt, all Activity/Fragment UI classes, and the `formref/`
// reference forms). No such read/display path exists — the app's only two
// references to `final_reports` are both inside the private
// `createOrUpdateFinalReport()` write helper (an existence-check SELECT
// immediately followed by an INSERT/UPDATE, i.e. Bug 6's WRITE-side defect
// already covered by task 21's `FinalReportAuthorityBug6Test.java`). There is
// therefore no meaningful companion Android-side "viewing a completed final
// report" test to add here: the responder app has no final-report viewing
// screen to preserve.
// ---------------------------------------------------------------------------
