import {
  AlertCircle,
  Building2,
  CheckCircle,
  Edit,
  Flame,
  Loader2,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Truck,
  Users,
  Waves,
  X
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionScope, isStationScoped } from '../utils/sessionScope';

// Google Maps API Key from main process
const GOOGLE_MAPS_API_KEY = 'AIzaSyBuylnOdkYntsIFYVDbsQFemeyqya1TaTc';

// Extend Window interface for Google Maps
declare global {
  interface Window {
    google?: {
      maps: typeof google.maps;
    };
  }
}

// Google Maps type declarations (using new APIs)
declare namespace google.maps {
  class Map {
    constructor(element: HTMLElement, options: MapOptions);
    setCenter(latLng: LatLngLiteral): void;
    setZoom(zoom: number): void;
    addListener(event: string, handler: (e: MapMouseEvent) => void): void;
  }
  
  // New AdvancedMarkerElement API
  namespace marker {
    class AdvancedMarkerElement {
      constructor(options: AdvancedMarkerOptions);
      position: LatLngLiteral | null;
      map: Map | null;
      gmpDraggable: boolean;
      addListener(event: string, handler: (e?: any) => void): void;
    }
    
    interface AdvancedMarkerOptions {
      position: LatLngLiteral;
      map: Map;
      gmpDraggable?: boolean;
      title?: string;
    }
  }
  
  class Geocoder {
    geocode(request: GeocoderRequest): Promise<GeocoderResponse>;
  }
  
  // New PlaceAutocompleteElement API
  namespace places {
    class PlaceAutocompleteElement extends HTMLElement {
      constructor(options?: PlaceAutocompleteOptions);
    }
    
    interface PlaceAutocompleteOptions {
      componentRestrictions?: { country: string | string[] };
    }
    
    interface PlaceResult {
      displayName?: string;
      formattedAddress?: string;
      location?: LatLng;
    }
  }
  
  interface MapOptions {
    center: LatLngLiteral;
    zoom: number;
    mapId?: string;
    mapTypeControl?: boolean;
    streetViewControl?: boolean;
    fullscreenControl?: boolean;
  }
  
  interface LatLngLiteral {
    lat: number;
    lng: number;
  }
  
  interface LatLng {
    lat(): number;
    lng(): number;
  }
  
  interface MapMouseEvent {
    latLng: LatLng | null;
  }
  
  interface GeocoderRequest {
    location: LatLngLiteral;
  }
  
  interface GeocoderResponse {
    results: GeocoderResult[];
  }
  
  interface GeocoderResult {
    formatted_address: string;
    geometry: {
      location: LatLng;
    };
  }
}

interface Agency {
  id: number;
  name: string;
  short_name: string;
}

interface Station {
  id: number;
  agency_id: number;
  name: string;
  latitude: number;
  longitude: number;
  contact_number: string | null;
  address: string | null;
  agencies?: Agency;
}

interface Resource {
  id: number;
  station_id: number;
  name: string;
  type: 'vehicle' | 'equipment' | 'personnel';
  status: 'available' | 'deployed' | 'maintenance';
  description: string | null;
}

type TabType = 'agencies' | 'stations' | 'resources';

function Agencies() {
  const scope = getSessionScope();
  const isAdmin = scope.role === 'Admin';
  const stationScopeActive = isStationScoped(scope);
  // Station-scoped users start on stations tab, admins start on agencies
  const [activeTab, setActiveTab] = useState<TabType>(stationScopeActive ? 'stations' : 'agencies');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  
  // Modal states
  const [showStationModal, setShowStationModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  
  // Toast notification state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [agenciesData, stationsData, resourcesData] = await Promise.all([
        window.api.getAgencies(),
        window.api.getAgencyStations(),
        window.api.getResources?.() || Promise.resolve([])
      ]);
      setAgencies(agenciesData);
      setStations(stationsData);
      setResources(resourcesData);
    } catch (error: any) {
      console.error('Failed to load data:', error);
      setLoadError(error.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getAgencyIcon = (shortName: string) => {
    switch (shortName) {
      case 'PNP': return <Shield className="w-5 h-5" />;
      case 'BFP': return <Flame className="w-5 h-5" />;
      case 'PDRRMO': return <Waves className="w-5 h-5" />;
      default: return <Building2 className="w-5 h-5" />;
    }
  };

  const getAgencyColor = (shortName: string) => {
    switch (shortName) {
      case 'PNP': return 'bg-blue-500';
      case 'BFP': return 'bg-red-500';
      case 'PDRRMO': return 'bg-teal-500';
      default: return 'bg-gray-500';
    }
  };

  const getAgencyBgColor = (shortName: string) => {
    switch (shortName) {
      case 'PNP': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'BFP': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'PDRRMO': return 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800';
      default: return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'deployed': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'maintenance': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredStations = stations.filter(station => {
    // Scope filter
    if (!isAdmin) {
      if (scope.stationId && station.id !== scope.stationId) return false;
      if (scope.agencyId && station.agency_id !== scope.agencyId) return false;
    }

    const matchesSearch = station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      station.address?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAgency = !agencyFilter || station.agency_id.toString() === agencyFilter;
    return matchesSearch && matchesAgency;
  });

  const stationsForModal = stationScopeActive && scope.stationId
    ? stations.filter((station) => station.id === scope.stationId)
    : stations;

  const filteredResources = resources.filter(resource => {
    const station = stations.find(s => s.id === resource.station_id);
    
    // Scope filter
    if (!isAdmin) {
      if (scope.stationId && resource.station_id !== scope.stationId) return false;
      if (scope.agencyId && station?.agency_id !== scope.agencyId) return false;
    }

    const matchesSearch = resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAgency = !agencyFilter || station?.agency_id.toString() === agencyFilter;
    return matchesSearch && matchesAgency;
  });

  // Station handlers
  const handleAddStation = () => {
    setEditingStation(null);
    setShowStationModal(true);
  };

  const handleEditStation = (station: Station) => {
    setEditingStation(station);
    setShowStationModal(true);
  };

  const handleSaveStation = async (data: Partial<Station>) => {
    try {
      if (editingStation) {
        await window.api.updateStation({ id: editingStation.id, updates: data });
        showToast('success', 'Station updated successfully');
      } else {
        await window.api.createStation(data);
        showToast('success', 'Station created successfully');
      }
      setShowStationModal(false);
      setEditingStation(null);
      loadData();
    } catch (error: any) {
      console.error('Failed to save station:', error);
      showToast('error', error.message || 'Failed to save station');
      throw error; // Re-throw to let modal handle it
    }
  };

  const handleDeleteStation = async (id: number) => {
    const station = stations.find(s => s.id === id);
    const stationResources = resources.filter(r => r.station_id === id);
    
    if (stationResources.length > 0) {
      showToast('error', `Cannot delete station with ${stationResources.length} resource(s). Remove resources first.`);
      return;
    }
    
    if (!confirm(`Are you sure you want to delete "${station?.name}"?`)) return;
    
    try {
      await window.api.deleteStation(id);
      showToast('success', 'Station deleted successfully');
      loadData();
    } catch (error: any) {
      console.error('Failed to delete station:', error);
      showToast('error', error.message || 'Failed to delete station');
    }
  };

  // Resource handlers
  const handleAddResource = () => {
    if (stations.length === 0) {
      showToast('error', 'Please create a station first before adding resources');
      return;
    }
    setEditingResource(null);
    setShowResourceModal(true);
  };

  const handleEditResource = (resource: Resource) => {
    setEditingResource(resource);
    setShowResourceModal(true);
  };

  const handleSaveResource = async (data: Partial<Resource>) => {
    try {
      if (editingResource) {
        await window.api.updateResource({ id: editingResource.id, updates: data });
        showToast('success', 'Resource updated successfully');
      } else {
        await window.api.createResource(data);
        showToast('success', 'Resource created successfully');
      }
      setShowResourceModal(false);
      setEditingResource(null);
      loadData();
    } catch (error: any) {
      console.error('Failed to save resource:', error);
      showToast('error', error.message || 'Failed to save resource');
      throw error; // Re-throw to let modal handle it
    }
  };

  const handleDeleteResource = async (id: number) => {
    const resource = resources.find(r => r.id === id);
    if (!confirm(`Are you sure you want to delete "${resource?.name}"?`)) return;
    
    try {
      await window.api.deleteResource(id);
      showToast('success', 'Resource deleted successfully');
      loadData();
    } catch (error: any) {
      console.error('Failed to delete resource:', error);
      showToast('error', error.message || 'Failed to delete resource');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show error state if data failed to load
  if (loadError) {
    return (
      <div className="p-6 dark:bg-gray-950 min-h-full">
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Failed to Load Data</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">{loadError}</p>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 dark:bg-gray-950 min-h-full">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg transition-all ${
          toast.type === 'success' 
            ? 'bg-green-600 text-white' 
            : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Station Scope Info Banner */}
      {stationScopeActive && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-100">
          <strong>Station view:</strong> {scope.stationName || `Station ${scope.stationId}`}
          {scope.stationMunicipality && <span> • {scope.stationMunicipality}</span>}
          <span className="block mt-1 text-blue-600 dark:text-blue-300">Showing only your station's information and resources.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            {stationScopeActive ? 'My Station' : 'Agency Management'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {stationScopeActive 
              ? 'View your station information and resources'
              : 'Manage agencies, stations, and resources'
            }
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors dark:text-white"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        {!stationScopeActive && (
          <button
            onClick={() => setActiveTab('agencies')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'agencies'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Agencies
            </div>
          </button>
        )}
        <button
          onClick={() => setActiveTab('stations')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'stations'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Stations ({stations.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('resources')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'resources'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4" />
            Resources ({resources.length})
          </div>
        </button>
      </div>

      {/* Agencies Tab */}
      {activeTab === 'agencies' && (
        <div className="grid grid-cols-3 gap-6">
          {agencies
            .filter(agency => !scope.agencyId || agency.id === scope.agencyId)
            .map((agency) => {
            const stationCount = stations.filter(s => s.agency_id === agency.id).length;
            const resourceCount = resources.filter(r => {
              const station = stations.find(s => s.id === r.station_id);
              return station?.agency_id === agency.id;
            }).length;
            const availableResources = resources.filter(r => {
              const station = stations.find(s => s.id === r.station_id);
              return station?.agency_id === agency.id && r.status === 'available';
            }).length;

            return (
              <div
                key={agency.id}
                className={`rounded-xl p-6 border ${getAgencyBgColor(agency.short_name)}`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${getAgencyColor(agency.short_name)} flex items-center justify-center text-white`}>
                    {getAgencyIcon(agency.short_name)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white">{agency.short_name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{agency.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
                      <MapPin className="w-4 h-4" />
                      Stations
                    </div>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{stationCount}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
                      <Truck className="w-4 h-4" />
                      Resources
                    </div>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{resourceCount}</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Available Resources</span>
                    <span className="font-medium text-green-600">{availableResources} / {resourceCount}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stations Tab */}
      {activeTab === 'stations' && (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[250px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search stations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
              {!stationScopeActive && (
                <select
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value="">All Agencies</option>
                  {agencies.map(agency => (
                    <option key={agency.id} value={agency.id}>{agency.short_name}</option>
                  ))}
                </select>
              )}
              {!stationScopeActive && (
                <button
                  onClick={handleAddStation}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Station
                </button>
              )}
            </div>
          </div>

          {/* Stations Grid */}
          <div className="grid grid-cols-2 gap-4">
            {filteredStations.length === 0 ? (
              <div className="col-span-2 bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
                <MapPin className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No stations found</p>
                <button
                  onClick={handleAddStation}
                  className="mt-4 text-blue-600 hover:underline"
                >
                  Add your first station
                </button>
              </div>
            ) : (
              filteredStations.map((station) => {
                const agency = agencies.find(a => a.id === station.agency_id);
                const stationResources = resources.filter(r => r.station_id === station.id);
                
                return (
                  <div
                    key={station.id}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${getAgencyColor(agency?.short_name || '')} flex items-center justify-center text-white`}>
                          {getAgencyIcon(agency?.short_name || '')}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-800 dark:text-white">{station.name}</h3>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{agency?.short_name}</span>
                        </div>
                      </div>
                      {!stationScopeActive && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditStation(station)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleDeleteStation(station.id)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>

                    {station.address && (
                      <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{station.address}</span>
                      </div>
                    )}

                    {station.contact_number && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                        <Phone className="w-4 h-4" />
                        <span>{station.contact_number}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <Truck className="w-4 h-4" />
                        <span>{stationResources.length} resources</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-green-600">{stationResources.filter(r => r.status === 'available').length} available</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Resources Tab */}
      {activeTab === 'resources' && (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[250px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search resources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
              {!stationScopeActive && (
                <select
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value="">All Agencies</option>
                  {agencies.map(agency => (
                    <option key={agency.id} value={agency.id}>{agency.short_name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={handleAddResource}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Resource
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">{resources.length}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Resources</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">
                    {resources.filter(r => r.status === 'available').length}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Available</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">
                    {resources.filter(r => r.status === 'deployed').length}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Deployed</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">
                    {resources.filter(r => r.status === 'maintenance').length}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Maintenance</p>
                </div>
              </div>
            </div>
          </div>

          {/* Resources Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Resource</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Type</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Station</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredResources.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      No resources found
                    </td>
                  </tr>
                ) : (
                  filteredResources.map((resource) => {
                    const station = stations.find(s => s.id === resource.station_id);
                    const agency = agencies.find(a => a.id === station?.agency_id);
                    
                    return (
                      <tr key={resource.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg ${getAgencyColor(agency?.short_name || '')} flex items-center justify-center text-white`}>
                              <Truck className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white">{resource.name}</p>
                              {resource.description && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">{resource.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="capitalize text-gray-700 dark:text-gray-300">{resource.type}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getAgencyColor(agency?.short_name || '')}`}></div>
                            <span className="text-gray-700 dark:text-gray-300">{station?.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(resource.status)}`}>
                            {resource.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEditResource(resource)}
                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                              <Edit className="w-4 h-4 text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleDeleteResource(resource.id)}
                              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Station Modal */}
      {showStationModal && (
        <StationModal
          station={editingStation}
          agencies={agencies}
          onClose={() => {
            setShowStationModal(false);
            setEditingStation(null);
          }}
          onSave={handleSaveStation}
        />
      )}

      {/* Resource Modal */}
      {showResourceModal && (
        <ResourceModal
          resource={editingResource}
          stations={stationsForModal}
          agencies={agencies}
          defaultStationId={stationScopeActive ? scope.stationId : undefined}
          onClose={() => {
            setShowResourceModal(false);
            setEditingResource(null);
          }}
          onSave={handleSaveResource}
        />
      )}
    </div>
  );
}

// Station Modal Component with Google Maps Picker (using new APIs)
function StationModal({
  station,
  agencies,
  onClose,
  onSave
}: {
  station: Station | null;
  agencies: Agency[];
  onClose: () => void;
  onSave: (data: Partial<Station>) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    agency_id: station?.agency_id?.toString() || '',
    name: station?.name || '',
    address: station?.address || '',
    contact_number: station?.contact_number || '',
    latitude: station?.latitude || 0,
    longitude: station?.longitude || 0,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [useManualEntry, setUseManualEntry] = useState(false);

  // Default center: Daet, Camarines Norte
  const defaultCenter = { lat: 14.1122, lng: 122.9553 };

  // Load Google Maps Script with new libraries
  useEffect(() => {
    const loadGoogleMaps = () => {
      // Check if already loaded
      if (window.google?.maps) {
        initializeMap();
        return;
      }

      const existingScript = document.getElementById('google-maps-script');
      if (existingScript) {
        // Script exists, wait for it to load or check if already loaded
        if (window.google?.maps) {
          initializeMap();
        } else {
          existingScript.addEventListener('load', () => {
            setTimeout(initializeMap, 200);
          });
          // Also set a timeout in case the script already loaded
          setTimeout(() => {
            if (window.google?.maps) {
              initializeMap();
            }
          }, 500);
        }
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      // Load with loading=async for best practice, and callback
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,marker&loading=async&callback=Function.prototype`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setTimeout(initializeMap, 200);
      };
      script.onerror = () => {
        setMapError('Failed to load Google Maps. You can enter coordinates manually.');
        setMapLoading(false);
        setUseManualEntry(true);
      };
      document.head.appendChild(script);
    };

    // Set a timeout to fallback to manual entry if map doesn't load
    const fallbackTimeout = setTimeout(() => {
      if (mapLoading && !window.google?.maps) {
        setMapError('Google Maps is taking too long to load. You can enter coordinates manually.');
        setMapLoading(false);
        setUseManualEntry(true);
      }
    }, 10000);

    loadGoogleMaps();

    return () => clearTimeout(fallbackTimeout);
  }, []);

  const initializeMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;

    try {
      const initialCenter = formData.latitude && formData.longitude
        ? { lat: formData.latitude, lng: formData.longitude }
        : defaultCenter;

      // Create map with mapId for AdvancedMarkerElement support
      const map = new google.maps.Map(mapRef.current, {
        center: initialCenter,
        zoom: 15,
        mapId: 'DEMO_MAP_ID', // Required for AdvancedMarkerElement
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      mapInstanceRef.current = map;

      // Create AdvancedMarkerElement (new API)
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: initialCenter,
        map,
        gmpDraggable: true,
        title: 'Station Location',
      });

      markerRef.current = marker;

      // Update form when marker is dragged
      marker.addListener('dragend', () => {
        const position = marker.position;
        if (position) {
          updateLocationFromCoords(position.lat, position.lng);
        }
      });

      // Update marker when map is clicked
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          marker.position = { lat, lng };
          updateLocationFromCoords(lat, lng);
        }
      });

      setMapLoading(false);
      setMapError(null);
    } catch (err: any) {
      console.error('Map initialization error:', err);
      // Check for API not activated error
      if (err.message?.includes('ApiNotActivatedMapError') || err.toString().includes('ApiNotActivatedMapError')) {
        setMapError('Google Maps API is not activated. Please enable it in Google Cloud Console or use manual entry.');
      } else {
        setMapError('Failed to initialize map. You can enter coordinates manually.');
      }
      setMapLoading(false);
      setUseManualEntry(true);
    }
  }, [formData.latitude, formData.longitude]);

  // Listen for Google Maps API errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message?.includes('Google Maps') || event.message?.includes('ApiNotActivatedMapError')) {
        setMapError('Google Maps API error. You can enter coordinates manually.');
        setMapLoading(false);
        setUseManualEntry(true);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  // Handle search using Geocoding API (simpler alternative to deprecated Autocomplete)
  const handleSearch = async () => {
    if (!searchQuery.trim() || !window.google?.maps) return;
    
    try {
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({ 
        address: searchQuery + ', Philippines'
      } as any);
      
      if (response.results[0]) {
        const location = response.results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setCenter({ lat, lng });
          mapInstanceRef.current.setZoom(17);
          markerRef.current.position = { lat, lng };
        }
        
        setFormData(prev => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          address: response.results[0].formatted_address
        }));
        
        setErrors(prev => ({ ...prev, location: '' }));
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
  };

  const updateLocationFromCoords = async (lat: number, lng: number) => {
    setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
    setErrors(prev => ({ ...prev, location: '' }));

    // Reverse geocode to get address
    try {
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({ location: { lat, lng } });
      if (response.results[0]) {
        setFormData(prev => ({ ...prev, address: response.results[0].formatted_address }));
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
  };

  // Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.agency_id) {
      newErrors.agency_id = 'Please select an agency';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Station name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Station name must be at least 3 characters';
    }

    if (!formData.latitude || !formData.longitude) {
      newErrors.location = 'Please select a location on the map';
    } else if (
      formData.latitude < 4.5 || formData.latitude > 21.5 ||
      formData.longitude < 116 || formData.longitude > 127
    ) {
      newErrors.location = 'Location must be within the Philippines';
    }

    if (formData.contact_number && !/^(\+63|0)?[\d\s-]{9,12}$/.test(formData.contact_number.replace(/\s/g, ''))) {
      newErrors.contact_number = 'Invalid phone number format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        agency_id: parseInt(formData.agency_id),
        name: formData.name.trim(),
        address: formData.address || null,
        contact_number: formData.contact_number || null,
        latitude: formData.latitude,
        longitude: formData.longitude,
      });
    } catch (err: any) {
      setErrors({ submit: err.message || 'Failed to save station' });
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            {station ? 'Edit Station' : 'Add Station'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* Submit Error */}
            {errors.submit && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{errors.submit}</span>
              </div>
            )}

            {/* Agency Select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agency *</label>
              <select
                value={formData.agency_id}
                onChange={(e) => {
                  setFormData({ ...formData, agency_id: e.target.value });
                  setErrors(prev => ({ ...prev, agency_id: '' }));
                }}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                  errors.agency_id ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                }`}
              >
                <option value="">Select Agency</option>
                {agencies.map(agency => (
                  <option key={agency.id} value={agency.id}>{agency.short_name} - {agency.name}</option>
                ))}
              </select>
              {errors.agency_id && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.agency_id}
                </p>
              )}
            </div>

            {/* Station Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Station Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  setErrors(prev => ({ ...prev, name: '' }));
                }}
                placeholder="e.g., Daet Municipal Police Station"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                  errors.name ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                }`}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.name}
                </p>
              )}
            </div>

            {/* Contact Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Number</label>
              <input
                type="tel"
                value={formData.contact_number}
                onChange={(e) => {
                  setFormData({ ...formData, contact_number: e.target.value });
                  setErrors(prev => ({ ...prev, contact_number: '' }));
                }}
                placeholder="+63 XXX XXX XXXX"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                  errors.contact_number ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                }`}
              />
              {errors.contact_number && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.contact_number}
                </p>
              )}
            </div>

            {/* Location Section */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Location * <span className="text-gray-400 font-normal">{useManualEntry ? '(Manual entry)' : '(Click on map or search)'}</span>
                </label>
                {mapError && !useManualEntry && (
                  <button
                    type="button"
                    onClick={() => setUseManualEntry(true)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Enter manually
                  </button>
                )}
                {useManualEntry && (
                  <button
                    type="button"
                    onClick={() => {
                      setUseManualEntry(false);
                      setMapError(null);
                      setMapLoading(true);
                      setTimeout(() => {
                        if (window.google?.maps) {
                          initializeMap();
                        } else {
                          setMapLoading(false);
                          setMapError('Google Maps not available');
                          setUseManualEntry(true);
                        }
                      }, 100);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Try map again
                  </button>
                )}
              </div>

              {/* Manual Entry Mode */}
              {useManualEntry ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Full address"
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Latitude *</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.latitude || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 });
                          setErrors(prev => ({ ...prev, location: '' }));
                        }}
                        placeholder="14.1122"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                          errors.location ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Longitude *</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.longitude || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 });
                          setErrors(prev => ({ ...prev, location: '' }));
                        }}
                        placeholder="122.9553"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                          errors.location ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                        }`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Tip: You can get coordinates from Google Maps by right-clicking on a location.
                  </p>
                </div>
              ) : (
                <>
                  {/* Search Input */}
                  <div className="flex gap-2 mb-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                        placeholder="Search for a place in Camarines Norte..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearch}
                      disabled={!window.google?.maps}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      Search
                    </button>
                  </div>

                  {/* Map Container */}
                  <div className={`relative rounded-lg overflow-hidden border ${errors.location ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'}`}>
                    {mapLoading && (
                      <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center z-10">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      </div>
                    )}
                    {mapError && (
                      <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center z-10">
                        <div className="text-center p-4">
                          <AlertCircle className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{mapError}</p>
                          <button
                            type="button"
                            onClick={() => setUseManualEntry(true)}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Enter coordinates manually
                          </button>
                        </div>
                      </div>
                    )}
                    <div ref={mapRef} className="w-full h-64" />
                  </div>
                </>
              )}

              {errors.location && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.location}
                </p>
              )}

              {/* Selected Location Info */}
              {formData.latitude !== 0 && formData.longitude !== 0 && !useManualEntry && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-gray-800 dark:text-white font-medium">
                        {formData.address || 'Selected Location'}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                        {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  station ? 'Update Station' : 'Add Station'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Resource Modal Component with Validation
function ResourceModal({
  resource,
  stations,
  agencies,
  defaultStationId,
  onClose,
  onSave
}: {
  resource: Resource | null;
  stations: Station[];
  agencies: Agency[];
  defaultStationId?: number;
  onClose: () => void;
  onSave: (data: Partial<Resource>) => void;
}) {
  const [formData, setFormData] = useState<{
    station_id: string;
    name: string;
    type: 'vehicle' | 'equipment' | 'personnel';
    status: 'available' | 'deployed' | 'maintenance';
    description: string;
  }>({
    station_id: resource?.station_id?.toString() || defaultStationId?.toString() || '',
    name: resource?.name || '',
    type: resource?.type || 'vehicle',
    status: resource?.status || 'available',
    description: resource?.description || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.station_id) {
      newErrors.station_id = 'Please select a station';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Resource name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Resource name must be at least 2 characters';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        station_id: parseInt(formData.station_id),
        name: formData.name.trim(),
        type: formData.type,
        status: formData.status,
        description: formData.description?.trim() || null,
      });
    } catch (err: any) {
      setErrors({ submit: err.message || 'Failed to save resource' });
      setSaving(false);
    }
  };

  const getAgencyForStation = (stationId: number) => {
    const station = stations.find(s => s.id === stationId);
    return agencies.find(a => a.id === station?.agency_id);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            {resource ? 'Edit Resource' : 'Add Resource'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Submit Error */}
          {errors.submit && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{errors.submit}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Station *</label>
            <select
              value={formData.station_id}
              onChange={(e) => {
                setFormData({ ...formData, station_id: e.target.value });
                setErrors(prev => ({ ...prev, station_id: '' }));
              }}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                errors.station_id ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
              }`}
            >
              <option value="">Select Station</option>
              {stations.map(station => {
                const agency = getAgencyForStation(station.id);
                return (
                  <option key={station.id} value={station.id}>
                    [{agency?.short_name}] {station.name}
                  </option>
                );
              })}
            </select>
            {errors.station_id && (
              <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.station_id}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resource Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                setErrors(prev => ({ ...prev, name: '' }));
              }}
              placeholder="e.g., Patrol Car 01, Fire Truck Alpha"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                errors.name ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'vehicle' | 'equipment' | 'personnel' })}
                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
              >
                <option value="vehicle">Vehicle</option>
                <option value="equipment">Equipment</option>
                <option value="personnel">Personnel</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status *</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'available' | 'deployed' | 'maintenance' })}
                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
              >
                <option value="available">Available</option>
                <option value="deployed">Deployed</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
              <span className="text-gray-400 font-normal ml-1">({formData.description.length}/500)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => {
                setFormData({ ...formData, description: e.target.value });
                setErrors(prev => ({ ...prev, description: '' }));
              }}
              placeholder="Additional details..."
              rows={3}
              maxLength={500}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white resize-none ${
                errors.description ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.description}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                resource ? 'Update Resource' : 'Add Resource'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Agencies;
