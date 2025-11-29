import {
    ArrowLeft,
    Clock,
    History,
    Image as ImageIcon,
    MapPin,
    Send,
    User
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface Incident {
  id: string;
  agency_type: string;
  reporter_name: string;
  reporter_age: number;
  description: string;
  status: string;
  latitude: number;
  longitude: number;
  location_address: string;
  media_urls: string;
  created_at: string;
  updated_at: string;
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
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    if (id) {
      loadIncident();
      loadHistory();
    }
  }, [id]);

  // Load stations after incident is loaded (needs coordinates)
  useEffect(() => {
    if (incident?.latitude && incident?.longitude) {
      loadStations();
    }
  }, [incident?.latitude, incident?.longitude]);

  const loadIncident = async () => {
    try {
      const data = await window.api.getIncident(id!);
      console.log('[IncidentDetail] Loaded incident:', data);
      console.log('[IncidentDetail] Location coords:', data?.latitude, data?.longitude);
      setIncident(data);
      setNewStatus(data?.status || '');
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

  const handleUpdateStatus = async () => {
    if (!newStatus) return;
    
    // Confirmation for critical status changes
    if ((newStatus === 'resolved' || newStatus === 'archived') && 
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
      });

      await loadIncident();
      await loadHistory();
      setNotes('');
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update status:', error);
      setUpdateError('Failed to update status. Please try again.');
    } finally {
      setUpdating(false);
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
                disabled={updating || newStatus === incident.status}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} />
                {updating ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IncidentDetail;
