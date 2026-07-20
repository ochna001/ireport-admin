/**
 * Bug 2 — Status vocabulary drift across apps (bug condition exploration test)
 *
 * Spec: .kiro/specs/incident-lifecycle-consistency
 * Property 1 (Bug Condition): "Canonical status not recognized by a given source"
 *
 * Bug condition (from design.md):
 *   isBugCondition(input) == input.statusValue NOT IN input.source.recognizedStatusSet
 *                            AND input.statusValue IN CANONICAL_STATUS_SET
 *
 * Canonical status list (7 values, per design.md Glossary):
 *   pending, assigned, in_progress, resolved, closed, rejected, ai_routing
 *
 * This file targets ONE of the four drifted sources named in task 5:
 *   ireport-admin/src/renderer/pages/IncidentDetail.tsx  STATUS_OPTIONS / VALID_STATUSES
 *
 * `IncidentDetail.tsx` imports Electron-renderer-only concerns (react-router-dom,
 * lucide-react, RouteMap, FinalReportModal) that make importing the whole module
 * in a jsdom/vitest unit test heavy and unnecessary. Per the workspace's existing
 * convention (see station-assignment.preservation.test.ts's
 * `extractFunctionBody` helper), this test reads the STATUS_OPTIONS array
 * literally out of the real source file via static inspection rather than
 * re-declaring/mocking it — so it stays a faithful reflection of production
 * code, not a hand-copied guess.
 *
 * CRITICAL: This test MUST FAIL (or demonstrate the defect) on unfixed code.
 * DO NOT attempt to fix IncidentDetail.tsx's STATUS_OPTIONS/VALID_STATUSES when
 * this fails.
 *
 * Validates: Requirements 1.4, 1.5, 1.6, 1.7
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const CANONICAL_STATUS_SET = new Set([
  'pending',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
  'rejected',
  'ai_routing',
]);

const incidentDetailPath = path.join(__dirname, '../../renderer/pages/IncidentDetail.tsx');
const source = fs.readFileSync(incidentDetailPath, 'utf-8');

/**
 * Extracts the actual list of `value: '...'` entries out of the real
 * `STATUS_OPTIONS` array literal in IncidentDetail.tsx, by locating the
 * declaration and scanning to its closing `];` (matching brackets), then
 * regex-matching `value: '...'` inside that slice. This mirrors the real
 * production array rather than a hand-copied duplicate that could itself drift
 * from the source.
 */
function extractStatusOptionValues(): string[] {
  const declIdx = source.indexOf('const STATUS_OPTIONS');
  expect(declIdx).toBeGreaterThan(-1);

  const bracketOpenIdx = source.indexOf('[', declIdx);
  let depth = 0;
  let i = bracketOpenIdx;
  for (; i < source.length; i++) {
    if (source[i] === '[') depth++;
    if (source[i] === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  const arrayLiteral = source.slice(bracketOpenIdx, i + 1);

  const values: string[] = [];
  const valueRegex = /value:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = valueRegex.exec(arrayLiteral)) !== null) {
    values.push(match[1]);
  }
  return values;
}

describe('Bug 2 exploration: status vocabulary drift — ireport-admin IncidentDetail.tsx', () => {
  const statusOptionValues = extractStatusOptionValues();
  const validStatuses = new Set(statusOptionValues);

  it('sanity: STATUS_OPTIONS was actually found and parsed (non-empty)', () => {
    expect(statusOptionValues.length).toBeGreaterThan(0);
  });

  it.each(['rejected', 'ai_routing'])(
    "BUG CONDITION: canonical status '%s' is NOT in IncidentDetail.tsx's STATUS_OPTIONS/VALID_STATUSES — EXPECTED TO FAIL on unfixed code",
    (canonicalStatus) => {
      expect(CANONICAL_STATUS_SET.has(canonicalStatus)).toBe(true); // sanity: it IS canonical

      // On UNFIXED code: STATUS_OPTIONS only lists
      // pending, assigned, in_progress, resolved, closed — 'rejected' and
      // 'ai_routing' are both missing, so this assertion FAILS, demonstrating
      // the bug (dispatcher cannot select or filter incidents by these values).
      expect(validStatuses.has(canonicalStatus)).toBe(true);
    }
  );

  it.each(['pending', 'assigned', 'in_progress', 'resolved', 'closed'])(
    "documents the (correct, non-buggy) overlap: canonical status '%s' IS present in STATUS_OPTIONS today",
    (canonicalStatus) => {
      // These five are common to all apps today (Preservation scope, 3.3) and
      // are expected to pass even on unfixed code — included here only to
      // contrast against the two missing values above.
      expect(validStatuses.has(canonicalStatus)).toBe(true);
    }
  );

  it('BUG CONDITION: VALID_STATUSES (derived from STATUS_OPTIONS) is missing 2 of the 7 canonical values — EXPECTED TO FAIL on unfixed code', () => {
    const missingFromAdmin = [...CANONICAL_STATUS_SET].filter((s) => !validStatuses.has(s));

    // On UNFIXED code: missingFromAdmin === ['rejected', 'ai_routing'] (order
    // may vary), so this length assertion fails, confirming the drift.
    expect(missingFromAdmin).toHaveLength(0);
  });
});
