/**
 * GeoJSON-based municipality & barangay detection for Camarines Norte.
 *
 * Resolution order for a coordinate:
 *   1. Barangay polygons (camarinesNorteBarangays.json) — authoritative for
 *      barangay AND municipality, since each barangay carries its parent
 *      municipality name (ADM3_EN).
 *   2. Municipality polygons (camarinesNorteMunicipalities.json) — used when
 *      barangay detail is absent but the municipality boundary still covers
 *      the point (e.g. some offshore/coastal water not in barangay polygons).
 *   3. Bounding-box fallback — only for the known-incomplete municipality
 *      polygons around small coastal/island areas. Offshore points that fall
 *      in no envelope are returned as null instead of being force-classified.
 *
 * Boundary data: PSA PSGC 2023-10-24 / NAMRIA 2023-11-06, bundled via
 * bendlikeabamboo/barangay-boundaries-repository (MIT). Simplified to ~500m;
 * suitable for visualization and classification, not cadastral/legal use.
 */

import * as fs from 'fs';
import * as path from 'path';

// GeoJSON types
interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

interface GeoJSONGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: any;
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: GeoJSONGeometry;
  properties: {
    adm3_en?: string; // Municipality name (municipality file)
    adm3_psgc?: number;
    ADM3_EN?: string; // Municipality name (barangay file)
    ADM4_EN?: string; // Barangay name (barangay file)
    [key: string]: any;
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// Caches for loaded GeoJSON data
let municipalityGeoData: GeoJSONFeatureCollection | null = null;
let barangayGeoData: GeoJSONFeatureCollection | null = null;

function resolveDataFile(filename: string): string | null {
  const possiblePaths = [
    path.join(__dirname, 'data', filename),
    path.join(__dirname, '..', 'main', 'data', filename),
    path.join(process.cwd(), 'src', 'main', 'data', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Load the Camarines Norte municipalities GeoJSON data
 */
function loadMunicipalityGeoData(): GeoJSONFeatureCollection {
  if (municipalityGeoData) {
    return municipalityGeoData;
  }

  try {
    const geoJsonPath = resolveDataFile('camarinesNorteMunicipalities.json');
    if (!geoJsonPath) {
      console.warn('[GeoUtils] Could not find camarinesNorteMunicipalities.json, falling back to bounding boxes');
      return { type: 'FeatureCollection', features: [] };
    }

    const data = fs.readFileSync(geoJsonPath, 'utf-8');
    municipalityGeoData = JSON.parse(data) as GeoJSONFeatureCollection;
    console.log(`[GeoUtils] Loaded ${municipalityGeoData.features.length} municipality boundaries`);
    return municipalityGeoData;
  } catch (error) {
    console.error('[GeoUtils] Error loading municipality GeoJSON:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Load the Camarines Norte barangays GeoJSON data
 */
function loadBarangayGeoData(): GeoJSONFeatureCollection {
  if (barangayGeoData) {
    return barangayGeoData;
  }

  try {
    const geoJsonPath = resolveDataFile('camarinesNorteBarangays.json');
    if (!geoJsonPath) {
      // Barangay detail is optional; municipality polygons + envelopes still work.
      return { type: 'FeatureCollection', features: [] };
    }

    const data = fs.readFileSync(geoJsonPath, 'utf-8');
    barangayGeoData = JSON.parse(data) as GeoJSONFeatureCollection;
    console.log(`[GeoUtils] Loaded ${barangayGeoData.features.length} barangay boundaries`);
    return barangayGeoData;
  } catch (error) {
    console.error('[GeoUtils] Error loading barangay GeoJSON:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Ray casting algorithm to check if a point is inside a polygon
 * @param point [longitude, latitude]
 * @param polygon Array of [longitude, latitude] coordinates forming a closed polygon
 */
function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon)
 */
function pointInGeometry(lng: number, lat: number, geometry: GeoJSONGeometry): boolean {
  const point: [number, number] = [lng, lat];

  if (geometry.type === 'Polygon') {
    const exteriorRing = geometry.coordinates[0];
    if (!pointInPolygon(point, exteriorRing)) {
      return false;
    }
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (pointInPolygon(point, geometry.coordinates[i])) {
        return false; // Point is in a hole
      }
    }
    return true;
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygonCoords of geometry.coordinates) {
      const exteriorRing = polygonCoords[0];
      if (pointInPolygon(point, exteriorRing)) {
        let inHole = false;
        for (let i = 1; i < polygonCoords.length; i++) {
          if (pointInPolygon(point, polygonCoords[i])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) {
          return true;
        }
      }
    }
    return false;
  }

  return false;
}

/**
 * Find the first feature whose geometry contains the point.
 */
function findContainingFeature(
  geoData: GeoJSONFeatureCollection,
  lng: number,
  lat: number
): GeoJSONFeature | null {
  for (const feature of geoData.features) {
    if (feature.geometry && pointInGeometry(lng, lat, feature.geometry as GeoJSONGeometry)) {
      return feature;
    }
  }
  return null;
}

/**
 * Get the barangay name for given coordinates.
 * @param lat Latitude
 * @param lng Longitude
 * @returns Barangay name, or null if not within any barangay polygon.
 */
export function getBarangayFromCoordinates(lat: number, lng: number): string | null {
  const geoData = loadBarangayGeoData();
  if (geoData.features.length === 0) return null;

  const feature = findContainingFeature(geoData, lng, lat);
  return feature?.properties.ADM4_EN ?? null;
}

/**
 * Resolve a coordinate to both barangay and municipality in one pass.
 * Barangay polygons are authoritative; municipality polygons and the
 * envelope fallback fill gaps where barangay detail is absent.
 */
export function resolveLocationFromCoordinates(lat: number, lng: number): {
  municipality: string | null;
  barangay: string | null;
} {
  // 1. Barangay polygons — carry the parent municipality name.
  const barangayData = loadBarangayGeoData();
  if (barangayData.features.length > 0) {
    const bFeature = findContainingFeature(barangayData, lng, lat);
    if (bFeature) {
      return {
        municipality: bFeature.properties.ADM3_EN ?? null,
        barangay: bFeature.properties.ADM4_EN ?? null,
      };
    }
  }

  // 2. Municipality polygons.
  const muniData = loadMunicipalityGeoData();
  if (muniData.features.length > 0) {
    const mFeature = findContainingFeature(muniData, lng, lat);
    if (mFeature) {
      return { municipality: mFeature.properties.adm3_en ?? null, barangay: null };
    }
  }

  // 3. Envelope fallback for known-incomplete coastal/island detail.
  const envelopeMuni = getMunicipalityFromBoundingBox(lat, lng);
  return { municipality: envelopeMuni, barangay: null };
}

/**
 * Get the municipality name for given coordinates.
 * Barangay polygons are checked first (they carry ADM3_EN), then
 * municipality polygons, then the envelope fallback.
 */
export function getMunicipalityFromCoordinates(lat: number, lng: number): string | null {
  return resolveLocationFromCoordinates(lat, lng).municipality;
}

/**
 * Fallback bounding box method for municipality detection.
 * Less accurate but covers locations the polygon detail omits.
 */
const municipalityBounds: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  Basud: { minLat: 14.02, maxLat: 14.15, minLng: 122.85, maxLng: 123.02 },
  Capalonga: { minLat: 14.28, maxLat: 14.42, minLng: 122.42, maxLng: 122.58 },
  Daet: { minLat: 14.08, maxLat: 14.18, minLng: 122.92, maxLng: 123.02 },
  'Jose Panganiban': { minLat: 14.25, maxLat: 14.35, minLng: 122.65, maxLng: 122.78 },
  Labo: { minLat: 14.12, maxLat: 14.28, minLng: 122.72, maxLng: 122.92 },
  Mercedes: { minLat: 14.08, maxLat: 14.18, minLng: 123.00, maxLng: 123.15 },
  Paracale: { minLat: 14.22, maxLat: 14.32, minLng: 122.72, maxLng: 122.85 },
  'San Lorenzo Ruiz': { minLat: 14.05, maxLat: 14.12, minLng: 122.82, maxLng: 122.92 },
  'San Vicente': { minLat: 14.05, maxLat: 14.12, minLng: 122.72, maxLng: 122.82 },
  'Santa Elena': { minLat: 14.15, maxLat: 14.25, minLng: 122.38, maxLng: 122.52 },
  Talisay: { minLat: 14.08, maxLat: 14.15, minLng: 122.82, maxLng: 122.92 },
  Vinzons: { minLat: 14.15, maxLat: 14.25, minLng: 122.88, maxLng: 123.00 },
};

function getMunicipalityFromBoundingBox(lat: number, lng: number): string | null {
  const matches = Object.entries(municipalityBounds).filter(([, bounds]) =>
    lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng
  );

  if (matches.length === 0) return null;

  matches.sort(([, a], [, b]) => {
    const distanceToA = Math.hypot(lat - (a.minLat + a.maxLat) / 2, lng - (a.minLng + a.maxLng) / 2);
    const distanceToB = Math.hypot(lat - (b.minLat + b.maxLat) / 2, lng - (b.minLng + b.maxLng) / 2);
    return distanceToA - distanceToB;
  });

  return matches[0][0];
}

/**
 * Check if coordinates fall within a specific municipality.
 * Uses the same resolution order as getMunicipalityFromCoordinates so the
 * two functions always agree.
 */
export function isInMunicipality(lat: number, lng: number, municipalityName: string): boolean {
  const resolved = resolveLocationFromCoordinates(lat, lng);
  if (resolved.municipality) {
    return resolved.municipality.toLowerCase() === municipalityName.toLowerCase();
  }

  // No polygon or envelope matched; do not force-classify offshore points.
  return false;
}

/**
 * Get all municipalities that a point could belong to (for debugging/verification)
 */
export function getAllMatchingMunicipalities(lat: number, lng: number): string[] {
  const matches: string[] = [];
  const seen = new Set<string>();

  const add = (name?: string | null) => {
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      matches.push(name);
    }
  };

  for (const feature of loadBarangayGeoData().features) {
    if (feature.geometry && pointInGeometry(lng, lat, feature.geometry as GeoJSONGeometry)) {
      add(feature.properties.ADM3_EN);
    }
  }

  for (const feature of loadMunicipalityGeoData().features) {
    if (feature.geometry && pointInGeometry(lng, lat, feature.geometry as GeoJSONGeometry)) {
      add(feature.properties.adm3_en);
    }
  }

  return matches;
}
