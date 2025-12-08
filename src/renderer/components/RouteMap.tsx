import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in webpack/vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icons
const incidentIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const stationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

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

      <MapContainer
        center={[incidentLat, incidentLng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Fit bounds when showing route */}
        <FitBounds bounds={getBounds()} />
        
        {/* Incident marker (red) */}
        <Marker position={[incidentLat, incidentLng]} icon={incidentIcon}>
          <Popup>
            <div className="text-sm">
              <strong className="text-red-600">📍 Incident Location</strong>
              {incidentAddress && <p className="mt-1 text-gray-600">{incidentAddress}</p>}
            </div>
          </Popup>
        </Marker>
        
        {/* Station marker (blue) - only show when route is enabled */}
        {showRoute && stationLat && stationLng && (
          <Marker position={[stationLat, stationLng]} icon={stationIcon}>
            <Popup>
              <div className="text-sm">
                <strong className="text-blue-600">🏢 {stationName || 'Station'}</strong>
                <p className="mt-1 text-gray-600">Response Unit Origin</p>
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
  );
}

export default RouteMap;
