/**
 * Bug 2 — Status vocabulary drift across apps (PRESERVATION tests)
 *
 * Spec: .kiro/specs/incident-lifecycle-consistency
 * Property 2 (Preservation): "Existing canonical statuses and their
 * notification branches"
 *
 * These tests capture behavior that is TRUE TODAY on UNFIXED code and that
 * task 7's fix (extending STATUS_OPTIONS/VALID_STATUSES to the full 7-value
 * canonical set) MUST NOT regress.
 *
 * They are companions to the bug-condition exploration test in
 * `status-vocabulary.exploration.test.ts` (task 5), which demonstrates the
 * OPPOSITE side: `rejected` and `ai_routing` are currently MISSING from
 * STATUS_OPTIONS/VALID_STATUSES. That is the bug.
 *
 * This file scopes to the part of Bug 2's Preservation property that is true
 * today in `ireport-admin`:
 *
 *   3.3 The 5 statuses already common to all apps today
 *       (pending, assigned, in_progress, resolved, closed) are present in
 *       STATUS_OPTIONS/VALID_STATUSES with a specific label and color, and
 *       display exactly as they do now. The fix (task 7.2) is additive-only
 *       (adds `rejected`/`ai_routing`), so these 5 entries' value/label/color
 *       must remain byte-for-byte identical after the fix.
 *
 * Per task 7.7, these exact tests are re-run unmodified after the fix lands
 * and are expected to keep passing (no regression).
 *
 * Validates: Requirements 3.3, 3.4
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const incidentDetailPath = path.join(__dirname, '../../renderer/pages/IncidentDetail.tsx');
const source = fs.readFileSync(incidentDetailPath, 'utf-8');

interface StatusOption {
  value: string;
  label: string;
  color: string;
}

/**
 * Extracts the actual `{ value: '...', label: '...', color: '...' }` entries
 * out of the real `STATUS_OPTIONS` array literal in IncidentDetail.tsx, by
 * locating the declaration and scanning to its closing `];` (matching
 * brackets), then regex-matching each field. Mirrors the extraction approach
 * used by the companion exploration test, extended to also capture label/color
 * so this test pins today's exact display strings, not just the value set.
 */
function extractStatusOptions(): StatusOption[] {
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

  const options: StatusOption[] = [];
  const entryRegex = /\{\s*value:\s*'([^']+)',\s*label:\s*'([^']+)',\s*color:\s*'([^']+)'\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(arrayLiteral)) !== null) {
    options.push({ value: match[1], label: match[2], color: match[3] });
  }
  return options;
}

describe('Bug 2 preservation: status vocabulary — ireport-admin IncidentDetail.tsx (must PASS on unfixed code)', () => {
  const options = extractStatusOptions();
  const optionsByValue = new Map(options.map((opt) => [opt.value, opt]));

  it('sanity: STATUS_OPTIONS was actually found and parsed (non-empty)', () => {
    expect(options.length).toBeGreaterThan(0);
  });

  it.each([
    ['pending', 'Pending', 'bg-yellow-500'],
    ['assigned', 'Assigned', 'bg-blue-500'],
    ['in_progress', 'In Progress', 'bg-orange-500'],
    ['resolved', 'Resolved', 'bg-green-500'],
    ['closed', 'Closed', 'bg-gray-500'],
  ])(
    "3.3 status '%s' displays with label '%s' and color '%s' today — must remain unchanged after the fix",
    (value, expectedLabel, expectedColor) => {
      const option = optionsByValue.get(value as string);
      expect(option).toBeDefined();
      expect(option?.label).toBe(expectedLabel);
      expect(option?.color).toBe(expectedColor);
    }
  );

  it('3.3 VALID_STATUSES (derived from STATUS_OPTIONS) recognizes all 5 statuses common to all apps today', () => {
    const validStatuses = new Set(options.map((opt) => opt.value));
    for (const status of ['pending', 'assigned', 'in_progress', 'resolved', 'closed']) {
      expect(validStatuses.has(status)).toBe(true);
    }
  });
});
