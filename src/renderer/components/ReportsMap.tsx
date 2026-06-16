import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Polygon, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Filter,
  Flame,
  Layers as LayersIcon,
  MapPin,
  RefreshCw,
  Shield,
  Waves,
  X,
} from 'lucide-react';
import { renderToString } from 'react-dom/server';
import municipalityGeoData from '../data/camarinesNorteMunicipalities.json';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MAP_LAYERS = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  google_road: {
    name: 'Google Roadmap',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
  },
  google_satellite: {
    name: 'Google Satellite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
  },
  google_hybrid: {
    name: 'Google Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
  },
};

interface Incident {
  id: string;
  agency_type: string;
  status: string;
  description: string;
  latitude: number;
  longitude: number;
  location_address?: string;
  created_at: string;
  reporter_name?: string;
}

interface HotspotCluster {
  lat: number;
  lng: number;
  count: number;
  radius: number; // in meters
  agencies: Record<string, number>;
  statuses: Record<string, number>;
}

const normalizeAgency = (agency?: string) =>
  agency?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : agency?.toLowerCase();

// Auto-fit bounds on load
function FitBounds({ markers }: { markers: Incident[] }) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (markers.length > 0 && !hasFit.current) {
      const bounds = L.latLngBounds(markers.map((m) => [m.latitude, m.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      hasFit.current = true;
    }
  }, [markers, map]);
  return null;
}

export function ReportsMap() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgency, setFilterAgency] = useState({ pnp: true, bfp: true, mdrrmo: true });
  const [filterTime, setFilterTime] = useState<'7d' | '30d' | '90d' | '1y' | 'all'>('30d');
  const [activeLayer, setActiveLayer] = useState<keyof typeof MAP_LAYERS>('google_hybrid');
  const [showLayerSelector, setShowLayerSelector] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);

  useEffect(() => {
    loadIncidents();
  }, []);

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const response: any = await window.api.getIncidents({ limit: 500 });
      const data = Array.isArray(response) ? response : (response?.data || []);
      setIncidents(data.filter((i: any) => i.latitude && i.longitude));
    } catch (error) {
      console.error('Failed to load incidents for map:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      const agency = normalizeAgency(incident.agency_type);
      if (agency === 'pnp' && !filterAgency.pnp) return false;
      if (agency === 'bfp' && !filterAgency.bfp) return false;
      if (agency === 'mdrrmo' && !filterAgency.mdrrmo) return false;

      const createdDate = new Date(incident.created_at);
      const now = new Date();
      if (filterTime === '7d') {
        if (createdDate < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) return false;
      } else if (filterTime === '30d') {
        if (createdDate < new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) return false;
      } else if (filterTime === '90d') {
        if (createdDate < new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)) return false;
      } else if (filterTime === '1y') {
        if (createdDate < new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)) return false;
      }
      return true;
    });
  }, [incidents, filterAgency, filterTime]);

  // Compute hotspot clusters using simple grid-based clustering
  const hotspots = useMemo((): HotspotCluster[] => {
    if (filteredIncidents.length < 2) return [];

    const gridSize = 0.005; // ~500m grid cells
    const grid: Record<string, { incidents: Incident[]; latSum: number; lngSum: number }> = {};

    filteredIncidents.forEach((inc) => {
      const key = `${Math.floor(inc.latitude / gridSize)}_${Math.floor(inc.longitude / gridSize)}`;
      if (!grid[key]) grid[key] = { incidents: [], latSum: 0, lngSum: 0 };
      grid[key].incidents.push(inc);
      grid[key].latSum += inc.latitude;
      grid[key].lngSum += inc.longitude;
    });

    return Object.values(grid)
      .filter((cell) => cell.incidents.length >= 2)
      .map((cell) => {
        const count = cell.incidents.length;
        const agencies: Record<string, number> = {};
        const statuses: Record<string, number> = {};
        cell.incidents.forEach((inc) => {
          const ag = normalizeAgency(inc.agency_type)?.toUpperCase() || 'UNKNOWN';
          agencies[ag] = (agencies[ag] || 0) + 1;
          const st = inc.status || 'unknown';
          statuses[st] = (statuses[st] || 0) + 1;
        });
        return {
          lat: cell.latSum / count,
          lng: cell.lngSum / count,
          count,
          radius: Math.min(300 + count * 50, 800),
          agencies,
          statuses,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [filteredIncidents]);

  // Stats summary
  const stats = useMemo(() => {
    const byAgency: Record<string, number> = { pnp: 0, bfp: 0, mdrrmo: 0 };
    const byStatus: Record<string, number> = {};
    filteredIncidents.forEach((inc) => {
      const ag = normalizeAgency(inc.agency_type) || 'unknown';
      if (ag in byAgency) byAgency[ag]++;
      const st = inc.status || 'unknown';
      byStatus[st] = (byStatus[st] || 0) + 1;
    });
    return { total: filteredIncidents.length, byAgency, byStatus, hotspotCount: hotspots.length };
  }, [filteredIncidents, hotspots]);

  // Convert GeoJSON coordinates [lng, lat] to Leaflet [lat, lng] format
  const geoJsonToLatLng = (coords: number[][]): [number, number][] => {
    return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
  };

  // Compute per-municipality incident counts for boundary labels
  const municipalityIncidentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const features = (municipalityGeoData as any).features || [];

    filteredIncidents.forEach((inc) => {
      // Simple point-in-polygon check for each municipality
      for (const feature of features) {
        const name = feature.properties?.adm3_en;
        if (!name) continue;

        const geom = feature.geometry;
        let inside = false;

        if (geom.type === 'Polygon') {
          inside = pointInPolygon(inc.longitude, inc.latitude, geom.coordinates[0]);
        } else if (geom.type === 'MultiPolygon') {
          for (const poly of geom.coordinates) {
            if (pointInPolygon(inc.longitude, inc.latitude, poly[0])) {
              inside = true;
              break;
            }
          }
        }

        if (inside) {
          counts[name] = (counts[name] || 0) + 1;
          break;
        }
      }
    });
    return counts;
  }, [filteredIncidents]);

  // Ray-casting point-in-polygon
  function pointInPolygon(x: number, y: number, polygon: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const getMarkerIcon = (agency?: string) => {
    const ag = normalizeAgency(agency);
    const color = ag === 'pnp' ? '#2563eb' : ag === 'bfp' ? '#dc2626' : '#0891b2';
    const IconComponent = ag === 'pnp' ? Shield : ag === 'bfp' ? Flame : Waves;

    const html = renderToString(
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid white',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      >
        <IconComponent size={16} color="white" />
      </div>
    );

    return L.divIcon({
      html,
      className: 'custom-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  };

  const getHotspotColor = (count: number) => {
    if (count >= 5) return '#dc2626'; // red
    if (count >= 3) return '#f59e0b'; // amber
    return '#3b82f6'; // blue
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-gray-50 dark:bg-gray-900 rounded-xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading map data...</p>
        </div>
      </div>
    );
  }

  const layer = MAP_LAYERS[activeLayer];

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Mapped Incidents</span>
          </div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Hotspot Areas</span>
          </div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.hotspotCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-500 dark:text-gray-400">By Agency</span>
          </div>
          <div className="flex gap-3 text-sm font-medium">
            <span className="text-blue-600">PNP: {stats.byAgency.pnp}</span>
            <span className="text-red-600">BFP: {stats.byAgency.bfp}</span>
            <span className="text-cyan-600">MDRRMO: {stats.byAgency.mdrrmo}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Pending</span>
          </div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">
            {stats.byStatus['pending'] || 0}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          {/* Agency toggles */}
          <button
            onClick={() => setFilterAgency((p) => ({ ...p, pnp: !p.pnp }))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterAgency.pnp
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> PNP
          </button>
          <button
            onClick={() => setFilterAgency((p) => ({ ...p, bfp: !p.bfp }))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterAgency.bfp
                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            }`}
          >
            <Flame className="w-3.5 h-3.5" /> BFP
          </button>
          <button
            onClick={() => setFilterAgency((p) => ({ ...p, mdrrmo: !p.mdrrmo }))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterAgency.mdrrmo
                ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            }`}
          >
            <Waves className="w-3.5 h-3.5" /> MDRRMO
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1" />

          {/* Time filter */}
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={filterTime}
              onChange={(e) => setFilterTime(e.target.value as any)}
              className="text-xs bg-transparent border-none focus:ring-0 text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last year</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Heatmap toggle */}
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showHeatmap
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            Hotspots
          </button>

          {/* Boundaries toggle */}
          <button
            onClick={() => setShowBoundaries(!showBoundaries)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showBoundaries
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            Boundaries
          </button>

          {/* Layer selector */}
          <div className="relative">
            <button
              onClick={() => setShowLayerSelector(!showLayerSelector)}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <LayersIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
            {showLayerSelector && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[10000] min-w-[160px]">
                {Object.entries(MAP_LAYERS).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveLayer(key as keyof typeof MAP_LAYERS);
                      setShowLayerSelector(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      activeLayer === key
                        ? 'text-blue-600 font-medium'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {val.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={loadIncidents}
            className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 h-[550px] relative">
        <MapContainer
          center={[14.17, 122.95]}
          zoom={11}
          className="h-full w-full"
          zoomControl={true}
        >
          <TileLayer url={layer.url} attribution={layer.attribution} />
          <FitBounds markers={filteredIncidents} />

          {/* Municipality boundaries */}
          {showBoundaries &&
            (municipalityGeoData as any).features.map((feature: any) => {
              const name = feature.properties?.adm3_en;
              const geom = feature.geometry;
              const incidentCount = municipalityIncidentCounts[name] || 0;

              const renderPolygon = (coords: number[][], key: string) => {
                const positions = geoJsonToLatLng(coords);
                return (
                  <Polygon
                    key={key}
                    positions={positions}
                    pathOptions={{
                      color: incidentCount > 0 ? '#6366f1' : '#94a3b8',
                      weight: 2,
                      opacity: 0.8,
                      fillColor: incidentCount >= 5 ? '#dc2626' : incidentCount >= 3 ? '#f59e0b' : incidentCount >= 1 ? '#6366f1' : 'transparent',
                      fillOpacity: incidentCount > 0 ? 0.1 : 0,
                      dashArray: incidentCount === 0 ? '4 4' : undefined,
                    }}
                  >
                    <Tooltip
                      direction="center"
                      permanent={false}
                      className="municipality-tooltip"
                    >
                      <div className="text-xs font-medium">
                        <p className="font-bold">{name}</p>
                        <p>{incidentCount} incident{incidentCount !== 1 ? 's' : ''}</p>
                      </div>
                    </Tooltip>
                  </Polygon>
                );
              };

              if (geom.type === 'Polygon') {
                return renderPolygon(geom.coordinates[0], `boundary-${name}`);
              } else if (geom.type === 'MultiPolygon') {
                return geom.coordinates.map((poly: number[][][], i: number) =>
                  renderPolygon(poly[0], `boundary-${name}-${i}`)
                );
              }
              return null;
            })}

          {/* Hotspot circles */}
          {showHeatmap &&
            hotspots.map((spot, i) => (
              <Circle
                key={`hotspot-${i}`}
                center={[spot.lat, spot.lng]}
                radius={spot.radius}
                pathOptions={{
                  color: getHotspotColor(spot.count),
                  fillColor: getHotspotColor(spot.count),
                  fillOpacity: 0.2,
                  weight: 2,
                  opacity: 0.6,
                }}
              >
                <Popup>
                  <div className="text-xs min-w-[140px]">
                    <p className="font-bold text-sm mb-1">
                      Hotspot — {spot.count} incidents
                    </p>
                    <div className="space-y-0.5">
                      {Object.entries(spot.agencies).map(([ag, cnt]) => (
                        <p key={ag}>
                          {ag}: {cnt}
                        </p>
                      ))}
                    </div>
                    <hr className="my-1" />
                    <div className="space-y-0.5">
                      {Object.entries(spot.statuses).map(([st, cnt]) => (
                        <p key={st} className="capitalize">
                          {st}: {cnt}
                        </p>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Circle>
            ))}

          {/* Incident markers */}
          {filteredIncidents.map((incident) => (
            <Marker
              key={incident.id}
              position={[incident.latitude, incident.longitude]}
              icon={getMarkerIcon(incident.agency_type)}
              eventHandlers={{
                click: () => setSelectedIncident(incident),
              }}
            >
              <Popup>
                <div className="text-xs min-w-[180px]">
                  <p className="font-bold text-sm mb-1">
                    #{incident.id?.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="text-gray-600 mb-1">
                    {incident.description?.slice(0, 80) || 'No description'}
                    {(incident.description?.length || 0) > 80 ? '...' : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${
                        normalizeAgency(incident.agency_type) === 'pnp'
                          ? 'bg-blue-600'
                          : normalizeAgency(incident.agency_type) === 'bfp'
                          ? 'bg-red-600'
                          : 'bg-cyan-600'
                      }`}
                    >
                      {normalizeAgency(incident.agency_type)?.toUpperCase()}
                    </span>
                    <span className="capitalize text-gray-500">{incident.status}</span>
                  </div>
                  {incident.location_address && (
                    <p className="text-gray-500 mt-1 truncate">{incident.location_address}</p>
                  )}
                  <p className="text-gray-400 mt-1">
                    {new Date(incident.created_at).toLocaleDateString()}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Legend overlay */}
        <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-gray-200 dark:border-gray-700 z-[1000]">
          <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
            Legend
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-600" />
              <span className="text-[11px] text-gray-600 dark:text-gray-300">PNP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-600" />
              <span className="text-[11px] text-gray-600 dark:text-gray-300">BFP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-600" />
              <span className="text-[11px] text-gray-600 dark:text-gray-300">MDRRMO</span>
            </div>
            {showHeatmap && (
              <>
                <hr className="border-gray-200 dark:border-gray-600 my-1" />
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500/30 border border-blue-500" />
                  <span className="text-[11px] text-gray-600 dark:text-gray-300">2-3 incidents</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500/30 border border-amber-500" />
                  <span className="text-[11px] text-gray-600 dark:text-gray-300">3-5 incidents</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500" />
                  <span className="text-[11px] text-gray-600 dark:text-gray-300">5+ incidents</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsMap;
