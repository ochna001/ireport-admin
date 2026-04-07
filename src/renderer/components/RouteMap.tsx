import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers as LayersIcon, Map as MapIcon, Globe, Info, Building2, MapPin as MapPinIcon, Navigation } from 'lucide-react';

const MAP_LAYERS = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
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
  google_terrain: {
    name: 'Google Terrain',
    url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  google_hybrid: {
    name: 'Google Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  }
};

// Fix for default marker icons in webpack/vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom Pins with divIcon to avoid 404s and for better style
const createPinIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-pin-marker',
    html: `
      <div style="position: relative; width: 32px; height: 32px;">
        <svg viewBox="0 0 384 512" style="width: 100%; height: 100%; fill: ${color}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
        </svg>
        <div style="
          position: absolute; 
          top: 45%; 
          left: 50%; 
          transform: translate(-50%, -50%); 
          color: white;
        ">
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

const incidentPin = createPinIcon('#dc2626');
const stationPin = createPinIcon('#2563eb');

interface RouteMapProps {
  incidentLat: number;
  incidentLng: number;
  incidentAddress?: string;
  stationLat?: number;
  stationLng?: number;
  stationName?: string;
  showRoute?: boolean;
  onRouteLoaded?: (distance: number, duration: number) => void;
}

// Component to fit bounds when route is shown
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, bounds]);
  return null;
}

export function RouteMap({
  incidentLat,
  incidentLng,
  incidentAddress,
  stationLat,
  stationLng,
  stationName,
  showRoute = false,
  onRouteLoaded
}: RouteMapProps) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<keyof typeof MAP_LAYERS>('osm');
  const [showLayerSelector, setShowLayerSelector] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Fetch route from OSRM when showRoute is enabled
  useEffect(() => {
    if (showRoute && stationLat && stationLng) {
      setLoading(true);
      setError(null);
      
      fetch(
        `https://router.project-osrm.org/route/v1/driving/${stationLng},${stationLat};${incidentLng},${incidentLat}?overview=full&geometries=geojson`
      )
        .then(res => res.json())
        .then(data => {
          if (data.routes && data.routes[0]) {
            const route = data.routes[0];
            // Convert GeoJSON coordinates [lng, lat] to Leaflet [lat, lng]
            const coords: [number, number][] = route.geometry.coordinates.map(
              (coord: [number, number]) => [coord[1], coord[0]]
            );
            setRouteCoords(coords);
            
            if (onRouteLoaded) {
              onRouteLoaded(route.distance / 1000, route.duration / 60);
            }
          } else {
            setError('No route found');
          }
        })
        .catch(err => {
          console.error('Failed to fetch route:', err);
          setError('Failed to load route');
        })
        .finally(() => setLoading(false));
    } else {
      setRouteCoords([]);
    }
  }, [showRoute, stationLat, stationLng, incidentLat, incidentLng, onRouteLoaded]);

  // Calculate bounds for the map
  const getBounds = (): L.LatLngBoundsExpression => {
    if (showRoute && stationLat && stationLng) {
      return [
        [Math.min(incidentLat, stationLat), Math.min(incidentLng, stationLng)],
        [Math.max(incidentLat, stationLat), Math.max(incidentLng, stationLng)]
      ];
    }
    // Default: just incident location with some padding
    return [
      [incidentLat - 0.005, incidentLng - 0.005],
      [incidentLat + 0.005, incidentLng + 0.005]
    ];
  };

  return (
    <div className="relative w-full h-[350px] rounded-lg overflow-hidden" style={{ zIndex: 0 }}>
      {/* Layer Selector */}
      <div className="absolute bottom-4 right-4 z-[1010] flex flex-col items-end gap-2">
        {showLayerSelector && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-2 min-w-[160px] animate-in fade-in slide-in-from-bottom-2">
            <div className="space-y-1">
              {(Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>).map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    setActiveLayer(key);
                    setShowLayerSelector(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeLayer === key 
                      ? 'bg-blue-600 text-white shadow-md' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {key === 'osm' && <MapIcon size={12} />}
                  {key.includes('google_road') && <Globe size={12} />}
                  {key.includes('satellite') && <Info size={12} />}
                  {key.includes('terrain') && <Building2 size={12} />}
                  {key.includes('hybrid') && <LayersIcon size={12} />}
                  {MAP_LAYERS[key].name}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => setShowLayerSelector(!showLayerSelector)}
          className={`p-2.5 rounded-full shadow-lg border transition-all ${
            showLayerSelector 
              ? 'bg-blue-600 text-white border-transparent' 
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-100 dark:border-gray-700 hover:bg-gray-50'
          }`}
          title="Change Map Layers"
        >
          <LayersIcon size={18} />
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-black/20 z-[1000] flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm">Loading route...</span>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-2 left-2 right-2 z-[1000] bg-red-100 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

    <div className="relative h-[300px] rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-inner">
      <MapContainer
        center={[incidentLat, incidentLng]}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        key={activeLayer}
      >
        <TileLayer
          attribution={MAP_LAYERS[activeLayer].attribution}
          url={MAP_LAYERS[activeLayer].url}
        />
        
        {/* Fit bounds when showing route */}
        <FitBounds bounds={getBounds()} />
        
        {/* Incident marker (red) */}
        <Marker position={[incidentLat, incidentLng]} icon={incidentPin}>
          <Popup>
            <div className="text-xs">
              <p className="font-bold">Incident Location</p>
              <p className="text-gray-500 mt-1">{incidentAddress}</p>
            </div>
          </Popup>
        </Marker>

        {stationLat && stationLng && stationPin && (
          <Marker position={[stationLat, stationLng]} icon={stationPin}>
            <Popup>
              <div className="text-xs">
                <p className="font-bold">Responding Station</p>
                <p className="text-gray-500 mt-1">{stationName || 'Base Station'}</p>
              </div>
            </Popup>
          </Marker>
        )}
        
        {/* Route polyline (blue) */}
        {showRoute && routeCoords.length > 0 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: '#2563eb',
              weight: 5,
              opacity: 0.8,
              lineCap: 'round',
              lineJoin: 'round'
            }}
          />
        )}
      </MapContainer>
    </div>
    </div>
  );
}

export default RouteMap;
