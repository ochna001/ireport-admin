import {
  ArrowLeft,
  BrainCircuit,
  AlertTriangle,
  Loader2,
  Building2,
  Check,
  ChevronDown,
  Clock,
  Edit3,
  FileText,
  History,
  Image as ImageIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCcw,
  Send,
  User,
  UserCheck,
  Users,
  Truck,
  Unlock,
  X
} from 'lucide-react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSessionScope, isStationScoped } from '../utils/sessionScope';
import { exportFinalReportToPDF } from '../utils/exportUtils';
import { FinalReportModal } from '../components/FinalReportModal';
import { RouteMap } from '../components/RouteMap';

interface Incident {
  id: string;
  agency_type: string;
  reporter_id?: string;
  reporter_name: string;
  reporter_age: number;
  reporter_phone?: string;
  reporter_location_address?: string;
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
  casualties_category?: string;
  casualties_count?: number;
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
  profiles?: {
    display_name: string;
  };
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
  agency_id?: number | null;
  status?: string;
}

interface AgencyResource {
  id: number;
  name: string;
  type: string;
  status: string;
  station_id: number;
}

interface AssignmentHistoryEntry {
  id: string;
  from_status?: string | null;
  to_status: string;
  reason: string;
  previous_officer_ids: string[];
  new_officer_ids: string[];
  previous_resource_ids: number[];
  new_resource_ids: number[];
  agency_ids: number[];
  changed_by_label?: string | null;
  notes?: string | null;
  created_at: string;
  previous_station?: { id: number; name?: string } | null;
  new_station?: { id: number; name?: string } | null;
  previous_officers?: Array<{ id: string; display_name?: string; email?: string; role?: string }>;
  new_officers?: Array<{ id: string; display_name?: string; email?: string; role?: string }>;
  previous_resources?: Array<{ id: number; name?: string; type?: string }>;
  new_resources?: Array<{ id: number; name?: string; type?: string }>;
  agencies?: Array<{ id: number; name?: string; short_name?: string }>;
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
  // MDRRMO specific
  affectedFamilies?: string;
  evacuees?: string;
  assistanceProvided?: string;
}

type BackupRequestStatus = 'pending' | 'acknowledged' | 'assigned' | 'resolved' | 'cancelled' | 'rejected';

interface BackupRequest {
  id: number;
  incident_id: string;
  requested_by: string;
  status: BackupRequestStatus;
  reason?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at?: string;
  acknowledged_at?: string | null;
  assigned_at?: string | null;
  resolved_at?: string | null;
  cancelled_at?: string | null;
  requester?: { display_name?: string; email?: string; role?: string };
  requested_agency?: { short_name?: string; name?: string };
  requested_station?: { name?: string };
  target_agency?: { short_name?: string; name?: string };
  target_station?: { name?: string };
}

interface DispatchPlan {
  recommended_status?: string;
  recommended_agency?: string;
  recommended_station_id?: number;
  recommended_station_name?: string;
  recommended_resource_ids?: number[];
  recommended_officer_ids?: string[];
  resource_needs?: string[] | string;
  personnel_needs?: string[] | string;
  requires_human_review?: boolean;
  review_reasons?: string[] | string;
  confidence?: number;
}

interface AIRecommendation {
  recommendedStatus: string;
  recommendedAgency: string;
  recommendedStationId: number | null;
  recommendedStationLabel: string;
  recommendedResourceIds: number[];
  recommendedResourceNames: string[];
  recommendedOfficerIds: string[];
  recommendedOfficerNames: string[];
  resourceNeeds: string[];
  personnelNeeds: string[];
  requiresHumanReview: boolean;
  reviewReasons: string[];
  confidence: number | null;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-500' },
  { value: 'assigned', label: 'Assigned', color: 'bg-blue-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-orange-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-green-500' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500' },
  { value: 'ai_routing', label: 'AI Routing', color: 'bg-purple-500' },
];

const VALID_STATUSES = new Set(STATUS_OPTIONS.map((option) => option.value));
const VALID_AGENCIES = new Set(['pnp', 'bfp', 'mdrrmo']);

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const parseRequestedCount = (values: string[], fallbackCount: number): number => {
  const joined = values.join(' ');
  const match = joined.match(/\b(\d{1,2})\b/);
  if (!match) return fallbackCount;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 1) return fallbackCount;
  return Math.min(parsed, 6);
};

const toAgencyKey = (value: unknown): string => {
  const key = String(value || '').trim().toLowerCase();
  return VALID_AGENCIES.has(key) ? key : '';
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

function IncidentDetail() {
  const scope = useMemo(() => getSessionScope(), []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [stations, setStations] = useState<AgencyStation[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [resources, setResources] = useState<AgencyResource[]>([]);
  const [unitReports, setUnitReports] = useState<any[]>([]);
  const [finalReport, setFinalReport] = useState<any>(null);
  const [draftReport, setDraftReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aiReport, setAiReport] = useState<any>(null);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [viewAgencyFilter, setViewAgencyFilter] = useState<string>('all');
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<string[]>([]);
  const [selectedPrimaryOfficerId, setSelectedPrimaryOfficerId] = useState<string | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [initialOfficerIds, setInitialOfficerIds] = useState<string[]>([]);
  const [initialPrimaryOfficerId, setInitialPrimaryOfficerId] = useState<string | null>(null);
  const [initialResourceIds, setInitialResourceIds] = useState<number[]>([]);
  const [initialStationId, setInitialStationId] = useState<number | null>(null);

  const isLocked = incident?.status === 'closed' || incident?.status === 'resolved';
  const [otherIncidents, setOtherIncidents] = useState<any[]>([]);
  const [hideBusy, setHideBusy] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [isUpdateStatusExpanded, setIsUpdateStatusExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'management' | 'backups'>('overview');

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

  // Administrative actions
  const [reopening, setReopening] = useState(false);
  const [showReopenConfirmModal, setShowReopenConfirmModal] = useState(false);

  // Media Upload State
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Draft media (from final_report_drafts.draft_details.media_urls)
  const [draftMediaUrls, setDraftMediaUrls] = useState<string[]>([]);

  // Routing state
  const [showRoute, setShowRoute] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);

  // Multi-Agency Coordination State
  const [incidentAgencies, setIncidentAgencies] = useState<any[]>([]);
  const [availableAgencies, setAvailableAgencies] = useState<any[]>([]);
  const [showAddAgencyModal, setShowAddAgencyModal] = useState(false);
  const [selectedAgencyToAdd, setSelectedAgencyToAdd] = useState<number | null>(null);
  const [selectedAgencyRole, setSelectedAgencyRole] = useState<'supporting' | 'lead'>('supporting');
  const [addingAgency, setAddingAgency] = useState(false);
  const [backupRequests, setBackupRequests] = useState<BackupRequest[]>([]);
  const [updatingBackupRequestId, setUpdatingBackupRequestId] = useState<number | null>(null);

  // Track which agencies are involved (primary + supporting)
  const [involvedAgencies, setInvolvedAgencies] = useState<string[]>([]);

  // Callback for when route is loaded from RouteMap component
  const handleRouteLoaded = useCallback((distance: number, duration: number) => {
    setRouteInfo({ distance, duration });
  }, []);

  const openPipelineLog = useCallback(() => {
    if (!id) return;
    navigate(`/ai-analysis?tab=pipeline-log&incidentId=${encodeURIComponent(id)}`);
  }, [id, navigate]);

  const aiRecommendation = useMemo<AIRecommendation | null>(() => {
    if (!incident || !aiReport) return null;

    const rawOutput = (aiReport?.raw_vlm_output && typeof aiReport.raw_vlm_output === 'object')
      ? aiReport.raw_vlm_output
      : {};
    const mainReport = (rawOutput?.grounded_report && typeof rawOutput.grounded_report === 'object')
      ? rawOutput.grounded_report
      : rawOutput;
    const dispatchPlan: DispatchPlan =
      (rawOutput?.dispatch_plan && typeof rawOutput.dispatch_plan === 'object')
        ? rawOutput.dispatch_plan
        : (mainReport?.dispatch_plan && typeof mainReport.dispatch_plan === 'object')
          ? mainReport.dispatch_plan
          : {};

    const recommendedAgency =
      toAgencyKey(dispatchPlan.recommended_agency) ||
      toAgencyKey(mainReport?.recommended_agency) ||
      toAgencyKey(incident.agency_type) ||
      'mdrrmo';

    const requestedStatus = String(dispatchPlan.recommended_status || '').trim().toLowerCase();
    const severity = Number(aiReport?.severity || 1);
    const recommendedStatus = VALID_STATUSES.has(requestedStatus)
      ? requestedStatus
      : severity >= 4
        ? 'assigned'
        : 'pending';

    const agencyStations = stations.filter((station) =>
      station.agencies?.short_name?.toLowerCase() === recommendedAgency
    );

    let recommendedStation: AgencyStation | undefined;
    if (dispatchPlan.recommended_station_id) {
      recommendedStation = stations.find((station) => station.id === dispatchPlan.recommended_station_id);
    }

    if (!recommendedStation && dispatchPlan.recommended_station_name) {
      const stationName = dispatchPlan.recommended_station_name.toLowerCase();
      recommendedStation = agencyStations.find((station) =>
        station.name?.toLowerCase().includes(stationName)
      );
    }

    if (!recommendedStation && agencyStations.length > 0) {
      const incLat = Number(incident.latitude);
      const incLng = Number(incident.longitude);
      if (Number.isFinite(incLat) && Number.isFinite(incLng)) {
        recommendedStation = [...agencyStations].sort((a, b) => {
          const distA = haversineKm(incLat, incLng, Number(a.latitude), Number(a.longitude));
          const distB = haversineKm(incLat, incLng, Number(b.latitude), Number(b.longitude));
          return distA - distB;
        })[0];
      } else {
        recommendedStation = agencyStations[0];
      }
    }

    const resourceNeeds = toStringArray(dispatchPlan.resource_needs || mainReport?.resource_needs);
    const personnelNeeds = toStringArray(dispatchPlan.personnel_needs || mainReport?.personnel_needs);

    const resourcePool = recommendedStation
      ? resources.filter((resource) => resource.station_id === recommendedStation!.id)
      : resources;
    const preferredResourceIds = Array.isArray(dispatchPlan.recommended_resource_ids)
      ? dispatchPlan.recommended_resource_ids.map(Number).filter(Number.isFinite)
      : [];
    let recommendedResources = preferredResourceIds
      .map((resId) => resourcePool.find((resource) => resource.id === resId && resource.status === 'available'))
      .filter(Boolean) as AgencyResource[];

    if (recommendedResources.length === 0) {
      const availableResources = resourcePool.filter((resource) => resource.status === 'available');
      const resourceCount = parseRequestedCount(resourceNeeds, severity >= 4 ? 3 : 2);
      recommendedResources = availableResources.slice(0, resourceCount);
    }

    const officerPool = recommendedStation
      ? officers.filter((officer) => officer.station_id === recommendedStation!.id)
      : officers.filter((officer) => {
        const officerStation = stations.find((station) => station.id === officer.station_id);
        return officerStation?.agencies?.short_name?.toLowerCase() === recommendedAgency;
      });
    const preferredOfficerIds = Array.isArray(dispatchPlan.recommended_officer_ids)
      ? dispatchPlan.recommended_officer_ids.map(String)
      : [];
    let recommendedOfficers = preferredOfficerIds
      .map((officerId) => officerPool.find((officer) => officer.id === officerId && officer.status === 'available'))
      .filter(Boolean) as Officer[];

    if (recommendedOfficers.length === 0) {
      const availableOfficers = officerPool.filter((officer) => !officer.status || officer.status === 'available');
      const officerCount = parseRequestedCount(personnelNeeds, severity >= 4 ? 3 : 2);
      recommendedOfficers = availableOfficers.slice(0, officerCount);
    }

    const reviewReasons = toStringArray(dispatchPlan.review_reasons);
    if (aiReport.status === 'failed') {
      reviewReasons.push('AI analysis failed previously and needs human validation.');
    }
    if (severity >= 4) {
      reviewReasons.push('High severity incident requires human review before dispatch updates.');
    }
    if (!recommendedStation) {
      reviewReasons.push('No matching station was found for the recommended agency.');
    }
    if (recommendedResources.length === 0) {
      reviewReasons.push('No available resources were selected automatically.');
    }
    if (recommendedOfficers.length === 0) {
      reviewReasons.push('No available officers were selected automatically.');
    }

    const rawConfidence = dispatchPlan.confidence ?? mainReport?.confidence;
    const parsedConfidence = Number(rawConfidence);
    const normalizedConfidence = Number.isFinite(parsedConfidence)
      ? Math.max(0, Math.min(1, parsedConfidence > 1 ? parsedConfidence / 100 : parsedConfidence))
      : null;

    if (normalizedConfidence === null) {
      reviewReasons.push('Auto-dispatch confidence is unavailable. Keep human review enabled.');
    } else if (normalizedConfidence < 0.75) {
      reviewReasons.push('Auto-dispatch confidence is low. Keep human review enabled.');
    }

    return {
      recommendedStatus,
      recommendedAgency,
      recommendedStationId: recommendedStation?.id ?? null,
      recommendedStationLabel: recommendedStation
        ? `${recommendedStation.name} (${recommendedStation.agencies?.short_name?.toUpperCase()})`
        : 'No station recommendation',
      recommendedResourceIds: recommendedResources.map((resource) => resource.id),
      recommendedResourceNames: recommendedResources.map((resource) => resource.name),
      recommendedOfficerIds: recommendedOfficers.map((officer) => officer.id),
      recommendedOfficerNames: recommendedOfficers.map((officer) => officer.display_name || officer.email),
      resourceNeeds,
      personnelNeeds,
      requiresHumanReview: dispatchPlan.requires_human_review ?? reviewReasons.length > 0,
      reviewReasons: Array.from(new Set(reviewReasons)),
      confidence: normalizedConfidence,
    };
  }, [aiReport, incident, stations, resources, officers]);

  const applyAIRecommendation = useCallback(() => {
    if (!aiRecommendation || isLocked) return;

    setNewStatus(aiRecommendation.recommendedStatus);
    setSelectedStationId(aiRecommendation.recommendedStationId);
    setSelectedResourceIds(aiRecommendation.recommendedResourceIds);
    setSelectedOfficerIds(aiRecommendation.recommendedOfficerIds);
    setSelectedPrimaryOfficerId(aiRecommendation.recommendedOfficerIds[0] || null);
    setNotes((prev) => {
      const marker = '[AI Recommendation Applied]';
      if (prev.includes(marker)) return prev;
      const next = `${marker} status=${aiRecommendation.recommendedStatus}, agency=${aiRecommendation.recommendedAgency}, station=${aiRecommendation.recommendedStationLabel}`;
      return prev ? `${prev.trim()}\n${next}` : next;
    });
  }, [aiRecommendation, isLocked]);

  const renderAIRecommendationPanel = () => {
    if (!aiRecommendation) return null;

    const confidenceLow = aiRecommendation.confidence !== null && aiRecommendation.confidence < 0.75;
    const needsReview = aiRecommendation.requiresHumanReview || aiRecommendation.reviewReasons.length > 0 || confidenceLow;
    const confidenceMessage = aiRecommendation.confidence === null
      ? 'Auto-dispatch confidence unavailable (manual review required)'
      : aiRecommendation.confidence < 0.75
        ? `Low (${(aiRecommendation.confidence * 100).toFixed(0)}%) - manual review required`
        : `High (${(aiRecommendation.confidence * 100).toFixed(0)}%)`;
    const readinessLabel = needsReview ? 'Needs Human Review' : 'Eligible for Auto';
    const readinessClass = needsReview
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700'
      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';

    return (
      <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50/70 dark:bg-blue-900/20 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300">AI Recommendation (Human Override)</h3>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span
              title="Automation readiness is advisory only. No automatic dispatch is executed."
              className={`px-2 py-1 text-[11px] font-medium rounded-full border ${readinessClass}`}
            >
              {readinessLabel}
            </span>
            <button
              onClick={openPipelineLog}
              className="px-2.5 py-1 text-xs rounded border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
            >
              View Full Analysis
            </button>
            <button
              onClick={applyAIRecommendation}
              disabled={isLocked}
              className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Apply AI Recommendation
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400">Recommended Status</p>
            <p className="font-medium text-gray-900 dark:text-white">{aiRecommendation.recommendedStatus}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Recommended Agency</p>
            <p className="font-medium text-gray-900 dark:text-white">{aiRecommendation.recommendedAgency.toUpperCase()}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Recommended Station</p>
            <p className="font-medium text-gray-900 dark:text-white">{aiRecommendation.recommendedStationLabel}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Confidence</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {confidenceMessage}
            </p>
          </div>
        </div>
        <div className="text-sm space-y-1">
          <p className="text-gray-500 dark:text-gray-400">Recommended Resources</p>
          <p className="font-medium text-gray-900 dark:text-white">
            {aiRecommendation.recommendedResourceNames.length > 0
              ? aiRecommendation.recommendedResourceNames.join(', ')
              : 'No concrete resources selected'}
          </p>
          {aiRecommendation.resourceNeeds.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Resource needs: {aiRecommendation.resourceNeeds.join(' | ')}
            </p>
          )}
        </div>
        <div className="text-sm space-y-1">
          <p className="text-gray-500 dark:text-gray-400">Recommended Personnel</p>
          <p className="font-medium text-gray-900 dark:text-white">
            {aiRecommendation.recommendedOfficerNames.length > 0
              ? aiRecommendation.recommendedOfficerNames.join(', ')
              : 'No concrete personnel selected'}
          </p>
          {aiRecommendation.personnelNeeds.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Personnel needs: {aiRecommendation.personnelNeeds.join(' | ')}
            </p>
          )}
        </div>
        {aiRecommendation.requiresHumanReview && aiRecommendation.reviewReasons.length > 0 && (
          <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="font-medium mb-1">Human review required:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {aiRecommendation.reviewReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (id) {
      loadIncident();
      loadHistory();
      loadAssignmentHistory();
      loadUnitReports();
      loadFinalReport();
      loadDraft();
      loadIncidentAgencies();
      loadBackupRequests();
      loadAiReport();
      loadOtherIncidents();
    }
  }, [id]);

  const loadOtherIncidents = async () => {
    try {
      const resp: any = await window.api.getIncidents({ limit: 200 });
      const data = Array.isArray(resp) ? resp : (resp?.data ?? []);
      setOtherIncidents(data);
    } catch (err) {
      console.error('Failed to load other incidents:', err);
    }
  };

  const loadBackupRequests = async () => {
    try {
      const data = await window.api.getBackupRequestsByIncident(id!);
      setBackupRequests(data || []);
    } catch (error) {
      console.error('Failed to load backup requests:', error);
    }
  };

  // Load stations and officers after incident is loaded
  useEffect(() => {
    if (incident?.latitude && incident?.longitude) {
      loadStations();
    }
    if (incident?.agency_type) {
      // Load officers and resources from all involved agencies
      const agencies = [incident.agency_type];
      const supportingAgencies = incidentAgencies
        .filter(ia => ia.acknowledged_at)
        .map(ia => ia.agencies?.short_name?.toLowerCase())
        .filter(Boolean) as string[];
      const allAgencies = [...agencies, ...supportingAgencies];
      setInvolvedAgencies(allAgencies);

      // Load officers from all agencies
      allAgencies.forEach(agency => loadOfficers(agency));
      loadResources();
    }
  }, [incident?.latitude, incident?.longitude, incident?.agency_type, incidentAgencies]);

  const loadIncident = async () => {
    try {
      const data = await window.api.getIncident(id!);
      console.log('[IncidentDetail] Loaded incident:', data);
      console.log('[IncidentDetail] Location coords:', data?.latitude, data?.longitude);
      setIncident(data);
      setNewStatus(data?.status || '');
      setSelectedStationId(data?.assigned_station_id);
      setInitialStationId(data?.assigned_station_id);

      const officerIds = data?.assigned_officer_ids?.length
        ? data.assigned_officer_ids
        : data?.assigned_officer_id ? [data.assigned_officer_id] : [];

      setSelectedOfficerIds(officerIds);
      setInitialOfficerIds(officerIds);
      const primaryOfficerId = data?.assigned_officer_id || officerIds[0] || null;
      setSelectedPrimaryOfficerId(primaryOfficerId);
      setInitialPrimaryOfficerId(primaryOfficerId);

      const resourceIds = data?.assigned_resource_ids || [];
      setSelectedResourceIds(resourceIds);
      setInitialResourceIds(resourceIds);
    } catch (error) {
      console.error('Failed to load incident:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAiReport = async () => {
    try {
      const report = await window.api.getIncidentAIReport(id!);
      setAiReport(report);
    } catch (error) {
      console.error('Failed to load AI report:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await window.api.getAuditLog(id!);
      console.log('[IncidentDetail] History data received:', JSON.stringify(data, null, 2));
      setHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const loadAssignmentHistory = async () => {
    try {
      const data = await window.api.getIncidentAssignmentHistory(id!);
      setAssignmentHistory(data || []);
    } catch (error) {
      console.error('Failed to load assignment history:', error);
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

  const loadDraft = async () => {
    try {
      const draft = await window.api.getFinalReportDraft(id!);
      setDraftReport(draft);
      if (draft?.draft_details?.media_urls) {
        const urls = draft.draft_details.media_urls;
        if (Array.isArray(urls)) {
          setDraftMediaUrls(urls.filter((u: any): u is string => typeof u === 'string'));
        } else if (typeof urls === 'string') {
          // Handle JSON string or single URL
          try {
            const parsed = JSON.parse(urls);
            if (Array.isArray(parsed)) {
              setDraftMediaUrls(parsed.filter((u: any): u is string => typeof u === 'string'));
            }
          } catch {
            if (urls.trim()) setDraftMediaUrls([urls.trim()]);
          }
        }
      } else {
        setDraftMediaUrls([]);
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
      setDraftMediaUrls([]);
      setDraftReport(null);
    }
  };

  const loadIncidentAgencies = async () => {
    try {
      const data = await window.api.getIncidentAgencies(id!);
      setIncidentAgencies(data);
    } catch (error) {
      console.error('Failed to load incident agencies:', error);
    }
  };

  const loadAvailableAgencies = async () => {
    try {
      const data = await window.api.getAvailableAgencies(id!);
      setAvailableAgencies(data);
    } catch (error) {
      console.error('Failed to load available agencies:', error);
    }
  };

  const handleAddAgency = async () => {
    if (!selectedAgencyToAdd) return;

    setAddingAgency(true);
    try {
      await window.api.addIncidentAgency({
        incidentId: id!,
        agencyId: selectedAgencyToAdd,
        role: selectedAgencyRole
      });
      await loadIncidentAgencies();
      setShowAddAgencyModal(false);
      setSelectedAgencyToAdd(null);
      setSelectedAgencyRole('supporting');
    } catch (error: any) {
      console.error('Failed to add agency:', error);
      alert(error.message || 'Failed to add agency');
    } finally {
      setAddingAgency(false);
    }
  };

  const handleRemoveAgency = async (agencyRecordId: number) => {
    if (!confirm('Remove this agency from the incident?')) return;

    try {
      await window.api.removeIncidentAgency(agencyRecordId);
      await loadIncidentAgencies();
    } catch (error: any) {
      console.error('Failed to remove agency:', error);
      alert(error.message || 'Failed to remove agency');
    }
  };

  const handleAcknowledgeAgency = async (agencyRecordId: number) => {
    try {
      await window.api.acknowledgeIncidentAgency(agencyRecordId);
      await loadIncidentAgencies();
    } catch (error: any) {
      console.error('Failed to acknowledge:', error);
    }
  };

  const handleBackupRequestStatusChange = async (requestId: number, status: BackupRequestStatus) => {
    setUpdatingBackupRequestId(requestId);
    try {
      const scope = getSessionScope();
      await window.api.updateBackupRequestStatus({
        id: requestId,
        status,
        handledById: scope.userId || undefined,
      });
      await loadBackupRequests();
    } catch (error: any) {
      console.error('Failed to update backup request status:', error);
      alert(error.message || 'Failed to update backup request status');
    } finally {
      setUpdatingBackupRequestId(null);
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

      // DEBUG: Log all officers returned from API
      console.log('[IncidentDetail] Officers loaded for agency:', agencyType);
      console.log('[IncidentDetail] Total officers from API:', data?.length || 0);

      // Filter based on scope if needed
      let filtered = data || [];
      if (isStationScoped(scope) && scope.stationId) {
        filtered = filtered.filter((officer: Officer) => !officer.station_id || officer.station_id === scope.stationId);
        console.log('[IncidentDetail] Filtered to station', scope.stationId, ':', filtered.length, 'officers');
      }

      console.log('[IncidentDetail] Final officers list for', agencyType, ':', filtered.length, 'officers');

      // Accumulate officers from all agencies instead of replacing
      setOfficers(prev => {
        // Remove officers from this agency first to avoid duplicates
        const withoutThisAgency = prev.filter(o => {
          const officerAgency = stations.find(s => s.id === o.station_id)?.agencies?.short_name?.toLowerCase();
          return officerAgency !== agencyType.toLowerCase();
        });
        // Combine and deduplicate by officer ID
        const combined = [...withoutThisAgency, ...filtered];
        const uniqueOfficers = Array.from(
          new Map(combined.map(officer => [officer.id, officer])).values()
        );
        return uniqueOfficers;
      });
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

  const handleReopenIncident = async () => {
    if (!id || !isLocked) return;

    const scope = getSessionScope();
    if (scope.role !== 'Admin') {
      alert('Only administrators can re-open incidents.');
      return;
    }

    setShowReopenConfirmModal(true);
  };

  const confirmReopenIncident = async () => {
    if (!id || !isLocked) return;

    const scope = getSessionScope();
    setReopening(true);
    setShowReopenConfirmModal(false);
    try {
      const result = await window.api.reopenIncident({
        id,
        updatedBy: scope.displayName || 'Administrator',
        updatedById: scope.userId,
        notes: 'Incident explicitly re-opened by administrator.'
      });

      // Refresh data
      await Promise.all([
        loadIncident(),
        loadHistory(),
        loadAssignmentHistory()
      ]);

      const restoredOfficerIds = result?.restoredOfficerIds || [];
      const restoredResourceIds = result?.restoredResourceIds || [];
      const unavailableOfficerIds = result?.unavailableOfficerIds || [];
      const unavailableResourceIds = result?.unavailableResourceIds || [];

      if (unavailableOfficerIds.length > 0 || unavailableResourceIds.length > 0) {
        const unavailableNames = [
          ...unavailableOfficerIds.map(officerId => {
            const officer = officers.find(o => o.id === officerId);
            return officer?.display_name || officer?.email || officerId;
          }),
          ...unavailableResourceIds.map(resourceId => {
            const resource = resources.find(r => r.id === resourceId);
            return resource?.name || `Resource #${resourceId}`;
          })
        ];
        alert(
          `Incident has been re-opened. Previously assigned [${unavailableNames.join(', ')}] ` +
          `are no longer available and were not restored — please reassign.`
        );
      } else if (restoredOfficerIds.length > 0 || restoredResourceIds.length > 0) {
        const restoredNames = [
          ...restoredOfficerIds.map(officerId => {
            const officer = officers.find(o => o.id === officerId);
            return officer?.display_name || officer?.email || officerId;
          }),
          ...restoredResourceIds.map(resourceId => {
            const resource = resources.find(r => r.id === resourceId);
            return resource?.name || `Resource #${resourceId}`;
          })
        ];
        alert(`Incident has been re-opened. Previously assigned [${restoredNames.join(', ')}] were restored.`);
      } else {
        alert('Incident has been re-opened.');
      }
    } catch (error: any) {
      console.error('Failed to re-open incident:', error);
      alert(error.message || 'Failed to re-open incident. Please try again.');
    } finally {
      setReopening(false);
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

  const hasPrimaryOfficerChanges = (): boolean => {
    return selectedPrimaryOfficerId !== initialPrimaryOfficerId;
  };

  const hasResourceChanges = () => {
    if (selectedResourceIds.length !== initialResourceIds.length) return true;
    const sortedSelected = [...selectedResourceIds].sort();
    const sortedInitial = [...initialResourceIds].sort();
    return JSON.stringify(sortedSelected) !== JSON.stringify(sortedInitial);
  };

  /**
   * Map of resource id -> set of *active* incident ids that currently hold it.
   * Computed from `otherIncidents` so we don't depend on the cached
   * `agency_resources.status` column, which can drift when other clients
   * (responder Android, direct SQL) update incident status without going
   * through the admin IPC release path. Mirrors the logic in
   * `StationDetailView.tsx` so both views agree on what's actually deployed.
   */
  const ACTIVE_INCIDENT_STATUSES = useMemo(
    () => new Set(['pending', 'assigned', 'in_progress', 'responding']),
    [],
  );
  const resourceHoldersMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const inc of otherIncidents) {
      if (!inc || inc.id === id) continue;
      if (!ACTIVE_INCIDENT_STATUSES.has(inc.status)) continue;
      const ids: any[] = Array.isArray(inc.assigned_resource_ids) ? inc.assigned_resource_ids : [];
      for (const rid of ids) {
        const num = Number(rid);
        if (!Number.isFinite(num)) continue;
        const existing = map.get(num);
        if (existing) existing.push(inc.id);
        else map.set(num, [inc.id]);
      }
    }
    return map;
  }, [otherIncidents, id, ACTIVE_INCIDENT_STATUSES]);

  const isResourceHeldByOther = (resourceId: number): boolean => {
    return (resourceHoldersMap.get(resourceId)?.length ?? 0) > 0;
  };

  const hasChanges = () => {
    return newStatus !== incident?.status ||
      (selectedStationId !== initialStationId) ||
      hasOfficerChanges() ||
      hasPrimaryOfficerChanges() ||
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
        primaryOfficerId: selectedPrimaryOfficerId,
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
          primary_officer_id: selectedPrimaryOfficerId,
        }
      });

      await loadIncident();
      await loadHistory();
      await loadAssignmentHistory();
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

  // Format field name to readable label
  const formatFieldLabel = (key: string): string => {
    // Custom labels for specific fields
    const customLabels: Record<string, string> = {
      'media_urls': 'Media URLs',
      'fire_origin': 'Fire Origin',
      'estimated_damage': 'Estimated Damage',
      'casualties': 'Casualties',
      'class_of_fire': 'Class of Fire',
      'fire_location': 'Fire Location',
      'area_ownership': 'Area Ownership',
      'evidence_count': 'Evidence Count',
      'case_number': 'Case Number',
      'suspects': 'Suspects',
      'victims': 'Victims',
      'suspects_count': 'Suspects Count',
      'victims_count': 'Victims Count',
      'narrative': 'Narrative',
      'nature_of_call': 'Nature of Call',
      'emergency_type': 'Emergency Type',
      'patients': 'Patients',
      'patients_count': 'Patients Count',
      'disaster_type': 'Disaster Type',
      'affected_area': 'Affected Area',
      'casualties_dead': 'Casualties (Dead)',
      'casualties_injured': 'Casualties (Injured)',
      'casualties_missing': 'Casualties (Missing)',
      'families_affected': 'Families Affected',
      'individuals_affected': 'Individuals Affected',
      'damage_level': 'Damage Level',
      'damage_details': 'Damage Details'
    };

    // Check for custom label first
    if (customLabels[key]) {
      return customLabels[key];
    }

    // Convert snake_case to Title Case
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Format details for display (Shared logic with FinalReportModal)
  const formatReportDetails = (details: any) => {
    if (!details) return null;

    const entries = Object.entries(details).filter(([key, value]) => {
      // Skip internal fields and empty values
      if (key === 'timestamp' || key.endsWith('_data')) return false;
      // Skip responder-submission metadata tags (added when draft_details originates
      // from the responder app) - these are provenance metadata, not report content
      if (key === 'source' || key === 'submitted_by_user_id' || key === 'title') return false;
      if (value === '' || value === '0' || value === null || value === undefined) return false;
      return true;
    });

    return entries;
  };

  const renderReportValue = (key: string, value: any) => {
    // Try to parse JSON strings that look like arrays/objects
    let content = value;
    if (typeof value === 'string' && (value.trim().startsWith('[') || value.trim().startsWith('{'))) {
      try {
        content = JSON.parse(value);
      } catch (e) {
        // Not valid JSON, keep as string
      }
    }

    // Handle media_urls specially - render as clickable thumbnails
    if (key === 'media_urls' || key === 'mediaUrls') {
      let urls: string[] = [];
      if (Array.isArray(content)) {
        urls = content.filter((u: any) => typeof u === 'string' && u.startsWith('http'));
      } else if (typeof content === 'string') {
        // Try to extract URLs from string
        const urlMatches = content.match(/https?:\/\/[^\s"\\,\]]+/g);
        if (urlMatches) urls = urlMatches;
      }

      if (urls.length > 0) {
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {urls.map((url, idx) => {
              const isVideo = url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov') || url.toLowerCase().includes('.webm');
              return (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative group aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600 hover:ring-2 hover:ring-blue-500 transition-all"
                >
                  {isVideo ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                      <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                          <div className="w-0 h-0 border-t-6 border-t-transparent border-l-10 border-l-gray-800 border-b-6 border-b-transparent ml-1"></div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={url}
                      alt={`Media ${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23999"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
                      }}
                    />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs text-white">{isVideo ? '🎬 Video' : '📷 Photo'}</span>
                  </div>
                </a>
              );
            })}
          </div>
        );
      }
      return <p className="mt-1 text-gray-500 italic">No media attached</p>;
    }

    if (Array.isArray(content)) {
      // Handle array of MDRRMO patients (check for 'name' field which is unique to patients)
      if (content.length > 0 && content[0].name !== undefined && typeof content[0].name === 'string') {
        return (
          <div className="space-y-3 mt-1">
            {content.map((patient: any, idx: number) => (
              <div key={idx} className="bg-cyan-50 dark:bg-cyan-900/20 p-3 rounded border border-cyan-200 dark:border-cyan-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-cyan-800 dark:text-cyan-200">Patient {idx + 1}</p>
                  <p className="text-xs text-cyan-600 dark:text-cyan-400">
                    {patient.age && `${patient.age} years old`} {patient.sex && `• ${patient.sex}`}
                  </p>
                </div>
                <p className="font-medium text-gray-900 dark:text-white mb-2">{patient.name}</p>
                {patient.address && <p className="text-sm text-gray-600 dark:text-gray-400">📍 {patient.address}</p>}
                {patient.chiefComplaint && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                    <span className="font-medium">Chief Complaint:</span> {patient.chiefComplaint}
                  </p>
                )}
                {patient.condition && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    <span className="font-medium">Condition:</span> {patient.condition}
                  </p>
                )}
                {(patient.vitals?.bp || patient.vitals?.pulse || patient.vitals?.spo2) && (
                  <div className="mt-2 pt-2 border-t border-cyan-200 dark:border-cyan-700">
                    <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300 mb-1">Vitals:</p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400">
                      {patient.vitals.bp && <span>BP: {patient.vitals.bp}</span>}
                      {patient.vitals.pulse && <span>Pulse: {patient.vitals.pulse}</span>}
                      {patient.vitals.spo2 && <span>SpO2: {patient.vitals.spo2}%</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      }
      // Handle array of persons (suspects/victims)
      if (content.length > 0 && (content[0].firstName || content[0].lastName)) {
        return (
          <div className="space-y-2 mt-1">
            {content.map((person: any, idx: number) => (
              <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded text-sm border border-gray-100 dark:border-gray-700">
                <p className="font-medium text-gray-800 dark:text-gray-200">
                  {person.firstName} {person.middleName} {person.lastName}
                </p>
                {person.alias && <p className="text-xs text-gray-500">Alias: {person.alias}</p>}
                {(person.address || person.occupation) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {[person.address, person.occupation].filter(Boolean).join(' • ')}
                  </p>
                )}
                {person.status && <p className="text-xs text-gray-500">Status: {person.status}</p>}
              </div>
            ))}
          </div>
        );
      }
      // Generic array
      return (
        <ul className="list-disc list-inside mt-1">
          {content.map((item: any, idx: number) => (
            <li key={idx} className="text-gray-800 dark:text-gray-200">
              {typeof item === 'object' ? JSON.stringify(item) : String(item)}
            </li>
          ))}
        </ul>
      );
    }

    if (typeof content === 'object' && content !== null) {
      return <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">{JSON.stringify(content, null, 2)}</pre>;
    }

    return <p className="mt-1 text-gray-800 dark:text-white whitespace-pre-wrap">{String(content)}</p>;
  };

  const handleExportPDF = async () => {
    if (!finalReport || !incident) return;

    try {
      const doc = await exportFinalReportToPDF(incident, finalReport, incident.agency_type);
      const filenameAgency = (incident.agency_type?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : incident.agency_type).toUpperCase();
      const filename = `Final_Report_${filenameAgency}_${incident.id.substring(0, 8)}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF. Please try again.');
    }
  };

  const handleExportPDFOld = () => {
    if (!finalReport) return;

    // Create a printable window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export PDF');
      return;
    }

    const detailsHtml = formatReportDetails(finalReport.report_details)?.map(([key, value]) => {
      // Simple rendering for print - JSON stringify complex objects for now if renderReportValue logic is too complex to inject
      // We'll do a basic rendering here
      let content = value;
      try {
        if (typeof value === 'string' && (value.trim().startsWith('[') || value.trim().startsWith('{'))) {
          content = JSON.parse(value);
        }
      } catch { }

      let valueHtml = '';
      // Handle MDRRMO patients (check for 'name' field which is unique to patients)
      if (Array.isArray(content) && content.length > 0 && content[0].name !== undefined && typeof content[0].name === 'string') {
        valueHtml = content.map((p: any, idx: number) => `
           <div style="margin-bottom: 12px; padding: 12px; background: #ecfeff; border: 1px solid #06b6d4; border-radius: 6px;">
             <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
               <strong style="color: #0e7490;">Patient ${idx + 1}</strong>
               <span style="font-size: 0.85em; color: #0891b2;">${p.age ? p.age + ' years old' : ''} ${p.sex ? '• ' + p.sex : ''}</span>
             </div>
             <div style="font-weight: 600; margin-bottom: 6px;">${p.name}</div>
             ${p.address ? `<div style="color: #666; font-size: 0.9em; margin-bottom: 6px;">📍 ${p.address}</div>` : ''}
             ${p.chiefComplaint ? `<div style="margin-top: 8px; font-size: 0.9em;"><strong>Chief Complaint:</strong> ${p.chiefComplaint}</div>` : ''}
             ${p.condition ? `<div style="font-size: 0.9em;"><strong>Condition:</strong> ${p.condition}</div>` : ''}
             ${(p.vitals?.bp || p.vitals?.pulse || p.vitals?.spo2) ? `
               <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #06b6d4;">
                 <div style="font-size: 0.85em; font-weight: 600; color: #0e7490; margin-bottom: 4px;">Vitals:</div>
                 <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 0.85em; color: #666;">
                   ${p.vitals.bp ? `<span>BP: ${p.vitals.bp}</span>` : ''}
                   ${p.vitals.pulse ? `<span>Pulse: ${p.vitals.pulse}</span>` : ''}
                   ${p.vitals.spo2 ? `<span>SpO2: ${p.vitals.spo2}%</span>` : ''}
                 </div>
               </div>
             ` : ''}
           </div>
         `).join('');
      }
      // Handle PNP suspects/victims
      else if (Array.isArray(content) && content.length > 0 && (content[0].firstName || content[0].lastName)) {
        valueHtml = content.map((p: any) => `
           <div style="margin-bottom: 8px; padding: 8px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px;">
             <strong>${p.firstName} ${p.middleName || ''} ${p.lastName}</strong>
             ${p.address ? `<br><span style="color: #666; font-size: 0.9em;">${p.address}</span>` : ''}
           </div>
         `).join('');
      } else if (typeof content === 'object') {
        valueHtml = `<pre style="white-space: pre-wrap; font-size: 0.8em; background: #f3f4f6; padding: 8px;">${JSON.stringify(content, null, 2)}</pre>`;
      } else {
        valueHtml = `<p style="white-space: pre-wrap; margin: 0;">${String(content)}</p>`;
      }

      return `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">
            ${formatFieldLabel(key)}
          </div>
          ${valueHtml}
        </div>
      `;
    }).join('') || '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Final Report - Incident #${incident?.id?.slice(0, 8).toUpperCase()}</title>
          <style>
            body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 40px; color: #111; line-height: 1.5; }
            .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
            .subtitle { color: #6b7280; font-size: 14px; }
            .meta { margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 14px; }
            .meta-item { margin-bottom: 4px; }
            .label { color: #6b7280; font-weight: 500; }
            .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${getAgencyName(incident?.agency_type || '')} - Final Report</div>
            <div class="subtitle">Incident ID: #${incident?.id?.toUpperCase()}</div>
          </div>
          
          <div class="meta">
            <div class="meta-item"><span class="label">Date Reported:</span> ${incident?.created_at ? new Date(incident.created_at).toLocaleString() : 'N/A'}</div>
            <div class="meta-item"><span class="label">Reporter:</span> ${incident?.reporter_name || 'N/A'}</div>
            <div class="meta-item"><span class="label">Location:</span> ${incident?.location_address || 'N/A'}</div>
            <div class="meta-item"><span class="label">Status:</span> ${incident?.status?.toUpperCase()}</div>
          </div>

          <div class="content">
            ${detailsHtml}
          </div>

          <div class="footer">
            Generated on ${new Date().toLocaleString()} • iReport Admin System
            <br>
            Completed at: ${finalReport.completed_at ? new Date(finalReport.completed_at).toLocaleString() : 'N/A'}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.print();
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
      case 'mdrrmo': return 'Municipal Disaster Risk Reduction Management Office';
      case 'pdrrmo': return 'Municipal Disaster Risk Reduction Management Office';
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

  // Get the assigned station for routing
  const getAssignedStation = (): AgencyStation | undefined => {
    if (!incident?.assigned_station_id) return undefined;
    return stations.find(s => s.id === incident.assigned_station_id);
  };

  const getAgencyIcon = (shortName: string) => {
    switch (shortName?.toUpperCase()) {
      case 'PNP': return '🚔';
      case 'BFP': return '🚒';
      case 'MDRRMO': return '🚑';
      default: return '📍';
    }
  };

  const handleRefresh = () => {
    if (!id) return;
    setLoading(true);
    loadIncident();
    loadHistory();
    loadAssignmentHistory();
    loadUnitReports();
    loadFinalReport();
    loadDraft();
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

  // Combine incident media_urls with draft media_urls (deduplicated)
  const allMediaUrls = [...new Set([...getMediaUrls(), ...draftMediaUrls])];
  const mediaItems = allMediaUrls.map((url) => ({
    url,
    type: getMediaType(url),
    source: draftMediaUrls.includes(url) && !getMediaUrls().includes(url) ? 'draft' : 'incident',
  }));
  const activeBackupRequests = backupRequests.filter(br => ['pending', 'acknowledged', 'assigned'].includes(br.status));
  const historicalBackupRequests = backupRequests.filter(br => !['pending', 'acknowledged', 'assigned'].includes(br.status));
  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: FileText },
    { id: 'reports' as const, label: 'Reports', icon: Edit3 },
    { id: 'management' as const, label: 'Management', icon: Truck },
    { id: 'backups' as const, label: 'Backups', icon: AlertTriangle, badge: activeBackupRequests.length },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
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
        <div className="flex items-center gap-2">
          {isLocked && scope.role === 'Admin' && (
            <button
              onClick={handleReopenIncident}
              disabled={reopening}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors shadow-sm"
              title="Unlock incident for editing (Admin only)"
            >
              {reopening ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Unlock size={16} />
              )}
              Re-open Incident
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto">
        <div className="inline-flex min-w-full sm:min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
              >
                <Icon size={16} />
                {tab.label}
                {!!tab.badge && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${(activeTab === 'overview' || activeTab === 'reports' || activeTab === 'management') ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        {/* Main Content */}
        <div className="space-y-6">
          {activeTab === 'overview' && (
            <>
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

                {/* Casualties Information */}
                {(incident.casualties_category || incident.casualties_count) && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2 flex items-center gap-2">
                      <Users size={16} />
                      Casualties/Affected Persons
                    </h3>
                    <div className="space-y-2">
                      {incident.casualties_category && (
                        <div>
                          <span className="text-xs text-red-600 dark:text-red-400">Category: </span>
                          <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            {incident.casualties_category}
                          </span>
                        </div>
                      )}
                      {incident.casualties_count && (
                        <div>
                          <span className="text-xs text-red-600 dark:text-red-400">Specific Count: </span>
                          <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            {incident.casualties_count} person{incident.casualties_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </>
          )}

          {activeTab === 'reports' && (
            <>
              {/* Final Report Section - with Edit/Create Draft button */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                    <FileText size={20} />
                    Final Report
                  </h2>
                  <button
                    onClick={() => setShowEnhancedReportModal(true)}
                    className={`px-4 py-2 text-white rounded-lg flex items-center gap-2 text-sm transition-colors ${isLocked
                      ? 'bg-gray-500 hover:bg-gray-600'
                      : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                  >
                    {isLocked ? <FileText size={16} /> : <Edit3 size={16} />}
                    {isLocked ? 'View Report' : finalReport ? 'Edit Report' : 'Create/Edit Draft'}
                  </button>
                </div>

                {finalReport ? (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs px-2 py-1 bg-green-600 text-white rounded">
                        Published
                      </span>
                      <button
                        onClick={handleExportPDF}
                        className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-sm flex items-center gap-1"
                      >
                        <FileText size={14} />
                        Export PDF
                      </button>
                    </div>

                    <div className="space-y-4">
                      {formatReportDetails(finalReport.report_details)?.map(([key, value]) => (
                        <div key={key}>
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 uppercase text-xs">
                            {formatFieldLabel(key)}
                          </h3>
                          {renderReportValue(key, value)}
                        </div>
                      ))}

                      <div className="pt-2 border-t border-green-200 dark:border-green-800 text-xs text-gray-500 dark:text-gray-400">
                        Completed on {formatDate(finalReport.completed_at)}
                      </div>
                    </div>
                  </div>
                ) : draftReport ? (
                  <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${draftReport.status === 'ready_for_review'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }`}>
                          {draftReport.status === 'ready_for_review' ? 'Ready for Review' : 'Draft In Progress'}
                        </span>
                        {draftReport.draft_details?.source === 'responder' && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded">
                            📱 Submitted by Responder
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Last saved: {draftReport.updated_at ? new Date(draftReport.updated_at).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>

                    {draftReport.draft_details?.source === 'responder' && draftReport.draft_details?.title && (
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
                        {draftReport.draft_details.title}
                      </p>
                    )}

                    <div className="space-y-4 opacity-80">
                      {formatReportDetails(draftReport.draft_details)?.slice(0, 3).map(([key, value]) => (
                        <div key={key}>
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 uppercase text-xs">
                            {formatFieldLabel(key)}
                          </h3>
                          <div className="line-clamp-2 text-sm">
                            {renderReportValue(key, value)}
                          </div>
                        </div>
                      ))}
                      {(!draftReport.draft_details || Object.keys(draftReport.draft_details).length === 0) && (
                        <p className="text-sm text-gray-500 italic">No details entered yet.</p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-yellow-200 dark:border-yellow-800 flex justify-end">
                      <button
                        onClick={() => setShowEnhancedReportModal(true)}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                      >
                        Continue Editing <ArrowLeft className="rotate-180" size={14} />
                      </button>
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

            </>
          )}

          {activeTab === 'overview' && (
            <>
              {/* Location */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <MapPin size={20} />
                  Location
                </h2>
                <p className="text-gray-700 dark:text-gray-300 mb-2">{incident.location_address || 'Address not available'}</p>
                {/* Assigned Station Badge */}
                {incident.assigned_station_id && (() => {
                  const assignedStation = stations.find(s => s.id === incident.assigned_station_id);
                  if (assignedStation) {
                    const isPrimary = assignedStation.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase();
                    return (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Assigned to:</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${isPrimary
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                          }`}>
                          {assignedStation.agencies?.short_name?.toUpperCase()} - {assignedStation.name}
                          {isPrimary ? ' (Primary)' : ' (Supporting)'}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {incident.latitude != null && incident.longitude != null ? (
                  <>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      Coordinates: {Number(incident.latitude).toFixed(6)}, {Number(incident.longitude).toFixed(6)}
                    </p>
                    {/* Interactive Map with Route */}
                    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                      {/* Route Toggle Button */}
                      {incident.assigned_station_id && getAssignedStation() && (
                        <div className="bg-gray-50 dark:bg-gray-700 p-2 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
                          <button
                            onClick={() => setShowRoute(!showRoute)}
                            className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-2 transition-colors ${showRoute
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-500'
                              }`}
                          >
                            <Truck size={16} />
                            {showRoute ? 'Hide Route' : 'Show Route from Station'}
                          </button>
                          {showRoute && routeInfo && (
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                              <span className="font-medium">{routeInfo.distance.toFixed(1)} km</span>
                              <span className="mx-2">•</span>
                              <span className="font-medium">~{Math.round(routeInfo.duration)} min</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Leaflet Map with Route */}
                      <RouteMap
                        incidentLat={Number(incident.latitude)}
                        incidentLng={Number(incident.longitude)}
                        incidentAddress={incident.location_address}
                        stationLat={getAssignedStation()?.latitude}
                        stationLng={getAssignedStation()?.longitude}
                        stationName={getAssignedStation()?.name}
                        showRoute={showRoute}
                        onRouteLoaded={handleRouteLoaded}
                      />

                      {/* Map Actions */}
                      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-3 py-2 border-t border-gray-200 dark:border-gray-600">
                        <button
                          onClick={() => {
                            const url = `https://www.openstreetmap.org/?mlat=${incident.latitude}&mlon=${incident.longitude}#map=16/${incident.latitude}/${incident.longitude}`;
                            window.api.openExternal(url);
                          }}
                          className="text-sm text-blue-600 hover:underline cursor-pointer"
                        >
                          View larger map ↗
                        </button>
                        {showRoute && getAssignedStation() && (
                          <button
                            onClick={() => {
                              const station = getAssignedStation();
                              if (station) {
                                const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${station.latitude}%2C${station.longitude}%3B${incident.latitude}%2C${incident.longitude}`;
                                window.api.openExternal(url);
                              }
                            }}
                            className="text-sm text-green-600 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Truck size={14} />
                            Open directions ↗
                          </button>
                        )}
                      </div>
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
                    disabled={uploadingMedia || isLocked}
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
                        {isLocked ? 'Locked' : 'Upload Media'}
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
                            {item.source === 'draft' && (
                              <span className="absolute top-2 left-2 text-xs px-2 py-1 bg-purple-600 text-white rounded font-medium">
                                Draft
                              </span>
                            )}
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
                          <div
                            key={index}
                            className="relative aspect-square bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                          >
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full h-full"
                            >
                              <img
                                src={item.url}
                                alt={`Media ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </a>
                            {item.source === 'draft' && (
                              <span className="absolute top-2 left-2 text-xs px-2 py-1 bg-purple-600 text-white rounded font-medium">
                                Draft
                              </span>
                            )}
                          </div>
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
                    {(() => {
                      const assignedIds = incident.assigned_officer_ids?.length
                        ? incident.assigned_officer_ids
                        : incident.assigned_officer_id ? [incident.assigned_officer_id] : [];
                      const assignedOfficers = assignedIds
                        .map(officerId => officers.find(o => o.id === officerId))
                        .filter(Boolean) as Officer[];
                      const orderedOfficers = incident.assigned_officer_id
                        ? [
                          ...assignedOfficers.filter(o => o.id === incident.assigned_officer_id),
                          ...assignedOfficers.filter(o => o.id !== incident.assigned_officer_id)
                        ]
                        : assignedOfficers;

                      return orderedOfficers.map((officer) => (
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
                            <div className="flex items-center gap-2 mt-1">
                              {(() => {
                                const officerStation = stations.find(s => s.id === officer.station_id);
                                const agencyShortName = officerStation?.agencies?.short_name;
                                const stationName = officerStation?.name;
                                return (
                                  <>
                                    {agencyShortName && (
                                      <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                                        {agencyShortName.toUpperCase()}
                                      </span>
                                    )}
                                    {stationName && (
                                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded">
                                        {stationName}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          {officer.id === incident.assigned_officer_id ? (
                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                              Lead
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded">
                              Supporting
                            </span>
                          )}
                        </div>
                      ));
                    })()}
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
                    {unitReports.map((report) => {
                      // Parse details - handle both string and object formats
                      let details: any = {};
                      if (report.details) {
                        if (typeof report.details === 'string') {
                          try {
                            details = JSON.parse(report.details);
                          } catch {
                            details = { raw: report.details };
                          }
                        } else {
                          details = report.details;
                        }
                      }

                      // Extract media URLs
                      let mediaUrls: string[] = [];
                      if (details.media_urls) {
                        if (typeof details.media_urls === 'string') {
                          try {
                            mediaUrls = JSON.parse(details.media_urls);
                          } catch {
                            // Try to extract URLs from the string
                            const urlMatches = details.media_urls.match(/https?:\/\/[^\s"\\]+/g);
                            if (urlMatches) mediaUrls = urlMatches;
                          }
                        } else if (Array.isArray(details.media_urls)) {
                          mediaUrls = details.media_urls;
                        }
                      }

                      return (
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

                          {/* Formatted Details */}
                          {report.details && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                              <div className="space-y-2 text-sm">
                                {/* Narrative */}
                                {details.narrative && (
                                  <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">Narrative:</span>
                                    <p className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{details.narrative}</p>
                                  </div>
                                )}

                                {/* Suspects */}
                                {details.suspects && (
                                  <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">Suspects:</span>
                                    <p className="mt-1 text-gray-600 dark:text-gray-400">{details.suspects}</p>
                                  </div>
                                )}

                                {/* Victims */}
                                {details.victims && (
                                  <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">Victims:</span>
                                    <p className="mt-1 text-gray-600 dark:text-gray-400">{details.victims}</p>
                                  </div>
                                )}

                                {/* Counts */}
                                <div className="flex flex-wrap gap-4 mt-2">
                                  {details.victims_count && (
                                    <span className="text-gray-600 dark:text-gray-400">
                                      <strong>Victims:</strong> {details.victims_count}
                                    </span>
                                  )}
                                  {details.suspects_count && (
                                    <span className="text-gray-600 dark:text-gray-400">
                                      <strong>Suspects:</strong> {details.suspects_count}
                                    </span>
                                  )}
                                  {details.evidence_count && (
                                    <span className="text-gray-600 dark:text-gray-400">
                                      <strong>Evidence:</strong> {details.evidence_count}
                                    </span>
                                  )}
                                </div>

                                {/* Timestamp */}
                                {details.timestamp && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Report Time: {new Date(details.timestamp).toLocaleString()}
                                  </p>
                                )}

                                {/* Media Gallery */}
                                {mediaUrls.length > 0 && (
                                  <div className="mt-3">
                                    <span className="font-medium text-gray-700 dark:text-gray-300 block mb-2">
                                      Attached Media ({mediaUrls.length}):
                                    </span>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                      {mediaUrls.map((url, idx) => {
                                        const isVideo = url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov') || url.toLowerCase().includes('.webm');
                                        return (
                                          <a
                                            key={idx}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="relative group aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600 hover:ring-2 hover:ring-blue-500 transition-all"
                                          >
                                            {isVideo ? (
                                              <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                <video
                                                  src={url}
                                                  className="w-full h-full object-cover"
                                                  muted
                                                  preload="metadata"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                  <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                                                    <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-gray-800 border-b-8 border-b-transparent ml-1"></div>
                                                  </div>
                                                </div>
                                              </div>
                                            ) : (
                                              <img
                                                src={url}
                                                alt={`Evidence ${idx + 1}`}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23999"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
                                                }}
                                              />
                                            )}
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <span className="text-xs text-white">
                                                {isVideo ? '🎬 Video' : '📷 Photo'}
                                              </span>
                                            </div>
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </>
          )}

          {activeTab === 'management' && !isUpdateStatusExpanded && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Update Status</h2>
                <button
                  onClick={() => setIsUpdateStatusExpanded(true)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Expand to modal"
                >
                  <Maximize2 size={18} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Status</p>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${STATUS_OPTIONS.find(s => s.value === incident.status)?.color || 'bg-gray-500'
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
                {renderAIRecommendationPanel()}
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Change To</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    disabled={isLocked}
                    className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} {option.value === incident.status ? '(current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Station Assignment - Editable for Admin, read-only for others */}
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Assigned Station
                    {incident.assigned_station_id && (
                      <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                        (Currently assigned: Station #{incident.assigned_station_id})
                      </span>
                    )}
                  </label>
                  {(() => {
                    const scope = getSessionScope();
                    const isAdmin = scope.role === 'Admin';

                    if (isAdmin) {
                      // Admin can reassign
                      return (
                        <>
                          <select
                            value={selectedStationId || ''}
                            onChange={(e) => setSelectedStationId(e.target.value ? Number(e.target.value) : null)}
                            disabled={isLocked}
                            className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                            <option value="">
                              {incident.assigned_station_id
                                ? 'Keep current assignment'
                                : 'Auto-assign closest station'}
                            </option>
                            {stations
                              .filter(s => involvedAgencies.includes(s.agencies?.short_name?.toLowerCase()))
                              .map((station) => {
                                const isPrimary = station.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase();
                                const agencyRole = incidentAgencies.find(ia =>
                                  ia.agencies?.short_name?.toLowerCase() === station.agencies?.short_name?.toLowerCase()
                                )?.role;
                                const badge = isPrimary ? '(Primary)' : agencyRole ? `(${agencyRole})` : '';
                                return (
                                  <option key={station.id} value={station.id}>
                                    {station.name} - {station.agencies?.short_name?.toUpperCase()} {badge} {station.address ? `- ${station.address}` : ''}
                                  </option>
                                );
                              })}
                            {stations.filter(s => involvedAgencies.includes(s.agencies?.short_name?.toLowerCase())).length === 0 && (
                              <option disabled>No stations available</option>
                            )}
                          </select>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-500 dark:text-gray-400">Requested Agency:</span>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded font-medium">
                              {incident.agency_type?.toUpperCase()}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            {!incident.assigned_station_id && newStatus !== 'pending'
                              ? 'Will auto-assign to closest station if left empty'
                              : 'Select a station to reassign or leave empty to keep current'}
                          </p>
                        </>
                      );
                    } else {
                      // Non-admin: read-only
                      return (
                        <>
                          <div className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            {incident.assigned_station_id ? (
                              (() => {
                                const assignedStation = stations.find(s => s.id === incident.assigned_station_id);
                                if (assignedStation) {
                                  const isPrimary = assignedStation.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase();
                                  const badge = isPrimary ? '(Primary)' : '(Supporting)';
                                  return `${assignedStation.name} - ${assignedStation.agencies?.short_name?.toUpperCase()} ${badge}`;
                                }
                                return `Station #${incident.assigned_station_id}`;
                              })()
                            ) : (
                              'No station assigned yet'
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-500 dark:text-gray-400">Requested Agency:</span>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded font-medium">
                              {incident.agency_type?.toUpperCase()}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            Station assignment is locked. Contact admin to reassign.
                          </p>
                        </>
                      );
                    }
                  })()}
                </div>

                {/* Agency Filter - Show for all incidents with involved agencies */}
                {incidentAgencies.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                      View Officers By Agency
                    </label>
                    <select
                      value={viewAgencyFilter}
                      onChange={(e) => setViewAgencyFilter(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    >
                      <option value="all">All Agencies</option>
                      {incidentAgencies.map((ia) => {
                        const isPrimary = ia.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase();
                        const badge = isPrimary ? ' (Primary)' : ` (${ia.role || 'Supporting'})`;
                        return (
                          <option key={ia.agency_id} value={ia.agencies?.short_name?.toLowerCase()}>
                            {ia.agencies?.short_name?.toUpperCase()}{badge}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-4 mb-4">
                  <input
                    type="checkbox"
                    id="hideBusyToggle"
                    checked={hideBusy}
                    onChange={(e) => setHideBusy(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="hideBusyToggle" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none font-medium">
                    Show only available officers
                  </label>
                </div>


                {/* Officer Assignment */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/40 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                      <UserCheck size={14} />
                      Assign Officers
                    </label>
                    <div className="flex items-center gap-2">
                      {selectedOfficerIds.length > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                          {selectedOfficerIds.length} selected
                        </span>
                      )}
                      {hasOfficerChanges() && (
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                          Modified
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`border border-gray-200 dark:border-gray-600 rounded-xl ${isUpdateStatusExpanded ? 'max-h-96' : 'max-h-48'} overflow-y-auto bg-white dark:bg-gray-700 divide-y divide-gray-100 dark:divide-gray-600`}>
                    {(() => {
                      const visibleOfficers = officers.filter(officer => {
                        // Filter by agency if multi-agency and filter is set
                        if (viewAgencyFilter !== 'all') {
                          const officerStation = stations.find(s => s.id === officer.station_id);
                          const officerAgency = officerStation?.agencies?.short_name?.toLowerCase();
                          if (officerAgency !== viewAgencyFilter) {
                            return false;
                          }
                        }

                        // Check if busy on other incidents
                        const ACTIVE_STATUSES = ['pending', 'assigned', 'in_progress', 'responding'];
                        const isBusyOnOther = otherIncidents.some(inc => {
                          if (inc.id === id) return false;
                          if (!ACTIVE_STATUSES.includes(inc.status)) return false;
                          const ids = inc.assigned_officer_ids?.length ? inc.assigned_officer_ids : (inc.assigned_officer_id ? [inc.assigned_officer_id] : []);
                          return ids.includes(officer.id);
                        });

                        if (hideBusy && isBusyOnOther && !initialOfficerIds.includes(officer.id)) {
                          return false;
                        }

                        return true;
                      });

                      if (visibleOfficers.length === 0) {
                        return (
                          <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            No officers available {selectedStationId ? 'at selected station' : 'for involved agencies'}
                          </p>
                        );
                      }

                      return visibleOfficers.map((officer) => {
                        const isCurrentlyAssigned = initialOfficerIds.includes(officer.id);

                        // Check busy status dynamically across all incidents
                        const ACTIVE_STATUSES = ['pending', 'assigned', 'in_progress', 'responding'];
                        const busyIncidents = otherIncidents.filter(inc => {
                          if (inc.id === id) return false;
                          if (!ACTIVE_STATUSES.includes(inc.status)) return false;
                          const ids = inc.assigned_officer_ids?.length ? inc.assigned_officer_ids : (inc.assigned_officer_id ? [inc.assigned_officer_id] : []);
                          return ids.includes(officer.id);
                        });

                        const isBusyOnOther = busyIncidents.length > 0;
                        const isAvailable = (officer.status === 'available' || !officer.status) && !isBusyOnOther;

                        // Show busy indicator if not available and not currently assigned to THIS incident
                        const showBusy = isBusyOnOther;

                        return (
                          <label
                            key={officer.id}
                            className={`flex items-start gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer transition-colors ${isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedOfficerIds.includes(officer.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const newOfficerIds = [...selectedOfficerIds, officer.id];
                                  setSelectedOfficerIds(newOfficerIds);
                                  if (newOfficerIds.length === 1 || !selectedPrimaryOfficerId) {
                                    setSelectedPrimaryOfficerId(officer.id);
                                  }
                                } else {
                                  const newOfficerIds = selectedOfficerIds.filter(id => id !== officer.id);
                                  setSelectedOfficerIds(newOfficerIds);
                                  if (selectedPrimaryOfficerId === officer.id) {
                                    setSelectedPrimaryOfficerId(newOfficerIds[0] || null);
                                  } else if (newOfficerIds.length === 1) {
                                    setSelectedPrimaryOfficerId(newOfficerIds[0]);
                                  }
                                }
                              }}
                              disabled={showBusy || isLocked} // Disable if busy on another incident or locked
                              className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 dark:text-white flex flex-wrap items-center gap-2">
                                <span className="truncate">{officer.display_name || officer.email}</span>
                                {isCurrentlyAssigned && (
                                  <span className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full font-medium">
                                    Assigned
                                  </span>
                                )}
                                {showBusy && (
                                  <span className="text-[11px] px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 rounded-full font-medium">
                                    Busy
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-2">
                                <span>{officer.role}</span>
                                {(() => {
                                  const officerStation = stations.find(s => s.id === officer.station_id);
                                  const agencyShortName = officerStation?.agencies?.short_name;
                                  if (agencyShortName) {
                                    const isPrimary = agencyShortName.toLowerCase() === incident.agency_type?.toLowerCase();
                                    const agencyRole = incidentAgencies.find(ia =>
                                      ia.agencies?.short_name?.toLowerCase() === agencyShortName.toLowerCase()
                                    )?.role;
                                    const badge = isPrimary ? 'Primary' : agencyRole || 'Supporting';
                                    const badgeColor = isPrimary ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
                                    return (
                                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${badgeColor}`}>
                                        {agencyShortName.toUpperCase()} ({badge})
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                                {officer.phone_number && <span>• {officer.phone_number}</span>}
                              </p>
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Select one or more officers to respond to this incident
                  </p>
                </div>


                {selectedOfficerIds.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Lead Officer
                      {hasPrimaryOfficerChanges() && (
                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                          (modified)
                        </span>
                      )}
                    </label>
                    <select
                      value={selectedPrimaryOfficerId || ''}
                      onChange={(e) => setSelectedPrimaryOfficerId(e.target.value || null)}
                      disabled={selectedOfficerIds.length === 1 || isLocked}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white disabled:opacity-70"
                    >
                      {selectedOfficerIds.map(officerId => {
                        const officer = officers.find(o => o.id === officerId);
                        return (
                          <option key={officerId} value={officerId}>
                            {officer?.display_name || officer?.email || officerId}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      The lead officer is the report owner. If only one officer is assigned, they are automatically the lead.
                    </p>
                  </div>
                )}{/* Assign Resources */}
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
                  <div className={`border border-gray-200 dark:border-gray-600 rounded-lg ${isUpdateStatusExpanded ? 'max-h-96' : 'max-h-48'} overflow-y-auto bg-white dark:bg-gray-700`}>
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
                        // Source of truth: live `assigned_resource_ids` of active incidents,
                        // not the cached `agency_resources.status` column. Avoids drift when
                        // other clients close incidents without going through the admin
                        // release path. Same approach as StationDetailView.
                        const isHeld = isResourceHeldByOther(res.id);
                        const showBusy = isHeld && !isCurrentlyAssigned;

                        return (
                          <label
                            key={res.id}
                            className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-100 dark:border-gray-600 last:border-b-0 ${isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
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
                              disabled={showBusy || isLocked}
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
                                  <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 rounded">
                                    Deployed
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                                {res.type}
                              </p>
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isLocked}
                    placeholder={isLocked ? "Cannot add notes to a locked incident" : "Add notes about this status change..."}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-gray-700 dark:text-white disabled:opacity-70"
                  />
                </div>

                <button
                  onClick={handleUpdateStatus}
                  disabled={updating || !hasChanges() || isLocked}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={18} />
                  {updating ? 'Updating...' : hasOfficerChanges() && newStatus === incident.status ? 'Update Officers' : 'Update Status'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {(activeTab === 'overview' || activeTab === 'reports') && (
          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            {/* AI Triage Summary */}
            {aiReport && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-[0px_0px_15px_rgba(59,130,246,0.15)] border-2 border-blue-100 dark:border-blue-900/50">
                <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-4 flex items-center gap-2">
                  <BrainCircuit size={20} className="text-blue-600 dark:text-blue-400" />
                  AI Triage Summary
                  {aiReport.status === 'processing' && (
                    <Loader2 size={16} className="animate-spin text-blue-500 ml-auto" />
                  )}
                  {aiReport.status === 'queued' && (
                    <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full ml-auto">Queued</span>
                  )}
                </h2>

                {aiReport.status === 'completed' && (
                  <div className="space-y-4">
                    {/* Severity Badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Predicted Severity</span>
                      <span className={`px-2 py-1 text-xs font-bold rounded-full text-white ${aiReport.severity >= 4 ? 'bg-red-600' :
                        aiReport.severity == 3 ? 'bg-orange-500' :
                          aiReport.severity == 2 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}>
                        Level {aiReport.severity} / 5
                      </span>
                    </div>

                    {/* Summary */}
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400 block mb-1">AI Overview</span>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                        {aiReport.summary}
                      </p>
                    </div>

                    {/* Hazards */}
                    {aiReport.hazards && aiReport.hazards.length > 0 && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400 block mb-2 flex items-center gap-1">
                          <AlertTriangle size={14} /> Identified Hazards
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {aiReport.hazards.map((hazard: string, idx: number) => (
                            <span key={idx} className="text-xs px-2 py-1 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800 rounded">
                              {hazard.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiRecommendation && (
                      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
                        {(() => {
                          const confidenceLow = aiRecommendation.confidence !== null && aiRecommendation.confidence < 0.75;
                          const needsReview = aiRecommendation.requiresHumanReview || aiRecommendation.reviewReasons.length > 0 || confidenceLow;
                          const readinessLabel = needsReview ? 'Needs Human Review' : 'Eligible for Auto';
                          const readinessClass = needsReview
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';

                          return (
                            <div className="flex justify-end">
                              <span
                                title="Automation readiness is advisory only. No automatic dispatch is executed."
                                className={`px-2 py-1 text-[11px] font-medium rounded-full border ${readinessClass}`}
                              >
                                {readinessLabel}
                              </span>
                            </div>
                          );
                        })()}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">AI Dispatch Recommendation</span>
                          <button
                            onClick={openPipelineLog}
                            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            View Full Analysis
                          </button>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          Agency: <span className="font-medium">{aiRecommendation.recommendedAgency.toUpperCase()}</span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          Station: <span className="font-medium">{aiRecommendation.recommendedStationLabel}</span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          Resources: <span className="font-medium">
                            {aiRecommendation.recommendedResourceNames.length > 0
                              ? aiRecommendation.recommendedResourceNames.join(', ')
                              : 'No concrete resources selected'}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700 text-right">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                        Processed in {aiReport.processing_time_ms}ms ({aiReport.model_metadata?.vlm_model})
                      </span>
                    </div>
                  </div>
                )}

                {aiReport.status === 'failed' && (
                  <div className="p-3 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-sm flex items-start gap-2">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <p>Automated AI analysis failed for this incident. Please dispatch manually.</p>
                  </div>
                )}

                {['processing', 'queued'].includes(aiReport.status) && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 animate-pulse text-center p-4">
                    Evaluating media and details...
                  </div>
                )}
              </div>
            )}

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
                {incident.reporter_latitude != null && incident.reporter_longitude != null && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Reporter Location</p>
                    {(() => {
                      const reporterLocationText = incident.reporter_location_address || incident.location_address;
                      return (
                        <a
                          href={`https://www.google.com/maps?q=${incident.reporter_latitude},${incident.reporter_longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                          {reporterLocationText || `${incident.reporter_latitude.toFixed(6)}, ${incident.reporter_longitude.toFixed(6)}`} ↗
                        </a>
                      );
                    })()}
                    {(incident.reporter_location_address || incident.location_address) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {incident.reporter_latitude.toFixed(6)}, {incident.reporter_longitude.toFixed(6)}
                      </p>
                    )}
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

          </div>
        )}
        <div className={(activeTab === 'management' || activeTab === 'backups') ? 'space-y-6 lg:sticky lg:top-6 lg:self-start' : 'hidden'}>
          {activeTab === 'management' && (
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
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          by {entry.profiles?.display_name || entry.changed_by}
                        </p>
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
          )}
          {activeTab === 'management' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <Truck size={20} />
                Assignment History
              </h2>
              {assignmentHistory.length > 0 ? (
                <div className="space-y-4">
                  {assignmentHistory.map((entry) => {
                    const officerNames = (entry.previous_officers || []).map(officer => officer.display_name || officer.email || officer.id);
                    const resourceNames = (entry.previous_resources || []).map(resource => resource.name || `Resource #${resource.id}`);
                    const agencyNames = (entry.agencies || []).map(agency => agency.short_name || agency.name || `Agency #${agency.id}`);

                    return (
                      <div key={entry.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="font-medium text-gray-800 dark:text-white capitalize">
                              {entry.from_status || 'New'} → {entry.to_status}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {entry.reason.replace(/_/g, ' ')} by {entry.changed_by_label || 'Unknown'} • {formatDate(entry.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Station: </span>
                            <span className="text-gray-800 dark:text-gray-200">
                              {entry.previous_station?.name || entry.new_station?.name || 'None recorded'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Agencies: </span>
                            <span className="text-gray-800 dark:text-gray-200">
                              {agencyNames.length > 0 ? agencyNames.join(', ') : 'None recorded'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Officers used: </span>
                            <span className="text-gray-800 dark:text-gray-200">
                              {officerNames.length > 0 ? officerNames.join(', ') : 'None recorded'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Resources used: </span>
                            <span className="text-gray-800 dark:text-gray-200">
                              {resourceNames.length > 0 ? resourceNames.join(', ') : 'None recorded'}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="text-gray-500 dark:text-gray-400 italic">"{entry.notes}"</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No assignment or resource usage history recorded yet</p>
              )}
            </div>
          )}
          {activeTab === 'management' && (incident.assigned_officer_ids?.length || incident.assigned_officer_id) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <UserCheck size={20} />
                Assigned Officers ({incident.assigned_officer_ids?.length || 1})
              </h2>
              <div className="space-y-3">
                {(() => {
                  const assignedIds = incident.assigned_officer_ids?.length
                    ? incident.assigned_officer_ids
                    : incident.assigned_officer_id ? [incident.assigned_officer_id] : [];
                  const assignedOfficers = assignedIds
                    .map(officerId => officers.find(o => o.id === officerId))
                    .filter(Boolean) as Officer[];
                  const orderedOfficers = incident.assigned_officer_id
                    ? [
                      ...assignedOfficers.filter(o => o.id === incident.assigned_officer_id),
                      ...assignedOfficers.filter(o => o.id !== incident.assigned_officer_id)
                    ]
                    : assignedOfficers;

                  return orderedOfficers.map((officer) => (
                    <div
                      key={officer.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <User size={18} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 dark:text-white truncate text-sm">
                          {officer.display_name || officer.email}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {officer.role}
                          {officer.phone_number && ` • ${officer.phone_number}`}
                        </p>
                      </div>
                      {officer.id === incident.assigned_officer_id ? (
                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                          Lead
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded">
                          Support
                        </span>
                      )}
                    </div>
                  ));
                })()}
                {officers.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading officer details...</p>
                )}
              </div>
            </div>
          )}
          {/* Multi-Agency Coordination */}
          {activeTab === 'management' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                  <Users size={20} />
                  Agency Coordination
                </h2>
                <button
                  onClick={() => {
                    loadAvailableAgencies();
                    setShowAddAgencyModal(true);
                  }}
                  disabled={isLocked}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isLocked ? "Cannot request support for closed incidents" : "Request Support"}
                >
                  <Plus size={18} />
                </button>
              </div>

              {/* Primary Agency */}
              <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    {incident.agency_type?.toUpperCase()}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 bg-blue-600 text-white rounded">Primary</span>
                </div>
              </div>

              {/* Supporting Agencies */}
              {incidentAgencies.length > 0 ? (
                <div className="space-y-2">
                  {incidentAgencies.map((ia) => (
                    <div
                      key={ia.id}
                      className={`p-3 rounded-lg border ${ia.acknowledged_at
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className={ia.acknowledged_at ? 'text-green-600' : 'text-yellow-600'} />
                          <span className="text-sm font-medium dark:text-white">
                            {ia.agencies?.short_name || ia.agencies?.name}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${ia.role === 'lead'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-500 text-white'
                            }`}>
                            {ia.role}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {!ia.acknowledged_at && (
                            <button
                              onClick={() => handleAcknowledgeAgency(ia.id)}
                              disabled={isLocked}
                              className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                              title="Acknowledge"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveAgency(ia.id)}
                            disabled={isLocked}
                            className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded disabled:opacity-50"
                            title="Remove"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {ia.acknowledged_at
                          ? `Acknowledged ${formatDate(ia.acknowledged_at)}`
                          : `Requested ${formatDate(ia.requested_at)}`
                        }
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No other agencies involved. Click + to request support.
                </p>
              )}
            </div>
          )}

          {/* Backup Requests */}
          {activeTab === 'backups' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                  <AlertTriangle size={20} />
                  Backup Requests
                </h2>
                {backupRequests.some(br => ['pending', 'acknowledged', 'assigned'].includes(br.status)) && (
                  <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    Active
                  </span>
                )}
              </div>

              {backupRequests.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No backup requests recorded for this incident.</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Active Requests ({activeBackupRequests.length})
                    </h3>
                    {activeBackupRequests.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No active backup requests.</p>
                    ) : (
                      <div className="space-y-3">
                        {activeBackupRequests.map((request) => {
                          const statusColorMap: Record<BackupRequestStatus, string> = {
                            pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                            acknowledged: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                            assigned: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
                            resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
                            cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
                            rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                          };

                          return (
                            <div key={request.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                                    {request.requester?.display_name || request.requester?.email || 'Unknown requester'}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Requested {formatDate(request.created_at)}
                                    {request.requested_agency?.short_name ? ` • ${request.requested_agency.short_name.toUpperCase()}` : ''}
                                    {request.requested_station?.name ? ` • ${request.requested_station.name}` : ''}
                                  </p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded capitalize ${statusColorMap[request.status]}`}>
                                  {request.status}
                                </span>
                              </div>

                              {request.reason && (
                                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Reason: {request.reason}</p>
                              )}

                              {request.target_agency?.short_name && (
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                  Target: {request.target_agency.short_name.toUpperCase()}
                                  {request.target_station?.name ? ` • ${request.target_station.name}` : ''}
                                </p>
                              )}

                              <div className="mt-3 flex items-center gap-2">
                                {request.status === 'pending' && (
                                  <button
                                    onClick={() => handleBackupRequestStatusChange(request.id, 'acknowledged')}
                                    disabled={updatingBackupRequestId === request.id || isLocked}
                                    className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    Acknowledge
                                  </button>
                                )}
                                {request.status !== 'resolved' && request.status !== 'cancelled' && request.status !== 'rejected' && (
                                  <button
                                    onClick={() => handleBackupRequestStatusChange(request.id, 'resolved')}
                                    disabled={updatingBackupRequestId === request.id || isLocked}
                                    className="px-2.5 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                  >
                                    Mark Resolved
                                  </button>
                                )}
                                {request.status === 'pending' && (
                                  <button
                                    onClick={() => handleBackupRequestStatusChange(request.id, 'cancelled')}
                                    disabled={updatingBackupRequestId === request.id || isLocked}
                                    className="px-2.5 py-1.5 text-xs rounded bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      History ({historicalBackupRequests.length})
                    </h3>
                    {historicalBackupRequests.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No completed backup request history.</p>
                    ) : (
                      <div className="space-y-3">
                        {historicalBackupRequests.map((request) => {
                          const statusColorMap: Record<BackupRequestStatus, string> = {
                            pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                            acknowledged: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                            assigned: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
                            resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
                            cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
                            rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                          };

                          return (
                            <div key={request.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                                    {request.requester?.display_name || request.requester?.email || 'Unknown requester'}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Requested {formatDate(request.created_at)}
                                    {request.requested_agency?.short_name ? ` • ${request.requested_agency.short_name.toUpperCase()}` : ''}
                                    {request.requested_station?.name ? ` • ${request.requested_station.name}` : ''}
                                  </p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded capitalize ${statusColorMap[request.status]}`}>
                                  {request.status}
                                </span>
                              </div>
                              {request.reason && (
                                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Reason: {request.reason}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}


        </div>
      </div>

      {/* Update Status - Modal View */}
      {isUpdateStatusExpanded && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Update Status</h2>
              <button
                onClick={() => setIsUpdateStatusExpanded(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6">
              {/* Current Status Display */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Status</p>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${STATUS_OPTIONS.find(s => s.value === incident.status)?.color || 'bg-gray-500'
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
                {renderAIRecommendationPanel()}
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Change To</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    disabled={isLocked}
                    className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} {option.value === incident.status ? '(current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Station Assignment - Editable for Admin, read-only for others */}
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Assigned Station
                    {incident.assigned_station_id && (
                      <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                        (Currently assigned: Station #{incident.assigned_station_id})
                      </span>
                    )}
                  </label>
                  {(() => {
                    const scope = getSessionScope();
                    const isAdmin = scope.role === 'Admin';

                    if (isAdmin) {
                      // Admin can reassign
                      return (
                        <>
                          <select
                            value={selectedStationId || ''}
                            onChange={(e) => setSelectedStationId(e.target.value ? Number(e.target.value) : null)}
                            disabled={isLocked}
                            className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                            <option value="">
                              {incident.assigned_station_id
                                ? 'Keep current assignment'
                                : 'Auto-assign closest station'}
                            </option>
                            {stations
                              .filter(s => involvedAgencies.includes(s.agencies?.short_name?.toLowerCase()))
                              .map((station) => {
                                const isPrimary = station.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase();
                                const agencyRole = incidentAgencies.find(ia =>
                                  ia.agencies?.short_name?.toLowerCase() === station.agencies?.short_name?.toLowerCase()
                                )?.role;
                                const badge = isPrimary ? '(Primary)' : agencyRole ? `(${agencyRole})` : '';
                                return (
                                  <option key={station.id} value={station.id}>
                                    {station.name} - {station.agencies?.short_name?.toUpperCase()} {badge} {station.address ? `- ${station.address}` : ''}
                                  </option>
                                );
                              })}
                            {stations.filter(s => involvedAgencies.includes(s.agencies?.short_name?.toLowerCase())).length === 0 && (
                              <option disabled>No stations available</option>
                            )}
                          </select>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-500 dark:text-gray-400">Requested Agency:</span>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded font-medium">
                              {incident.agency_type?.toUpperCase()}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            {!incident.assigned_station_id && newStatus !== 'pending'
                              ? 'Will auto-assign to closest station if left empty'
                              : 'Select a station to reassign or leave empty to keep current'}
                          </p>
                        </>
                      );
                    } else {
                      // Non-admin: read-only
                      return (
                        <>
                          <div className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            {incident.assigned_station_id ? (
                              (() => {
                                const assignedStation = stations.find(s => s.id === incident.assigned_station_id);
                                if (assignedStation) {
                                  const isPrimary = assignedStation.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase();
                                  const badge = isPrimary ? '(Primary)' : '(Supporting)';
                                  return `${assignedStation.name} - ${assignedStation.agencies?.short_name?.toUpperCase()} ${badge}`;
                                }
                                return `Station #${incident.assigned_station_id}`;
                              })()
                            ) : (
                              'No station assigned yet'
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-500 dark:text-gray-400">Requested Agency:</span>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded font-medium">
                              {incident.agency_type?.toUpperCase()}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            Station assignment is locked. Contact admin to reassign.
                          </p>
                        </>
                      );
                    }
                  })()}
                </div>

                {/* Agency Filter - Show for all incidents with involved agencies */}
                {incidentAgencies.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                      View Officers By Agency
                    </label>
                    <select
                      value={viewAgencyFilter}
                      onChange={(e) => setViewAgencyFilter(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    >
                      <option value="all">All Agencies</option>
                      {incidentAgencies.map((ia) => {
                        const isPrimary = ia.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase();
                        const badge = isPrimary ? ' (Primary)' : ` (${ia.role || 'Supporting'})`;
                        return (
                          <option key={ia.agency_id} value={ia.agencies?.short_name?.toLowerCase()}>
                            {ia.agencies?.short_name?.toUpperCase()}{badge}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      Filter officers by agency to see available responders
                    </p>
                  </div>
                )}

                {/* Officer Assignment */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/40 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                      <UserCheck size={14} />
                      Assign Officers
                    </label>
                    <div className="flex items-center gap-2">
                      {selectedOfficerIds.length > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                          {selectedOfficerIds.length} selected
                        </span>
                      )}
                      {hasOfficerChanges() && (
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                          Modified
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-600 rounded-xl max-h-96 overflow-y-auto bg-white dark:bg-gray-700 divide-y divide-gray-100 dark:divide-gray-600">
                    {(() => {
                      const visibleOfficers = officers.filter(officer => {
                        // Filter by agency if multi-agency and filter is set
                        if (viewAgencyFilter !== 'all') {
                          const officerStation = stations.find(s => s.id === officer.station_id);
                          const officerAgency = officerStation?.agencies?.short_name?.toLowerCase();
                          if (officerAgency !== viewAgencyFilter) {
                            return false;
                          }
                        }

                        // Check if busy on other incidents
                        const ACTIVE_STATUSES = ['pending', 'assigned', 'in_progress', 'responding'];
                        const isBusyOnOther = otherIncidents.some(inc => {
                          if (inc.id === id) return false;
                          if (!ACTIVE_STATUSES.includes(inc.status)) return false;
                          const ids = inc.assigned_officer_ids?.length ? inc.assigned_officer_ids : (inc.assigned_officer_id ? [inc.assigned_officer_id] : []);
                          return ids.includes(officer.id);
                        });

                        if (hideBusy && isBusyOnOther && !initialOfficerIds.includes(officer.id)) {
                          return false;
                        }

                        return true;
                      });

                      if (visibleOfficers.length === 0) {
                        return (
                          <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            No officers available {selectedStationId ? 'at selected station' : 'for involved agencies'}
                          </p>
                        );
                      }

                      return visibleOfficers.map((officer) => {
                        const isCurrentlyAssigned = initialOfficerIds.includes(officer.id);

                        const ACTIVE_STATUSES = ['pending', 'assigned', 'in_progress', 'responding'];
                        const isBusyOnOther = otherIncidents.some(inc => {
                          if (inc.id === id) return false;
                          if (!ACTIVE_STATUSES.includes(inc.status)) return false;
                          const ids = inc.assigned_officer_ids?.length ? inc.assigned_officer_ids : (inc.assigned_officer_id ? [inc.assigned_officer_id] : []);
                          return ids.includes(officer.id);
                        });

                        const showBusy = isBusyOnOther;

                        return (
                          <label
                            key={officer.id}
                            className={`flex items-start gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer transition-colors ${isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedOfficerIds.includes(officer.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const newOfficerIds = [...selectedOfficerIds, officer.id];
                                  setSelectedOfficerIds(newOfficerIds);
                                  if (newOfficerIds.length === 1 || !selectedPrimaryOfficerId) {
                                    setSelectedPrimaryOfficerId(officer.id);
                                  }
                                } else {
                                  const newOfficerIds = selectedOfficerIds.filter(id => id !== officer.id);
                                  setSelectedOfficerIds(newOfficerIds);
                                  if (selectedPrimaryOfficerId === officer.id) {
                                    setSelectedPrimaryOfficerId(newOfficerIds[0] || null);
                                  } else if (newOfficerIds.length === 1) {
                                    setSelectedPrimaryOfficerId(newOfficerIds[0]);
                                  }
                                }
                              }}
                              disabled={showBusy || isLocked}
                              className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 dark:text-white flex flex-wrap items-center gap-2">
                                <span className="truncate">{officer.display_name || officer.email}</span>
                                {isCurrentlyAssigned && (
                                  <span className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full font-medium">
                                    Assigned
                                  </span>
                                )}
                                {showBusy && (
                                  <span className="text-[11px] px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 rounded-full font-medium">
                                    Busy
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-2">
                                <span>{officer.role}</span>
                                {(() => {
                                  const officerStation = stations.find(s => s.id === officer.station_id);
                                  const agencyShortName = officerStation?.agencies?.short_name;
                                  if (agencyShortName) {
                                    const isPrimary = agencyShortName.toLowerCase() === incident.agency_type?.toLowerCase();
                                    const agencyRole = incidentAgencies.find(ia =>
                                      ia.agencies?.short_name?.toLowerCase() === agencyShortName.toLowerCase()
                                    )?.role;
                                    const badge = isPrimary ? 'Primary' : agencyRole || 'Supporting';
                                    const badgeColor = isPrimary ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
                                    return (
                                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${badgeColor}`}>
                                        {agencyShortName.toUpperCase()} ({badge})
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                                {officer.phone_number && <span>• {officer.phone_number}</span>}
                              </p>
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Select one or more officers to respond to this incident
                  </p>
                </div>



                {selectedOfficerIds.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Lead Officer
                      {hasPrimaryOfficerChanges() && (
                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                          (modified)
                        </span>
                      )}
                    </label>
                    <select
                      value={selectedPrimaryOfficerId || ''}
                      onChange={(e) => setSelectedPrimaryOfficerId(e.target.value || null)}
                      disabled={selectedOfficerIds.length === 1 || isLocked}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white disabled:opacity-70"
                    >
                      {selectedOfficerIds.map(officerId => {
                        const officer = officers.find(o => o.id === officerId);
                        return (
                          <option key={officerId} value={officerId}>
                            {officer?.display_name || officer?.email || officerId}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      The lead officer is the report owner. If only one officer is assigned, they are automatically the lead.
                    </p>
                  </div>
                )}{/* Assign Resources */}
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
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg max-h-96 overflow-y-auto bg-white dark:bg-gray-700">
                    {(() => {
                      const visibleResources = resources.filter(res => {
                        const targetStationId = selectedStationId || incident.assigned_station_id;
                        if (targetStationId) {
                          return res.station_id === targetStationId;
                        }
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
                        const isHeld = isResourceHeldByOther(res.id);
                        const showBusy = isHeld && !isCurrentlyAssigned;

                        return (
                          <label
                            key={res.id}
                            className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-100 dark:border-gray-600 last:border-b-0 ${isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
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
                              disabled={showBusy || isLocked}
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
                                  <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 rounded">
                                    Deployed
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                                {res.type}
                              </p>
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isLocked}
                    placeholder={isLocked ? "Cannot add notes to a locked incident" : "Add notes about this status change..."}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-gray-700 dark:text-white disabled:opacity-70"
                  />
                </div>

                <button
                  onClick={handleUpdateStatus}
                  disabled={updating || !hasChanges() || isLocked}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={18} />
                  {updating ? 'Updating...' : hasOfficerChanges() && newStatus === incident.status ? 'Update Officers' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

              {incident?.agency_type?.toLowerCase() === 'mdrrmo' && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-3">MDRRMO Specific Details</h3>
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
        readOnly={isLocked}
        latestUnitReport={unitReports.length > 0 ? unitReports[0] : null}
        onReportPublished={() => {
          loadFinalReport();
          loadIncident(); // status might change
        }}
        onDraftSaved={() => {
          loadDraft();
        }}
      />

      {/* Add Agency Modal */}
      {showAddAgencyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <Users size={20} />
                Request Agency Support
              </h2>
              <button
                onClick={() => {
                  setShowAddAgencyModal(false);
                  setSelectedAgencyToAdd(null);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Agency
                </label>
                <select
                  value={selectedAgencyToAdd || ''}
                  onChange={(e) => setSelectedAgencyToAdd(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Choose an agency...</option>
                  {availableAgencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.short_name} - {agency.name}
                    </option>
                  ))}
                </select>
                {availableAgencies.length === 0 && (
                  <p className="text-sm text-gray-500 mt-1">All agencies are already involved in this incident.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Role
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="agencyRole"
                      value="supporting"
                      checked={selectedAgencyRole === 'supporting'}
                      onChange={() => setSelectedAgencyRole('supporting')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Supporting</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="agencyRole"
                      value="lead"
                      checked={selectedAgencyRole === 'lead'}
                      onChange={() => setSelectedAgencyRole('lead')}
                      className="w-4 h-4 text-purple-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Lead Coordinator</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedAgencyRole === 'lead'
                    ? 'This agency will coordinate the multi-agency response.'
                    : 'This agency will provide support to the primary agency.'
                  }
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddAgencyModal(false);
                  setSelectedAgencyToAdd(null);
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAgency}
                disabled={!selectedAgencyToAdd || addingAgency}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {addingAgency ? (
                  <>
                    <RefreshCcw size={16} className="animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Request Support
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-open Confirmation Modal */}
      {showReopenConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                  <Unlock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Re-open Incident?</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    This will unlock all editing capabilities and return the status to <span className="font-semibold text-orange-600 dark:text-orange-400">In Progress</span>.
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 mb-6 text-sm text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-800">
                <p>Note: This action will be recorded in the audit logs and status history.</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowReopenConfirmModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReopenIncident}
                  className="flex-1 px-4 py-3 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors shadow-lg shadow-amber-600/20"
                >
                  Confirm Re-open
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default IncidentDetail;
