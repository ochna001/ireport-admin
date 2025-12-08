import {
    ArrowLeft,
    Clock,
    Edit3,
    FileText,
    History,
    Image as ImageIcon,
    MapPin,
    Send,
    User,
    UserCheck,
    Truck,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSessionScope, isStationScoped } from '../utils/sessionScope';
import { FinalReportModal } from '../components/FinalReportModal';

interface Incident {
  id: string;
  agency_type: string;
  reporter_id?: string;
  reporter_name: string;
  reporter_age: number;
  reporter_phone?: string;
  reporter_latitude?: number;
  reporter_longitude?: number;
  description: string;
  status: string;
  latitude: number;
  longitude: number;
  location_address: string;
  media_urls: string | string[] | null;
  assigned_station_id?: number;
  assigned_officer_id?: string;
  assigned_officer_ids?: string[]; // Multiple officers
  assigned_resource_ids?: number[];
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
  station_id?: number | null;
  status?: string;
}

interface AgencyResource {
  id: number;
  name: string;
  type: string;
  status: string;
  station_id: number;
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
  const [resources, setResources] = useState<AgencyResource[]>([]);
  const [unitReports, setUnitReports] = useState<any[]>([]);
  const [finalReport, setFinalReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<string[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [initialOfficerIds, setInitialOfficerIds] = useState<string[]>([]);
  const [initialResourceIds, setInitialResourceIds] = useState<number[]>([]);
  const [initialStationId, setInitialStationId] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Final Report Modal State (legacy - for closing incidents)
  const [showFinalReportModal, setShowFinalReportModal] = useState(false);
  const [finalReportData, setFinalReportData] = useState<FinalReportData>({
    summary: '',
    actionsTaken: '',
    outcome: '',
    recommendations: '',
  });
  const [savingFinalReport, setSavingFinalReport] = useState(false);
  
  // Enhanced Final Report Modal (with drafts support)
  const [showEnhancedReportModal, setShowEnhancedReportModal] = useState(false);

  // Media Upload State
  const [uploadingMedia, setUploadingMedia] = useState(false);

  useEffect(() => {
    if (id) {
      loadIncident();
      loadHistory();
      loadUnitReports();
      loadFinalReport();
    }
  }, [id]);

  // Load stations and officers after incident is loaded
  useEffect(() => {
    if (incident?.latitude && incident?.longitude) {
      loadStations();
    }
    if (incident?.agency_type) {
      loadOfficers(incident.agency_type);
      loadResources();
    }
  }, [incident?.latitude, incident?.longitude, incident?.agency_type]);

  const loadIncident = async () => {
    try {
      const data = await window.api.getIncident(id!);
      console.log('[IncidentDetail] Loaded incident:', data);
      console.log('[IncidentDetail] Location coords:', data?.latitude, data?.longitude);
      setIncident(data);
      setNewStatus(data?.status || '');
      setSelectedStationId(data?.assigned_station_id);
      setInitialStationId(data?.assigned_station_id);

      const officerIds = data?.assigned_officer_ids || [];
      setSelectedOfficerIds(officerIds);
      setInitialOfficerIds(officerIds);

      const resourceIds = data?.assigned_resource_ids || [];
      setSelectedResourceIds(resourceIds);
      setInitialResourceIds(resourceIds);
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

  const loadUnitReports = async () => {
    try {
      const data = await window.api.getUnitReportsByIncident(id!);
      setUnitReports(data);
    } catch (error) {
      console.error('Failed to load unit reports:', error);
    }
  };

  const loadFinalReport = async () => {
    try {
      const data = await window.api.getFinalReport(id!);
      setFinalReport(data);
    } catch (error) {
      console.error('Failed to load final report:', error);
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

  const loadOfficers = async (agencyType: string) => {
    try {
      const scope = getSessionScope();
      let data = await window.api.getOfficersByAgency(agencyType);

      // Filter based on scope if needed
      let filtered = data || [];
      if (isStationScoped(scope) && scope.stationId) {
        filtered = filtered.filter((officer: Officer) => !officer.station_id || officer.station_id === scope.stationId);
      }
      setOfficers(filtered);
    } catch (error) {
      console.error('Failed to load officers:', error);
    }
  };

  const loadResources = async () => {
    try {
      const data = await window.api.getResources?.() || [];
      setResources(data);
    } catch (error) {
      console.error('Failed to load resources:', error);
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

  const hasResourceChanges = () => {
    if (selectedResourceIds.length !== initialResourceIds.length) return true;
    const sortedSelected = [...selectedResourceIds].sort();
    const sortedInitial = [...initialResourceIds].sort();
    return JSON.stringify(sortedSelected) !== JSON.stringify(sortedInitial);
  };

  const hasChanges = () => {
    return newStatus !== incident?.status ||
           (selectedStationId !== initialStationId) ||
           hasOfficerChanges() ||
           hasResourceChanges() ||
           (notes.trim().length > 0);
  };

  const performStatusUpdate = async () => {
    if (!incident) return;
    
    // Confirmation for critical status changes
    if ((newStatus === 'resolved' || newStatus === 'closed') &&
        !confirm(`Are you sure you want to mark this incident as ${newStatus}? This action cannot be easily undone.`)) {
      return;
    }

    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    try {
      const scope = getSessionScope();
      await window.api.updateIncidentStatus({
        id: incident.id,
        status: newStatus,
        notes: notes,
        updatedBy: scope.role === 'Admin' ? 'Admin' : (scope.role || 'User'),
        updatedById: scope.userId || undefined,
        stationId: selectedStationId ?? undefined,
        officerIds: selectedOfficerIds,
        resourceIds: selectedResourceIds
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
      const scope = getSessionScope();
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
        completedBy: scope.userId || 'unknown',
      });

      // Log security action
      await window.api.logSecurityAction({
        action: 'final_report_created',
        details: { incident_id: id }
      });

      // Close modal and proceed with status update
      setShowFinalReportModal(false);
      await performStatusUpdate();
      await loadFinalReport(); // Reload to show the new final report
      
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

  const handleUploadMedia = async () => {
    if (!id) return;
    
    setUploadingMedia(true);
    try {
      // Open file dialog
      const result = await window.api.openFileDialog({
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
          { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }
        ]
      });
      
      if (result.canceled || !result.filePath) {
        setUploadingMedia(false);
        return;
      }
      
      // Determine media type from extension
      const ext = result.filePath.split('.').pop()?.toLowerCase() || '';
      const videoExts = ['mp4', 'mov', 'avi', 'mkv'];
      const mediaType = videoExts.includes(ext) ? 'video' : 'photo';
      
      // Extract filename
      const fileName = result.filePath.split(/[\\/]/).pop() || 'upload';
      
      // Upload to Supabase
      await window.api.uploadMedia({
        incidentId: id,
        filePath: result.filePath,
        fileName,
        mediaType
      });
      
      // Reload incident to show new media
      await loadIncident();
      
      alert('Media uploaded successfully!');
    } catch (error) {
      console.error('Failed to upload media:', error);
      alert('Failed to upload media. Please try again.');
    } finally {
      setUploadingMedia(false);
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
    const raw = incident?.media_urls;
    if (!raw) return [];

    // Supabase returns text[] so handle arrays first
    if (Array.isArray(raw)) {
      return raw.filter((item): item is string => typeof item === 'string');
    }

    // Fallback: stringified JSON array or single URL string
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string');
        }
      } catch {
        // Not JSON, treat as single URL
        if (raw.trim().length > 0) {
          return [raw.trim()];
        }
      }
    }

    return [];
  };

  const getMediaType = (url: string): 'video' | 'image' | 'unknown' => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.match(/\.(mp4|mov|webm|ogg|m4v)$/)) return 'video';
    if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|avif|heic|heif)$/)) return 'image';
    return 'unknown';
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

  const mediaItems = getMediaUrls().map((url) => ({
    url,
    type: getMediaType(url),
  }));

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
          {/* Initial Incident Report (from Reporter) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <FileText size={20} />
                Initial Incident Report
              </h2>
              <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                From Reporter
              </span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{incident.description}</p>
          </div>

          {/* Final Report Section - with Edit/Create Draft button */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <FileText size={20} />
                Final Report
              </h2>
              <button
                onClick={() => setShowEnhancedReportModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
              >
                <Edit3 size={16} />
                {finalReport ? 'Edit Report' : 'Create/Edit Draft'}
              </button>
            </div>
            
            {finalReport ? (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs px-2 py-1 bg-green-600 text-white rounded">
                    Published
                  </span>
                  <button
                    onClick={() => {/* TODO: Export PDF */}}
                    className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-sm flex items-center gap-1"
                  >
                    <FileText size={14} />
                    Export PDF
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Summary</h3>
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{finalReport.report_details?.summary || finalReport.report_details?.narrative || 'N/A'}</p>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Actions Taken</h3>
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{finalReport.report_details?.actionsTaken || 'N/A'}</p>
                  </div>
                  
                  {finalReport.report_details?.recommendations && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Recommendations</h3>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{finalReport.report_details?.recommendations}</p>
                    </div>
                  )}
                  
                  <div className="pt-2 border-t border-green-200 dark:border-green-800 text-xs text-gray-500 dark:text-gray-400">
                    Completed on {formatDate(finalReport.completed_at)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FileText size={48} className="mx-auto mb-3 opacity-50" />
                <p>No final report yet</p>
                <p className="text-sm">Click "Create/Edit Draft" to start</p>
              </div>
            )}
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
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <ImageIcon size={20} />
                Media ({mediaItems.length})
              </h2>
              <button
                onClick={handleUploadMedia}
                disabled={uploadingMedia}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
              >
                {uploadingMedia ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <ImageIcon size={16} />
                    Upload Media
                  </>
                )}
              </button>
            </div>
            {mediaItems.length > 0 ? (
              <div className="grid grid-cols-3 gap-4">
                {mediaItems.map((item, index) => {
                  const isVideo = item.type === 'video';
                  const isImage = item.type === 'image';

                  if (isVideo) {
                    return (
                      <div
                        key={index}
                        className="relative aspect-square bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden"
                      >
                        <video
                          src={item.url}
                          controls
                          preload="metadata"
                          className="w-full h-full object-cover"
                        >
                          Your browser does not support the video tag.
                        </video>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute bottom-2 right-2 text-xs px-2 py-1 bg-black/70 text-white rounded"
                        >
                          Open
                        </a>
                      </div>
                    );
                  }

                  if (isImage) {
                    return (
                      <a
                        key={index}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                      >
                        <img
                          src={item.url}
                          alt={`Media ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    );
                  }

                  return (
                    <a
                      key={index}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center aspect-square bg-gray-100 dark:bg-gray-900 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                    >
                      View file
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No media uploaded yet. Click "Upload Media" to add photos or videos.</p>
            )}
          </div>

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

          {/* Unit Reports from Field Officers */}
          {unitReports.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <FileText size={20} />
                Field Officer Reports ({unitReports.length})
              </h2>
              <div className="space-y-4">
                {unitReports.map((report) => (
                  <div key={report.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800 dark:text-white">{report.title}</span>
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                        {report.agency}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      By: {report.profiles?.display_name || 'Unknown Officer'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Submitted: {formatDate(report.created_at)}
                    </p>
                    {report.details && (
                      <details className="mt-2">
                        <summary className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                          View Details
                        </summary>
                        <div className="mt-2 p-3 bg-white dark:bg-gray-800 rounded text-sm">
                          <pre className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                            {JSON.stringify(report.details, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
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
              {incident.reporter_phone && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
                  <a 
                    href={`tel:${incident.reporter_phone}`}
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {incident.reporter_phone}
                  </a>
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
                  <p className="text-sm text-gray-500 dark:text-gray-400">Profile Contact</p>
                  <a 
                    href={`tel:${incident.reporter.phone_number}`}
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {incident.reporter.phone_number}
                  </a>
                </div>
              )}
              {incident.reporter_latitude && incident.reporter_longitude && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Reporter Location</p>
                  <a 
                    href={`https://www.google.com/maps?q=${incident.reporter_latitude},${incident.reporter_longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-sm"
                  >
                    {incident.reporter_latitude.toFixed(6)}, {incident.reporter_longitude.toFixed(6)} ↗
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
                  {(() => {
                    const visibleOfficers = officers.filter(officer => {
                      const targetStationId = selectedStationId || incident.assigned_station_id;
                      // If station is selected/assigned, only show officers from that station or with no station
                      if (targetStationId) {
                        return !officer.station_id || officer.station_id === targetStationId;
                      }
                      return true;
                    });

                    if (visibleOfficers.length === 0) {
                      return (
                        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          No officers available {selectedStationId ? 'at selected station' : `for ${incident.agency_type?.toUpperCase()}`}
                        </p>
                      );
                    }

                    return visibleOfficers.map((officer) => {
                      const isCurrentlyAssigned = initialOfficerIds.includes(officer.id);
                      const isAvailable = officer.status === 'available' || !officer.status;
                      // Show busy indicator if not available and not currently assigned to THIS incident
                      // If assigned to THIS incident, they are "busy" but valid to keep assigned
                      const showBusy = !isAvailable && !isCurrentlyAssigned;

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
                          disabled={showBusy} // Disable if busy on another incident
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-white truncate flex items-center gap-2">
                            {officer.display_name || officer.email}
                            {isCurrentlyAssigned && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded">
                                Assigned
                              </span>
                            )}
                            {showBusy && (
                              <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 rounded">
                                Busy
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {officer.role} {officer.phone_number && `• ${officer.phone_number}`}
                          </p>
                        </div>
                      </label>
                    );});
                  })()}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Select one or more officers to respond to this incident
                </p>
              </div>

              {/* Assign Resources */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span className="flex items-center gap-1">
                    <Truck size={14} />
                    Assign Resources
                  </span>
                  {selectedResourceIds.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                      ({selectedResourceIds.length} selected{hasResourceChanges() ? ' - modified' : ''})
                    </span>
                  )}
                </label>
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-700">
                  {(() => {
                    const visibleResources = resources.filter(res => {
                      const targetStationId = selectedStationId || incident.assigned_station_id;
                      // Filter by station (must match assigned station)
                      if (targetStationId) {
                        return res.station_id === targetStationId;
                      }
                      // If no station assigned, show all? Or none?
                      // Usually resources belong to a station. If incident has no station, maybe show none until station selected.
                      return false;
                    });

                    if (visibleResources.length === 0) {
                      return (
                        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {selectedStationId ? 'No resources available at selected station' : 'Select a station to see resources'}
                        </p>
                      );
                    }

                    return visibleResources.map((res) => {
                      const isCurrentlyAssigned = initialResourceIds.includes(res.id);
                      const isAvailable = res.status === 'available';
                      const showBusy = !isAvailable && !isCurrentlyAssigned;

                      return (
                      <label
                        key={res.id}
                        className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-100 dark:border-gray-600 last:border-b-0 ${
                          isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedResourceIds.includes(res.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedResourceIds([...selectedResourceIds, res.id]);
                            } else {
                              setSelectedResourceIds(selectedResourceIds.filter(id => id !== res.id));
                            }
                          }}
                          disabled={showBusy}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-white truncate flex items-center gap-2">
                            {res.name}
                            {isCurrentlyAssigned && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded">
                                Assigned
                              </span>
                            )}
                            {showBusy && (
                              <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 rounded capitalize">
                                {res.status}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                            {res.type}
                          </p>
                        </div>
                      </label>
                    );});
                  })()}
                </div>
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

      {/* Enhanced Final Report Modal (with drafts) */}
      <FinalReportModal
        isOpen={showEnhancedReportModal}
        onClose={() => setShowEnhancedReportModal(false)}
        incident={incident}
        existingFinalReport={finalReport}
        onReportPublished={() => {
          loadFinalReport();
          loadIncident();
        }}
      />
    </div>
  );
}

export default IncidentDetail;
