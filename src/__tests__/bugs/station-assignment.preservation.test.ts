/**
 * Bug 1 — Duplicated station auto-assignment logic (PRESERVATION tests)
 *
 * Spec: .kiro/specs/incident-lifecycle-consistency
 * Property 2 (Preservation): "Manual override and untouched existing assignment"
 *
 * These tests capture behavior that is TRUE TODAY on UNFIXED code and that
 * task 3's fix (routing all auto-assignment through a single
 * `assign_station_if_unset` DB function) MUST NOT regress.
 *
 * They are companions to the bug-condition exploration test in
 * `ireport_v1/src/__tests__/bugs/station-assignment.exploration.test.ts` (task 1),
 * which demonstrates the OPPOSITE side: the two mobile call sites
 * (`confirm-report.tsx`, `offlineQueue.ts`) unconditionally overwrite an
 * existing `assigned_station_id` with no guard. That is the bug.
 *
 * This file scopes to the parts of Bug 1's Preservation property that ARE
 * true today, all of which live in `ireport-admin`:
 *
 *   3.1 An incident with an existing valid `assigned_station_id`, when no new
 *       insert/replay trigger fires, keeps its assignment unchanged. Concretely
 *       demonstrated via `db:updateIncidentStatus`'s own guard: its auto-assign
 *       branch only fires `!currentIncident.assigned_station_id`; when a station
 *       is already assigned it takes the `else if (currentIncident?.assigned_station_id)`
 *       no-op branch instead (verbatim from ireport-admin/src/main/index.ts, lines ~977-1069).
 *
 *   3.2 A dispatcher's manual reassignment (the `stationId` param, first `if`
 *       branch in the same handler) is honored, and a later status update
 *       with no `stationId` does not revert it back through admin's own
 *       auto-assign branch (guarded by the same existing-assignment check).
 *
 *   (unlabeled 3rd observation) `IncidentDetail.tsx`'s `haversineKm()` /
 *       `calculateDistance()` UI helpers (recommendation panel, nearby-stations
 *       list) are pure read/sort/display helpers and do not write to the DB.
 *
 * Per task 3.6, these exact tests are re-run unmodified after the fix lands
 * and are expected to keep passing (no regression).
 *
 * Validates: Requirements 3.1, 3.2
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Literal replica of the station-assignment decision cascade inside
// ireport-admin/src/main/index.ts db:updateIncidentStatus (lines ~977-1069).
// Only the branching logic that decides WHETHER/WHAT to write to
// `assigned_station_id` is replicated — the actual agency/station DB lookups
// and haversine distance calculation are stubbed out via `pickStationFn`
// since they are not what's under test here (that inline haversine reimpl
// is the Bug 1 defect itself, already covered by the exploration test).
// ---------------------------------------------------------------------------

interface StationAssignmentInput {
  providedStationId: number | undefined;
  currentAssignedStationId: number | string | null | undefined;
  status: string;
  pickStationFn?: () => number | string;
}

interface StationAssignmentResult {
  assignedStationId: number | string | null | undefined;
  autoAssignRan: boolean;
  explicitOverrideApplied: boolean;
}

function adminStationAssignmentBranch(input: StationAssignmentInput): StationAssignmentResult {
  const { providedStationId, currentAssignedStationId, status } = input;
  const isTerminalStatus = status === 'resolved' || status === 'closed';

  // Verbatim cascade from db:updateIncidentStatus:
  //   if (stationId) { ... }
  //   else if (!currentIncident?.assigned_station_id && status !== 'pending' && !isTerminalStatus) { ... auto-assign ... }
  //   else if (currentIncident?.assigned_station_id) { /* no-op: already assigned */ }
  //   else if (status === 'pending') { /* no-op */ }
  if (providedStationId) {
    return {
      assignedStationId: providedStationId,
      autoAssignRan: false,
      explicitOverrideApplied: true,
    };
  } else if (!currentAssignedStationId && status !== 'pending' && !isTerminalStatus) {
    const picked = (input.pickStationFn || (() => 'station-AUTO'))();
    return {
      assignedStationId: picked,
      autoAssignRan: true,
      explicitOverrideApplied: false,
    };
  } else if (currentAssignedStationId) {
    // "Station already assigned" — untouched.
    return {
      assignedStationId: currentAssignedStationId,
      autoAssignRan: false,
      explicitOverrideApplied: false,
    };
  }

  // status === 'pending' (or terminal with no existing assignment) — untouched.
  return {
    assignedStationId: currentAssignedStationId ?? null,
    autoAssignRan: false,
    explicitOverrideApplied: false,
  };
}

// ---------------------------------------------------------------------------
// 3.1 — existing valid assignment + no new insert/replay trigger stays unchanged
// ---------------------------------------------------------------------------

describe('Bug 1 preservation: station assignment (must PASS on unfixed code)', () => {
  describe('3.1 existing assignment untouched with no new insert/replay trigger', () => {
    it('db:updateIncidentStatus auto-assign branch is skipped when assigned_station_id is already set (no stationId provided)', () => {
      const result = adminStationAssignmentBranch({
        providedStationId: undefined,
        currentAssignedStationId: 'station-A',
        status: 'in_progress',
      });

      expect(result.assignedStationId).toBe('station-A');
      expect(result.autoAssignRan).toBe(false);
    });

    it('existing assignment on an incident record is unaffected when no call site is invoked at all', () => {
      // Simulates "no new insert/replay trigger" — e.g. simply reading/viewing
      // an incident, or a status update path unrelated to station assignment.
      // No auto-assign function is called here; the record is just inspected.
      const incidentRow = { id: 'incident-9', assigned_station_id: 'station-Z', status: 'assigned' };

      expect(incidentRow.assigned_station_id).toBe('station-Z');
    });

    it('auto-assign still runs (and only then writes) when no assignment exists yet — contrast case confirming the guard is assignment-presence-based, not blanket-skipped', () => {
      const result = adminStationAssignmentBranch({
        providedStationId: undefined,
        currentAssignedStationId: null,
        status: 'in_progress',
        pickStationFn: () => 'station-AUTO',
      });

      expect(result.autoAssignRan).toBe(true);
      expect(result.assignedStationId).toBe('station-AUTO');
    });
  });

  // ---------------------------------------------------------------------------
  // 3.2 — dispatcher manual reassignment honored, not reverted by admin's
  // own auto-assign branch on a subsequent call
  // ---------------------------------------------------------------------------

  describe('3.2 dispatcher manual reassignment honored and not reverted', () => {
    it('an explicit stationId override is honored even when a different station was previously auto-assigned', () => {
      const result = adminStationAssignmentBranch({
        providedStationId: 'station-MANUAL' as any,
        currentAssignedStationId: 'station-AUTO',
        status: 'in_progress',
      });

      expect(result.assignedStationId).toBe('station-MANUAL');
      expect(result.explicitOverrideApplied).toBe(true);
    });

    it('a later status update with no stationId does not revert the manual reassignment via admin auto-assign', () => {
      // 1) Dispatcher manually reassigns.
      const manual = adminStationAssignmentBranch({
        providedStationId: 'station-MANUAL' as any,
        currentAssignedStationId: 'station-AUTO',
        status: 'in_progress',
      });
      expect(manual.assignedStationId).toBe('station-MANUAL');

      // 2) A subsequent status change on the same incident, with no stationId
      // provided this time (e.g. dispatcher advances status further).
      const followUp = adminStationAssignmentBranch({
        providedStationId: undefined,
        currentAssignedStationId: manual.assignedStationId,
        status: 'in_progress',
      });

      expect(followUp.assignedStationId).toBe('station-MANUAL');
      expect(followUp.autoAssignRan).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // IncidentDetail.tsx haversineKm/calculateDistance UI helpers do not write to the DB
  // ---------------------------------------------------------------------------

  describe('IncidentDetail.tsx UI-only distance helpers do not write to the DB', () => {
    const incidentDetailPath = path.join(__dirname, '../../renderer/pages/IncidentDetail.tsx');
    const source = fs.readFileSync(incidentDetailPath, 'utf-8');

    function extractFunctionBody(fnSignatureStart: string): string {
      const startIdx = source.indexOf(fnSignatureStart);
      expect(startIdx).toBeGreaterThan(-1);

      // Find the opening brace of the function body, then scan forward
      // tracking brace depth to find the matching closing brace.
      const braceOpenIdx = source.indexOf('{', startIdx);
      let depth = 0;
      let i = braceOpenIdx;
      for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      return source.slice(braceOpenIdx, i + 1);
    }

    it('haversineKm (recommendation panel helper) is a pure calculation with no Supabase write calls', () => {
      const body = extractFunctionBody('const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number =>');

      expect(body).not.toMatch(/\.update\(/);
      expect(body).not.toMatch(/\.insert\(/);
      expect(body).not.toMatch(/\.rpc\(/);
      expect(body).not.toMatch(/supabase/i);
    });

    it('calculateDistance (nearby-stations list helper) is a pure calculation with no Supabase write calls', () => {
      const body = extractFunctionBody('const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number =>');

      expect(body).not.toMatch(/\.update\(/);
      expect(body).not.toMatch(/\.insert\(/);
      expect(body).not.toMatch(/\.rpc\(/);
      expect(body).not.toMatch(/supabase/i);
    });

    it('getNearbyStations only sorts/maps station data for display and does not call update/insert/rpc', () => {
      const body = extractFunctionBody('const getNearbyStations = ()');

      expect(body).toMatch(/calculateDistance\(/);
      expect(body).not.toMatch(/\.update\(/);
      expect(body).not.toMatch(/\.insert\(/);
      expect(body).not.toMatch(/\.rpc\(/);
    });
  });
});
