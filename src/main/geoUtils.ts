/**
 * GeoJSON-based municipality detection for Camarines Norte
 * Uses point-in-polygon algorithm with actual municipality boundaries
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

interface GeoJSONFeature {
  type: 'Feature';
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
  properties: {
    adm3_en: string; // Municipality name
    adm3_psgc: number;
    [key: string]: any;
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// Cache for loaded GeoJSON data
let municipalityGeoData: GeoJSONFeatureCollection | null = null;

/**
 * Load the Camarines Norte municipalities GeoJSON data
 */
function loadMunicipalityGeoData(): GeoJSONFeatureCollection {
  if (municipalityGeoData) {
    return municipalityGeoData;
  }

  try {
    // Try multiple possible paths for the GeoJSON file
    const possiblePaths = [
      path.join(__dirname, 'data', 'camarinesNorteMunicipalities.json'),
      path.join(__dirname, '..', 'main', 'data', 'camarinesNorteMunicipalities.json'),
      path.join(process.cwd(), 'src', 'main', 'data', 'camarinesNorteMunicipalities.json'),
    ];

    let geoJsonPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        geoJsonPath = p;
        break;
      }
    }

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
function pointInGeometry(
  lng: number,
  lat: number,
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon
): boolean {
  const point: [number, number] = [lng, lat];

  if (geometry.type === 'Polygon') {
    // For Polygon, coordinates is [exterior ring, ...hole rings]
    // We check if point is in exterior ring and not in any holes
    const exteriorRing = geometry.coordinates[0];
    if (!pointInPolygon(point, exteriorRing)) {
      return false;
    }
    // Check holes (if any)
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (pointInPolygon(point, geometry.coordinates[i])) {
        return false; // Point is in a hole
      }
    }
    return true;
  } else if (geometry.type === 'MultiPolygon') {
    // For MultiPolygon, check if point is in any of the polygons
    for (const polygonCoords of geometry.coordinates) {
      const exteriorRing = polygonCoords[0];
      if (pointInPolygon(point, exteriorRing)) {
        // Check holes
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
 * Get the municipality name for given coordinates using GeoJSON boundaries
 * @param lat Latitude
 * @param lng Longitude
 * @returns Municipality name or null if not found
 */
export function getMunicipalityFromCoordinates(lat: number, lng: number): string | null {
  const geoData = loadMunicipalityGeoData();

  if (geoData.features.length === 0) {
    // Fallback to bounding box method if GeoJSON not available
    return getMunicipalityFromBoundingBox(lat, lng);
  }

  for (const feature of geoData.features) {
    if (pointInGeometry(lng, lat, feature.geometry)) {
      return feature.properties.adm3_en;
    }
  }

  return null;
}

/**
 * Fallback bounding box method for municipality detection
 * Less accurate but works without GeoJSON data
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
  for (const [municipality, bounds] of Object.entries(municipalityBounds)) {
    if (lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng) {
      return municipality;
    }
  }
  return null;
}

/**
 * Check if coordinates fall within a specific municipality
 * @param lat Latitude
 * @param lng Longitude
 * @param municipalityName Name of the municipality to check
 * @returns true if coordinates are within the municipality
 */
export function isInMunicipality(lat: number, lng: number, municipalityName: string): boolean {
  const geoData = loadMunicipalityGeoData();

  if (geoData.features.length === 0) {
    // Fallback to bounding box
    const bounds = municipalityBounds[municipalityName];
    if (!bounds) return false;
    return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
  }

  // Find the feature for this municipality
  const feature = geoData.features.find(
    (f) => f.properties.adm3_en.toLowerCase() === municipalityName.toLowerCase()
  );

  if (!feature) {
    console.warn(`[GeoUtils] Municipality not found in GeoJSON: ${municipalityName}`);
    // Fallback to bounding box
    const bounds = municipalityBounds[municipalityName];
    if (!bounds) return false;
    return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
  }

  return pointInGeometry(lng, lat, feature.geometry);
}

/**
 * Get all municipalities that a point could belong to (for debugging/verification)
 */
export function getAllMatchingMunicipalities(lat: number, lng: number): string[] {
  const geoData = loadMunicipalityGeoData();
  const matches: string[] = [];

  for (const feature of geoData.features) {
    if (pointInGeometry(lng, lat, feature.geometry)) {
      matches.push(feature.properties.adm3_en);
    }
  }

  return matches;
}
