import { describe, expect, it } from 'vitest';
import { getIncidentReference } from '../../renderer/utils/incidentReference';

describe('getIncidentReference', () => {
  it('uses the server-generated reference when present', () => {
    expect(getIncidentReference({ id: 'uuid', incident_reference: 'INC-2026-00042' })).toBe('INC-2026-00042');
  });

  it('formats reference components when the generated field is not available', () => {
    expect(getIncidentReference({ reference_year: 2026, reference_number: 7 })).toBe('INC-2026-00007');
  });

  it('falls back to the legacy short code or UUID prefix for unsynced data', () => {
    expect(getIncidentReference({ id: 'abcdef12-3456', short_code: '39b1' })).toBe('#39B1');
    expect(getIncidentReference({ id: 'abcdef12-3456' })).toBe('#ABCDEF12');
    expect(getIncidentReference({})).toBe('Pending reference');
  });
});
