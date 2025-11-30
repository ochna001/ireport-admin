import {
    ArrowLeft,
    Clock,
    FileText,
    History,
    Image as ImageIcon,
    MapPin,
    Send,
    User,
    UserCheck,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface Incident {
  id: string;
  agency_type: string;
  reporter_id?: string;
  reporter_name: string;
  reporter_age: number;
  description: string;
  status: string;
  latitude: number;
  longitude: number;
  location_address: string;
  media_urls: string;
  assigned_station_id?: number;
  assigned_officer_id?: string;
  assigned_officer_ids?: string[]; // Multiple officers
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  updated_by?: string;
  // Joined from profiles table via reporter_id
  reporter?: {
    email?: string;
    phone_number?: string;
  };
}

interface StatusHistoryEntry {
  id: number;
  status: string;
  notes: string;
  changed_by: string;
  changed_at: string;
}

interface AgencyStation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  contact_number: string;
  agencies: { name: string; short_name: string };
}

interface Officer {
  id: string;
  display_name: string;
  email: string;
  role: string;
  phone_number?: string;
}

interface FinalReportData {
  summary: string;
  actionsTaken: string;
  outcome: string;
  recommendations?: string;
  // PNP specific
  caseNumber?: string;
  suspects?: string;
  evidence?: string;
  // BFP specific
  fireOrigin?: string;
  estimatedDamage?: string;
  casualties?: string;
  // PDRRMO specific
  affectedFamilies?: string;
  evacuees?: string;
  assistanceProvided?: string;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-500' },
  { value: 'assigned', label: 'Assigned', color: 'bg-blue-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-orange-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-green-500' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-500' },
];

function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [stations, setStations] = useState<AgencyStation[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<string[]>([]);
  const [initialOfficerIds, setInitialOfficerIds] = useState<string[]>([]); // Track initial state
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  
  // Final Report Modal State
  const [showFinalReportModal, setShowFinalReportModal] = useState(false);
  const [finalReportData, setFinalReportData] = useState<FinalReportData>({
    summary: '',
    actionsTaken: '',
    outcome: '',
    recommendations: '',
  });
  const [savingFinalReport, setSavingFinalReport] = useState(false);

  useEffect(() => {
    if (id) {
      loadIncident();
      loadHistory();
    }
  }, [id]);

  // Load stations and officers after incident is loaded
  useEffect(() => {
    if (incident?.latitude && incident?.longitude) {
      loadStations();
    }
    if (incident?.agency_type) {
      loadOfficers();
    }
  }, [incident?.latitude, incident?.longitude, incident?.agency_type]);

  const loadIncident = async () => {
    try {
      const data = await window.api.getIncident(id!);
      console.log('[IncidentDetail] Loaded incident:', data);
      console.log('[IncidentDetail] Location coords:', data?.latitude, data?.longitude);
      setIncident(data);
      setNewStatus(data?.status || '');
      
      // Pre-select already assigned officers
      if (data?.assigned_officer_ids && data.assigned_officer_ids.length > 0) {
        setSelectedOfficerIds(data.assigned_officer_ids);
        setInitialOfficerIds(data.assigned_officer_ids);
      } else if (data?.assigned_officer_id) {
        // Fallback to single officer for backward compatibility
        setSelectedOfficerIds([data.assigned_officer_id]);
        setInitialOfficerIds([data.assigned_officer_id]);
      } else {
        setInitialOfficerIds([]);
      }
    } catch (error) {
      console.error('Failed to load incident:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await window.api.getAuditLog(id!);
      setHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const loadStations = async () => {
    // Wait for incident to be loaded first
    if (!incident?.latitude || !incident?.longitude) return;
    
    try {
      // First try database stations
      let data = await window.api.getAgencyStations();
      
      // If no stations in DB, fetch from OpenStreetMap
      if (!data || data.length === 0) {
        console.log('[IncidentDetail] No stations in DB, fetching from OSM...');
        data = await window.api.getNearbyServices({
          latitude: Number(incident.latitude),
          longitude: Number(incident.longitude),
          radius: 15000 // 15km radius
        });
      }
      
      setStations(data);
    } catch (error) {
      console.error('Failed to load stations:', error);
    }
  };

  const loadOfficers = async () => {
    if (!incident?.agency_type) return;
    
    try {
      const data = await window.api.getOfficersByAgency(incident.agency_type);
      setOfficers(data);
    } catch (error) {
      console.error('Failed to load officers:', error);
    }
  };

  const handleUpdateStatus = async () => {
    if (!newStatus) return;
    
    // If changing to 'closed', show final report modal first
    if (newStatus === 'closed' && incident?.status !== 'closed') {
      setShowFinalReportModal(true);
      return;
    }
    
    await performStatusUpdate();
  };

  // Check if officer selection has changed
  const hasOfficerChanges = (): boolean => {
    if (selectedOfficerIds.length !== initialOfficerIds.length) return true;
    const sortedSelected = [...selectedOfficerIds].sort();
    const sortedInitial = [...initialOfficerIds].sort();
    return sortedSelected.some((id, index) => id !== sortedInitial[index]);
  };

  // Check if there are any changes to submit
  const hasChanges = (): boolean => {
    return newStatus !== incident?.status || 
           hasOfficerChanges() || 
           selectedStationId !== null ||
           notes.trim() !== '';
  };

  const performStatusUpdate = async () => {
    // Confirmation for critical status changes
    if ((newStatus === 'resolved' || newStatus === 'closed') && 
        !confirm(`Are you sure you want to mark this incident as ${newStatus}? This action cannot be easily undone.`)) {
      return;
    }

    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    try {
      await window.api.updateIncidentStatus({
        id: id!,
        status: newStatus,
        notes: notes,
        updatedBy: 'Admin',
        stationId: selectedStationId || undefined,
        officerIds: selectedOfficerIds.length > 0 ? selectedOfficerIds : undefined,
      });

      // Log security action
      await window.api.logSecurityAction({
        action: 'incident_status_changed',
        details: {
          incident_id: id,
          old_status: incident?.status,
          new_status: newStatus,
          station_id: selectedStationId,
          officer_ids: selectedOfficerIds,
        }
      });

      await loadIncident();
      await loadHistory();
      setNotes('');
      setSelectedStationId(null);
      // Don't clear selectedOfficerIds - loadIncident will update them from server
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update status:', error);
      setUpdateError('Failed to update status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSubmitFinalReport = async () => {
    if (!finalReportData.summary || !finalReportData.actionsTaken || !finalReportData.outcome) {
      alert('Please fill in all required fields (Summary, Actions Taken, Outcome)');
      return;
    }

    setSavingFinalReport(true);
    try {
      // Create final report
      await window.api.createFinalReport({
        incidentId: id!,
        reportDetails: {
          ...finalReportData,
          agency_type: incident?.agency_type,
          incident_description: incident?.description,
          location: incident?.location_address,
          reporter_name: incident?.reporter_name,
          created_at: new Date().toISOString(),
        },
        completedBy: 'admin', // TODO: Use actual admin user ID when auth is implemented
      });

      // Log security action
      await window.api.logSecurityAction({
        action: 'final_report_created',
        details: { incident_id: id }
      });

      // Close modal and proceed with status update
      setShowFinalReportModal(false);
      await performStatusUpdate();
      
      // Reset form
      setFinalReportData({
        summary: '',
        actionsTaken: '',
        outcome: '',
        recommendations: '',
      });
    } catch (error) {
      console.error('Failed to create final report:', error);
      alert('Failed to create final report. Please try again.');
    } finally {
      setSavingFinalReport(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAgencyName = (agency: string) => {
    switch (agency?.toLowerCase()) {
      case 'pnp': return 'Philippine National Police';
      case 'bfp': return 'Bureau of Fire Protection';
      case 'pdrrmo': return 'Provincial Disaster Risk Reduction Management Office';
      default: return agency;
    }
  };

  const getMediaUrls = (): string[] => {
    if (!incident?.media_urls) return [];
    try {
      return JSON.parse(incident.media_urls);
    } catch {
      return [];
    }
  };

  // Calculate distance between two coordinates in km (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Get nearby stations sorted by distance
  const getNearbyStations = () => {
    if (!incident?.latitude || !incident?.longitude || stations.length === 0) return [];
    
    return stations
      .map(station => ({
        ...station,
        distance: calculateDistance(
          Number(incident.latitude),
          Number(incident.longitude),
          Number(station.latitude),
          Number(station.longitude)
        )
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5); // Top 5 nearest
  };

  const getAgencyIcon = (shortName: string) => {
    switch (shortName?.toUpperCase()) {
      case 'PNP': return '🚔';
      case 'BFP': return '🚒';
      case 'PDRRMO': return '🚑';
      default: return '📍';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-gray-500 mb-4">Incident not found</p>
        <button
          onClick={() => navigate('/incidents')}
          className="text-blue-600 hover:underline"
        >
          Back to Incidents
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/incidents')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg dark:text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Incident #{incident.id.substring(0, 8).toUpperCase()}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">{getAgencyName(incident.agency_type)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Description</h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{incident.description}</p>
          </div>

          {/* Location */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <MapPin size={20} />
              Location
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-2">{incident.location_address || 'Address not available'}</p>
            {incident.latitude != null && incident.longitude != null ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Coordinates: {Number(incident.latitude).toFixed(6)}, {Number(incident.longitude).toFixed(6)}
                </p>
                {/* Embedded Map */}
                <div className="rounded-lg overflow-hidden border border-gray-200">
                  <iframe
                    title="Incident Location"
                    width="100%"
                    height="300"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(incident.longitude) - 0.01}%2C${Number(incident.latitude) - 0.01}%2C${Number(incident.longitude) + 0.01}%2C${Number(incident.latitude) + 0.01}&layer=mapnik&marker=${incident.latitude}%2C${incident.longitude}`}
                  />
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${incident.latitude}&mlon=${incident.longitude}#map=16/${incident.latitude}/${incident.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    View larger map ↗
                  </a>
                </div>

                {/* Nearby Stations */}
                {getNearbyStations().length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Nearby Response Units</h3>
                    <div className="space-y-2">
                      {getNearbyStations().map((station) => (
                        <div 
                          key={station.id} 
                          className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getAgencyIcon(station.agencies?.short_name)}</span>
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white">{station.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{station.agencies?.short_name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-700 dark:text-gray-300">{station.distance.toFixed(1)} km</p>
                            {station.contact_number && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">{station.contact_number}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Map coordinates not available</p>
            )}
          </div>

          {/* Media */}
          {getMediaUrls().length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <ImageIcon size={20} />
                Media ({getMediaUrls().length})
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {getMediaUrls().map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square bg-gray-100 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                  >
                    <img
                      src={url}
                      alt={`Media ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Assigned Officers */}
          {(incident.assigned_officer_ids?.length || incident.assigned_officer_id) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <UserCheck size={20} />
                Assigned Officers ({incident.assigned_officer_ids?.length || 1})
              </h2>
              <div className="space-y-3">
                {officers.filter(o => 
                  incident.assigned_officer_ids?.includes(o.id) || 
                  o.id === incident.assigned_officer_id
                ).map((officer, index) => (
                  <div 
                    key={officer.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <User size={20} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 dark:text-white truncate">
                        {officer.display_name || officer.email}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {officer.role}
                        {officer.phone_number && ` • ${officer.phone_number}`}
                      </p>
                    </div>
                    {index === 0 && incident.assigned_officer_ids && incident.assigned_officer_ids.length > 1 && (
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                        Lead
                      </span>
                    )}
                  </div>
                ))}
                {/* Show placeholder if officers not loaded yet */}
                {officers.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading officer details...</p>
                )}
              </div>
            </div>
          )}

          {/* Status History */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <History size={20} />
              Status History
            </h2>
            {history.length > 0 ? (
              <div className="space-y-4">
                {history.map((entry) => (
                  <div key={entry.id} className="flex gap-4 pb-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div className="w-3 h-3 rounded-full bg-blue-500 mt-1.5"></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800 dark:text-white">
                          Status changed to <span className="uppercase">{entry.status}</span>
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(entry.changed_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">by {entry.changed_by}</p>
                      {entry.notes && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">"{entry.notes}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No status changes recorded</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Reporter Info */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <User size={20} />
              Reporter
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Name</p>
                <p className="font-medium dark:text-white">{incident.reporter_name || 'Anonymous'}</p>
              </div>
              {incident.reporter_age && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Age</p>
                  <p className="font-medium dark:text-white">{incident.reporter_age} years old</p>
                </div>
              )}
              {incident.reporter?.email && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                  <a 
                    href={`mailto:${incident.reporter.email}`}
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {incident.reporter.email}
                  </a>
                </div>
              )}
              {incident.reporter?.phone_number && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Contact</p>
                  <a 
                    href={`tel:${incident.reporter.phone_number}`}
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {incident.reporter.phone_number}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <Clock size={20} />
              Timeline
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Reported</p>
                <p className="font-medium dark:text-white">{formatDate(incident.created_at)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated</p>
                <p className="font-medium dark:text-white">{formatDate(incident.updated_at || incident.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Update Status */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Update Status</h2>
            
            {/* Current Status Display */}
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Status</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${
                STATUS_OPTIONS.find(s => s.value === incident.status)?.color || 'bg-gray-500'
              } text-white`}>
                {STATUS_OPTIONS.find(s => s.value === incident.status)?.label || incident.status}
              </span>
            </div>

            {updateSuccess && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
                Status updated successfully!
              </div>
            )}
            
            {updateError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {updateError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Change To</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} {option.value === incident.status ? '(current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Station Assignment */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Assign Station
                  {incident.assigned_station_id && (
                    <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                      (Currently assigned: Station #{incident.assigned_station_id})
                    </span>
                  )}
                </label>
                <select
                  value={selectedStationId || ''}
                  onChange={(e) => setSelectedStationId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value="">
                    {incident.assigned_station_id 
                      ? 'Keep current assignment' 
                      : 'Auto-assign closest station'}
                  </option>
                  {stations
                    .filter(s => s.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase())
                    .map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name} {station.address ? `- ${station.address}` : ''}
                      </option>
                    ))}
                  {stations.filter(s => s.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase()).length === 0 && (
                    <option disabled>No stations available for {incident.agency_type?.toUpperCase()}</option>
                  )}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  {!incident.assigned_station_id && newStatus !== 'pending' 
                    ? 'Will auto-assign to closest station if left empty'
                    : 'Select a station to reassign or leave empty to keep current'}
                </p>
              </div>

              {/* Officer Assignment */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span className="flex items-center gap-1">
                    <UserCheck size={14} />
                    Assign Officers
                  </span>
                  {selectedOfficerIds.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                      ({selectedOfficerIds.length} selected{hasOfficerChanges() ? ' - modified' : ''})
                    </span>
                  )}
                </label>
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-700">
                  {officers.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      No officers available for {incident.agency_type?.toUpperCase()}
                    </p>
                  ) : (
                    officers.map((officer) => {
                      const isCurrentlyAssigned = initialOfficerIds.includes(officer.id);
                      return (
                      <label
                        key={officer.id}
                        className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-100 dark:border-gray-600 last:border-b-0 ${
                          isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedOfficerIds.includes(officer.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOfficerIds([...selectedOfficerIds, officer.id]);
                            } else {
                              setSelectedOfficerIds(selectedOfficerIds.filter(id => id !== officer.id));
                            }
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-white truncate flex items-center gap-2">
                            {officer.display_name || officer.email}
                            {isCurrentlyAssigned && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded">
                                Assigned
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {officer.role} {officer.phone_number && `• ${officer.phone_number}`}
                          </p>
                        </div>
                      </label>
                    );})
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Select one or more officers to respond to this incident
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this status change..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>

              <button
                onClick={handleUpdateStatus}
                disabled={updating || !hasChanges()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} />
                {updating ? 'Updating...' : hasOfficerChanges() && newStatus === incident.status ? 'Update Officers' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Final Report Modal */}
      {showFinalReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <FileText size={24} />
                Final Report - Close Incident
              </h2>
              <button
                onClick={() => setShowFinalReportModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  You are about to close this incident. Please complete the final report before proceeding.
                </p>
              </div>

              {/* Common Fields */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Summary <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={finalReportData.summary}
                  onChange={(e) => setFinalReportData(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder="Brief summary of the incident and resolution..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Actions Taken <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={finalReportData.actionsTaken}
                  onChange={(e) => setFinalReportData(prev => ({ ...prev, actionsTaken: e.target.value }))}
                  placeholder="List all actions taken to resolve this incident..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Outcome <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={finalReportData.outcome}
                  onChange={(e) => setFinalReportData(prev => ({ ...prev, outcome: e.target.value }))}
                  placeholder="Final outcome and current status..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Agency-Specific Fields */}
              {incident?.agency_type?.toLowerCase() === 'pnp' && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3">PNP Specific Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Case Number</label>
                      <input
                        type="text"
                        value={finalReportData.caseNumber || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, caseNumber: e.target.value }))}
                        placeholder="e.g., PNP-2024-001234"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Suspects</label>
                      <input
                        type="text"
                        value={finalReportData.suspects || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, suspects: e.target.value }))}
                        placeholder="Suspect information if any"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Evidence Collected</label>
                    <input
                      type="text"
                      value={finalReportData.evidence || ''}
                      onChange={(e) => setFinalReportData(prev => ({ ...prev, evidence: e.target.value }))}
                      placeholder="List of evidence collected"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                </div>
              )}

              {incident?.agency_type?.toLowerCase() === 'bfp' && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">BFP Specific Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Fire Origin</label>
                      <input
                        type="text"
                        value={finalReportData.fireOrigin || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, fireOrigin: e.target.value }))}
                        placeholder="Determined origin of fire"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Estimated Damage</label>
                      <input
                        type="text"
                        value={finalReportData.estimatedDamage || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, estimatedDamage: e.target.value }))}
                        placeholder="e.g., ₱500,000"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Casualties</label>
                    <input
                      type="text"
                      value={finalReportData.casualties || ''}
                      onChange={(e) => setFinalReportData(prev => ({ ...prev, casualties: e.target.value }))}
                      placeholder="Injuries or fatalities if any"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                </div>
              )}

              {incident?.agency_type?.toLowerCase() === 'pdrrmo' && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-3">PDRRMO Specific Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Affected Families</label>
                      <input
                        type="text"
                        value={finalReportData.affectedFamilies || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, affectedFamilies: e.target.value }))}
                        placeholder="Number of families affected"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Evacuees</label>
                      <input
                        type="text"
                        value={finalReportData.evacuees || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, evacuees: e.target.value }))}
                        placeholder="Number of evacuees"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Assistance Provided</label>
                    <input
                      type="text"
                      value={finalReportData.assistanceProvided || ''}
                      onChange={(e) => setFinalReportData(prev => ({ ...prev, assistanceProvided: e.target.value }))}
                      placeholder="Relief goods, shelter, etc."
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Recommendations (optional)
                </label>
                <textarea
                  value={finalReportData.recommendations || ''}
                  onChange={(e) => setFinalReportData(prev => ({ ...prev, recommendations: e.target.value }))}
                  placeholder="Any recommendations for future prevention or follow-up..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowFinalReportModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFinalReport}
                disabled={savingFinalReport}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {savingFinalReport ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <FileText size={18} />
                    Submit & Close Incident
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IncidentDetail;
