import { describe, expect, it } from 'vitest';
import { getAgencyPresentation, normalizeAgency } from '../../renderer/utils/agencyPresentation';

describe('agency presentation', () => {
  it('treats unknown values as awaiting human approval', () => {
    const awaiting = getAgencyPresentation('unknown');

    expect(awaiting.key).toBe('awaiting');
    expect(awaiting.isApproved).toBe(false);
    expect(awaiting.fullLabel).toBe('Agency assignment pending');
  });

  it('never presents an unapproved incident as MDRRMO', () => {
    const awaiting = getAgencyPresentation(null);
    const mdrrmo = getAgencyPresentation('mdrrmo');

    expect(awaiting.markerColor).not.toBe(mdrrmo.markerColor);
    expect(awaiting.shortLabel).not.toBe(mdrrmo.shortLabel);
  });

  it('keeps the legacy PDRRMO alias mapped to MDRRMO', () => {
    expect(normalizeAgency('PDRRMO')).toBe('mdrrmo');
  });
});
