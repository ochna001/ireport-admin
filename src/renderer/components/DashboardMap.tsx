import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Shield, Flame, Waves, HelpCircle, Filter, Calendar, Info, Clock, MapPin as MapPinIcon, Menu, Search, X, Building2, Phone, Layers as LayersIcon, Map as MapIcon, Globe } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import provinceMunicipalities from '../data/camarinesNorteMunicipalities.json';
import barangayBoundaries from '../data/camarinesNorteBarangays.json';
import { getAgencyPresentation } from '../utils/agencyPresentation';
import { getIncidentReference } from '../utils/incidentReference';

const PROVINCE_BOUNDS_PADDING = 0.08;
// Zoom threshold above which barangay boundaries + labels are drawn.
const BARANGAY_ZOOM_THRESHOLD = 13;

function AgencyPinIcon({ color, Icon }: { color: string; Icon: typeof Shield }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-7 w-6 shrink-0 items-center justify-center"
      style={{ color }}
    >
      <MapPinIcon className="absolute inset-0 h-7 w-6" fill="currentColor" strokeWidth={1.8} />
      <Icon className="relative z-[1] h-3 w-3 text-white" strokeWidth={2.6} />
    </span>
  );
}

function getProvinceMaskRings(): [number, number][][] {
  const rings: [number, number][][] = [];
  for (const feature of provinceMunicipalities.features) {
    const geometry = feature.geometry as any;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      const outerRing = polygon[0];
      if (outerRing?.length > 3) {
        rings.push(outerRing.map(([lng, lat]: number[]) => [lat, lng] as [number, number]));
      }
    }
  }
  return rings;
}

function ProvinceMask() {
  const maskRings = useMemo(() => getProvinceMaskRings(), []);
  const worldRing: [number, number][] = [
    [-90, -180], [-90, 180], [90, 180], [90, -180], [-90, -180],
  ];

  return (
    <Polygon
      positions={[worldRing, ...maskRings] as any}
      pathOptions={{ fillColor: '#0f172a', fillOpacity: 0.48, color: 'transparent', fillRule: 'evenodd' }}
    />
  );
}

function ProvinceBoundary({ fitCounter }: { fitCounter: number }) {
  const map = useMap();
  const boundary = useMemo(() => L.geoJSON(provinceMunicipalities as any), []);

  useEffect(() => {
    const bounds = boundary.getBounds();
    if (!bounds.isValid()) return;

    const paddedBounds = bounds.pad(PROVINCE_BOUNDS_PADDING);
    map.setMaxBounds(paddedBounds);
    map.fitBounds(bounds, { padding: [24, 24] });
    map.setMinZoom(map.getBoundsZoom(paddedBounds));
  }, [boundary, map]);

  useEffect(() => {
    if (fitCounter === 0) return;
    const bounds = boundary.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
  }, [boundary, fitCounter, map]);

  return (
    <GeoJSON
      data={provinceMunicipalities as any}
      style={() => ({
        color: '#f8fafc',
        weight: 1.5,
        opacity: 0.9,
        fillColor: '#0f766e',
        fillOpacity: 0.08,
      })}
    />
  );
}

// Barangay boundaries (PSA PSGC / NAMRIA via barangay-boundaries-repository, MIT).
// Rendered only when zoomed in to keep the province overview readable.
function BarangayBoundaries({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <GeoJSON
      data={barangayBoundaries as any}
      style={() => ({
        color: '#22d3ee',
        weight: 0.6,
        opacity: 0.5,
        fillColor: '#0f766e',
        fillOpacity: 0.03,
      })}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.ADM4_EN;
        if (name) {
          layer.bindTooltip(name, {
            sticky: true,
            direction: 'center',
            className: 'barangay-tooltip',
          });
        }
      }}
    />
  );
}

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
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  google_road: {
    name: 'Google Roadmap',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  google_satellite: {
    name: 'Google Satellite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  google_hybrid: {
    name: 'Google Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  esri_satellite: {
    name: 'Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri'
  }
};

// Component to handle auto-fitting bounds based on markers
function ChangeView({ markers, selectedItem, fitCounter }: { markers: any[], selectedItem: any, fitCounter: number }) {
  const map = useMap();
  const hasInitiallyFit = useRef(false);
  const prevMarkersCount = useRef(0);
  const prevFitCounter = useRef(0);

  useEffect(() => {
    // Only auto-fit if:
    // 1. We haven't done an initial fit yet
    // 2. OR the markers count increased (new incident)
    // 3. OR the user clicked the manual 'Overview' button
    // AND the user isn't currently inspecting a specific incident (unless manual fit)
    if (markers.length > 0) {
      const isNewIncident = markers.length > prevMarkersCount.current;
      const isManualFit = fitCounter > prevFitCounter.current;

      if (!hasInitiallyFit.current || isNewIncident || isManualFit) {
        if (!selectedItem || isManualFit) {
          const bounds = L.latLngBounds(markers.map(m => [m.latitude, m.longitude]));
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
          hasInitiallyFit.current = true;

          if (isManualFit) {
            // If they clicked overview, maybe clear the selection?
            // Actually, keep it but just pull back.
          }
        }
      }
    }
    prevMarkersCount.current = markers.length;
    prevFitCounter.current = fitCounter;
  }, [markers, map, selectedItem, fitCounter]);
  return null;
}

// Controller to handle programmatic map movements
function MapController({ selectedItem, mapZoom }: { selectedItem: any, mapZoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (selectedItem && selectedItem.latitude && selectedItem.longitude) {
      map.flyTo([selectedItem.latitude, selectedItem.longitude], mapZoom, {
        duration: 0.5,
        easeLinearity: 0.25
      });
    }
  }, [selectedItem, map, mapZoom]);
  return null;
}

// Component to track map zoom level
function ZoomHandler({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handleZoom = () => onZoomChange(map.getZoom());
    map.on('zoomend', handleZoom);
    return () => { map.off('zoomend', handleZoom); };
  }, [map, onZoomChange]);
  return null;
}

export function DashboardMap() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [showStations, setShowStations] = useState(false);
  const [filterAgency, setFilterAgency] = useState({ awaiting: true, pnp: true, bfp: true, mdrrmo: true });
  const [filterStatus, setFilterStatus] = useState<'active' | 'all'>('active');
  const [filterTime, setFilterTime] = useState<'24h' | 'today' | 'yesterday' | 'week' | 'month' | '90d' | 'year' | 'all'>('week');

  // Sidebar & Interactivity
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentZoom, setCurrentZoom] = useState(12);
  const [activeLayer, setActiveLayer] = useState<keyof typeof MAP_LAYERS>('google_hybrid');
  const [showLayerSelector, setShowLayerSelector] = useState(false);
  const [fitCounter, setFitCounter] = useState(0);

  useEffect(() => {
    loadMapData();
    const interval = setInterval(loadMapData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadMapData = async () => {
    try {
      // Fetch incidents and stations in parallel
      const [incidentData, stationsData] = await Promise.all([
        window.api.getIncidents({ limit: 100 }),
        window.api.getAgencyStations()
      ]);
      setIncidents(incidentData);
      setStations(stationsData);
    } catch (error) {
      console.error('Failed to load map data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter(incident => {
      // Agency Filter
      const agencyKey = getAgencyPresentation(incident.agency_type).key;
      if (!filterAgency[agencyKey]) return false;

      // Status Filter
      if (filterStatus === 'active') {
        const activeStatuses = ['pending', 'assigned', 'in_progress', 'responding'];
        if (!activeStatuses.includes(incident.status?.toLowerCase())) return false;
      }

      // Time Filter
      const createdDate = new Date(incident.created_at);
      const now = new Date();

      if (filterTime === '24h') {
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (createdDate < twentyFourHoursAgo) return false;
      } else if (filterTime === 'today') {
        if (createdDate.toDateString() !== now.toDateString()) return false;
      } else if (filterTime === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (createdDate.toDateString() !== yesterday.toDateString()) return false;
      } else if (filterTime === 'week') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (createdDate < oneWeekAgo) return false;
      } else if (filterTime === 'month') {
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (createdDate < oneMonthAgo) return false;
      } else if (filterTime === '90d') {
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        if (createdDate < ninetyDaysAgo) return false;
      } else if (filterTime === 'year') {
        if (createdDate.getFullYear() !== now.getFullYear()) return false;
      }
      // 'all' doesn't need a filter

      // Must have coordinates
      return incident.latitude && incident.longitude;
    });
  }, [incidents, filterAgency, filterStatus, filterTime]);

  const getIncidentIcon = (agency?: string, status?: string) => {
    const agencyPresentation = getAgencyPresentation(agency);
    const color = agencyPresentation.markerColor;
    const isActiveIncident = ['pending', 'assigned', 'in_progress', 'responding'].includes((status || '').toLowerCase());

    // Scale size based on zoom (larger for better visibility on satellite tiles)
    const size = currentZoom > 17 ? 24 : 38;
    const iconSize = currentZoom > 17 ? 12 : 18;

    // Shield (PNP), Flame (BFP), Waves (MDRRMO)
    let iconPath = '';
    if (agency?.toLowerCase() === 'pnp') {
      iconPath = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>';
    } else if (agency?.toLowerCase() === 'bfp') {
      iconPath = '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-13.5-3.5"></path>';
    } else if (agencyPresentation.key === 'mdrrmo') {
      iconPath = '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.6 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.6 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.6 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>';
    } else {
      iconPath = '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.75 2.75 0 1 1 4.7 1.95c-1.2 1.18-2.2 1.45-2.2 3.05"></path><path d="M12 17h.01"></path>';
    }

    return L.divIcon({
      className: 'custom-incident-marker',
      html: `
        <div style="position: relative; width: ${size}px; height: ${size}px;">
          <div class="${isActiveIncident ? 'incident-pulse-ring' : ''}" style="
            position: absolute;
            top: 22%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: ${Math.round(size * 0.6)}px;
            height: ${Math.round(size * 0.6)}px;
            border-radius: 9999px;
            border: 2px solid rgba(255, 255, 255, 0.95);
            background: ${color}55;
            box-shadow: 0 0 0 4px ${color}33;
            pointer-events: none;
          "></div>
          <svg viewBox="0 0 384 512" style="width: 100%; height: 100%; fill: ${color}; stroke: rgba(255,255,255,0.96); stroke-width: 20; filter: drop-shadow(0 5px 10px rgba(0,0,0,0.6));">
            <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
          </svg>
          <div style="
            position: absolute; 
            top: 45%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            color: white; 
            display: flex; 
            align-items: center; 
            justify-content: center;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
          </div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size]
    });
  };

  const getStationIcon = (agency?: string) => {
    const color = agency?.toLowerCase() === 'pnp' ? '#2563eb' :
      agency?.toLowerCase() === 'bfp' ? '#dc2626' : '#0891b2';

    // Scale size based on zoom (larger for better visibility on satellite tiles)
    const size = currentZoom > 17 ? 24 : 38;
    const iconSize = currentZoom > 17 ? 12 : 20;

    // Using a more robust divIcon with inline styles to ensure visibility
    return L.divIcon({
      className: 'custom-station-marker',
      html: `
        <div style="position: relative; width: ${size}px; height: ${size}px;">
          <div style="
            position: absolute;
            top: 22%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: ${Math.round(size * 0.6)}px;
            height: ${Math.round(size * 0.6)}px;
            border-radius: 9999px;
            border: 2px solid rgba(255, 255, 255, 0.95);
            background: ${color}55;
            box-shadow: 0 0 0 4px ${color}33;
            pointer-events: none;
          "></div>
          <svg viewBox="0 0 384 512" style="width: 100%; height: 100%; fill: ${color}; stroke: rgba(255,255,255,0.96); stroke-width: 20; filter: drop-shadow(0 5px 10px rgba(0,0,0,0.6));">
            <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
          </svg>
          <div style="
            position: absolute; 
            top: 45%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            color: white; 
            display: flex; 
            align-items: center; 
            justify-content: center;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
          </div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size]
    });
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'bg-yellow-500';
      case 'assigned': return 'bg-blue-500';
      case 'in_progress': return 'bg-orange-500';
      case 'responding': return 'bg-orange-500';
      case 'resolved': return 'bg-green-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col h-[700px] mb-8 relative">
      {/* Search and Filters Header */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Map Filters</span>
        </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5 sm:gap-3">
            {/* Agency Toggles */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900" role="group" aria-label="Incident agency filters">
              <span className="hidden px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 xl:inline">Filter pins</span>
            <button
              type="button"
              aria-pressed={filterAgency.awaiting}
              aria-label="Toggle incidents awaiting agency approval"
              onClick={() => setFilterAgency(prev => ({ ...prev, awaiting: !prev.awaiting }))}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${filterAgency.awaiting ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
            >
              <AgencyPinIcon color="#475569" Icon={HelpCircle} /> <span>Agency not assigned</span>
            </button>
            <button
              type="button"
              aria-pressed={filterAgency.pnp}
              aria-label="Toggle PNP incidents"
              onClick={() => setFilterAgency(prev => ({ ...prev, pnp: !prev.pnp }))}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${filterAgency.pnp ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200 dark:bg-slate-800 dark:text-blue-300 dark:ring-blue-900' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
            >
              <AgencyPinIcon color="#2563eb" Icon={Shield} /> <span>PNP</span>
            </button>
            <button
              type="button"
              aria-pressed={filterAgency.bfp}
              aria-label="Toggle BFP incidents"
              onClick={() => setFilterAgency(prev => ({ ...prev, bfp: !prev.bfp }))}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${filterAgency.bfp ? 'bg-white text-red-700 shadow-sm ring-1 ring-red-200 dark:bg-slate-800 dark:text-red-300 dark:ring-red-900' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
            >
              <AgencyPinIcon color="#dc2626" Icon={Flame} /> <span>BFP</span>
            </button>
            <button
              type="button"
              aria-pressed={filterAgency.mdrrmo}
              aria-label="Toggle MDRRMO incidents"
              onClick={() => setFilterAgency(prev => ({ ...prev, mdrrmo: !prev.mdrrmo }))}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${filterAgency.mdrrmo ? 'bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-200 dark:bg-slate-800 dark:text-cyan-300 dark:ring-cyan-900' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
            >
              <AgencyPinIcon color="#0891b2" Icon={Waves} /> <span>MDRRMO</span>
            </button>
          </div>

          {/* Station Toggle */}
          <button
            type="button"
            aria-pressed={showStations}
            aria-label="Toggle agency stations"
            onClick={() => setShowStations(!showStations)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${showStations
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
          >
            <Building2 size={14} /> Stations
          </button>

          {/* Fit Overview Button */}
          <button
            type="button"
            aria-label="Fit map to Camarines Norte province"
            onClick={() => {
              setSelectedItem(null);
              setFitCounter(prev => prev + 1);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            title="Show the complete Camarines Norte province"
          >
            <MapIcon size={14} /> Overview
          </button>

          {/* Status Select */}
          <div className="flex items-center gap-2">
            <Info size={16} className="text-slate-400" />
            <select
              aria-label="Incident status filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="text-xs font-medium bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none dark:text-white"
            >
              <option value="active">Active Reports Only</option>
              <option value="all">All Reports</option>
            </select>
          </div>

          {/* Time Limit */}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
              <select
                aria-label="Incident time filter"
                value={filterTime}
              onChange={(e) => setFilterTime(e.target.value as any)}
              className="text-xs font-medium bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none dark:text-white"
            >
              <option value="24h">Past 24 Hours</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Past 7 Days</option>
              <option value="month">Past 30 Days</option>
              <option value="90d">Past 90 Days</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Map Area */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 z-[1000] flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          <MapContainer
            center={[14.1122, 122.9553]} // Default Camarines Norte
            zoom={10}
            minZoom={9}
            maxBoundsViscosity={0.85}
            style={{ height: '100%', width: '100%' }}
            key={activeLayer} // Re-render when layer changes for clean swap
          >
            <TileLayer
              attribution={MAP_LAYERS[activeLayer].attribution}
              url={MAP_LAYERS[activeLayer].url}
            />

            <ProvinceBoundary fitCounter={fitCounter} />
            <ProvinceMask />
            <BarangayBoundaries visible={currentZoom >= BARANGAY_ZOOM_THRESHOLD} />
            <MapController selectedItem={selectedItem} mapZoom={18} />
            <ZoomHandler onZoomChange={setCurrentZoom} />

            {/* Station Markers */}
            {showStations && stations.filter(s => {
              const agency = s.agencies?.short_name || (s.agency_id === 1 ? 'PNP' : s.agency_id === 2 ? 'BFP' : 'MDRRMO');
              const isAgencyOn = (agency === 'PNP' && filterAgency.pnp) ||
                (agency === 'BFP' && filterAgency.bfp) ||
                (agency === 'MDRRMO' && filterAgency.mdrrmo);
              return isAgencyOn;
            }).map(station => {
              const agencyShortName = station.agencies?.short_name || (station.agency_id === 1 ? 'PNP' : station.agency_id === 2 ? 'BFP' : 'MDRRMO');
              return (
                <Marker
                  key={`station-${station.id}`}
                  position={[station.latitude, station.longitude]}
                  icon={getStationIcon(agencyShortName)}
                  eventHandlers={{
                    click: () => setSelectedItem(station)
                  }}
                >
                  <Popup>
                    <div className="min-w-[200px] p-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-1.5 rounded-lg text-white ${(station.agencies?.short_name === 'PNP' || station.agency_id === 1) ? 'bg-blue-600' :
                          (station.agencies?.short_name === 'BFP' || station.agency_id === 2) ? 'bg-red-600' : 'bg-cyan-600'
                          }`}>
                          <Building2 size={14} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 leading-tight">{station.name}</h4>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">
                            {station.agencies?.short_name || (station.agency_id === 1 ? 'PNP' : station.agency_id === 2 ? 'BFP' : 'MDRRMO')} Base Station
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100">
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                          <MapPinIcon size={12} className="mt-0.5 shrink-0" />
                          <span>{station.address || 'Address unlisted'}</span>
                        </div>
                        {station.contact_number && (
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Phone size={12} />
                            <span>{station.contact_number}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Incident Markers */}
            {filteredIncidents.map(incident => (
              <Marker
                key={incident.id}
                position={[incident.latitude, incident.longitude]}
                icon={getIncidentIcon(incident.agency_type, incident.status)}
                eventHandlers={{
                  click: () => setSelectedItem(incident)
                }}
              >
                <Popup>
                  <div className="min-w-[200px] p-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded text-white ${getStatusColor(incident.status)}`}>
                        {incident.status?.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {getIncidentReference(incident)}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 mb-1 leading-tight">
                      {incident.description}
                    </h4>
                    <div className="space-y-1.5 mt-2">
                      <div className="flex items-start gap-2 text-xs text-slate-700">
                        <HelpCircle size={12} className="mt-0.5 shrink-0" />
                        <div>
                          <span className="font-semibold">{getAgencyPresentation(incident.agency_type).fullLabel}</span>
                          {!getAgencyPresentation(incident.agency_type).isApproved && incident.recommended_agency_type && (
                            <span className="block text-blue-700">AI recommends {getAgencyPresentation(incident.recommended_agency_type).shortLabel}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <MapPinIcon size={12} />
                        <span className="truncate">{incident.location_address || 'Address unlisted'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Clock size={12} />
                        <span>{new Date(incident.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => window.location.hash = `#/incidents/${incident.id}`}
                      className="w-full mt-3 bg-blue-600 text-white text-xs font-bold py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      View Incident Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Layer Selector */}
          <div className="absolute bottom-4 right-4 z-[1010] flex flex-col items-end gap-2">
            {showLayerSelector && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 p-2 min-w-[180px] animate-in fade-in slide-in-from-bottom-2">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase px-2 mb-1.5 tracking-wider">Map Providers</p>
                <div className="space-y-1">
                  {(Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>).map((key) => (
                    <button
                      type="button"
                      aria-pressed={activeLayer === key}
                      key={key}
                      onClick={() => {
                        setActiveLayer(key);
                        setShowLayerSelector(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${activeLayer === key
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                      {key === 'osm' && <MapIcon size={14} />}
                      {key.includes('google_road') && <Globe size={14} />}
                      {key.includes('satellite') && <Info size={14} />}
                      {key.includes('terrain') && <Building2 size={14} />}
                      {key.includes('hybrid') && <LayersIcon size={14} />}
                      {MAP_LAYERS[key].name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              aria-label="Change map layer"
              onClick={() => setShowLayerSelector(!showLayerSelector)}
              className={`p-3 rounded-full shadow-lg border transition-all ${showLayerSelector
                ? 'bg-blue-600 text-white border-transparent rotate-90'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-700 hover:bg-slate-50'
                }`}
              title="Change Map Layers"
            >
              <LayersIcon size={20} />
            </button>
          </div>

          {/* Sidebar Toggle Button */}
          <button
            type="button"
            aria-label={isSidebarOpen ? 'Hide report list' : 'Show report list'}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`absolute top-4 right-4 z-[1010] bg-white dark:bg-slate-800 p-2 rounded-lg shadow-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}
            title={isSidebarOpen ? "Hide Report List" : "Show Report List"}
          >
            {isSidebarOpen ? <X size={20} className="text-slate-600 dark:text-slate-300" /> : <Menu size={20} className="text-slate-600 dark:text-slate-300" />}
          </button>

          {/* Results Info Overlay */}
          {!isSidebarOpen && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-100 dark:border-slate-700 px-3 py-1.5 rounded-lg shadow-sm">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Showing {filteredIncidents.length} incidents on map
              </p>
            </div>
          )}

          {/* Sidebar Panel - Instant Show/Hide Overlay */}
          {isSidebarOpen && (
            <aside
              className="absolute top-0 right-0 bottom-0 w-[350px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-l border-slate-100 dark:border-slate-700 flex flex-col z-[1005] shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    List of Reports
                    <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] px-2 py-0.5 rounded-full">
                      {filteredIncidents.length}
                    </span>
                  </h3>
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by ID or details..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {filteredIncidents
                  .filter(i =>
                    i.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    i.description.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(incident => (
                    <button
                      type="button"
                      key={incident.id}
                      onClick={() => setSelectedItem(incident)}
                      className={`w-full p-3 text-left rounded-xl border border-transparent transition-all cursor-pointer hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedItem?.id === incident.id ? 'bg-white dark:bg-slate-800 border-blue-500/50 shadow-sm' : 'bg-white/40 dark:bg-white/5'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          {incident.agency_type?.toLowerCase() === 'pnp' && <Shield size={12} className="text-blue-600" />}
                          {incident.agency_type?.toLowerCase() === 'bfp' && <Flame size={12} className="text-red-500" />}
                          {incident.agency_type?.toLowerCase() === 'mdrrmo' && <Waves size={12} className="text-cyan-500" />}
                          {!getAgencyPresentation(incident.agency_type).isApproved && <HelpCircle size={12} className="text-slate-600 dark:text-slate-300" />}
                          <span className="text-[10px] font-mono font-bold text-slate-500">
                            {getIncidentReference(incident)}
                          </span>
                        </div>
                        <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded text-white ${getStatusColor(incident.status)}`}>
                          {incident.status?.replace('_', ' ')}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-800 dark:text-white line-clamp-2 leading-snug mb-2">
                        {incident.description}
                      </p>

                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${getAgencyPresentation(incident.agency_type).badgeClass}`}>
                          {getAgencyPresentation(incident.agency_type).shortLabel}
                        </span>
                        {!getAgencyPresentation(incident.agency_type).isApproved && incident.recommended_agency_type && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            AI suggests {getAgencyPresentation(incident.recommended_agency_type).shortLabel}
                          </span>
                        )}
                        {(incident.triage_severity || incident.triage_urgency) && (
                          <span className="text-[9px] font-medium text-slate-500">
                            {incident.triage_severity ? `Severity ${incident.triage_severity}` : ''}{incident.triage_severity && incident.triage_urgency ? ' · ' : ''}{incident.triage_urgency || ''}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-1 max-w-[150px]">
                          <MapPinIcon size={10} className="shrink-0" />
                          <span className="truncate">{incident.location_address || 'CamNorte'}</span>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
