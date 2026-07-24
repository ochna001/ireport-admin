import {
  ArrowLeft,
  BrainCircuit,
  AlertTriangle,
  Loader2,
  Building2,
  Check,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  Clock,
  Edit3,
  FileText,
  History,
  Info,
  Image as ImageIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCcw,
  Send,
  Smartphone,
  User,
  UserCheck,
  Users,
  Truck,
  Unlock,
  X
} from 'lucide-react';
import { useEffect, useState, useCallback, useMemo, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSessionScope, isStationScoped } from '../utils/sessionScope';
import { exportFinalReportToPDF } from '../utils/exportUtils';
import { FinalReportModal } from '../components/FinalReportModal';
import { RouteMap } from '../components/RouteMap';
import { ContextHint } from '../components/ContextHint';
import { getAgencyPresentation } from '../utils/agencyPresentation';
import { getIncidentReference } from '../utils/incidentReference';

interface Incident {
  id: string;
  incident_reference?: string | null;
  reference_year?: number | null;
  reference_number?: number | null;
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

interface TriageAssessment {
  emergency_state?: string | null;
  incident_type?: string | null;
  severity?: number | null;
  urgency?: 'U1' | 'U2' | 'U3' | 'U4' | null;
  evidence_confidence?: 'low' | 'medium' | 'high' | null;
  dispatch_priority?: number | null;
  evidence?: Record<string, unknown>;
  missing_facts?: string[];
  contradictions?: string[];
  triggered_rules?: string[];
  required_capabilities?: string[];
  rules_version?: string | null;
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

const STATUS_HINTS: Record<string, { title: string; description: string }> = {
  pending: {
    title: 'Awaiting an operational assignment',
    description: 'The report is still under review. Select the responsible agency and station before moving it to Assigned.',
  },
  assigned: {
    title: 'Response ownership confirmed',
    description: 'A response agency and station have accepted operational responsibility. Assign a lead officer before field work begins.',
  },
  in_progress: {
    title: 'Field response underway',
    description: 'Assigned responders are actively handling the incident. Keep officer, resource, and progress details current.',
  },
  resolved: {
    title: 'Operational response complete',
    description: 'The immediate incident has been handled. Complete and verify the final report before closing the record.',
  },
  closed: {
    title: 'Incident record finalized',
    description: 'Operational work and final reporting are complete. The record is locked unless an administrator reopens it.',
  },
  rejected: {
    title: 'Report not accepted for response',
    description: 'The report was rejected after review. The decision should be supported by a clear note in the status history.',
  },
  ai_routing: {
    title: 'Automated routing in progress',
    description: 'AI is preparing advisory triage and routing information. A dispatcher must still confirm the operational assignment.',
  },
};

const VALID_STATUSES = new Set(STATUS_OPTIONS.map((option) => option.value));
const VALID_AGENCIES = new Set(['pnp', 'bfp', 'mdrrmo']);
const AI_DISPATCH_MODE = String(import.meta.env.VITE_AI_DISPATCH_MODE || 'shadow').toLowerCase();
const AI_SHADOW_REVEAL = String(import.meta.env.VITE_AI_SHADOW_REVEAL || '').toLowerCase() === 'true';
const SHOW_AI_DISPATCH_RECOMMENDATION = AI_DISPATCH_MODE !== 'shadow' || AI_SHADOW_REVEAL;

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

type AssignmentFormErrors = {
  status?: string;
  agency?: string;
  station?: string;
  officers?: string;
  leadOfficer?: string;
  resources?: string;
  notes?: string;
  form?: string;
};

const normalizeUpdateError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (/dispatch_plan_required/i.test(raw)) return 'Select a response agency and assigned station before applying an active assignment.';
  if (/agency_required/i.test(raw)) return 'Select a configured response agency before assigning this incident.';
  if (/status_assignment_conflict/i.test(raw)) return 'Pending incidents cannot have a station, responders, or resources assigned. Change the status to Assigned or clear the assignment first.';
  if (/final_report_required/i.test(raw)) return 'Complete the final report before closing this incident.';
  if (/incident_is_locked|already .*cannot be modified/i.test(raw)) return 'This incident is locked and can no longer be modified.';
  if (/expired/i.test(raw)) return 'The dispatch recommendation expired. Refresh it, review the new recommendation, then try again.';
  if (/permission|not authorized|forbidden|rls/i.test(raw)) return 'You do not have permission to make this update. Contact an administrator if access is incorrect.';
  if (/network|fetch|timeout|offline|econn/i.test(raw)) return 'The update could not reach the server. Check your connection and try again.';
  return 'We could not save these changes. Review the fields and try again.';
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
  const [triageAssessment, setTriageAssessment] = useState<TriageAssessment | null>(null);
  const [dispatchRecommendation, setDispatchRecommendation] = useState<any>(null);
  const [feedbackVerdict, setFeedbackVerdict] = useState<'accepted' | 'modified' | 'rejected' | 'not_applicable'>('accepted');
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [refreshingDispatchRecommendation, setRefreshingDispatchRecommendation] = useState(false);
  const [appliedAIRecommendationKey, setAppliedAIRecommendationKey] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [selectedAgencyType, setSelectedAgencyType] = useState('');
  const [initialAgencyType, setInitialAgencyType] = useState('');
  const [stationAssignmentIntent, setStationAssignmentIntent] = useState<'keep' | 'auto' | 'explicit'>('auto');
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
  const [formErrors, setFormErrors] = useState<AssignmentFormErrors>({});
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [isUpdateStatusExpanded, setIsUpdateStatusExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'management' | 'backups'>('overview');
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [showChangeReview, setShowChangeReview] = useState(false);
  const [releaseAssignments, setReleaseAssignments] = useState(false);
  const [stationReconciliationError, setStationReconciliationError] = useState<string | null>(null);
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
  const [mapView, setMapView] = useState<'larger' | 'directions' | null>(null);

  // Multi-Agency Coordination State
  const [incidentAgencies, setIncidentAgencies] = useState<any[]>([]);
  const [availableAgencies, setAvailableAgencies] = useState<any[]>([]);
  const [showAddAgencyModal, setShowAddAgencyModal] = useState(false);
  const [selectedAgencyToAdd, setSelectedAgencyToAdd] = useState<number | null>(null);
  const [selectedAgencyRole, setSelectedAgencyRole] = useState<'supporting' | 'lead'>('supporting');
  const [addingAgency, setAddingAgency] = useState(false);
  const [backupRequests, setBackupRequests] = useState<BackupRequest[]>([]);
  const [updatingBackupRequestId, setUpdatingBackupRequestId] = useState<number | null>(null);
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = useState<number | null>(null);

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
      'unknown';

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
    if (!recommendedStation && agencyStations.length > 0 && Number.isFinite(Number(incident.latitude)) && Number.isFinite(Number(incident.longitude))) {
      recommendedStation = [...agencyStations].sort((left, right) =>
        haversineKm(Number(incident.latitude), Number(incident.longitude), Number(left.latitude), Number(left.longitude)) -
        haversineKm(Number(incident.latitude), Number(incident.longitude), Number(right.latitude), Number(right.longitude))
      )[0];
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

    const reviewReasons = toStringArray(dispatchPlan.review_reasons);
    reviewReasons.unshift('Dispatcher confirmation is required before assigning responders.');
    if (aiReport.status === 'failed') {
      reviewReasons.push('AI analysis failed previously and needs human validation.');
    }
    if (severity >= 4) {
      reviewReasons.push('High-severity report: verify the evidence and response plan.');
    }
    if (!recommendedStation) {
      reviewReasons.push('No eligible station is configured for the suggested agency.');
    }
    if (recommendedResources.length === 0) {
      reviewReasons.push('No available resources were selected; choose them manually if needed.');
    }
    if (recommendedOfficers.length === 0) {
      reviewReasons.push('No available personnel were selected; choose them manually if needed.');
    }

    const rawConfidence = dispatchPlan.confidence ?? mainReport?.confidence;
    const parsedConfidence = Number(rawConfidence);
    const normalizedConfidence = Number.isFinite(parsedConfidence)
      ? Math.max(0, Math.min(1, parsedConfidence > 1 ? parsedConfidence / 100 : parsedConfidence))
      : null;

    if (normalizedConfidence === null) {
      reviewReasons.push('Confidence is unavailable; verify the recommendation manually.');
    } else if (normalizedConfidence < 0.75) {
      reviewReasons.push('Confidence is low; verify the recommendation manually.');
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
  }, [aiReport, incident, stations, resources, officers, dispatchRecommendation]);

  const aiRecommendationKey = useMemo(() => {
    if (!aiRecommendation || !aiReport) return null;
    return [
      aiReport.id || aiReport.updated_at || aiReport.created_at || aiReport.status,
      incident?.id,
      aiRecommendation.recommendedStatus,
      aiRecommendation.recommendedStationId ?? 'none',
      aiRecommendation.recommendedResourceIds.join(','),
      aiRecommendation.recommendedOfficerIds.join(','),
    ].join('|');
  }, [aiRecommendation, aiReport, incident?.id]);

  useEffect(() => {
    setAppliedAIRecommendationKey(null);
  }, [aiRecommendationKey]);

  const applyAIRecommendation = useCallback(() => {
    if (!aiRecommendation || isLocked) return;

    const allowedStatuses = getAllowedStatuses();
    const suggestedStatus = allowedStatuses.includes(aiRecommendation.recommendedStatus) && aiRecommendation.recommendedStationId
      ? aiRecommendation.recommendedStatus
      : aiRecommendation.recommendedStationId ? incident?.status || 'pending' : 'pending';

    setNewStatus(suggestedStatus);
    setSelectedStationId(aiRecommendation.recommendedStationId);
    setSelectedAgencyType(toAgencyKey(aiRecommendation.recommendedAgency));
    setStationAssignmentIntent(aiRecommendation.recommendedStationId === null ? 'explicit' : 'explicit');
    setSelectedResourceIds(aiRecommendation.recommendedResourceIds);
    setSelectedOfficerIds(aiRecommendation.recommendedOfficerIds);
    setSelectedPrimaryOfficerId(aiRecommendation.recommendedOfficerIds[0] || null);
    setNotes((prev) => {
      const marker = '[AI Recommendation Applied]';
      if (prev.includes(marker)) return prev;
       const next = `${marker} status=${suggestedStatus}, agency=${aiRecommendation.recommendedAgency}, station=${aiRecommendation.recommendedStationLabel}`;
      return prev ? `${prev.trim()}\n${next}` : next;
    });
    setAppliedAIRecommendationKey(aiRecommendationKey);
    setShowChangeReview(true);
  }, [aiRecommendation, aiRecommendationKey, incident?.status, isLocked]);

  const renderAIRecommendationPanel = () => {
    if (!aiRecommendation) return null;
    if (!SHOW_AI_DISPATCH_RECOMMENDATION) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          <Info size={14} className="shrink-0" aria-hidden="true" />
          <span><strong className="font-semibold text-slate-800 dark:text-slate-100">Independent dispatch mode.</strong> AI recommendations are hidden during evaluation.</span>
        </div>
      );
    }

    const confidenceLow = aiRecommendation.confidence !== null && aiRecommendation.confidence < 0.75;
    const needsReview = aiRecommendation.requiresHumanReview || aiRecommendation.reviewReasons.length > 0 || confidenceLow;
    const confidenceMessage = aiRecommendation.confidence === null
      ? 'Auto-dispatch confidence unavailable (manual review required)'
      : aiRecommendation.confidence < 0.75
        ? `Low (${(aiRecommendation.confidence * 100).toFixed(0)}%) - manual review required`
        : `High (${(aiRecommendation.confidence * 100).toFixed(0)}%)`;
    const readinessLabel = needsReview ? 'Dispatcher review required' : 'Ready for dispatcher review';
    const readinessClass = needsReview
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700'
      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';
    const recommendationExpired = Boolean(
      dispatchRecommendation?.expires_at && new Date(dispatchRecommendation.expires_at).getTime() <= Date.now(),
    );
    const recommendationNeedsRefresh = !dispatchRecommendation?.id || recommendationExpired;
    const recommendationApplied = !recommendationNeedsRefresh && aiRecommendationKey !== null && appliedAIRecommendationKey === aiRecommendationKey;

    return (
      <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50/70 dark:bg-blue-900/20 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300">AI dispatch recommendation</h3>
            <p className="mt-0.5 text-xs text-blue-800/80 dark:text-blue-200/80">Decision support only — nothing is assigned until a dispatcher confirms it.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ContextHint
              title={needsReview ? 'Human confirmation required' : 'Recommendation ready to inspect'}
              description={needsReview
                ? 'One or more confidence, evidence, capacity, or assignment checks still need a dispatcher. No responders are dispatched automatically.'
                : 'The advisory plan has enough information for dispatcher review. It still does not assign responders until a dispatcher confirms it.'}
              ariaLabel={`Explain dispatch readiness: ${readinessLabel}`}
            >
              <span className={`px-2 py-1 text-[11px] font-medium rounded-full border ${readinessClass}`}>
                {readinessLabel}
              </span>
            </ContextHint>
            <button
              onClick={openPipelineLog}
              className="min-h-10 px-2.5 py-1 text-xs rounded border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-900/40"
            >
              View Full Analysis
            </button>
             <button
               type="button"
               onClick={recommendationNeedsRefresh ? refreshDispatchRecommendation : applyAIRecommendation}
               disabled={isLocked || refreshingDispatchRecommendation || recommendationApplied}
               aria-disabled={recommendationApplied}
               className={`min-h-10 px-2.5 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 ${recommendationApplied
                 ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                 : needsReview
                 ? 'border-amber-300 bg-white text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-amber-900/20'
                 : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                 }`}
             >
               {refreshingDispatchRecommendation
                 ? 'Refreshing dispatch plan...'
                 : recommendationNeedsRefresh
                   ? 'Refresh dispatch plan'
                   : recommendationApplied ? 'Recommendation staged for review' : 'Review dispatch plan'}
             </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-slate-500 dark:text-slate-400">Recommended Status</p>
            <p className="font-medium text-slate-900 dark:text-white">{aiRecommendation.recommendedStatus}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400">Recommended Agency</p>
            <p className="font-medium text-slate-900 dark:text-white">{aiRecommendation.recommendedAgency.toUpperCase()}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400">Recommended Station</p>
            <p className="font-medium text-slate-900 dark:text-white">{aiRecommendation.recommendedStationLabel}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400">Confidence</p>
            <p className="font-medium text-slate-900 dark:text-white">
              {confidenceMessage}
            </p>
          </div>
        </div>
        {Array.isArray(dispatchRecommendation?.dispatch_candidates) && dispatchRecommendation.dispatch_candidates.length > 0 && (
          <div className="text-sm space-y-1">
            <p className="text-slate-500 dark:text-slate-400">Candidate stations</p>
            <div className="space-y-1">
              {dispatchRecommendation.dispatch_candidates.slice(0, 3).map((candidate: any) => (
                <div key={candidate.id} className="flex items-center justify-between rounded border border-blue-100 bg-white/70 px-2 py-1.5 text-xs dark:border-blue-800 dark:bg-slate-800/60">
                  <span>Station #{candidate.station_id || 'Unknown'} · {candidate.distance_meters != null ? `${Math.round(Number(candidate.distance_meters))}m` : 'ETA unavailable'}</span>
                  <span className="font-semibold">{candidate.eligible ? `Rank ${candidate.rank}` : 'Ineligible'}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Candidates are advisory and require dispatcher selection and approval.</p>
            {Array.isArray(dispatchRecommendation.dispatch_recommendation_agencies) && dispatchRecommendation.dispatch_recommendation_agencies.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">Agency recommendations: {dispatchRecommendation.dispatch_recommendation_agencies.map((item: any) => `${item.role || 'support'} #${item.agency_id}`).join(', ')}</p>
            )}
          </div>
        )}
        {SHOW_AI_DISPATCH_RECOMMENDATION && (
          <div className="rounded border border-slate-200 bg-white/70 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/60">
            <p className="font-semibold text-slate-700 dark:text-slate-200">Reviewer feedback</p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">Record whether the advisory plan was useful for calibration and weekly monitoring.</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select value={feedbackVerdict} onChange={(event) => setFeedbackVerdict(event.target.value as typeof feedbackVerdict)} className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
                <option value="accepted">Accepted</option><option value="modified">Modified</option><option value="rejected">Rejected</option><option value="not_applicable">Not applicable</option>
              </select>
              <select value={feedbackReason} onChange={(event) => setFeedbackReason(event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
                <option value="">Reason code</option><option value="agency_wrong">Agency wrong</option><option value="severity_wrong">Severity wrong</option><option value="insufficient_evidence">Insufficient evidence</option><option value="capacity_changed">Capacity changed</option><option value="useful">Useful recommendation</option>
              </select>
              <button type="button" onClick={saveDispatchFeedback} disabled={savingFeedback} className="rounded bg-slate-700 px-3 py-1.5 font-semibold text-white disabled:opacity-60">{savingFeedback ? 'Saving…' : feedbackSaved ? 'Feedback saved' : 'Save feedback'}</button>
            </div>
            <textarea value={feedbackNotes} onChange={(event) => setFeedbackNotes(event.target.value)} placeholder="Optional reviewer note" className="mt-2 min-h-14 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800" />
          </div>
        )}
        <div className="text-sm space-y-1">
          <p className="text-slate-500 dark:text-slate-400">Recommended Resources</p>
          <p className="font-medium text-slate-900 dark:text-white">
            {aiRecommendation.recommendedResourceNames.length > 0
              ? aiRecommendation.recommendedResourceNames.join(', ')
              : 'No concrete resources selected'}
          </p>
          {aiRecommendation.resourceNeeds.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Resource needs: {aiRecommendation.resourceNeeds.join(' | ')}
            </p>
          )}
        </div>
        <div className="text-sm space-y-1">
          <p className="text-slate-500 dark:text-slate-400">Recommended Personnel</p>
          <p className="font-medium text-slate-900 dark:text-white">
            {aiRecommendation.recommendedOfficerNames.length > 0
              ? aiRecommendation.recommendedOfficerNames.join(', ')
              : 'No concrete personnel selected'}
          </p>
          {aiRecommendation.personnelNeeds.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
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
      loadTriageAssessment();
      loadDispatchRecommendation();
      loadOtherIncidents();
      window.api.getAgencies().then((data) => setAvailableAgencies(data || [])).catch((error) => console.error('Failed to load agencies:', error));
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
    if (incident?.agency_type || selectedAgencyType) {
      // Load officers and resources from all involved agencies
      const agencies = [selectedAgencyType || incident?.agency_type].filter((value): value is string => Boolean(value));
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
  }, [incident?.latitude, incident?.longitude, incident?.agency_type, incidentAgencies, selectedAgencyType]);

  const loadIncident = async () => {
    try {
      setIncidentError(null);
      const data = await window.api.getIncident(id!);
      console.log('[IncidentDetail] Loaded incident:', data);
      console.log('[IncidentDetail] Location coords:', data?.latitude, data?.longitude);
      setIncident(data);
      const loadedAgency = toAgencyKey(data?.agency_type);
      setSelectedAgencyType(loadedAgency);
      setInitialAgencyType(loadedAgency);
      setNewStatus(data?.status || '');
      setSelectedStationId(data?.assigned_station_id);
      setStationAssignmentIntent(data?.assigned_station_id ? 'keep' : 'auto');
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
      setIncidentError('Incident details could not be refreshed. The information shown may be stale.');
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
    const errors: AssignmentFormErrors = {};
    const effectiveStationId = stationAssignmentIntent === 'keep'
      ? incident?.assigned_station_id ?? selectedStationId
      : selectedStationId;
    if (!newStatus) errors.status = 'Choose the status to apply.';
    if (newStatus && ['assigned', 'in_progress', 'responding'].includes(newStatus)) {
      if (!selectedAgencyType && !incident?.agency_type) errors.agency = 'Select a response agency for this active assignment.';
      if (!effectiveStationId) errors.station = 'Select an assigned station before applying this active assignment.';
    }
    const hasAssignment = Boolean(effectiveStationId || selectedOfficerIds.length || selectedResourceIds.length);
    if (newStatus === 'pending' && hasAssignment) {
      errors.status = 'Pending incidents cannot have a station, responders, or resources assigned. Choose Assigned or clear the assignment first.';
    }
    if (selectedOfficerIds.length > 0 && !effectiveStationId) {
      errors.station = errors.station || 'Select a station before assigning responders.';
    }
    if (selectedOfficerIds.length > 1 && !selectedPrimaryOfficerId) {
      errors.leadOfficer = 'Choose a lead officer for the assigned team.';
    }
    if (selectedResourceIds.length > 0 && !effectiveStationId) {
      errors.resources = 'Select a station before assigning resources.';
    }
    if (['rejected', 'resolved'].includes(newStatus) && !notes.trim()) {
      errors.notes = `Add a note explaining why this incident is being marked ${newStatus}.`;
    }
    setFormErrors(errors);
    setUpdateError(null);
    if (Object.keys(errors).length > 0) {
      const firstInvalidId = errors.status
        ? 'incident-next-status'
        : errors.agency
          ? 'incident-response-agency'
          : errors.station
            ? 'incident-assigned-station'
            : errors.notes
              ? 'incident-operational-note'
              : null;
      if (firstInvalidId) requestAnimationFrame(() => document.getElementById(firstInvalidId)?.focus());
      return;
    }
    if (!hasChanges()) return;
    if (newStatus === 'closed' && !finalReport) {
      setActiveTab('reports');
      setShowEnhancedReportModal(true);
      return;
    }
    setShowChangeReview(true);
  };

  const loadTriageAssessment = async () => {
    try {
      const assessment = await window.api.getIncidentTriageAssessment(id!);
      setTriageAssessment(assessment || null);
    } catch (error) {
      console.error('Failed to load structured triage assessment:', error);
      setTriageAssessment(null);
    }
  };

  const loadDispatchRecommendation = async () => {
    try {
      const recommendation = await window.api.getDispatchRecommendation(id!);
      setDispatchRecommendation(recommendation || null);
    } catch (error) {
      console.error('Failed to load dispatch recommendation:', error);
      setDispatchRecommendation(null);
    }
  };

  const refreshDispatchRecommendation = async (): Promise<boolean> => {
    if (!id || refreshingDispatchRecommendation) return false;
    setRefreshingDispatchRecommendation(true);
    setUpdateError(null);
    try {
      await window.api.triggerAIReanalysis(id);
      await Promise.all([loadAiReport(), loadTriageAssessment(), loadDispatchRecommendation()]);
      setAppliedAIRecommendationKey(null);
      return true;
    } catch (error: any) {
      console.error('Failed to refresh dispatch recommendation:', error);
      setUpdateError(error?.message || 'Failed to refresh the dispatch recommendation.');
      return false;
    } finally {
      setRefreshingDispatchRecommendation(false);
    }
  };

  const saveDispatchFeedback = async () => {
    if (!incident?.id || !scope.userId) {
      setUpdateError('A signed-in dispatch reviewer is required to record feedback.');
      return;
    }
    setSavingFeedback(true);
    setUpdateError(null);
    try {
      await window.api.recordDispatchReviewFeedback({
        incidentId: incident.id,
        recommendationId: dispatchRecommendation?.id || null,
        reviewerId: scope.userId,
        verdict: feedbackVerdict,
        actualIncidentType: triageAssessment?.incident_type || undefined,
        actualSeverity: triageAssessment?.severity ?? null,
        actualAgencyCodes: selectedAgencyType ? [selectedAgencyType] : [],
        finalCapabilities: triageAssessment?.required_capabilities || [],
        reasonCodes: feedbackReason ? [feedbackReason] : [],
        notes: feedbackNotes || undefined,
      });
      setFeedbackSaved(true);
      setFeedbackNotes('');
    } catch (error: any) {
      setUpdateError(error?.message || 'Failed to record dispatch feedback.');
    } finally {
      setSavingFeedback(false);
    }
  };

  const getAllowedStatuses = () => {
    if (!incident) return [];
    const transitions: Record<string, string[]> = {
      pending: ['pending', 'assigned', 'rejected'],
      assigned: ['assigned', 'in_progress', 'pending'],
      in_progress: ['in_progress', 'resolved'],
      responding: ['responding', 'resolved'],
      resolved: ['resolved', 'closed'],
      ai_routing: ['ai_routing', 'pending', 'assigned', 'rejected'],
      rejected: ['rejected', 'pending'],
      closed: ['closed'],
    };
    return transitions[incident.status] ?? [incident.status];
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabId: typeof activeTab) => {
    const tabIds = tabs.map((tab) => tab.id);
    const currentIndex = tabIds.indexOf(tabId);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabIds.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(tabIds[nextIndex]);
    requestAnimationFrame(() => document.getElementById(`incident-tab-${tabIds[nextIndex]}`)?.focus());
  };

  const confirmChangeReview = async () => {
    setShowChangeReview(false);
    await performStatusUpdate();
  };

  const handleStationChange = (value: string) => {
    const isKeepCurrent = value === 'keep';
    const isAutoAssign = value === 'auto';
    const nextStationId = !isKeepCurrent && !isAutoAssign && value ? Number(value) : isKeepCurrent ? incident?.assigned_station_id ?? null : null;
    const incompatibleOfficerIds = selectedOfficerIds.filter((officerId) => {
      const officer = officers.find((item) => item.id === officerId);
      return nextStationId !== null && officer?.station_id !== nextStationId;
    });
    const incompatibleResourceIds = selectedResourceIds.filter((resourceId) => {
      const resource = resources.find((item) => item.id === resourceId);
      return nextStationId !== null && resource?.station_id !== nextStationId;
    });

    setStationReconciliationError(
      incompatibleOfficerIds.length || incompatibleResourceIds.length
        ? 'Station changed. Personnel or resources from the previous station were removed; review the remaining selections.'
        : null,
    );
    setSelectedStationId(nextStationId);
    if (nextStationId !== null && newStatus === 'pending') {
      setNewStatus('assigned');
    }
    setFormErrors((current) => ({ ...current, station: undefined, officers: undefined, resources: undefined }));
    setStationAssignmentIntent(isKeepCurrent ? 'keep' : isAutoAssign ? 'auto' : 'explicit');
    if (incompatibleOfficerIds.length) {
      setSelectedOfficerIds((ids) => ids.filter((officerId) => !incompatibleOfficerIds.includes(officerId)));
      setSelectedPrimaryOfficerId((primaryId) => primaryId && incompatibleOfficerIds.includes(primaryId) ? null : primaryId);
    }
    if (incompatibleResourceIds.length) {
      setSelectedResourceIds((ids) => ids.filter((resourceId) => !incompatibleResourceIds.includes(resourceId)));
    }
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
      selectedAgencyType !== initialAgencyType ||
      (selectedStationId !== initialStationId) ||
      hasOfficerChanges() ||
      hasPrimaryOfficerChanges() ||
      hasResourceChanges() ||
      (notes.trim().length > 0) || releaseAssignments;
  };

  const changeSummary = () => {
    const changes: string[] = [];
    const stationLabel = (stationId: number | null) => {
      if (!stationId) return 'None';
      return stations.find((station) => station.id === stationId)?.name || `Station #${stationId}`;
    };
    const officerLabel = (officerId: string) => officers.find((officer) => officer.id === officerId)?.display_name || officerId;
    const resourceLabel = (resourceId: number) => resources.find((resource) => resource.id === resourceId)?.name || `Resource #${resourceId}`;
    const statusLabel = (status: string | undefined) => STATUS_OPTIONS.find((option) => option.value === status)?.label || status || 'Unknown';

    if (selectedAgencyType !== initialAgencyType) changes.push(`Agency: ${initialAgencyType.toUpperCase() || 'Not assigned'} -> ${selectedAgencyType.toUpperCase() || 'Not assigned'}`);
    if (newStatus !== incident?.status) changes.push(`Status: ${statusLabel(incident?.status)} → ${statusLabel(newStatus)}`);
    if (selectedStationId !== initialStationId) changes.push(`Station: ${stationLabel(initialStationId)} → ${stationAssignmentIntent === 'auto' ? 'Select manually' : stationLabel(selectedStationId)}`);
    if (hasOfficerChanges()) changes.push(`Officers: ${initialOfficerIds.map(officerLabel).join(', ') || 'None'} → ${selectedOfficerIds.map(officerLabel).join(', ') || 'None'}`);
    if (hasPrimaryOfficerChanges()) changes.push(`Lead officer: ${initialPrimaryOfficerId ? officerLabel(initialPrimaryOfficerId) : 'None'} → ${selectedPrimaryOfficerId ? officerLabel(selectedPrimaryOfficerId) : 'None'}`);
    if (hasResourceChanges()) changes.push(`Resources: ${initialResourceIds.map(resourceLabel).join(', ') || 'None'} → ${selectedResourceIds.map(resourceLabel).join(', ') || 'None'}`);
    if (notes.trim()) changes.push('Operational note added');
    return changes;
  };

  const performStatusUpdate = async () => {
    if (!incident) return;

    setUpdating(true);
    setUpdateError(null);
    setFormErrors({});
    setUpdateSuccess(false);

    try {
      const scope = getSessionScope();
      const applyingAIRecommendation = Boolean(
        newStatus === 'assigned' &&
        selectedStationId &&
        aiRecommendationKey &&
        appliedAIRecommendationKey === aiRecommendationKey,
      );

      if (applyingAIRecommendation) {
        if (!dispatchRecommendation?.id) {
          throw new Error('The AI dispatch plan is no longer current and must be refreshed before approval.');
        }
        if (!scope.userId) {
          throw new Error('A signed-in dispatcher account is required to approve an AI dispatch recommendation.');
        }
        await window.api.approveDispatchRecommendation({
          recommendationId: dispatchRecommendation.id,
          incidentId: incident.id,
          stationId: selectedStationId!,
          officerIds: selectedOfficerIds,
          resourceIds: selectedResourceIds,
          approvedBy: scope.userId,
          overrideReason: notes.trim() || undefined,
        });
      } else {
        await window.api.updateIncidentStatus({
          id: incident.id,
          status: newStatus,
          notes: notes,
          updatedBy: scope.role === 'Admin' ? 'Admin' : (scope.role || 'User'),
          updatedById: scope.userId || undefined,
          agencyType: selectedAgencyType || undefined,
          stationId: selectedStationId ?? undefined,
          officerIds: selectedOfficerIds,
          primaryOfficerId: selectedPrimaryOfficerId,
          resourceIds: selectedResourceIds,
          releaseAssignments: newStatus === 'resolved' || newStatus === 'closed' ? releaseAssignments : undefined,
        });
      }

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
      setReleaseAssignments(false);
      // Don't clear selectedOfficerIds - loadIncident will update them from server
      setLastRefreshed(new Date());
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error: any) {
      console.error('Failed to update status:', error);
      const message = String(error?.message || '');
      if (message.includes('Dispatch recommendation has expired')) {
        const refreshed = await refreshDispatchRecommendation();
        if (refreshed) {
          setUpdateError('The previous dispatch plan expired. A fresh plan is ready for dispatcher review.');
        }
      } else {
        const friendly = normalizeUpdateError(error);
        setUpdateError(friendly);
        if (/dispatch_plan_required/i.test(message)) {
          setFormErrors({ agency: !selectedAgencyType && !incident?.agency_type ? 'Select a response agency.' : undefined, station: !selectedStationId && !incident?.assigned_station_id ? 'Select an assigned station.' : undefined });
        } else if (/final_report_required/i.test(message)) {
          setFormErrors({ form: friendly });
        }
      }
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
                  className="relative group aspect-square rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-600 hover:ring-2 hover:ring-blue-500 transition-all"
                >
                  {isVideo ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800">
                      <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                          <div className="w-0 h-0 border-t-6 border-t-transparent border-l-10 border-l-slate-800 border-b-6 border-b-transparent ml-1"></div>
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
      return <p className="mt-1 text-slate-500 italic">No media attached</p>;
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
                <p className="font-medium text-slate-900 dark:text-white mb-2">{patient.name}</p>
                {patient.address && <p className="text-sm text-slate-600 dark:text-slate-400">📍 {patient.address}</p>}
                {patient.chiefComplaint && (
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                    <span className="font-medium">Chief Complaint:</span> {patient.chiefComplaint}
                  </p>
                )}
                {patient.condition && (
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                    <span className="font-medium">Condition:</span> {patient.condition}
                  </p>
                )}
                {(patient.vitals?.bp || patient.vitals?.pulse || patient.vitals?.spo2) && (
                  <div className="mt-2 pt-2 border-t border-cyan-200 dark:border-cyan-700">
                    <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300 mb-1">Vitals:</p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-400">
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
              <div key={idx} className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded text-sm border border-slate-100 dark:border-slate-700">
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  {person.firstName} {person.middleName} {person.lastName}
                </p>
                {person.alias && <p className="text-xs text-slate-500">Alias: {person.alias}</p>}
                {(person.address || person.occupation) && (
                  <p className="text-xs text-slate-500 mt-1">
                    {[person.address, person.occupation].filter(Boolean).join(' • ')}
                  </p>
                )}
                {person.status && <p className="text-xs text-slate-500">Status: {person.status}</p>}
              </div>
            ))}
          </div>
        );
      }
      // Generic array
      return (
        <ul className="list-disc list-inside mt-1">
          {content.map((item: any, idx: number) => (
            <li key={idx} className="text-slate-800 dark:text-slate-200">
              {typeof item === 'object' ? JSON.stringify(item) : String(item)}
            </li>
          ))}
        </ul>
      );
    }

    if (typeof content === 'object' && content !== null) {
      return <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-x-auto">{JSON.stringify(content, null, 2)}</pre>;
    }

    return <p className="mt-1 text-slate-800 dark:text-white whitespace-pre-wrap">{String(content)}</p>;
  };

  const handleExportPDF = async () => {
    if (!finalReport || !incident) return;

    try {
      const doc = await exportFinalReportToPDF(incident, finalReport, incident.agency_type);
      const filenameAgency = (incident.agency_type?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : incident.agency_type).toUpperCase();
      const filename = `Final_Report_${filenameAgency}_${getIncidentReference(incident)}_${new Date().toISOString().split('T')[0]}.pdf`;
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
          <title>Final Report - ${getIncidentReference(incident || {})}</title>
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
            <div class="subtitle">Incident reference: ${getIncidentReference(incident || {})}</div>
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

       // finalReports:create is the authoritative close operation. Do not issue
       // a second status update, which would turn a successful close into a
       // misleading partial-failure state.
       setShowFinalReportModal(false);
       await Promise.all([loadIncident(), loadHistory(), loadAssignmentHistory(), loadFinalReport()]);

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
    return getAgencyPresentation(agency).fullLabel;
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
      case 'PNP': return 'PNP';
      case 'BFP': return 'BFP';
      case 'MDRRMO': return 'MDRRMO';
      default: return 'UNIT';
    }
  };

  const formatIncidentAge = (dateStr: string) => {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
  };

  const handleRefresh = async () => {
    if (!id) return;
    setLoading(true);
    setIncidentError(null);
    await Promise.allSettled([
      loadIncident(),
      loadHistory(),
      loadAssignmentHistory(),
      loadUnitReports(),
      loadFinalReport(),
      loadDraft(),
      loadIncidentAgencies(),
      loadBackupRequests(),
      loadAiReport(),
      loadOtherIncidents(),
      loadStations(),
      loadResources(),
    ]);
    setLastRefreshed(new Date());
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" role="status" aria-label="Loading incident details">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="sr-only">Loading incident details</span>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        {incidentError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">{incidentError}</div>
        ) : (
          <p className="text-slate-500 mb-4">Incident not found</p>
        )}

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
    { id: 'management' as const, label: 'Management', icon: Truck },
    { id: 'backups' as const, label: 'Backups', icon: AlertTriangle, badge: activeBackupRequests.length },
    { id: 'reports' as const, label: 'Final Report', icon: Edit3 },
  ];
  const assignedOfficerIds = incident.assigned_officer_ids?.length
    ? incident.assigned_officer_ids
    : incident.assigned_officer_id ? [incident.assigned_officer_id] : [];
  const assignedOfficerNames = assignedOfficerIds
    .map((officerId) => officers.find((officer) => officer.id === officerId)?.display_name)
    .filter(Boolean) as string[];
  const assignedStation = getAssignedStation();
  const effectiveDraftStationId = stationAssignmentIntent === 'keep'
    ? incident.assigned_station_id ?? selectedStationId
    : selectedStationId;
  const leadOfficerId = incident.assigned_officer_id || assignedOfficerIds[0] || null;
  const leadOfficerName = leadOfficerId
    ? officers.find((officer) => officer.id === leadOfficerId)?.display_name || 'Officer details unavailable'
    : null;
  const hasOperationalAssignment = Boolean(
    incident.assigned_station_id || assignedOfficerIds.length > 0 || incident.assigned_resource_ids?.length,
  );
  const hasAssignmentStatusConflict = incident.status === 'pending' && hasOperationalAssignment;
  const officialAgency = getAgencyPresentation(incident.agency_type);
  const recommendedAgency = aiRecommendation ? getAgencyPresentation(aiRecommendation.recommendedAgency) : null;
  const severityValue = triageAssessment?.severity ?? aiReport?.severity ?? null;
  const statusHint = STATUS_HINTS[incident.status] || {
    title: 'Incident lifecycle status',
    description: 'This is the official workflow state recorded for the incident.',
  };
  const responseState = assignedStation
    ? assignedOfficerNames.length > 0 ? `${assignedOfficerNames.length} officer${assignedOfficerNames.length === 1 ? '' : 's'} assigned` : 'Station assigned, no officer'
    : 'No station assigned';
  const aiSeverity = aiReport?.status === 'completed' && aiReport.severity ? `Level ${aiReport.severity} / 5` : 'Not assessed';
  const nextRequiredAction = hasAssignmentStatusConflict
    ? 'Align the status with the active assignment'
    : incident.status === 'pending'
      ? 'Choose a response agency and station'
      : incident.status === 'assigned' && !leadOfficerName
        ? 'Assign a lead officer'
        : incident.status === 'assigned'
          ? 'Begin the field response'
          : ['in_progress', 'responding'].includes(incident.status)
            ? 'Monitor the response and update resources'
            : incident.status === 'resolved'
              ? 'Complete the final report and close the record'
              : incident.status === 'closed'
                ? 'No further operational action'
                : 'Review the incident record';
  const proposedStation = effectiveDraftStationId
    ? stations.find((station) => station.id === effectiveDraftStationId)
    : null;
  const proposedLeadOfficer = selectedPrimaryOfficerId
    ? officers.find((officer) => officer.id === selectedPrimaryOfficerId)
    : null;
  const proposedAssignmentConflict = newStatus === 'pending' && Boolean(
    effectiveDraftStationId || selectedOfficerIds.length || selectedResourceIds.length,
  );
  const openResponseManagement = (proposedStatus?: string) => {
    if (proposedStatus) setNewStatus(proposedStatus);
    setFormErrors({});
    setUpdateError(null);
    setActiveTab('management');
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto dark:bg-slate-950">
      {/* Header */}
      <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-4">
        <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate('/incidents')}
            aria-label="Back to incidents"
            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Incident details</p>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              {getIncidentReference(incident)}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ContextHint
                title={officialAgency.isApproved ? 'Official response agency' : 'Agency assignment pending'}
                description={officialAgency.isApproved
                  ? `${officialAgency.fullLabel} is the agency currently recorded as operationally responsible for this incident.`
                  : 'No approved response agency is recorded yet. Review the evidence and assign the responsible agency and station in Management.'}
                ariaLabel={`Explain agency tag: ${officialAgency.fullLabel}`}
              >
                <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${officialAgency.badgeClass}`}>
                  {!officialAgency.isApproved && <HelpCircle size={13} aria-hidden="true" />}
                  {officialAgency.fullLabel}
                </span>
              </ContextHint>
              {!officialAgency.isApproved && recommendedAgency?.isApproved && (
                <ContextHint
                  title="AI agency recommendation"
                  description={`${recommendedAgency.fullLabel} is suggested from the available report evidence. This is advisory and does not change the official agency or assign a station.`}
                  ariaLabel={`Explain AI recommendation for ${recommendedAgency.shortLabel}`}
                >
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800">
                    AI recommends {recommendedAgency.shortLabel}
                  </span>
                </ContextHint>
              )}
              {!officialAgency.isApproved && (severityValue || triageAssessment?.urgency) && (
                <ContextHint
                  title="AI severity and urgency"
                  description="Severity estimates impact on a 1-5 scale. Urgency describes how quickly action may be needed. Both are advisory until a dispatcher verifies the report."
                  ariaLabel="Explain AI severity and urgency"
                >
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {severityValue ? `Severity ${severityValue}` : ''}{severityValue && triageAssessment?.urgency ? ' · ' : ''}{triageAssessment?.urgency || ''}
                  </span>
                </ContextHint>
              )}
              <ContextHint
                title={statusHint.title}
                description={statusHint.description}
                ariaLabel={`Explain ${STATUS_OPTIONS.find(s => s.value === incident.status)?.label || incident.status} status`}
              >
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold text-white ${STATUS_OPTIONS.find(s => s.value === incident.status)?.color || 'bg-slate-500'}`}>
                  {STATUS_OPTIONS.find(s => s.value === incident.status)?.label || incident.status}
                </span>
              </ContextHint>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Reported {formatIncidentAge(incident.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLocked && scope.role === 'Admin' && (
            <button
              onClick={handleReopenIncident}
              disabled={reopening}
            className="inline-flex items-center gap-2 min-h-10 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 rounded-lg hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-amber-900/20 transition-colors shadow-sm"
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
            disabled={loading}
            className="inline-flex items-center gap-2 min-h-10 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-600 rounded-lg hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-900/30 transition-colors"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
          {lastRefreshed && <span className="hidden text-xs text-slate-500 dark:text-slate-400 xl:inline">Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        </div>
      </div>

      {incidentError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <span>{incidentError}</span>
          <button type="button" onClick={handleRefresh} className="min-h-10 rounded-lg border border-red-300 px-3 font-semibold hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-700 dark:hover:bg-red-900/40">Retry</button>
        </div>
      )}

      <div className="mb-4 overflow-x-auto">
        <div role="tablist" aria-label="Incident details" className="inline-flex min-w-full sm:min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`incident-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                role="tab"
                aria-selected={isActive}
                aria-controls={`incident-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`flex flex-1 sm:flex-none min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'
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

       <div id={`incident-panel-${activeTab}`} role="tabpanel" aria-labelledby={`incident-tab-${activeTab}`} tabIndex={0} className={`grid grid-cols-1 gap-4 ${(activeTab === 'overview' || activeTab === 'reports' || activeTab === 'management') ? 'xl:grid-cols-[minmax(620px,1fr)_320px]' : ''}`}>
        {/* Main Content */}
        <div className="space-y-6">
          {activeTab === 'overview' && (
            <>
              {hasAssignmentStatusConflict && (
                <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20" aria-labelledby="assignment-conflict-title" role="alert">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                      <div>
                        <h2 id="assignment-conflict-title" className="text-sm font-semibold text-amber-950 dark:text-amber-100">Status does not match the response assignment</h2>
                        <p className="mt-1 text-sm leading-5 text-amber-900 dark:text-amber-200">
                          {assignedStation?.name || 'A response unit'} is assigned while this incident remains Pending. Review the response plan before further updates.
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" onClick={() => openResponseManagement('assigned')} className="min-h-11 rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">Set status to Assigned</button>
                      <button type="button" onClick={() => openResponseManagement()} className="min-h-11 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/30">Review assignment</button>
                    </div>
                  </div>
                </section>
              )}
              <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/20" aria-labelledby="operational-summary-title">
                <div className="mb-3">
                  <div>
                    <h2 id="operational-summary-title" className="text-base font-semibold text-slate-900 dark:text-white">Current response state</h2>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">Live assignment and readiness information</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
                  <div><p className="text-xs text-slate-500 dark:text-slate-400">Status</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{STATUS_OPTIONS.find((option) => option.value === incident.status)?.label || incident.status}</p></div>
                  <div><p className="text-xs text-slate-500 dark:text-slate-400">Incident age</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatIncidentAge(incident.created_at)}</p></div>
                  <div><p className="text-xs text-slate-500 dark:text-slate-400">AI severity</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{aiSeverity}</p></div>
                  <div><p className="text-xs font-medium text-slate-600 dark:text-slate-300">Affected people</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{incident.casualties_count ? `${incident.casualties_count} recorded` : incident.casualties_category || 'Not confirmed'}</p></div>
                  <div className="col-span-2 md:col-span-2"><p className="text-xs text-slate-500 dark:text-slate-400">Assigned station</p><p className="mt-1 truncate font-semibold text-slate-900 dark:text-white">{assignedStation ? `${assignedStation.agencies?.short_name?.toUpperCase() || ''} · ${assignedStation.name}` : 'Not assigned'}</p></div>
                  <div><p className="text-xs text-slate-500 dark:text-slate-400">Response team</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{responseState}</p></div>
                  <div><p className="text-xs text-slate-500 dark:text-slate-400">Resources</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{incident.assigned_resource_ids?.length || 0} assigned</p></div>
                </div>
              </section>

              {/* Incident evidence: reporter narrative and attached media belong together. */}
              <div id="incident-evidence" className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                   <h2 className="text-base font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                    <FileText size={20} />
                    Incident Evidence
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">From Reporter</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{mediaItems.length} attachment{mediaItems.length === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{incident.description || 'No written description provided.'}</p>

                {mediaItems.length > 0 && (
                  <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><ImageIcon size={14} /> Attached evidence</p>
                      <button type="button" onClick={() => setSelectedEvidenceIndex(0)} className="min-h-10 rounded-lg px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/20">View all</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {mediaItems.slice(0, 6).map((item, index) => (
                        <button key={`${item.url}-${index}`} type="button" onClick={() => setSelectedEvidenceIndex(index)} aria-label={`Open evidence ${index + 1} of ${mediaItems.length}`} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900">
                          {item.type === 'video' ? <video src={item.url} preload="metadata" className="h-full w-full object-cover" /> : <img src={item.url} alt={`Incident evidence attachment ${index + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
                          {index === 5 && mediaItems.length > 6 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">+{mediaItems.length - 6}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" aria-labelledby="final-report-title">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 id="final-report-title" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <FileText size={20} />
                      Official final report
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Complete the record, request review, then publish after verification.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEnhancedReportModal(true)}
                    className={`flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isLocked
                      ? 'bg-slate-600 hover:bg-slate-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                  >
                    {isLocked ? <FileText size={16} /> : <Edit3 size={16} />}
                    {isLocked ? 'View official report' : draftReport ? 'Open working report' : 'Start final report'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-3" aria-label="Final report workflow status">
                  {[
                    { label: '1. Working report', complete: Boolean(draftReport || finalReport), active: !finalReport && (!draftReport || draftReport.status === 'draft') },
                    { label: '2. Review', complete: Boolean(finalReport || draftReport?.status === 'ready_for_review'), active: !finalReport && draftReport?.status === 'ready_for_review' },
                    { label: '3. Published', complete: Boolean(finalReport), active: Boolean(finalReport) }
                  ].map((step) => (
                    <div key={step.label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${step.active
                      ? 'border-blue-300 bg-blue-50 font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200'
                      : step.complete
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                        : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                      }`}>
                      {step.complete ? <CheckCircle2 size={16} /> : <span className="h-4 w-4 rounded-full border border-current" aria-hidden="true" />}
                      {step.label}
                    </div>
                  ))}
                </div>

                {finalReport ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-900/10">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Published record</span>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Published {formatDate(finalReport.completed_at)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportPDF}
                        className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <FileText size={14} />
                        Export PDF
                      </button>
                    </div>

                    <div className="space-y-4">
                      {formatReportDetails(finalReport.report_details)?.map(([key, value]) => (
                        <div key={key}>
                          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase text-xs">
                            {formatFieldLabel(key)}
                          </h3>
                          {renderReportValue(key, value)}
                        </div>
                      ))}

                    </div>
                  </div>
                ) : draftReport ? (
                  <div className={`rounded-lg border p-4 ${draftReport.status === 'ready_for_review'
                    ? 'border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-900/10'
                    : 'border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-900/10'
                    }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${draftReport.status === 'ready_for_review'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}>
                          {draftReport.status === 'ready_for_review' ? 'Ready for Review' : 'Draft In Progress'}
                        </span>
                        {draftReport.draft_details?.source === 'responder' && (
                          <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <Smartphone size={13} /> Responder submission
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Saved {draftReport.updated_at ? formatDate(draftReport.updated_at) : 'date unavailable'}
                      </span>
                    </div>

                    <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
                      {draftReport.status === 'ready_for_review'
                        ? 'Required fields are complete. Verify the report before publishing and closing the incident.'
                        : 'This report is still being authored. Complete required fields before submitting it for review.'}
                    </p>

                    {draftReport.draft_details?.source === 'responder' && draftReport.draft_details?.title && (
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
                        {draftReport.draft_details.title}
                      </p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {formatReportDetails(draftReport.draft_details)?.slice(0, 3).map(([key, value]) => (
                        <div key={key}>
                          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase text-xs">
                            {formatFieldLabel(key)}
                          </h3>
                          <div className="line-clamp-2 text-sm">
                            {renderReportValue(key, value)}
                          </div>
                        </div>
                      ))}
                      {(!draftReport.draft_details || Object.keys(draftReport.draft_details).length === 0) && (
                        <p className="text-sm text-slate-500 italic">No details entered yet.</p>
                      )}
                    </div>

                    <div className="mt-4 flex justify-end border-t border-slate-200 pt-3 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setShowEnhancedReportModal(true)}
                        className="flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/20"
                      >
                        {draftReport.status === 'ready_for_review' ? 'Review report' : 'Continue editing'} <ArrowLeft className="rotate-180" size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-slate-500 dark:border-slate-600 dark:text-slate-400">
                    <FileText size={36} className="mx-auto mb-3 opacity-50" />
                    <p className="font-medium text-slate-700 dark:text-slate-200">No working report</p>
                    <p className="mt-1 text-sm">Start the agency report and save it before requesting review.</p>
                  </div>
                )}
              </section>

            </>
          )}

          {activeTab === 'overview' && (
            <>
              {/* Location */}
              <div id="incident-location" className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                 <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                  <MapPin size={20} />
                  Incident Location
                </h2>
                <p className="text-slate-700 dark:text-slate-300 mb-2">{incident.location_address || 'Address not available'}</p>
                {/* Assigned Station Badge */}
                {incident.assigned_station_id && (() => {
                  const assignedStation = stations.find(s => s.id === incident.assigned_station_id);
                  if (assignedStation) {
                    const isPrimary = assignedStation.agencies?.short_name?.toLowerCase() === incident.agency_type?.toLowerCase();
                    return (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Assigned to:</span>
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
                     <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                       Coordinates: {Number(incident.latitude).toFixed(6)}, {Number(incident.longitude).toFixed(6)}
                     </p>
                    {/* Interactive Map with Route */}
                    <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                      {/* Route Toggle Button */}
                      {incident.assigned_station_id && getAssignedStation() && (
                        <div className="bg-slate-50 dark:bg-slate-700 p-2 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
                          <button
                            onClick={() => setShowRoute(!showRoute)}
                            aria-pressed={showRoute}
                            className={`min-h-10 px-3 py-1.5 text-sm rounded-lg flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${showRoute
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-500'
                              }`}
                          >
                            <Truck size={16} />
                            {showRoute ? 'Hide Route' : 'Show Route from Station'}
                          </button>
                          {showRoute && routeInfo && (
                            <div className="text-sm text-slate-600 dark:text-slate-300">
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
                       <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" aria-label="Map legend">
                         <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Incident</span>
                         <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Responding station</span>
                         {showRoute && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-blue-600" /> Suggested route</span>}
                       </div>

                       {/* Map Actions */}
                      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700 px-3 py-2 border-t border-slate-200 dark:border-slate-600">
                         <button
                           type="button"
                           onClick={() => {
                             if (getAssignedStation()) setShowRoute(true);
                             setMapView('larger');
                           }}
                           className="min-h-10 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                         >
                           <Maximize2 size={14} />
                           View larger map
                         </button>
                         {getAssignedStation() && (
                           <button
                             type="button"
                             onClick={() => {
                               setShowRoute(true);
                               setMapView('directions');
                             }}
                             className="min-h-10 text-sm text-green-600 hover:underline flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 cursor-pointer"
                           >
                             <Truck size={14} />
                             Open directions
                           </button>
                         )}
                      </div>
                    </div>

                    {/* Nearby Stations */}
                    {getNearbyStations().length > 0 && (
                       <div className="mt-4">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Nearby Response Units</h3>
                        <div className="space-y-2">
                          {getNearbyStations().map((station) => (
                            <div
                              key={station.id}
                               className="flex min-h-12 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm transition-colors hover:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500 dark:border-slate-700 dark:bg-slate-700"
                            >
                              <div className="flex items-center gap-2">
                                 <span className="min-w-14 text-xs font-bold text-slate-500 dark:text-slate-300">{station.agencies?.short_name?.toUpperCase()}</span>
                                <div>
                                  <p className="font-medium text-slate-800 dark:text-white">{station.name}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{station.agencies?.short_name}</p>
                                </div>
                              </div>
                               <div className="text-right">
                                 <p className="font-medium text-slate-700 dark:text-slate-300">{station.distance.toFixed(1)} km</p>
                                {station.contact_number && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{station.contact_number}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Map coordinates not available</p>
                )}
              </div>

              {/* Media */}
               <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                   <h2 className="text-base font-semibold text-slate-800 dark:text-white flex items-center gap-2">
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
                   <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {mediaItems.map((item, index) => {
                      const isVideo = item.type === 'video';
                      const isImage = item.type === 'image';

                      if (isVideo) {
                        return (
                          <div
                            key={index}
                            className="relative aspect-square bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden"
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
                            className="relative aspect-square bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                          >
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                            >
                              <img
                                src={item.url}
                                alt={`Incident evidence ${index + 1}`}
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
                          className="flex items-center justify-center aspect-square bg-slate-100 dark:bg-slate-900 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 transition-colors"
                        >
                          View file
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No media uploaded yet. Click "Upload Media" to add photos or videos.</p>
                )}
              </div>

              {/* Assigned Officers */}
              {(incident.assigned_officer_ids?.length || incident.assigned_officer_id) && (
                 <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                   <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
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
                          className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <User size={20} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 dark:text-white truncate">
                              {officer.display_name || officer.email}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
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
                                      <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded">
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
                            <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded">
                              Supporting
                            </span>
                          )}
                        </div>
                      ));
                    })()}
                    {/* Show placeholder if officers not loaded yet */}
                    {officers.length === 0 && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Loading officer details...</p>
                    )}
                  </div>
                </div>
              )}

              {/* Unit Reports from Field Officers */}
              {unitReports.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
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
                        <div key={report.id} className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-slate-800 dark:text-white">{report.title}</span>
                            <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                              {report.agency}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            By: {report.profiles?.display_name || 'Unknown Officer'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Submitted: {formatDate(report.created_at)}
                          </p>

                          {/* Formatted Details */}
                          {report.details && (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                              <div className="space-y-2 text-sm">
                                {/* Narrative */}
                                {details.narrative && (
                                  <div>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Narrative:</span>
                                    <p className="mt-1 text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{details.narrative}</p>
                                  </div>
                                )}

                                {/* Suspects */}
                                {details.suspects && (
                                  <div>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Suspects:</span>
                                    <p className="mt-1 text-slate-600 dark:text-slate-400">{details.suspects}</p>
                                  </div>
                                )}

                                {/* Victims */}
                                {details.victims && (
                                  <div>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Victims:</span>
                                    <p className="mt-1 text-slate-600 dark:text-slate-400">{details.victims}</p>
                                  </div>
                                )}

                                {/* Counts */}
                                <div className="flex flex-wrap gap-4 mt-2">
                                  {details.victims_count && (
                                    <span className="text-slate-600 dark:text-slate-400">
                                      <strong>Victims:</strong> {details.victims_count}
                                    </span>
                                  )}
                                  {details.suspects_count && (
                                    <span className="text-slate-600 dark:text-slate-400">
                                      <strong>Suspects:</strong> {details.suspects_count}
                                    </span>
                                  )}
                                  {details.evidence_count && (
                                    <span className="text-slate-600 dark:text-slate-400">
                                      <strong>Evidence:</strong> {details.evidence_count}
                                    </span>
                                  )}
                                </div>

                                {/* Timestamp */}
                                {details.timestamp && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Report Time: {new Date(details.timestamp).toLocaleString()}
                                  </p>
                                )}

                                {/* Media Gallery */}
                                {mediaUrls.length > 0 && (
                                  <div className="mt-3">
                                    <span className="font-medium text-slate-700 dark:text-slate-300 block mb-2">
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
                                            className="relative group aspect-square rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-600 hover:ring-2 hover:ring-blue-500 transition-all"
                                          >
                                            {isVideo ? (
                                              <div className="w-full h-full flex items-center justify-center bg-slate-800">
                                                <video
                                                  src={url}
                                                  className="w-full h-full object-cover"
                                                  muted
                                                  preload="metadata"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                  <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                                                    <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-slate-800 border-b-8 border-b-transparent ml-1"></div>
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
            <>
            <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/20" aria-labelledby="decision-context-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="decision-context-title" className="text-sm font-semibold text-slate-900 dark:text-white">Decision context</h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{getIncidentReference(incident)} · {incident.location_address || 'Location unavailable'}</p>
                </div>
                <button type="button" onClick={() => setActiveTab('overview')} className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300">View overview</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div><span className="block text-slate-500 dark:text-slate-400">Status</span><strong className="mt-0.5 block text-slate-900 dark:text-white">{STATUS_OPTIONS.find((option) => option.value === incident.status)?.label || incident.status}</strong></div>
                <div><span className="block text-slate-500 dark:text-slate-400">AI severity</span><strong className="mt-0.5 block text-slate-900 dark:text-white">{aiSeverity}</strong></div>
                <div><span className="block text-slate-500 dark:text-slate-400">Recommendation</span><strong className="mt-0.5 block text-slate-900 dark:text-white">{recommendedAgency?.shortLabel || officialAgency.shortLabel}</strong></div>
                <div><span className="block text-slate-500 dark:text-slate-400">Evidence</span><strong className="mt-0.5 block text-slate-900 dark:text-white">{mediaItems.length} attachment{mediaItems.length === 1 ? '' : 's'}</strong></div>
              </div>
              {mediaItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedEvidenceIndex(0)}
                  aria-label={`Open evidence, ${mediaItems.length} attachment${mediaItems.length === 1 ? '' : 's'}`}
                  className="mt-3 flex w-full items-center gap-3 rounded-lg border border-blue-200/80 bg-white/70 p-2 text-left transition-colors hover:border-blue-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800/70 dark:bg-slate-900/30 dark:hover:bg-slate-900/60"
                >
                  <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800">
                    {mediaItems[0].type === 'video' ? (
                      <video src={mediaItems[0].url} muted preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      <img src={mediaItems[0].url} alt="First incident evidence" className="h-full w-full object-cover" />
                    )}
                    {mediaItems.length > 1 && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-bold text-white">+{mediaItems.length - 1}</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">Open evidence preview</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{mediaItems.length > 1 ? 'View all attachments' : 'View full-size attachment'}</span>
                  </span>
                  <ImageIcon size={16} className="ml-auto shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                </button>
              )}
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-700 dark:text-slate-300">{incident.description || 'No written description provided.'}</p>
            </section>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">Response plan</p>
                  <h2 className="mt-0.5 text-base font-semibold text-slate-800 dark:text-white">Update operational state</h2>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-700">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Current status</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_OPTIONS.find(s => s.value === incident.status)?.color || 'bg-slate-500'
                  } text-white`}>
                  {STATUS_OPTIONS.find(s => s.value === incident.status)?.label || incident.status}
                </span>
              </div>

              {incident.status === 'pending' && (incident.assigned_station_id || initialOfficerIds.length > 0 || initialResourceIds.length > 0) && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200" role="alert">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span><strong>Assignment status needs review.</strong> This incident is Pending but already has response assignments.</span>
                  </div>
                  <button type="button" onClick={() => { setNewStatus('assigned'); setFormErrors((current) => ({ ...current, status: undefined })); }} className="ml-5 mt-2 min-h-10 rounded-lg bg-amber-700 px-3 py-1.5 font-semibold text-white hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">Set status to Assigned</button>
                </div>
              )}

              {updateSuccess && (
                 <div className="mb-3 p-2.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm" role="status" aria-live="polite">
                  Response plan updated successfully.
                </div>
              )}

              {updateError && (
                 <div className="mb-3 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200" role="alert" aria-live="assertive">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <div><p className="font-semibold">Could not save changes</p><p className="mt-0.5">{updateError}</p></div>
                </div>
              )}

              <div className="space-y-3">
                {renderAIRecommendationPanel()}
                {(newStatus === 'resolved' || newStatus === 'closed') && (initialOfficerIds.length > 0 || initialResourceIds.length > 0) && (
                  <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                    <legend className="px-1 text-sm font-semibold text-amber-900 dark:text-amber-200">Assignment disposition</legend>
                    <div className="space-y-2">
                    <label className="flex min-h-10 items-start gap-3 text-sm text-amber-900 dark:text-amber-100">
                      <input
                        type="radio"
                        name="assignment-disposition"
                        checked={releaseAssignments}
                        onChange={() => setReleaseAssignments(true)}
                        disabled={isLocked}
                        className="mt-1 h-4 w-4 border-amber-400 text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <strong>Release assigned personnel and resources</strong>
                        <span className="mt-1 block text-xs text-amber-800 dark:text-amber-200">Mark the response team available when this update is applied.</span>
                      </span>
                    </label>
                    <label className="flex min-h-10 items-start gap-3 text-sm text-amber-900 dark:text-amber-100">
                      <input type="radio" name="assignment-disposition" checked={!releaseAssignments} onChange={() => setReleaseAssignments(false)} disabled={isLocked} className="mt-1 h-4 w-4 border-amber-400 text-blue-600 focus:ring-blue-500" />
                      <span><strong>Keep the team attached for follow-up</strong><span className="mt-1 block text-xs text-amber-800 dark:text-amber-200">Preserve the current assignment after the status change.</span></span>
                    </label>
                    </div>
                  </fieldset>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="incident-next-status" className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1.5">1. Next operational state</label>
                  <select
                    id="incident-next-status"
                    value={newStatus}
                     onChange={(e) => {
                       const nextStatus = e.target.value;
                       setNewStatus(nextStatus);
                       setFormErrors((current) => ({ ...current, status: nextStatus === 'pending' && hasOperationalAssignment ? 'Clear the response plan before returning to Pending.' : undefined, notes: undefined }));
                     }}
                    disabled={isLocked}
                    aria-invalid={Boolean(formErrors.status)}
                    aria-describedby={formErrors.status ? 'incident-status-error' : undefined}
                    className={`w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                     {STATUS_OPTIONS.filter((option) => getAllowedStatuses().includes(option.value)).map((option) => (
                      <option key={option.value} value={option.value} disabled={option.value === 'pending' && hasOperationalAssignment}>
                        {option.label} {option.value === incident.status ? '(current)' : ''}
                      </option>
                    ))}
                  </select>
                  {formErrors.status && <p id="incident-status-error" className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.status}</p>}
                </div>

                {/* Response Agency - explicit dispatcher choice */}
                {getSessionScope().role === 'Admin' && (
                  <div>
                    <label htmlFor="incident-response-agency" className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1.5">2. Response agency</label>
                    <select
                      id="incident-response-agency"
                      value={selectedAgencyType}
                      onChange={(event) => {
                        const nextAgency = event.target.value;
                        const clearedPlan = Boolean(selectedStationId || selectedOfficerIds.length || selectedResourceIds.length);
                        setSelectedAgencyType(nextAgency);
                        setFormErrors((current) => ({ ...current, agency: undefined, station: undefined }));
                        setSelectedStationId(null);
                        setStationAssignmentIntent('explicit');
                        setSelectedOfficerIds([]);
                        setSelectedPrimaryOfficerId(null);
                        setSelectedResourceIds([]);
                        setStationReconciliationError(clearedPlan ? 'Response agency changed. The previous station, personnel, and resources were cleared.' : null);
                      }}
                      disabled={isLocked}
                      aria-invalid={Boolean(formErrors.agency)}
                      aria-describedby={formErrors.agency ? 'incident-agency-error' : 'incident-agency-help'}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    >
                      <option value="">Select an agency</option>
                      {availableAgencies.map((agency) => {
                        const code = String(agency.short_name || '').toLowerCase();
                        return ['pnp', 'bfp', 'mdrrmo'].includes(code) ? <option key={agency.id} value={code}>{agency.name} ({code.toUpperCase()})</option> : null;
                      })}
                    </select>
                    {formErrors.agency && <p id="incident-agency-error" className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.agency}</p>}
                    <p id="incident-agency-help" className="mt-1 text-xs text-slate-500 dark:text-slate-400">Determines the available stations, personnel, and resources.</p>
                  </div>
                )}
                </div>

                {/* Station Assignment - Editable for Admin, read-only for others */}
                <div>
                  <label htmlFor="incident-assigned-station" className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1.5">
                    3. Assigned station
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
                            id="incident-assigned-station"
                             value={stationAssignmentIntent === 'keep' ? 'keep' : stationAssignmentIntent === 'auto' ? 'auto' : selectedStationId?.toString() || ''}
                             onChange={(e) => handleStationChange(e.target.value)}
                            disabled={isLocked}
                            aria-invalid={Boolean(formErrors.station)}
                            aria-describedby={formErrors.station ? 'incident-station-error' : undefined}
                            className={`w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                             <option value={incident.assigned_station_id ? 'keep' : 'auto'}>
                               {incident.assigned_station_id ? 'Keep current station' : 'Select a station'}
                             </option>
                            {stations
                              .filter(s => (selectedAgencyType ? s.agencies?.short_name?.toLowerCase() === selectedAgencyType : involvedAgencies.includes(s.agencies?.short_name?.toLowerCase())))
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
                            {stations.filter(s => (selectedAgencyType ? s.agencies?.short_name?.toLowerCase() === selectedAgencyType : involvedAgencies.includes(s.agencies?.short_name?.toLowerCase()))).length === 0 && (
                              <option disabled>No stations configured for this agency</option>
                            )}
                          </select>
                          {formErrors.station && <p id="incident-station-error" className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.station}</p>}
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">Selected Agency:</span>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded font-medium">
                              {selectedAgencyType ? selectedAgencyType.toUpperCase() : 'Not selected'}
                            </span>
                          </div>
                   {stationReconciliationError && (
                     <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                       {stationReconciliationError}
                     </p>
                   )}
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                             {stationAssignmentIntent === 'auto'
                               ? newStatus === 'pending' ? 'Choose a station before assigning responders.' : 'Select a station before applying an active assignment.'
                               : stationAssignmentIntent === 'keep' ? 'The current station will remain assigned.' : 'Changing station may remove incompatible responders or resources.'}
                          </p>
                        </>
                      );
                    } else {
                      // Non-admin: read-only
                      return (
                        <>
                          <div className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
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
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">Selected Agency:</span>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded font-medium">
                              {getAgencyPresentation(incident.agency_type).shortLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
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
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1.5">
                      View Officers By Agency
                    </label>
                    <select
                      value={viewAgencyFilter}
                      onChange={(e) => setViewAgencyFilter(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
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

                <div className="flex items-center gap-2 mt-2 mb-2">
                  <input
                    type="checkbox"
                    id="hideBusyToggle"
                    checked={hideBusy}
                    onChange={(e) => setHideBusy(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="hideBusyToggle" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none font-medium">
                    Show only available officers
                  </label>
                </div>


                {/* Officer Assignment */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <UserCheck size={14} />
                      4. Response personnel
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

                  <div className={`border border-slate-200 dark:border-slate-600 rounded-xl ${isUpdateStatusExpanded ? 'max-h-96' : 'max-h-48'} overflow-y-auto bg-white dark:bg-slate-700 divide-y divide-slate-100 dark:divide-slate-600`}>
                    {(() => {
                       const targetStationId = effectiveDraftStationId || null;
                       if (!targetStationId) {
                         return <p className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">Select a response agency and station to view eligible personnel.</p>;
                       }
                       const visibleOfficers = officers.filter(officer => {
                         if (officer.station_id !== targetStationId) return false;
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
                          <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
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
                         const profileUnavailable = Boolean(officer.status && !['available', 'online'].includes(officer.status.toLowerCase()));
                         // Keep currently assigned officers visible, but prevent adding unavailable officers.
                         const showBusy = !isCurrentlyAssigned && (isBusyOnOther || profileUnavailable);

                        return (
                          <label
                            key={officer.id}
                             className={`flex items-start gap-3 px-3 py-3 ${showBusy ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600'} transition-colors ${isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedOfficerIds.includes(officer.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const newOfficerIds = [...selectedOfficerIds, officer.id];
                                  setSelectedOfficerIds(newOfficerIds);
                                  if (newStatus === 'pending') setNewStatus('assigned');
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
                               disabled={showBusy || isLocked} // Disable if deployed/unavailable or locked
                              className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-white flex flex-wrap items-center gap-2">
                                <span className="truncate">{officer.display_name || officer.email}</span>
                                {isCurrentlyAssigned && (
                                  <span className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full font-medium">
                                    Assigned
                                  </span>
                                )}
                                 {showBusy && (
                                   <span className="text-[11px] px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 rounded-full font-medium">
                                     {isBusyOnOther ? 'Busy' : officer.status}
                                   </span>
                                 )}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
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
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Select one or more officers to respond to this incident
                  </p>
                  {formErrors.officers && <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.officers}</p>}
                </div>


                {selectedOfficerIds.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1.5">
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
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white disabled:opacity-70"
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
                    {formErrors.leadOfficer && <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.leadOfficer}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      The lead officer is the report owner. If only one officer is assigned, they are automatically the lead.
                    </p>
                  </div>
                )}{/* Assign Resources */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-2">
                    <span className="flex items-center gap-1">
                      <Truck size={14} />
                      5. Response resources
                    </span>
                    {selectedResourceIds.length > 0 && (
                      <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                        ({selectedResourceIds.length} selected{hasResourceChanges() ? ' - modified' : ''})
                      </span>
                    )}
                  </label>
                  <div className={`border border-slate-200 dark:border-slate-600 rounded-lg ${isUpdateStatusExpanded ? 'max-h-96' : 'max-h-48'} overflow-y-auto bg-white dark:bg-slate-700`}>
                    {(() => {
                       const visibleResources = resources.filter(res => {
                        const targetStationId = effectiveDraftStationId;
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
                          <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
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
                            className={`flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer border-b border-slate-100 dark:border-slate-600 last:border-b-0 ${isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedResourceIds.includes(res.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedResourceIds([...selectedResourceIds, res.id]);
                                  if (newStatus === 'pending') setNewStatus('assigned');
                                } else {
                                  setSelectedResourceIds(selectedResourceIds.filter(id => id !== res.id));
                                }
                              }}
                              disabled={showBusy || isLocked}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-white truncate flex items-center gap-2">
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
                              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                                {res.type}
                              </p>
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                  {formErrors.resources && <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.resources}</p>}
                </div>

                <div>
                   <label htmlFor="incident-operational-note" className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-2">6. {['rejected', 'resolved'].includes(newStatus) ? 'Reason / resolution note' : 'Operational record (optional)'}</label>
                  <textarea
                    id="incident-operational-note"
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); if (e.target.value.trim()) setFormErrors((current) => ({ ...current, notes: undefined })); }}
                    disabled={isLocked}
                    aria-invalid={Boolean(formErrors.notes)}
                    aria-describedby={formErrors.notes ? 'incident-note-error' : undefined}
                     placeholder={isLocked ? "Cannot add notes to a locked incident" : ['rejected', 'resolved'].includes(newStatus) ? 'Explain the decision and operational outcome...' : 'Add notes about this status change...'}
                    rows={3}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-slate-700 dark:text-white disabled:opacity-70"
                  />
                  {formErrors.notes && <p id="incident-note-error" className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.notes}</p>}
                </div>

                    <button
                      onClick={handleUpdateStatus}
                      disabled={updating || !hasChanges() || isLocked}
                      className="sticky bottom-0 w-full min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md xl:hidden"
                >
                  <Send size={18} />
                    {updating ? 'Applying changes...' : hasChanges() ? `Review ${changeSummary().length} change${changeSummary().length === 1 ? '' : 's'}` : 'No changes to review'}
                </button>
              </div>
            </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        {(activeTab === 'overview' || activeTab === 'reports') && (
          <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            {activeTab === 'overview' && (
              <section className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900/60 dark:bg-slate-800" aria-labelledby="response-context-title">
                <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">Next required action</p>
                <h2 id="response-context-title" className="mt-1 text-base font-semibold leading-6 text-slate-900 dark:text-white">{nextRequiredAction}</h2>
                <dl className="mt-4 space-y-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
                  <div><dt className="text-xs font-medium text-slate-600 dark:text-slate-300">Lead officer</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{leadOfficerName || 'Not assigned'}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-600 dark:text-slate-300">Backup requests</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{activeBackupRequests.length > 0 ? `${activeBackupRequests.length} active` : 'None active'}</dd></div>
                  <div><dt className="text-xs font-medium text-slate-600 dark:text-slate-300">Facts to verify</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-200">{triageAssessment?.missing_facts?.length ? `${triageAssessment.missing_facts.length} outstanding` : 'No AI verification prompts'}</dd></div>
                </dl>
                {!isLocked && <button type="button" onClick={() => openResponseManagement(hasAssignmentStatusConflict ? 'assigned' : undefined)} className="mt-4 min-h-11 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Manage response</button>}
              </section>
            )}
            {activeTab === 'reports' && (
              <>
                <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" aria-labelledby="record-context-title">
                  <h2 id="record-context-title" className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Record context</h2>
                  <dl className="space-y-3 text-sm">
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">Agency decision</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{getAgencyPresentation(incident.agency_type).fullLabel}</dd></div>
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">Incident status</dt><dd className="mt-0.5 font-medium capitalize text-slate-900 dark:text-white">{incident.status.replace(/_/g, ' ')}</dd></div>
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">Field reports available</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{unitReports.length}</dd></div>
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">Draft attachments</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{draftMediaUrls.length}</dd></div>
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">Reporter</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{incident.reporter_name || 'Anonymous'}</dd></div>
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">Incident location</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-200">{incident.location_address || 'Not recorded'}</dd></div>
                  </dl>
                </section>
                <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-900/10" aria-labelledby="publishing-impact-title">
                  <h2 id="publishing-impact-title" className="mb-2 text-base font-semibold text-slate-900 dark:text-white">Publishing impact</h2>
                  <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">Publishing creates the official final record and closes the incident. Confirm field details, casualty figures, response times, and supporting evidence first.</p>
                </section>
              </>
            )}
            {/* AI Triage Summary */}
            {activeTab === 'overview' && aiReport && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-blue-200 dark:border-blue-900/50">
                <h2 className="text-base font-semibold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
                  <BrainCircuit size={20} className="text-blue-600 dark:text-blue-400" />
                  <ContextHint
                    title="Decision support, not a dispatch order"
                    description="Severity estimates what the report appears to show. Urgency and priority combine available evidence with safety rules. Missing facts lower confidence and identify what the dispatcher should verify next."
                    ariaLabel="Explain AI triage advisory"
                    className="text-blue-800 dark:text-blue-300"
                  >
                    <span>AI triage <span className="text-xs font-normal text-blue-700/70 dark:text-blue-300/70">Advisory</span></span>
                  </ContextHint>
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
                      <span className="text-sm text-slate-500 dark:text-slate-400">Predicted Severity</span>
                      <ContextHint
                        title="AI-predicted impact level"
                        description="A 1-5 estimate of the incident's apparent impact based on the submitted evidence. It supports triage but does not set the official status or dispatch responders."
                        ariaLabel={`Explain predicted severity level ${aiReport.severity}`}
                      >
                        <span className={`px-2 py-1 text-xs font-bold rounded-full text-white ${aiReport.severity >= 4 ? 'bg-red-600' :
                          aiReport.severity == 3 ? 'bg-orange-500' :
                            aiReport.severity == 2 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}>
                          Level {aiReport.severity} / 5
                        </span>
                      </ContextHint>
                    </div>

                    {triageAssessment && (
                      <details className="group rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                          <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">Structured triage</span>
                          <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                            {triageAssessment.urgency || 'Unknown urgency'} · {triageAssessment.evidence_confidence || 'Unknown confidence'}
                          </span>
                        </summary>
                        <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                          <div><span className="block text-amber-700/80 dark:text-amber-300/80">Emergency state</span><strong className="capitalize text-amber-950 dark:text-amber-100">{(triageAssessment.emergency_state || 'unknown').replace(/_/g, ' ')}</strong></div>
                          <div><span className="block text-amber-700/80 dark:text-amber-300/80">Incident type</span><strong className="capitalize text-amber-950 dark:text-amber-100">{triageAssessment.incident_type || 'unknown'}</strong></div>
                          <div><span className="block text-amber-700/80 dark:text-amber-300/80">Urgency</span><strong className="text-amber-950 dark:text-amber-100">{triageAssessment.urgency || 'Unknown'}</strong></div>
                          <div><span className="block text-amber-700/80 dark:text-amber-300/80">Evidence</span><strong className="capitalize text-amber-950 dark:text-amber-100">{triageAssessment.evidence_confidence || 'Unknown'}</strong></div>
                          <div><span className="block text-amber-700/80 dark:text-amber-300/80">Priority</span><strong className="text-amber-950 dark:text-amber-100">{triageAssessment.dispatch_priority ?? 'Unknown'} / 5</strong></div>
                          <div><span className="block text-amber-700/80 dark:text-amber-300/80">Rules fired</span><strong className="text-amber-950 dark:text-amber-100">{triageAssessment.triggered_rules?.length || 0}</strong></div>
                        </div>
                        {triageAssessment.missing_facts && triageAssessment.missing_facts.length > 0 && (
                          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                            Missing confirmation: {triageAssessment.missing_facts.join(', ').replace(/_/g, ' ')}. Verify these facts before finalizing the response plan.
                          </p>
                        )}
                        {triageAssessment.contradictions && triageAssessment.contradictions.length > 0 && (
                          <p className="mt-2 text-xs text-red-800 dark:text-red-200">Contradictions to resolve: {triageAssessment.contradictions.join(', ').replace(/_/g, ' ')}.</p>
                        )}
                        {triageAssessment.required_capabilities && triageAssessment.required_capabilities.length > 0 && (
                          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">Required capabilities: {triageAssessment.required_capabilities.join(', ').replace(/_/g, ' ')}.</p>
                        )}
                      </details>
                    )}

                    {/* Summary */}
                    <div>
                      <span className="text-sm text-slate-500 dark:text-slate-400 block mb-1">AI Overview</span>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                        {aiReport.summary}
                      </p>
                    </div>

                    {/* Hazards */}
                    {aiReport.hazards && aiReport.hazards.length > 0 && (
                      <div>
                        <span className="text-sm text-slate-500 dark:text-slate-400 block mb-2 flex items-center gap-1">
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

                    {SHOW_AI_DISPATCH_RECOMMENDATION && aiRecommendation && (
                      <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
                        {(() => {
                          const confidenceLow = aiRecommendation.confidence !== null && aiRecommendation.confidence < 0.75;
                          const needsReview = aiRecommendation.requiresHumanReview || aiRecommendation.reviewReasons.length > 0 || confidenceLow;
                          const readinessLabel = needsReview ? 'Dispatcher review required' : 'Ready for dispatcher review';
                          const readinessClass = needsReview
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';

                          return (
                            <div className="flex justify-end">
                              <ContextHint
                                title={needsReview ? 'Human confirmation required' : 'Recommendation ready to inspect'}
                                description={needsReview
                                  ? 'One or more confidence, evidence, capacity, or assignment checks still need a dispatcher. No responders are dispatched automatically.'
                                  : 'The advisory plan has enough information for dispatcher review. It still does not assign responders until a dispatcher confirms it.'}
                                ariaLabel={`Explain dispatch readiness: ${readinessLabel}`}
                              >
                                <span className={`px-2 py-1 text-[11px] font-medium rounded-full border ${readinessClass}`}>
                                  {readinessLabel}
                                </span>
                              </ContextHint>
                            </div>
                          );
                        })()}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">AI Dispatch Recommendation</span>
                 <button
                            onClick={openPipelineLog}
                            className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                          >
                            View Full Analysis
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Agency: <span className="font-medium">{aiRecommendation.recommendedAgency.toUpperCase()}</span>
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Station: <span className="font-medium">{aiRecommendation.recommendedStationLabel}</span>
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Resources: <span className="font-medium">
                            {aiRecommendation.recommendedResourceNames.length > 0
                              ? aiRecommendation.recommendedResourceNames.join(', ')
                              : 'No concrete resources selected'}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700 text-right">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
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
                  <div className="text-sm text-slate-500 dark:text-slate-400 animate-pulse text-center p-4">
                    Evaluating media and details...
                  </div>
                )}
              </div>
            )}

            {/* Reporter Info */}
            {activeTab === 'overview' && <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                   <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <User size={20} />
                Reporter
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Name</p>
                  <p className="font-medium dark:text-white">{incident.reporter_name || 'Anonymous'}</p>
                </div>
                {incident.reporter_age && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Age</p>
                    <p className="font-medium dark:text-white">{incident.reporter_age} years old</p>
                  </div>
                )}
                {incident.reporter_phone && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Phone</p>
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
                    <p className="text-sm text-slate-500 dark:text-slate-400">Email</p>
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
                    <p className="text-sm text-slate-500 dark:text-slate-400">Profile Contact</p>
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
                    <p className="text-sm text-slate-500 dark:text-slate-400">Reporter Location</p>
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
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {incident.reporter_latitude.toFixed(6)}, {incident.reporter_longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>}

            {/* Timestamps */}
            {activeTab === 'overview' && <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Clock size={20} />
                Timeline
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Reported</p>
                  <p className="font-medium dark:text-white">{formatDate(incident.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Last Updated</p>
                  <p className="font-medium dark:text-white">{formatDate(incident.updated_at || incident.created_at)}</p>
                </div>
              </div>
            </div>}

          </div>
        )}
        <div className={(activeTab === 'management' || activeTab === 'backups') ? 'space-y-4 lg:sticky lg:top-6 lg:self-start' : 'hidden'}>
          {activeTab === 'management' && (
            <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900/60 dark:bg-slate-800" aria-labelledby="review-response-plan-title">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">Proposed result</p>
                  <h2 id="review-response-plan-title" className="mt-1 text-base font-semibold text-slate-900 dark:text-white">Review response plan</h2>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold text-white ${STATUS_OPTIONS.find((option) => option.value === newStatus)?.color || 'bg-slate-500'}`}>
                  {STATUS_OPTIONS.find((option) => option.value === newStatus)?.label || newStatus}
                </span>
              </div>

              <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
                <div className="grid grid-cols-[88px_1fr] gap-2 py-2.5"><dt className="text-slate-600 dark:text-slate-300">Agency</dt><dd className="text-right font-semibold text-slate-900 dark:text-white">{selectedAgencyType ? selectedAgencyType.toUpperCase() : 'Not selected'}</dd></div>
                <div className="grid grid-cols-[88px_1fr] gap-2 py-2.5"><dt className="text-slate-600 dark:text-slate-300">Station</dt><dd className="text-right font-semibold text-slate-900 dark:text-white">{proposedStation?.name || assignedStation?.name || 'Not selected'}</dd></div>
                <div className="grid grid-cols-[88px_1fr] gap-2 py-2.5"><dt className="text-slate-600 dark:text-slate-300">Lead</dt><dd className="text-right font-semibold text-slate-900 dark:text-white">{proposedLeadOfficer?.display_name || proposedLeadOfficer?.email || 'Not assigned'}</dd></div>
                <div className="grid grid-cols-[88px_1fr] gap-2 py-2.5"><dt className="text-slate-600 dark:text-slate-300">Personnel</dt><dd className="text-right font-semibold text-slate-900 dark:text-white">{selectedOfficerIds.length}</dd></div>
                <div className="grid grid-cols-[88px_1fr] gap-2 py-2.5"><dt className="text-slate-600 dark:text-slate-300">Resources</dt><dd className="text-right font-semibold text-slate-900 dark:text-white">{selectedResourceIds.length}</dd></div>
              </dl>

              {proposedAssignmentConflict && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200" role="alert">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" /> Pending cannot retain an active response plan.
                </div>
              )}

              {hasChanges() ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Changes</p>
                  <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-700 dark:text-slate-200">
                    {changeSummary().slice(0, 5).map((change) => <li key={change} className="flex gap-2"><span className="text-blue-600" aria-hidden="true">•</span><span>{change}</span></li>)}
                  </ul>
                </div>
              ) : <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No unsaved changes.</p>}

              <button type="button" onClick={handleUpdateStatus} disabled={updating || !hasChanges() || isLocked || proposedAssignmentConflict} className="mt-4 hidden min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 xl:flex">
                <Send size={17} /> {updating ? 'Applying changes...' : `Review ${changeSummary().length} change${changeSummary().length === 1 ? '' : 's'}`}
              </button>
            </section>
          )}
          {activeTab === 'management' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <History size={20} />
                Recent status activity
              </h2>
              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.slice(0, 5).map((entry, index) => (
                    <div key={entry.id} className="flex gap-3 pb-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
                      <div className="w-3 h-3 rounded-full bg-blue-500 mt-1.5"></div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-800 dark:text-white">
                             Status changed {history[index + 1]?.status ? `from ${history[index + 1].status.toUpperCase()} ` : ''}to <span className="uppercase">{entry.status}</span>
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(entry.changed_at)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          by {entry.profiles?.display_name || entry.changed_by}
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">"{entry.notes}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">No status changes recorded</p>
              )}
            </div>
          )}
          {activeTab === 'management' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <Truck size={20} />
                Recent assignment activity
              </h2>
              {assignmentHistory.length > 0 ? (
                <div className="space-y-4">
                  {assignmentHistory.slice(0, 3).map((entry) => {
                    const officerNames = (entry.previous_officers || []).map(officer => officer.display_name || officer.email || officer.id);
                    const resourceNames = (entry.previous_resources || []).map(resource => resource.name || `Resource #${resource.id}`);
                    const agencyNames = (entry.agencies || []).map(agency => agency.short_name || agency.name || `Agency #${agency.id}`);

                    return (
                      <div key={entry.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white capitalize">
                              {entry.from_status || 'New'} → {entry.to_status}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {entry.reason.replace(/_/g, ' ')} by {entry.changed_by_label || 'Unknown'} • {formatDate(entry.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Station: </span>
                            <span className="text-slate-800 dark:text-slate-200">
                               {entry.previous_station?.name || 'None'} → {entry.new_station?.name || 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Agencies: </span>
                            <span className="text-slate-800 dark:text-slate-200">
                              {agencyNames.length > 0 ? agencyNames.join(', ') : 'None recorded'}
                            </span>
                          </div>
                          <div>
                             <span className="text-slate-500 dark:text-slate-400">Officers: </span>
                            <span className="text-slate-800 dark:text-slate-200">
                               {officerNames.length > 0 ? officerNames.join(', ') : 'None'} → {(entry.new_officers || []).map(officer => officer.display_name || officer.email || officer.id).join(', ') || 'None'}
                            </span>
                          </div>
                          <div>
                             <span className="text-slate-500 dark:text-slate-400">Resources: </span>
                            <span className="text-slate-800 dark:text-slate-200">
                               {resourceNames.length > 0 ? resourceNames.join(', ') : 'None'} → {(entry.new_resources || []).map(resource => resource.name || `Resource #${resource.id}`).join(', ') || 'None'}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="text-slate-500 dark:text-slate-400 italic">"{entry.notes}"</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">No assignment or resource usage history recorded yet</p>
              )}
            </div>
          )}
          {activeTab === 'management' && (incident.assigned_officer_ids?.length || incident.assigned_officer_id) && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
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
                      className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                    >
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <User size={18} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 dark:text-white truncate text-sm">
                          {officer.display_name || officer.email}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {officer.role}
                          {officer.phone_number && ` • ${officer.phone_number}`}
                        </p>
                      </div>
                      {officer.id === incident.assigned_officer_id ? (
                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                          Lead
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded">
                          Support
                        </span>
                      )}
                    </div>
                  ));
                })()}
                {officers.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Loading officer details...</p>
                )}
              </div>
            </div>
          )}
          {/* Multi-Agency Coordination */}
          {activeTab === 'management' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <Users size={20} />
                  Agency Coordination
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    loadAvailableAgencies();
                    setShowAddAgencyModal(true);
                  }}
                  disabled={isLocked}
                  aria-label="Request agency support"
                  className="min-h-10 min-w-10 flex items-center justify-center text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    {getAgencyPresentation(incident.agency_type).shortLabel}
                  </span>
                  <ContextHint
                    title="Primary response agency"
                    description="This agency owns the operational response and final coordination decisions. Supporting agencies assist without replacing that responsibility."
                    ariaLabel="Explain primary agency role"
                  >
                    <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white">Primary</span>
                  </ContextHint>
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
                          <ContextHint
                            title={ia.role === 'lead' ? 'Lead coordination role' : 'Supporting agency role'}
                            description={ia.role === 'lead'
                              ? 'This requested agency is expected to lead its part of the coordinated response. The incident\'s official primary agency remains unchanged.'
                              : 'This agency provides requested support while the primary agency retains overall operational responsibility.'}
                            ariaLabel={`Explain ${ia.role || 'supporting'} agency role`}
                          >
                            <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${ia.role === 'lead'
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-500 text-white'
                              }`}>
                              {ia.role || 'supporting'}
                            </span>
                          </ContextHint>
                        </div>
                        <div className="flex items-center gap-1">
                          {!ia.acknowledged_at && (
                            <button
                               type="button"
                               onClick={() => handleAcknowledgeAgency(ia.id)}
                               disabled={isLocked}
                               aria-label={`Acknowledge ${ia.agencies?.short_name || 'agency'} support request`}
                               className="min-h-10 min-w-10 flex items-center justify-center text-green-600 hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                              title="Acknowledge"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveAgency(ia.id)}
                            disabled={isLocked}
                            aria-label={`Remove ${ia.agencies?.short_name || 'agency'} from incident`}
                            className="min-h-10 min-w-10 flex items-center justify-center text-red-600 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-900/30 rounded disabled:opacity-50"
                            title="Remove"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {ia.acknowledged_at
                          ? `Acknowledged ${formatDate(ia.acknowledged_at)}`
                          : `Requested ${formatDate(ia.requested_at)}`
                        }
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No other agencies involved. Click + to request support.
                </p>
              )}
            </div>
          )}

          {/* Backup Requests */}
          {activeTab === 'backups' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
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
                <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center">
                  <AlertTriangle size={28} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No backup requests yet</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Requests from responders or supporting agencies will appear here.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                      Active Requests ({activeBackupRequests.length})
                    </h3>
                    {activeBackupRequests.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">No active backup requests.</p>
                    ) : (
                      <div className="space-y-3">
                        {activeBackupRequests.map((request) => {
                          const statusColorMap: Record<BackupRequestStatus, string> = {
                            pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                            acknowledged: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                            assigned: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
                            resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
                            cancelled: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
                            rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                          };

                          return (
                            <div key={request.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-800 dark:text-white">
                                    {request.requester?.display_name || request.requester?.email || 'Unknown requester'}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
                                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Reason: {request.reason}</p>
                              )}

                              {request.target_agency?.short_name && (
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
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
                                    className="px-2.5 py-1.5 text-xs rounded bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
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
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                      History ({historicalBackupRequests.length})
                    </h3>
                    {historicalBackupRequests.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">No completed backup request history.</p>
                    ) : (
                      <div className="space-y-3">
                        {historicalBackupRequests.map((request) => {
                          const statusColorMap: Record<BackupRequestStatus, string> = {
                            pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                            acknowledged: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                            assigned: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
                            resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
                            cancelled: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
                            rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                          };

                          return (
                            <div key={request.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-800 dark:text-white">
                                    {request.requester?.display_name || request.requester?.email || 'Unknown requester'}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
                                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Reason: {request.reason}</p>
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

      {selectedEvidenceIndex !== null && mediaItems[selectedEvidenceIndex] && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/80 p-4"
          role="presentation"
          onClick={() => setSelectedEvidenceIndex(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSelectedEvidenceIndex(null);
            if (event.key === 'ArrowLeft') setSelectedEvidenceIndex((current) => current === null ? 0 : (current - 1 + mediaItems.length) % mediaItems.length);
            if (event.key === 'ArrowRight') setSelectedEvidenceIndex((current) => current === null ? 0 : (current + 1) % mediaItems.length);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label={`Evidence ${selectedEvidenceIndex + 1} of ${mediaItems.length}`} className="relative flex max-h-[90vh] w-full max-w-5xl flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <div className="flex w-full items-center justify-between text-sm text-white">
              <span>Evidence {selectedEvidenceIndex + 1} of {mediaItems.length}</span>
              <button type="button" onClick={() => setSelectedEvidenceIndex(null)} aria-label="Close evidence viewer" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-white/10 text-2xl hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">×</button>
            </div>
            <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/30">
              {mediaItems[selectedEvidenceIndex].type === 'video' ? (
                <video src={mediaItems[selectedEvidenceIndex].url} controls autoPlay className="max-h-[78vh] max-w-full rounded-lg" />
              ) : (
                <img src={mediaItems[selectedEvidenceIndex].url} alt={`Evidence ${selectedEvidenceIndex + 1}`} className="max-h-[78vh] max-w-full rounded-lg object-contain" />
              )}
              {mediaItems.length > 1 && (
                <>
                  <button type="button" onClick={() => setSelectedEvidenceIndex((current) => current === null ? 0 : (current - 1 + mediaItems.length) % mediaItems.length)} aria-label="Previous evidence" className="absolute left-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/60 text-2xl text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">‹</button>
                  <button type="button" onClick={() => setSelectedEvidenceIndex((current) => current === null ? 0 : (current + 1) % mediaItems.length)} aria-label="Next evidence" className="absolute right-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/60 text-2xl text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">›</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Update Status - Modal View */}
      {isUpdateStatusExpanded && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="update-status-title">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
               <h2 id="update-status-title" className="text-xl font-semibold text-slate-800 dark:text-white">Update response</h2>
              <button
                onClick={() => setIsUpdateStatusExpanded(false)}
                aria-label="Close update response dialog"
                className="min-h-10 min-w-10 flex items-center justify-center p-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-6">
              {/* Current Status Display */}
              <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current Status</p>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${STATUS_OPTIONS.find(s => s.value === incident.status)?.color || 'bg-slate-500'
                  } text-white`}>
                  {STATUS_OPTIONS.find(s => s.value === incident.status)?.label || incident.status}
                </span>
              </div>

              {updateSuccess && (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
                  Response plan updated successfully.
                </div>
              )}

              {updateError && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200" role="alert" aria-live="assertive">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <div><p className="font-semibold">Could not save changes</p><p className="mt-0.5">{updateError}</p></div>
                </div>
              )}

               <div className="space-y-4">
                 {renderAIRecommendationPanel()}
                 {(newStatus === 'resolved' || newStatus === 'closed') && (initialOfficerIds.length > 0 || initialResourceIds.length > 0) && (
                   <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                     <legend className="px-1 text-sm font-semibold text-amber-900 dark:text-amber-200">Assignment disposition</legend>
                     <label className="flex min-h-10 items-start gap-3 text-sm text-amber-900 dark:text-amber-100">
                       <input type="checkbox" checked={releaseAssignments} onChange={(event) => setReleaseAssignments(event.target.checked)} disabled={isLocked} className="mt-1 h-4 w-4 rounded border-amber-400 text-blue-600 focus:ring-blue-500" />
                       <span><strong>Release assigned personnel and resources</strong><span className="mt-1 block text-xs text-amber-800 dark:text-amber-200">Mark the response team available after this terminal status.</span></span>
                     </label>
                   </fieldset>
                 )}
                 <div>
                   <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Change To</label>
                  <select
                    value={newStatus}
                    onChange={(e) => { setNewStatus(e.target.value); setFormErrors((current) => ({ ...current, status: undefined, notes: undefined })); }}
                    disabled={isLocked}
                    aria-invalid={Boolean(formErrors.status)}
                    className={`w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                     {STATUS_OPTIONS.filter((option) => getAllowedStatuses().includes(option.value)).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} {option.value === incident.status ? '(current)' : ''}
                      </option>
                    ))}
                  </select>
                  {formErrors.status && <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.status}</p>}
                </div>

                {/* Station Assignment - Editable for Admin, read-only for others */}
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">
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
                     value={stationAssignmentIntent === 'keep' ? 'keep' : stationAssignmentIntent === 'auto' ? 'auto' : selectedStationId?.toString() || ''}
                             onChange={(e) => handleStationChange(e.target.value)}
                            disabled={isLocked}
                            aria-invalid={Boolean(formErrors.station)}
                            className={`w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                             <option value={incident.assigned_station_id ? 'keep' : 'auto'}>
                               {incident.assigned_station_id ? 'Keep current station' : 'Select a station'}
                             </option>
                            {stations
                              .filter(s => (selectedAgencyType ? s.agencies?.short_name?.toLowerCase() === selectedAgencyType : involvedAgencies.includes(s.agencies?.short_name?.toLowerCase())))
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
                            {stations.filter(s => (selectedAgencyType ? s.agencies?.short_name?.toLowerCase() === selectedAgencyType : involvedAgencies.includes(s.agencies?.short_name?.toLowerCase()))).length === 0 && (
                              <option disabled>No stations configured for this agency</option>
                            )}
                          </select>
                          {formErrors.station && <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.station}</p>}
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">Selected Agency:</span>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded font-medium">
                              {getAgencyPresentation(incident.agency_type).shortLabel}
                            </span>
                          </div>
                           <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                             {stationAssignmentIntent === 'auto'
                               ? newStatus === 'pending' ? 'No station will be assigned while the incident remains pending.' : 'The closest eligible station will be assigned when changes are applied.'
                               : stationAssignmentIntent === 'keep' ? 'The current station will remain assigned.' : 'Changing station may remove incompatible responders or resources.'}
                          </p>
                        </>
                      );
                    } else {
                      // Non-admin: read-only
                      return (
                        <>
                          <div className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
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
                            <span className="text-slate-500 dark:text-slate-400">Selected Agency:</span>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded font-medium">
                              {getAgencyPresentation(incident.agency_type).shortLabel}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-400">
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
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1.5">
                      View Officers By Agency
                    </label>
                    <select
                      value={viewAgencyFilter}
                      onChange={(e) => setViewAgencyFilter(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
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
                    <p className="mt-1 text-xs text-slate-400">
                      Filter officers by agency to see available responders
                    </p>
                  </div>
                )}

                {/* Officer Assignment */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-800/40 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
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

                  <div className="border border-slate-200 dark:border-slate-600 rounded-xl max-h-96 overflow-y-auto bg-white dark:bg-slate-700 divide-y divide-slate-100 dark:divide-slate-600">
                    {(() => {
                       const visibleOfficers = officers.filter(officer => {
                         if (selectedStationId !== null && officer.station_id !== selectedStationId) return false;
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
                          <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
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

                         const profileUnavailable = Boolean(officer.status && !['available', 'online'].includes(officer.status.toLowerCase()));
                         const showBusy = !isCurrentlyAssigned && (isBusyOnOther || profileUnavailable);

                        return (
                          <label
                            key={officer.id}
                             className={`flex items-start gap-3 px-3 py-3 ${showBusy ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600'} transition-colors ${isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
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
                              className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-white flex flex-wrap items-center gap-2">
                                <span className="truncate">{officer.display_name || officer.email}</span>
                                {isCurrentlyAssigned && (
                                  <span className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full font-medium">
                                    Assigned
                                  </span>
                                )}
                                 {showBusy && (
                                   <span className="text-[11px] px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 rounded-full font-medium">
                                     {isBusyOnOther ? 'Busy' : officer.status}
                                   </span>
                                 )}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
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
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Select one or more officers to respond to this incident
                  </p>
                </div>



                {selectedOfficerIds.length > 0 && (
                  <div>
                    <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">
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
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white disabled:opacity-70"
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
                    <p className="mt-1 text-xs text-slate-400">
                      The lead officer is the report owner. If only one officer is assigned, they are automatically the lead.
                    </p>
                  </div>
                )}{/* Assign Resources */}
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">
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
                  <div className="border border-slate-200 dark:border-slate-600 rounded-lg max-h-96 overflow-y-auto bg-white dark:bg-slate-700">
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
                          <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
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
                            className={`flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer border-b border-slate-100 dark:border-slate-600 last:border-b-0 ${isCurrentlyAssigned ? 'bg-blue-50 dark:bg-blue-900/20' : ''
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
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-white truncate flex items-center gap-2">
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
                              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
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
                   <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">{['rejected', 'resolved'].includes(newStatus) ? 'Reason / resolution note' : 'Operational note (optional)'}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); if (e.target.value.trim()) setFormErrors((current) => ({ ...current, notes: undefined })); }}
                    disabled={isLocked}
                    aria-invalid={Boolean(formErrors.notes)}
                     placeholder={isLocked ? "Cannot add notes to a locked incident" : ['rejected', 'resolved'].includes(newStatus) ? 'Explain the decision and operational outcome...' : 'Add notes about this status change...'}
                    rows={2}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-slate-700 dark:text-white disabled:opacity-70"
                  />
                  {formErrors.notes && <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{formErrors.notes}</p>}
                </div>

                 <button
                   type="button"
                  onClick={handleUpdateStatus}
                  disabled={updating || !hasChanges() || isLocked}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={18} />
                    {updating ? 'Applying changes...' : hasChanges() ? `Review ${changeSummary().length} change${changeSummary().length === 1 ? '' : 's'}` : 'No changes to review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mapView && incident.latitude != null && incident.longitude != null && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div className="flex h-[min(92vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-800" role="dialog" aria-modal="true" aria-labelledby="incident-map-dialog-title">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5">
              <div>
                <h2 id="incident-map-dialog-title" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <MapPin size={18} />
                  {mapView === 'directions' ? 'Directions to incident' : 'Incident location map'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {mapView === 'directions'
                    ? `${getAssignedStation()?.name || 'Responding station'} to ${incident.location_address || 'incident location'}`
                    : incident.location_address || 'Incident location'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMapView(null)}
                aria-label="Close map dialog"
                className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-200" aria-label="Map route summary">
                <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 dark:bg-red-900/20 dark:text-red-300">Incident</span>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">Responding station</span>
                {routeInfo && <span className="ml-auto font-semibold">{routeInfo.distance.toFixed(1)} km · ~{Math.round(routeInfo.duration)} min</span>}
              </div>
              <RouteMap
                incidentLat={Number(incident.latitude)}
                incidentLng={Number(incident.longitude)}
                incidentAddress={incident.location_address}
                stationLat={getAssignedStation()?.latitude}
                stationLng={getAssignedStation()?.longitude}
                stationName={getAssignedStation()?.name}
                showRoute={Boolean(getAssignedStation())}
                mapHeight="expanded"
                onRouteLoaded={handleRouteLoaded}
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300" aria-label="Map legend">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Incident location</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Responding station</span>
                {getAssignedStation() && <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-blue-600" /> Suggested route</span>}
              </div>
              {mapView === 'directions' && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
                  <p className="font-semibold">Route overview</p>
                  <p className="mt-1">The route is shown from the assigned station to the incident. Use the map controls to inspect the route and markers inside the app.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Final Report Modal */}
      {showFinalReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="final-report-title">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
               <h2 id="final-report-title" className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <FileText size={24} />
                Final Report - Close Incident
              </h2>
              <button
                onClick={() => setShowFinalReportModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Summary <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={finalReportData.summary}
                  onChange={(e) => setFinalReportData(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder="Brief summary of the incident and resolution..."
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Actions Taken <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={finalReportData.actionsTaken}
                  onChange={(e) => setFinalReportData(prev => ({ ...prev, actionsTaken: e.target.value }))}
                  placeholder="List all actions taken to resolve this incident..."
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Outcome <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={finalReportData.outcome}
                  onChange={(e) => setFinalReportData(prev => ({ ...prev, outcome: e.target.value }))}
                  placeholder="Final outcome and current status..."
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                />
              </div>

              {/* Agency-Specific Fields */}
              {incident?.agency_type?.toLowerCase() === 'pnp' && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3">PNP Specific Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Case Number</label>
                      <input
                        type="text"
                        value={finalReportData.caseNumber || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, caseNumber: e.target.value }))}
                        placeholder="e.g., PNP-2024-001234"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Suspects</label>
                      <input
                        type="text"
                        value={finalReportData.suspects || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, suspects: e.target.value }))}
                        placeholder="Suspect information if any"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Evidence Collected</label>
                    <input
                      type="text"
                      value={finalReportData.evidence || ''}
                      onChange={(e) => setFinalReportData(prev => ({ ...prev, evidence: e.target.value }))}
                      placeholder="List of evidence collected"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                    />
                  </div>
                </div>
              )}

              {incident?.agency_type?.toLowerCase() === 'bfp' && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">BFP Specific Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Fire Origin</label>
                      <input
                        type="text"
                        value={finalReportData.fireOrigin || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, fireOrigin: e.target.value }))}
                        placeholder="Determined origin of fire"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Estimated Damage</label>
                      <input
                        type="text"
                        value={finalReportData.estimatedDamage || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, estimatedDamage: e.target.value }))}
                        placeholder="e.g., ₱500,000"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Casualties</label>
                    <input
                      type="text"
                      value={finalReportData.casualties || ''}
                      onChange={(e) => setFinalReportData(prev => ({ ...prev, casualties: e.target.value }))}
                      placeholder="Injuries or fatalities if any"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                    />
                  </div>
                </div>
              )}

              {incident?.agency_type?.toLowerCase() === 'mdrrmo' && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-3">MDRRMO Specific Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Affected Families</label>
                      <input
                        type="text"
                        value={finalReportData.affectedFamilies || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, affectedFamilies: e.target.value }))}
                        placeholder="Number of families affected"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Evacuees</label>
                      <input
                        type="text"
                        value={finalReportData.evacuees || ''}
                        onChange={(e) => setFinalReportData(prev => ({ ...prev, evacuees: e.target.value }))}
                        placeholder="Number of evacuees"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Assistance Provided</label>
                    <input
                      type="text"
                      value={finalReportData.assistanceProvided || ''}
                      onChange={(e) => setFinalReportData(prev => ({ ...prev, assistanceProvided: e.target.value }))}
                      placeholder="Relief goods, shelter, etc."
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Recommendations (optional)
                </label>
                <textarea
                  value={finalReportData.recommendations || ''}
                  onChange={(e) => setFinalReportData(prev => ({ ...prev, recommendations: e.target.value }))}
                  placeholder="Any recommendations for future prevention or follow-up..."
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowFinalReportModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full" role="dialog" aria-modal="true" aria-labelledby="support-dialog-title">
            <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
               <h2 id="support-dialog-title" className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Users size={20} />
                Request Agency Support
              </h2>
              <button
                onClick={() => {
                  setShowAddAgencyModal(false);
                  setSelectedAgencyToAdd(null);
                }}
                aria-label="Close support request dialog"
                className="min-h-10 min-w-10 flex items-center justify-center p-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Select Agency
                </label>
                <select
                  value={selectedAgencyToAdd || ''}
                  onChange={(e) => setSelectedAgencyToAdd(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                >
                  <option value="">Choose an agency...</option>
                  {availableAgencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.short_name} - {agency.name}
                    </option>
                  ))}
                </select>
                {availableAgencies.length === 0 && (
                  <p className="text-sm text-slate-500 mt-1">All agencies are already involved in this incident.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                    <span className="text-sm text-slate-700 dark:text-slate-300">Supporting</span>
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
                    <span className="text-sm text-slate-700 dark:text-slate-300">Lead Coordinator</span>
                  </label>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedAgencyRole === 'lead'
                    ? 'This agency will coordinate the multi-agency response.'
                    : 'This agency will provide support to the primary agency.'
                  }
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddAgencyModal(false);
                  setSelectedAgencyToAdd(null);
                }}
                className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-in fade-in duration-200" role="presentation">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-slate-100 dark:border-slate-700 animate-in zoom-in-95 duration-200" role="dialog" aria-modal="true" aria-labelledby="reopen-dialog-title">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                  <Unlock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                   <h3 id="reopen-dialog-title" className="text-xl font-bold text-slate-900 dark:text-white">Re-open incident?</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    This will unlock all editing capabilities and return the status to <span className="font-semibold text-orange-600 dark:text-orange-400">In Progress</span>.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 mb-6 text-sm text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
                <p>Note: This action will be recorded in the audit logs and status history.</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowReopenConfirmModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
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

      {showChangeReview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" role="presentation">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl dark:bg-slate-800" role="dialog" aria-modal="true" aria-labelledby="change-review-title">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <h2 id="change-review-title" className="text-lg font-semibold text-slate-900 dark:text-white">Review response changes</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Confirm the operational changes before they are written to the incident.</p>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm">
              <ul className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                {changeSummary().map((change) => <li key={change}>{change}</li>)}
              </ul>
              {(newStatus === 'resolved' || newStatus === 'closed') && (
                <p className={`rounded-lg border px-3 py-2 ${releaseAssignments ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'}`}>
                  {releaseAssignments ? 'Assigned personnel and resources will be released.' : 'Assigned personnel and resources will remain attached.'}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <button type="button" onClick={() => setShowChangeReview(false)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:hover:bg-slate-700">Back to editing</button>
              <button type="button" onClick={confirmChangeReview} disabled={updating} className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">Confirm response changes</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default IncidentDetail;
