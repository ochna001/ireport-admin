import { describe, expect, it } from 'vitest';
import {
  getMunicipalityFromCoordinates,
  isInMunicipality,
  getBarangayFromCoordinates,
  resolveLocationFromCoordinates,
  getAllMatchingMunicipalities,
} from '../../main/geoUtils';

describe('barangay GeoJSON resolution', () => {
  it('resolves a coordinate inside a barangay polygon to barangay + municipality', () => {
    // Inside Paracale / Calaburnay polygon.
    const resolved = resolveLocationFromCoordinates(14.25, 122.8);
    expect(resolved.municipality).toBe('Paracale');
    expect(resolved.barangay).toBe('Calaburnay');
  });

  it('getBarangayFromCoordinates returns the barangay name', () => {
    expect(getBarangayFromCoordinates(14.25, 122.8)).toBe('Calaburnay');
  });

  it('getMunicipalityFromCoordinates derives municipality from the barangay polygon', () => {
    expect(getMunicipalityFromCoordinates(14.25, 122.8)).toBe('Paracale');
  });

  it('isInMunicipality agrees with getMunicipalityFromCoordinates', () => {
    expect(isInMunicipality(14.25, 122.8, 'Paracale')).toBe(true);
    expect(isInMunicipality(14.25, 122.8, 'Daet')).toBe(false);
  });

  it('uses the envelope fallback for a coastal point inside the municipality envelope but outside all polygons', () => {
    // This point is over water outside every barangay polygon, but inside the
    // Paracale envelope. The envelope fallback covers known-incomplete coastal
    // / island detail, so it is classified as Paracale (without a barangay).
    const resolved = resolveLocationFromCoordinates(14.28, 122.805);
    expect(resolved.municipality).toBe('Paracale');
    expect(resolved.barangay).toBeNull();
    expect(isInMunicipality(14.28, 122.805, 'Paracale')).toBe(true);
  });

  it('does not force-classify a point that is in no polygon and no envelope', () => {
    // Well offshore, outside every envelope.
    expect(getMunicipalityFromCoordinates(14.28, 123.5)).toBeNull();
    expect(isInMunicipality(14.28, 123.5, 'Paracale')).toBe(false);
  });

  it('returns null for coordinates far outside Camarines Norte', () => {
    expect(getMunicipalityFromCoordinates(13.5, 121.5)).toBeNull();
    expect(getBarangayFromCoordinates(13.5, 121.5)).toBeNull();
  });

  it('getAllMatchingMunicipalities deduplicates across barangay + municipality layers', () => {
    const matches = getAllMatchingMunicipalities(14.25, 122.8);
    expect(matches).toContain('Paracale');
    // No duplicate entries.
    expect(new Set(matches.map((m) => m.toLowerCase())).size).toBe(matches.length);
  });
});
