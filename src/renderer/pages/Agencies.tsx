import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle,
  ChevronRight,
  Download,
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
  Upload,
  Users,
  Waves,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSessionScope, isStationScoped } from '../utils/sessionScope';
import { parseResourcesCSV, generateResourcesCSVTemplate, downloadFile } from '../utils/exportUtils';
import { StationDetailView } from './StationDetailView';
import { ConfirmDialog } from '../components/ui';

// Google Maps API Key from Vite environment (set VITE_GOOGLE_MAPS_API_KEY in .env)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

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
  const scope = useMemo(() => getSessionScope(), []);
  const isAdmin = scope.role === 'Admin';
  const stationScopeActive = isStationScoped(scope);
  // Station-scoped users start on stations tab, admins start on agencies
  const [activeTab, setActiveTab] = useState<TabType>(stationScopeActive ? 'stations' : 'agencies');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationSearchQuery, setStationSearchQuery] = useState('');
  const [resourceSearchQuery, setResourceSearchQuery] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [resourceView, setResourceView] = useState<'stations' | 'all'>('stations');
  const [resourceStatusFilter, setResourceStatusFilter] = useState<Resource['status'] | ''>('');
  const [expandedStations, setExpandedStations] = useState<Record<number, boolean>>({});

  // Modal states
  const [showAgencyModal, setShowAgencyModal] = useState(false);
  const [showStationModal, setShowStationModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [detailStation, setDetailStation] = useState<Station | null>(null);
  const [showBatchImportModal, setShowBatchImportModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    kind: 'agency' | 'station' | 'resource';
    id: number;
    name: string;
  } | null>(null);
  const [importingResources, setImportingResources] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);

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
      case 'MDRRMO': return <Waves className="w-5 h-5" />;
      default: return <Building2 className="w-5 h-5" />;
    }
  };

  const getAgencyColor = (shortName: string) => {
    switch (shortName) {
      case 'PNP': return 'bg-blue-500';
      case 'BFP': return 'bg-red-500';
      case 'MDRRMO': return 'bg-teal-500';
      default: return 'bg-slate-500';
    }
  };

  const getAgencyBgColor = (shortName: string) => {
    switch (shortName) {
      case 'PNP': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'BFP': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'MDRRMO': return 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800';
      default: return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'deployed': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'maintenance': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const filteredStations = stations.filter(station => {
    // Scope filter
    if (!isAdmin) {
      if (scope.stationId && station.id !== scope.stationId) return false;
      if (scope.agencyId && station.agency_id !== scope.agencyId) return false;
    }

    const matchesSearch = station.name.toLowerCase().includes(stationSearchQuery.toLowerCase()) ||
      station.address?.toLowerCase().includes(stationSearchQuery.toLowerCase());
    const matchesAgency = !agencyFilter || station.agency_id.toString() === agencyFilter;
    return matchesSearch && matchesAgency;
  });

  const stationsForModal = stationScopeActive && scope.stationId
    ? stations.filter((station) => station.id === scope.stationId)
    : stations;
  const selectedAgencyId = agencyFilter ? Number(agencyFilter) : undefined;
  const agencyScopedStations = selectedAgencyId
    ? stationsForModal.filter((station) => station.agency_id === selectedAgencyId)
    : stationsForModal;
  const resourceStationsForModal = editingResource ? stationsForModal : agencyScopedStations;
  const defaultResourceStationId = stationScopeActive
    ? scope.stationId
    : agencyScopedStations.length === 1 ? agencyScopedStations[0].id : undefined;

  const filteredResources = resources.filter(resource => {
    const station = stations.find(s => s.id === resource.station_id);

    // Scope filter
    if (!isAdmin) {
      if (scope.stationId && resource.station_id !== scope.stationId) return false;
      if (scope.agencyId && station?.agency_id !== scope.agencyId) return false;
    }

    const matchesSearch = resource.name.toLowerCase().includes(resourceSearchQuery.toLowerCase()) ||
      resource.description?.toLowerCase().includes(resourceSearchQuery.toLowerCase());
    const matchesAgency = !agencyFilter || station?.agency_id.toString() === agencyFilter;
    const matchesStatus = !resourceStatusFilter || resource.status === resourceStatusFilter;
    return matchesSearch && matchesAgency && matchesStatus;
  });

  const resourceGroups = stations
    .map((station) => {
      const stationResources = filteredResources.filter((resource) => resource.station_id === station.id);
      const agency = agencies.find((item) => item.id === station.agency_id);
      return {
        station,
        agency,
        resources: stationResources,
        attentionCount: stationResources.filter((resource) => resource.status !== 'available').length,
      };
    })
    .filter((group) => group.resources.length > 0)
    .sort((a, b) => b.attentionCount - a.attentionCount || a.station.name.localeCompare(b.station.name));

  // Agency handlers
  const handleAddAgency = () => {
    setEditingAgency(null);
    setShowAgencyModal(true);
  };

  const handleEditAgency = (agency: Agency) => {
    setEditingAgency(agency);
    setShowAgencyModal(true);
  };

  const handleSaveAgency = async (data: Pick<Agency, 'name' | 'short_name'>) => {
    try {
      if (editingAgency) {
        await window.api.updateAgency({ id: editingAgency.id, updates: data });
        showToast('success', 'Agency updated successfully');
      } else {
        await window.api.createAgency(data);
        showToast('success', 'Agency created successfully');
      }
      setShowAgencyModal(false);
      setEditingAgency(null);
      await loadData();
    } catch (error: any) {
      console.error('Failed to save agency:', error);
      showToast('error', error.message || 'Failed to save agency');
      throw error;
    }
  };

  const requestDeleteAgency = (agency: Agency) => {
    const stationCount = stations.filter((station) => station.agency_id === agency.id).length;
    if (stationCount > 0) {
      showToast('error', `Cannot delete ${agency.short_name} while it has ${stationCount} station${stationCount === 1 ? '' : 's'}. Remove or reassign stations first.`);
      return;
    }
    setDeleteConfirmation({ kind: 'agency', id: agency.id, name: agency.name });
  };

  const handleDeleteAgency = async (id: number) => {
    try {
      await window.api.deleteAgency(id);
      showToast('success', 'Agency deleted successfully');
      if (agencyFilter === id.toString()) setAgencyFilter('');
      await loadData();
    } catch (error: any) {
      console.error('Failed to delete agency:', error);
      showToast('error', error.message || 'Failed to delete agency');
    }
  };

  // Station handlers
  const handleAddStation = () => {
    if (agencies.length === 0) {
      showToast('error', 'Create an agency before adding a station.');
      return;
    }
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

  const requestDeleteStation = (id: number) => {
    const station = stations.find(s => s.id === id);
    const stationResources = resources.filter(r => r.station_id === id);

    if (stationResources.length > 0) {
      showToast('error', `Cannot delete station with ${stationResources.length} resource(s). Remove resources first.`);
      return;
    }

    if (!station) return;
    setDeleteConfirmation({ kind: 'station', id, name: station.name });
  };

  const handleDeleteStation = async (id: number) => {

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
    if (resourceStationsForModal.length === 0) {
      showToast('error', 'Please create a station first before adding resources');
      return;
    }
    setEditingResource(null);
    setShowResourceModal(true);
  };

  const selectedAgency = agencies.find((agency) => agency.id.toString() === agencyFilter);
  const clearAgencyScope = () => setAgencyFilter('');
  const clearStationFilters = () => {
    setStationSearchQuery('');
    setAgencyFilter('');
  };
  const clearResourceFilters = () => {
    setResourceSearchQuery('');
    setAgencyFilter('');
    setResourceStatusFilter('');
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

  const requestDeleteResource = (id: number) => {
    const resource = resources.find(r => r.id === id);
    if (!resource) return;
    if (resource.status !== 'available') {
      showToast('error', `Cannot delete ${resource.name} while it is ${resource.status}. Return it to available first.`);
      return;
    }
    setDeleteConfirmation({ kind: 'resource', id, name: resource.name });
  };

  const handleDeleteResource = async (id: number) => {

    try {
      await window.api.deleteResource(id);
      showToast('success', 'Resource deleted successfully');
      loadData();
    } catch (error: any) {
      console.error('Failed to delete resource:', error);
      showToast('error', error.message || 'Failed to delete resource');
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation) return;
    const { kind, id } = deleteConfirmation;
    setDeleteConfirmation(null);
    if (kind === 'agency') {
      await handleDeleteAgency(id);
    } else if (kind === 'station') {
      await handleDeleteStation(id);
    } else {
      await handleDeleteResource(id);
    }
  };

  // Batch import handlers
  const handleDownloadTemplate = () => {
    const template = generateResourcesCSVTemplate();
    downloadFile(template, 'resources_template.csv', 'text/csv');
    showToast('success', 'Template downloaded successfully');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = await parseResourcesCSV(text);

      if (parsed.length === 0) {
        showToast('error', 'No valid resources found in CSV');
        return;
      }

      setImportPreview(parsed);
      setShowBatchImportModal(true);
    } catch (error: any) {
      console.error('Failed to parse CSV:', error);
      showToast('error', 'Failed to parse CSV file. Please check the format.');
    }

    event.target.value = '';
  };

  const handleBatchImport = async () => {
    if (importPreview.length === 0) return;

    if (!agencyFilter) {
      showToast('error', 'Please select an agency filter first');
      return;
    }

    const selectedStation = stations.find(s => s.agency_id === parseInt(agencyFilter));
    if (!selectedStation) {
      showToast('error', 'No station found for selected agency');
      return;
    }

    try {
      setImportingResources(true);
      let successCount = 0;
      let errorCount = 0;

      for (const resource of importPreview) {
        try {
          await window.api.createResource({
            station_id: selectedStation.id,
            name: resource.name,
            type: resource.type || 'equipment',
            status: resource.status || 'available',
            description: resource.description || ''
          });
          successCount++;
        } catch (error) {
          console.error('Failed to import resource:', resource.name, error);
          errorCount++;
        }
      }

      showToast('success', `Imported ${successCount} resources successfully${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
      setShowBatchImportModal(false);
      setImportPreview([]);
      loadData();
    } catch (error: any) {
      console.error('Batch import failed:', error);
      showToast('error', 'Batch import failed');
    } finally {
      setImportingResources(false);
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
      <div className="min-h-full bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Failed to Load Data</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">{loadError}</p>
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

  // Show station detail view instead of the list
  if (detailStation) {
    return (
      <StationDetailView
        station={detailStation}
        agencies={agencies}
        onBack={() => setDetailStation(null)}
      />
    );
  }

  return (
    <div className="p-6 dark:bg-slate-950 min-h-full">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg transition-all ${toast.type === 'success'
          ? 'bg-green-600 text-white'
          : 'bg-red-600 text-white'
          }`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)} className="ml-2 rounded p-1 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Operations directory</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            {stationScopeActive ? 'My Station' : 'Agency Management'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {stationScopeActive
              ? 'View your station information and resources'
              : 'Manage agencies, stations, and resources'
            }
          </p>
        </div>
          <button
           type="button"
           aria-label="Refresh agency data"
           onClick={loadData}
           className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Agency management sections">
        {!stationScopeActive && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'agencies'}
            onClick={() => setActiveTab('agencies')}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'agencies'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
          >
             <Building2 className="h-4 w-4" /> Agencies ({agencies.length})
           </button>
         )}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'stations'}
          onClick={() => setActiveTab('stations')}
          className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'stations'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
        >
          <MapPin className="h-4 w-4" /> Stations ({stations.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'resources'}
          onClick={() => setActiveTab('resources')}
          className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'resources'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
        >
          <Truck className="h-4 w-4" /> Resources ({filteredResources.length})
        </button>
      </div>

      {selectedAgency && activeTab !== 'agencies' && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <span><strong>{selectedAgency.short_name}</strong> scope active. Showing only this agency's {activeTab}.</span>
          <button type="button" onClick={clearAgencyScope} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-blue-300 px-2 py-1 text-xs font-semibold hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800 dark:hover:bg-blue-900/40"><X className="h-3.5 w-3.5" /> Clear scope</button>
        </div>
      )}

      {/* Agencies Tab */}
      {activeTab === 'agencies' && (
        <div role="tabpanel" aria-label="Agencies">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Configured agencies</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Create agency records before adding their stations and resources.</p>
            </div>
            {isAdmin && (
              <button type="button" onClick={handleAddAgency} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <Plus className="h-4 w-4" /> Add Agency
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                <article
                  key={agency.id}
                  className={`group w-full rounded-xl border p-5 transition-shadow hover:shadow-sm ${getAgencyBgColor(agency.short_name)}`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${getAgencyColor(agency.short_name)} text-white`}>
                        {getAgencyIcon(agency.short_name)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 dark:text-white">{agency.short_name}</h3>
                        <p className="text-sm leading-5 text-slate-500 dark:text-slate-400">{agency.name}</p>
                      </div>
                    </div>
                    {isAdmin && <div className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label={`Edit agency ${agency.name}`} onClick={() => handleEditAgency(agency)} className="rounded-lg p-2 transition-colors hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800"><Edit className="h-4 w-4 text-slate-600 dark:text-slate-300" /></button>
                      <button type="button" aria-label={`Delete agency ${agency.name}`} onClick={() => requestDeleteAgency(agency)} className="rounded-lg p-2 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" /></button>
                    </div>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="rounded-lg border border-white/70 bg-white p-3 dark:border-slate-700/70 dark:bg-slate-800">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                        <MapPin className="w-4 h-4" />
                        Stations
                      </div>
                      <p className="text-2xl font-bold text-slate-800 dark:text-white">{stationCount}</p>
                    </div>
                     <div className="rounded-lg border border-white/70 bg-white p-3 dark:border-slate-700/70 dark:bg-slate-800">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                        <Truck className="w-4 h-4" />
                        Resources
                      </div>
                      <p className="text-2xl font-bold text-slate-800 dark:text-white">{resourceCount}</p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Available Resources</span>
                      <span className="font-medium text-green-600">{availableResources} / {resourceCount}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`${agency.name} — View stations`}
                    onClick={() => {
                      setAgencyFilter(agency.id.toString());
                      setActiveTab('stations');
                    }}
                    className="mt-4 flex min-h-9 w-full items-center justify-end gap-1 rounded-lg px-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-slate-800"
                  >
                    View stations <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </article>
              );
              })}
            {agencies.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                <Building2 className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="mt-3 font-medium text-slate-800 dark:text-slate-100">No agencies configured</p>
                <p className="mt-1 text-sm text-slate-500">Add an agency before creating stations.</p>
                <button type="button" onClick={handleAddAgency} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Plus className="h-4 w-4" /> Add Agency</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stations Tab */}
      {activeTab === 'stations' && (
        <>
          {/* Filters */}
           <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900" role="tabpanel" aria-label="Stations">
             <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex-1 min-w-[250px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search stations..."
                     value={stationSearchQuery}
                     onChange={(e) => setStationSearchQuery(e.target.value)}
                     aria-label="Search stations"
                     className="w-full min-h-10 rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
              {!stationScopeActive && (
               <select
                  aria-label="Filter stations by agency"
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value)}
                  className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">All Agencies</option>
                  {agencies.map(agency => (
                    <option key={agency.id} value={agency.id}>{agency.short_name}</option>
                  ))}
                </select>
              )}
              {!stationScopeActive && (
                 <button
                   type="button"
                   onClick={handleAddStation}
                   className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Plus className="w-4 h-4" />
                  Add Station
                            </button>
               )}
              {(stationSearchQuery || agencyFilter) && <button type="button" onClick={clearStationFilters} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><X className="h-4 w-4" /> Clear</button>}
             </div>
           </div>
           {/* Stations Grid */}
           <div className="grid gap-4 xl:grid-cols-2">
            {filteredStations.length === 0 ? (
              <div className="col-span-2 bg-white dark:bg-slate-800 rounded-xl p-12 text-center">
                <MapPin className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400">No stations found</p>
                 <button
                   type="button"
                   aria-label="Add your first station"
                   onClick={handleAddStation}
                   className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
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
                     role="button"
                     tabIndex={0}
                     key={station.id}
                     onClick={() => setDetailStation(station)}
                     onKeyDown={(event) => {
                       if (event.key === 'Enter' || event.key === ' ') {
                         event.preventDefault();
                         setDetailStation(station);
                       }
                     }}
                     className="relative w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-shadow hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900"
                   >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${getAgencyColor(agency?.short_name || '')} flex items-center justify-center text-white`}>
                          {getAgencyIcon(agency?.short_name || '')}
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800 dark:text-white">{station.name}</h3>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{agency?.short_name}</span>
                        </div>
                      </div>
                      {!stationScopeActive && (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                           <button
                             type="button"
                             aria-label={`Edit station ${station.name}`}
                            onClick={() => handleEditStation(station)}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4 text-slate-500" />
                          </button>
                           <button
                             type="button"
                             aria-label={`Delete station ${station.name}`}
                             onClick={() => requestDeleteStation(station.id)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                           </button>
                         </div>
                       )}
                     </div>

                    {station.address && (
                      <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{station.address}</span>
                      </div>
                    )}

                    {station.contact_number && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-3">
                        <Phone className="w-4 h-4" />
                        <span>{station.contact_number}</span>
                      </div>
                    )}

                     <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <Truck className="w-4 h-4" />
                        <span>{stationResources.length} resources</span>
                      </div>
                       <div className="flex items-center gap-2 text-sm">
                         <span className="text-green-600">{stationResources.filter(r => r.status === 'available').length} available</span>
                         <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
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
           <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900" role="tabpanel" aria-label="Resources">
             <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex-1 min-w-[250px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search resources..."
                     value={resourceSearchQuery}
                     onChange={(e) => setResourceSearchQuery(e.target.value)}
                     aria-label="Search resources"
                     className="w-full min-h-10 rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
              {!stationScopeActive && (
                <select
                  aria-label="Filter resources by agency"
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value)}
                  className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">All Agencies</option>
                  {agencies.map(agency => (
                    <option key={agency.id} value={agency.id}>{agency.short_name}</option>
                  ))}
                </select>
              )}
              <select
                aria-label="Filter resources by status"
                value={resourceStatusFilter}
                onChange={(event) => setResourceStatusFilter(event.target.value as Resource['status'] | '')}
                className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All Statuses</option>
                <option value="available">Available</option>
                <option value="deployed">Deployed</option>
                <option value="maintenance">Maintenance</option>
              </select>
              {(resourceSearchQuery || agencyFilter || resourceStatusFilter) && <button type="button" onClick={clearResourceFilters} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><X className="h-4 w-4" /> Clear</button>}
              <div className="flex gap-2">
                <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950" role="group" aria-label="Resource view">
                  <button type="button" aria-pressed={resourceView === 'stations'} onClick={() => setResourceView('stations')} className={`min-h-8 rounded-md px-2.5 text-xs font-semibold ${resourceView === 'stations' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500'}`}>By station</button>
                  <button type="button" aria-pressed={resourceView === 'all'} onClick={() => setResourceView('all')} className={`min-h-8 rounded-md px-2.5 text-xs font-semibold ${resourceView === 'all' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500'}`}>All resources</button>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                   type="button"
                   className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Download className="w-4 h-4" />
                  CSV Template
                </button>
                 <label className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-emerald-500 ${agencyFilter ? 'cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500'}`} title={agencyFilter ? 'Import resources for the selected agency' : 'Select an agency before importing resources'}>
                  <Upload className="w-4 h-4" />
                  Batch Import
                   <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={!agencyFilter}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAddResource}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Plus className="w-4 h-4" />
                  Add Resource
                </button>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">{filteredResources.length}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Total Resources</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">
                    {filteredResources.filter(r => r.status === 'available').length}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Available</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">
                    {filteredResources.filter(r => r.status === 'deployed').length}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Deployed</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">
                    {filteredResources.filter(r => r.status === 'maintenance').length}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Maintenance</p>
                </div>
              </div>
            </div>
          </div>

          {resourceView === 'stations' && (
            <div className="space-y-3" aria-label="Resources grouped by station">
              {resourceGroups.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">No resources match the current filters.</div>
              ) : resourceGroups.map((group) => {
                const expanded = expandedStations[group.station.id] ?? group.attentionCount > 0;
                const counts = {
                  available: group.resources.filter((resource) => resource.status === 'available').length,
                  deployed: group.resources.filter((resource) => resource.status === 'deployed').length,
                  maintenance: group.resources.filter((resource) => resource.status === 'maintenance').length,
                };
                return (
                  <section key={group.station.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <button type="button" aria-expanded={expanded} onClick={() => setExpandedStations((current) => ({ ...current, [group.station.id]: !expanded }))} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800">
                      <span className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${getAgencyColor(group.agency?.short_name || '')} text-white`}><Truck className="h-4 w-4" /></span><span><span className="block font-semibold text-slate-950 dark:text-white">{group.station.name}</span><span className="block text-xs text-slate-500">{group.agency?.short_name || 'Agency'} · {group.resources.length} resources</span></span></span>
                      <span className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">{counts.available} available</span><span className="rounded-full bg-orange-100 px-2 py-1 font-medium text-orange-700">{counts.deployed} deployed</span><span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-700">{counts.maintenance} maintenance</span><ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} /></span>
                    </button>
                    {expanded && <div className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">{group.resources.map((resource) => <div key={resource.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><span className="flex min-w-0 items-center gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getAgencyColor(group.agency?.short_name || '')} text-white`}><Truck className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{resource.name}</span><span className="block text-xs capitalize text-slate-500">{resource.type}</span></span></span><span className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${getStatusColor(resource.status)}`}>{resource.status}</span><button type="button" aria-label={`Edit resource ${resource.name}`} onClick={() => handleEditResource(resource)} className="rounded-lg p-2 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800"><Edit className="h-4 w-4 text-slate-500" /></button><button type="button" aria-label={`Delete resource ${resource.name}`} onClick={() => requestDeleteResource(resource.id)} className="rounded-lg p-2 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4 text-red-500" /></button></span></div>)}</div>}
                  </section>
                );
              })}
            </div>
          )}

           {/* Resources Table */}
          {resourceView === 'all' && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Resource</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Type</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Station</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredResources.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      No resources found
                    </td>
                  </tr>
                ) : (
                  filteredResources.map((resource) => {
                    const station = stations.find(s => s.id === resource.station_id);
                    const agency = agencies.find(a => a.id === station?.agency_id);

                    return (
                      <tr key={resource.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg ${getAgencyColor(agency?.short_name || '')} flex items-center justify-center text-white`}>
                              <Truck className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-medium text-slate-800 dark:text-white">{resource.name}</p>
                              {resource.description && (
                                <p className="text-sm text-slate-500 dark:text-slate-400">{resource.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="capitalize text-slate-700 dark:text-slate-300">{resource.type}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getAgencyColor(agency?.short_name || '')}`}></div>
                            <span className="text-slate-700 dark:text-slate-300">{station?.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(resource.status)}`}>
                            {resource.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              aria-label={`Edit resource ${resource.name}`}
                              onClick={() => handleEditResource(resource)}
                              className="rounded-lg p-2 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800"
                            >
                              <Edit className="w-4 h-4 text-slate-500" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete resource ${resource.name}`}
                               onClick={() => requestDeleteResource(resource.id)}
                              className="rounded-lg p-2 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-900/20"
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
           </div>}
        </>
      )}

      {/* Agency Modal */}
      {showAgencyModal && (
        <AgencyModal
          agency={editingAgency}
          onClose={() => {
            setShowAgencyModal(false);
            setEditingAgency(null);
          }}
          onSave={handleSaveAgency}
        />
      )}

      {/* Station Modal */}
      {showStationModal && (
        <StationModal
          station={editingStation}
          agencies={agencies}
          defaultAgencyId={selectedAgencyId}
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
          stations={resourceStationsForModal}
          agencies={agencies}
          defaultStationId={defaultResourceStationId}
          onClose={() => {
            setShowResourceModal(false);
            setEditingResource(null);
          }}
          onSave={handleSaveResource}
        />
      )}

      {/* Batch Import Modal */}
      <BatchImportModal
        isOpen={showBatchImportModal}
        onClose={() => {
          setShowBatchImportModal(false);
          setImportPreview([]);
        }}
        resources={importPreview}
        onImport={handleBatchImport}
        importing={importingResources}
      />
      {deleteConfirmation && (
        <ConfirmDialog
          isOpen
          title={`Delete ${deleteConfirmation.kind}?`}
          description={<>This will permanently delete <strong>{deleteConfirmation.name}</strong>. This action cannot be undone.</>}
          confirmLabel="Delete permanently"
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function AgencyModal({
  agency,
  onClose,
  onSave,
}: {
  agency: Agency | null;
  onClose: () => void;
  onSave: (data: Pick<Agency, 'name' | 'short_name'>) => Promise<void> | void;
}) {
  const [name, setName] = useState(agency?.name || '');
  const [shortName, setShortName] = useState(agency?.short_name || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    const normalizedCode = shortName.trim().toUpperCase();
    const nextErrors: Record<string, string> = {};
    if (normalizedName.length < 3 || normalizedName.length > 120) nextErrors.name = 'Use 3 to 120 characters.';
    if (!/^[A-Z0-9-]{2,12}$/.test(normalizedCode)) nextErrors.short_name = 'Use 2 to 12 letters, numbers, or hyphens.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave({ name: normalizedName, short_name: normalizedCode });
    } catch (error: any) {
      setErrors({ submit: error.message || 'Failed to save agency.' });
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="agency-modal-title" className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <h2 id="agency-modal-title" className="text-lg font-bold text-slate-950 dark:text-white">{agency ? 'Edit Agency' : 'Add Agency'}</h2>
            <p className="mt-1 text-sm text-slate-500">Agency records organize stations, users, and resources.</p>
          </div>
          <button type="button" aria-label="Close agency form" onClick={onClose} disabled={saving} className="rounded-lg p-2 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {errors.submit && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{errors.submit}</div>}
          <div>
            <label htmlFor="agency-name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Agency name <span className="text-red-600">*</span></label>
            <input id="agency-name" autoFocus value={name} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: '' })); }} maxLength={120} placeholder="e.g., Bureau of Fire Protection" className={`min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white ${errors.name ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`} />
            {errors.name && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="agency-code" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Agency code <span className="text-red-600">*</span></label>
            <input id="agency-code" value={shortName} onChange={(event) => { setShortName(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')); setErrors((current) => ({ ...current, short_name: '' })); }} readOnly={Boolean(agency)} maxLength={12} placeholder="e.g., BFP" className={`min-h-11 w-full rounded-lg border px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 ${agency ? 'cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400' : 'bg-white text-slate-900 dark:bg-slate-800 dark:text-white'} ${errors.short_name ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`} />
            <p className="mt-1 text-xs text-slate-500">{agency ? 'The code is locked because dispatch and historical records depend on it.' : 'Short, unique code used in station and dispatch records.'}</p>
            {errors.short_name && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.short_name}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Saving...' : agency ? 'Save Changes' : 'Add Agency'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Station Modal Component with Google Maps Picker (using new APIs)
function StationModal({
  station,
  agencies,
  defaultAgencyId,
  onClose,
  onSave
}: {
  station: Station | null;
  agencies: Agency[];
  defaultAgencyId?: number;
  onClose: () => void;
  onSave: (data: Partial<Station>) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    agency_id: station?.agency_id?.toString() || defaultAgencyId?.toString() || '',
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
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {station ? 'Edit Station' : 'Add Station'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Agency *</label>
              <select
                value={formData.agency_id}
                onChange={(e) => {
                  setFormData({ ...formData, agency_id: e.target.value });
                  setErrors(prev => ({ ...prev, agency_id: '' }));
                }}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${errors.agency_id ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Station Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  setErrors(prev => ({ ...prev, name: '' }));
                }}
                placeholder="e.g., Daet Municipal Police Station"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${errors.name ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Contact Number</label>
              <input
                type="tel"
                value={formData.contact_number}
                onChange={(e) => {
                  setFormData({ ...formData, contact_number: e.target.value });
                  setErrors(prev => ({ ...prev, contact_number: '' }));
                }}
                placeholder="+63 XXX XXX XXXX"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${errors.contact_number ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Location * <span className="text-slate-400 font-normal">{useManualEntry ? '(Manual entry)' : '(Click on map or search)'}</span>
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
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Full address"
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Latitude *</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.latitude || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 });
                          setErrors(prev => ({ ...prev, location: '' }));
                        }}
                        placeholder="14.1122"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${errors.location ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                          }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Longitude *</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.longitude || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 });
                          setErrors(prev => ({ ...prev, location: '' }));
                        }}
                        placeholder="122.9553"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${errors.location ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                          }`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tip: You can get coordinates from Google Maps by right-clicking on a location.
                  </p>
                </div>
              ) : (
                <>
                  {/* Search Input */}
                  <div className="flex gap-2 mb-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                        placeholder="Search for a place in Camarines Norte..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
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
                  <div className={`relative rounded-lg overflow-hidden border ${errors.location ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'}`}>
                    {mapLoading && (
                      <div className="absolute inset-0 bg-slate-100 dark:bg-slate-700 flex items-center justify-center z-10">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      </div>
                    )}
                    {mapError && (
                      <div className="absolute inset-0 bg-slate-100 dark:bg-slate-700 flex items-center justify-center z-10">
                        <div className="text-center p-4">
                          <AlertCircle className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{mapError}</p>
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
                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-slate-800 dark:text-white font-medium">
                        {formData.address || 'Selected Location'}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                        {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors dark:text-slate-300"
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
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {resource ? 'Edit Resource' : 'Add Resource'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Station *</label>
            <select
              value={formData.station_id}
              onChange={(e) => {
                setFormData({ ...formData, station_id: e.target.value });
                setErrors(prev => ({ ...prev, station_id: '' }));
              }}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${errors.station_id ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Resource Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                setErrors(prev => ({ ...prev, name: '' }));
              }}
              placeholder="e.g., Patrol Car 01, Fire Truck Alpha"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${errors.name ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'vehicle' | 'equipment' | 'personnel' })}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
              >
                <option value="vehicle">Vehicle</option>
                <option value="equipment">Equipment</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status *</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'available' | 'deployed' | 'maintenance' })}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
              >
                <option value="available">Available</option>
                <option value="deployed">Deployed</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
              <span className="text-slate-400 font-normal ml-1">({formData.description.length}/500)</span>
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
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white resize-none ${errors.description ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
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
              className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors dark:text-slate-300"
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

function BatchImportModal({
  isOpen,
  onClose,
  resources,
  onImport,
  importing
}: {
  isOpen: boolean;
  onClose: () => void;
  resources: any[];
  onImport: () => void;
  importing: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            Batch Import Resources
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>{resources.length} resources</strong> will be imported. Review the list below and click Import to proceed.
            </p>
          </div>

          <div className="space-y-2">
            {resources.map((resource, index) => (
              <div
                key={index}
                className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-slate-800 dark:text-white">
                      {resource.name}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 flex gap-3 mt-1">
                      <span>Type: {resource.type || 'equipment'}</span>
                      <span>Status: {resource.status || 'available'}</span>
                    </div>
                    {resource.description && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {resource.description}
                      </div>
                    )}
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 ml-3" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={onClose}
            disabled={importing}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onImport}
            disabled={importing}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import {resources.length} Resources
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StationDetailsModal({
  station,
  agency,
  resources,
  getAgencyColor,
  getAgencyIcon,
  getStatusColor,
  onClose
}: {
  station: Station;
  agency?: Agency;
  resources: Resource[];
  getAgencyColor: (shortName: string) => string;
  getAgencyIcon: (shortName: string) => JSX.Element;
  getStatusColor: (status: string) => string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<any[]>([]);
  const [activeIncidents, setActiveIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersData, incidentsData] = await Promise.all([
          window.api.getUsers({ stationId: station.id }),
          window.api.getIncidents({ limit: 100 })
        ]);
        setMembers(usersData.filter((u: any) => u.station_id === station.id || u.role === 'Chief')); // Approximation of members
        setActiveIncidents(incidentsData.filter((i: any) => i.status !== 'resolved' && i.status !== 'closed' && i.status !== 'fake_report'));
      } catch (err) {
        console.error('Failed to load station details', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [station.id]);

  // Derived stats
  const availableResources = resources.filter(r => r.status === 'available');
  const deployedResources = resources.filter(r => r.status === 'deployed');

  const busyMemberIds = new Set<string>();
  activeIncidents.forEach(inc => {
    if (inc.assigned_officer_id) busyMemberIds.add(inc.assigned_officer_id);
    if (inc.assigned_officer_ids) {
      inc.assigned_officer_ids.forEach((id: string) => busyMemberIds.add(id));
    }
  });

  const availableMembers = members.filter(m => !busyMemberIds.has(m.id));
  const busyMembers = members.filter(m => busyMemberIds.has(m.id));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${getAgencyColor(agency?.short_name || '')} flex items-center justify-center text-white`}>
              {getAgencyIcon(agency?.short_name || '')}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">{station.name}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{agency?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                    <Users className="w-4 h-4" /> Available Officers
                  </div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{availableMembers.length}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                    <Users className="w-4 h-4" /> Busy Officers
                  </div>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{busyMembers.length}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                    <Truck className="w-4 h-4" /> Available Resources
                  </div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{availableResources.length}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                    <Truck className="w-4 h-4" /> Dispatched Resources
                  </div>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{deployedResources.length}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Members List */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col min-h-0">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 relative">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <Users className="w-4 h-4" /> Station Members ({members.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                    {members.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-sm">No members assigned to this station</div>
                    ) : (
                      members.map(member => (
                        <div key={member.id} className="p-4 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-800 dark:text-white">{member.display_name || member.email}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{member.role}</span>
                          </div>
                          <span className={`px-2 py-1 text-xs font-bold rounded-full ${busyMemberIds.has(member.id) ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' : 'bg-green-100 text-green-700 dark:bg-green-900/30'}`}>
                            {busyMemberIds.has(member.id) ? 'Busy' : 'Available'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Resources List */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col min-h-0">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 relative">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <Truck className="w-4 h-4" /> Station Resources ({resources.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                    {resources.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-sm">No resources assigned to this station</div>
                    ) : (
                      resources.map(resource => (
                        <div key={resource.id} className="p-4 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-800 dark:text-white">{resource.name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">{resource.type}</span>
                          </div>
                          <span className={`px-2 py-1 text-xs font-bold rounded-full capitalize ${getStatusColor(resource.status)}`}>
                            {resource.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Agencies;
