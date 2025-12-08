import { AlertCircle, Check, Edit3, FileText, Flame, Plus, Save, Send, Shield, Trash2, User, Waves, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSessionScope } from '../utils/sessionScope';

interface FinalReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: any;
  existingFinalReport: any | null;
  onReportPublished: () => void;
}

// ============================================
// PERSON ENTRY (for PNP suspects/victims)
// ============================================
interface PersonEntry {
  firstName: string;
  middleName: string;
  lastName: string;
  address: string;
  occupation: string;
  status: string;
}

// ============================================
// PNP FORM FIELDS (matches PnpReportFormActivity.java)
// ============================================
interface PnpFormData {
  narrative: string;
  suspects: PersonEntry[];
  victims: PersonEntry[];
  evidenceCount: number;
  caseNumber: string;
}

// ============================================
// BFP FORM FIELDS (matches BfpReportFormActivity.java)
// ============================================
interface BfpFormData {
  fireLocation: string;
  areaOwnership: string;
  classOfFire: string;
  rootCause: string;
  peopleInjured: string;
  estimatedDamage: string;
}

// ============================================
// PDRRMO FORM FIELDS (matches MdrrmoReportFormActivity.java)
// ============================================
interface PdrrmoFormData {
  natureOfCall: string;
  emergencyType: string;
  areaType: string;
  incidentLocation: string;
  narrative: string;
  facilityType: string;
  facilityName: string;
  timeCall: string;
  timeDispatch: string;
  timeScene: string;
  timeDeparture: string;
  timeFacility: string;
  timeHandover: string;
  timeClear: string;
  timeBase: string;
  patientsCount: number;
}

// Validation errors interface
interface ValidationErrors {
  [key: string]: string;
}

const emptyPerson: PersonEntry = {
  firstName: '',
  middleName: '',
  lastName: '',
  address: '',
  occupation: '',
  status: ''
};

const defaultPnpForm: PnpFormData = {
  narrative: '',
  suspects: [{ ...emptyPerson }],
  victims: [{ ...emptyPerson }],
  evidenceCount: 0,
  caseNumber: ''
};

const defaultBfpForm: BfpFormData = {
  fireLocation: '',
  areaOwnership: '',
  classOfFire: '',
  rootCause: '',
  peopleInjured: '',
  estimatedDamage: ''
};

const defaultPdrrmoForm: PdrrmoFormData = {
  natureOfCall: '',
  emergencyType: '',
  areaType: '',
  incidentLocation: '',
  narrative: '',
  facilityType: '',
  facilityName: '',
  timeCall: '',
  timeDispatch: '',
  timeScene: '',
  timeDeparture: '',
  timeFacility: '',
  timeHandover: '',
  timeClear: '',
  timeBase: '',
  patientsCount: 0
};

export function FinalReportModal({ isOpen, onClose, incident, existingFinalReport, onReportPublished }: FinalReportModalProps) {
  const [activeTab, setActiveTab] = useState<'draft' | 'published'>('draft');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [draftStatus, setDraftStatus] = useState<'draft' | 'ready_for_review'>('draft');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Agency-specific form data
  const [pnpForm, setPnpForm] = useState<PnpFormData>({ ...defaultPnpForm });
  const [bfpForm, setBfpForm] = useState<BfpFormData>({ ...defaultBfpForm });
  const [pdrrmoForm, setPdrrmoForm] = useState<PdrrmoFormData>({ ...defaultPdrrmoForm });

  const agencyType = incident?.agency_type?.toLowerCase() || 'pnp';

  useEffect(() => {
    if (isOpen && incident?.id) {
      loadDraft();
    }
  }, [isOpen, incident?.id]);

  // Pre-fill location when incident changes
  useEffect(() => {
    if (incident?.location_address) {
      if (agencyType === 'bfp') {
        setBfpForm(prev => ({ ...prev, fireLocation: prev.fireLocation || incident.location_address }));
      } else if (agencyType === 'pdrrmo') {
        setPdrrmoForm(prev => ({ ...prev, incidentLocation: prev.incidentLocation || incident.location_address }));
      }
    }
  }, [incident, agencyType]);

  const loadDraft = async () => {
    setLoading(true);
    setErrors({});
    setSaveError(null);
    try {
      const draftData = await window.api.getFinalReportDraft(incident.id);
      if (draftData) {
        setDraft(draftData);
        setDraftStatus(draftData.status || 'draft');
        populateFormFromDetails(draftData.draft_details);
        setActiveTab('draft');
      } else if (existingFinalReport) {
        populateFormFromDetails(existingFinalReport.report_details);
        setActiveTab('published');
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    } finally {
      setLoading(false);
    }
  };

  const populateFormFromDetails = (details: any) => {
    if (!details) return;
    
    if (agencyType === 'pnp') {
      // Parse suspects/victims from stored format
      const parseSuspects = details.suspects_data || details.suspects || [];
      const parseVictims = details.victims_data || details.victims || [];
      
      setPnpForm({
        narrative: details.narrative || '',
        suspects: Array.isArray(parseSuspects) && parseSuspects.length > 0 
          ? parseSuspects 
          : [{ ...emptyPerson }],
        victims: Array.isArray(parseVictims) && parseVictims.length > 0 
          ? parseVictims 
          : [{ ...emptyPerson }],
        evidenceCount: parseInt(details.evidence_count || '0') || 0,
        caseNumber: details.caseNumber || details.case_number || ''
      });
    } else if (agencyType === 'bfp') {
      setBfpForm({
        fireLocation: details.fireLocation || details.fire_location || incident?.location_address || '',
        areaOwnership: details.areaOwnership || details.area_ownership || '',
        classOfFire: details.classOfFire || details.class_of_fire || '',
        rootCause: details.rootCause || details.root_cause || '',
        peopleInjured: details.peopleInjured || details.people_injured || '',
        estimatedDamage: details.estimatedDamage || details.estimated_damage || ''
      });
    } else if (agencyType === 'pdrrmo') {
      setPdrrmoForm({
        natureOfCall: details.natureOfCall || details.nature_of_call || '',
        emergencyType: details.emergencyType || details.emergency_type || '',
        areaType: details.areaType || details.area_type || '',
        incidentLocation: details.incidentLocation || details.incident_location || incident?.location_address || '',
        narrative: details.narrative || '',
        facilityType: details.facilityType || details.facility_type || '',
        facilityName: details.facilityName || details.facility_name || '',
        timeCall: details.time_call || details.timeCall || '',
        timeDispatch: details.time_dispatch || details.timeDispatch || '',
        timeScene: details.time_scene || details.timeScene || '',
        timeDeparture: details.time_depart || details.timeDeparture || '',
        timeFacility: details.time_facility || details.timeFacility || '',
        timeHandover: details.time_handover || details.timeHandover || '',
        timeClear: details.time_clear || details.timeClear || '',
        timeBase: details.time_base || details.timeBase || '',
        patientsCount: parseInt(details.patients_count || details.patientsCount || '0') || 0
      });
    }
  };

  // ============================================
  // VALIDATION
  // ============================================
  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};
    
    if (agencyType === 'pnp') {
      if (!pnpForm.narrative.trim()) {
        newErrors.narrative = 'Incident narrative is required';
      } else if (pnpForm.narrative.trim().length < 20) {
        newErrors.narrative = 'Narrative must be at least 20 characters';
      }
    } else if (agencyType === 'bfp') {
      if (!bfpForm.fireLocation.trim()) {
        newErrors.fireLocation = 'Fire location is required';
      }
      if (!bfpForm.classOfFire) {
        newErrors.classOfFire = 'Class of fire is required';
      }
    } else if (agencyType === 'pdrrmo') {
      if (!pdrrmoForm.incidentLocation.trim()) {
        newErrors.incidentLocation = 'Incident location is required';
      }
      if (!pdrrmoForm.natureOfCall) {
        newErrors.natureOfCall = 'Nature of call is required';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getFormDetails = (): any => {
    const timestamp = new Date().toISOString();
    
    if (agencyType === 'pnp') {
      // Filter out empty person entries
      const validSuspects = pnpForm.suspects.filter(s => s.firstName || s.lastName);
      const validVictims = pnpForm.victims.filter(v => v.firstName || v.lastName);
      
      return {
        narrative: pnpForm.narrative,
        suspects_data: pnpForm.suspects,
        victims_data: pnpForm.victims,
        suspects: validSuspects.map(s => `${s.firstName} ${s.lastName}`.trim()).join('; '),
        victims: validVictims.map(v => `${v.firstName} ${v.lastName}`.trim()).join('; '),
        suspects_count: validSuspects.length.toString(),
        victims_count: validVictims.length.toString(),
        evidence_count: pnpForm.evidenceCount.toString(),
        caseNumber: pnpForm.caseNumber,
        timestamp
      };
    } else if (agencyType === 'bfp') {
      return {
        fireLocation: bfpForm.fireLocation,
        areaOwnership: bfpForm.areaOwnership,
        classOfFire: bfpForm.classOfFire,
        rootCause: bfpForm.rootCause,
        peopleInjured: bfpForm.peopleInjured,
        estimatedDamage: bfpForm.estimatedDamage,
        timestamp
      };
    } else {
      return {
        natureOfCall: pdrrmoForm.natureOfCall,
        emergencyType: pdrrmoForm.emergencyType,
        areaType: pdrrmoForm.areaType,
        incidentLocation: pdrrmoForm.incidentLocation,
        narrative: pdrrmoForm.narrative,
        facilityType: pdrrmoForm.facilityType,
        facilityName: pdrrmoForm.facilityName,
        time_call: pdrrmoForm.timeCall,
        time_dispatch: pdrrmoForm.timeDispatch,
        time_scene: pdrrmoForm.timeScene,
        time_depart: pdrrmoForm.timeDeparture,
        time_facility: pdrrmoForm.timeFacility,
        time_handover: pdrrmoForm.timeHandover,
        time_clear: pdrrmoForm.timeClear,
        time_base: pdrrmoForm.timeBase,
        patients_count: pdrrmoForm.patientsCount.toString(),
        timestamp
      };
    }
  };

  const handleSaveDraft = async (status: 'draft' | 'ready_for_review' = 'draft') => {
    setSaveError(null);
    
    // Validate only when submitting for review
    if (status === 'ready_for_review' && !validateForm()) {
      setSaveError('Please fix the validation errors before submitting');
      return;
    }
    
    setSaving(true);
    try {
      const scope = getSessionScope();
      await window.api.saveFinalReportDraft({
        incidentId: incident.id,
        agencyType: agencyType,
        draftDetails: getFormDetails(),
        status,
        authorId: scope.userId || ''
      });
      setDraftStatus(status);
      await loadDraft();
      setSaveError(null);
    } catch (error: any) {
      setSaveError(error.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaveError(null);
    
    if (!validateForm()) {
      setSaveError('Please fix the validation errors before publishing');
      return;
    }
    
    if (!confirm('Publish this final report? This will finalize the incident.')) return;
    
    setSaving(true);
    try {
      const scope = getSessionScope();
      
      // Save draft first if not exists
      if (!draft) {
        await window.api.saveFinalReportDraft({
          incidentId: incident.id,
          agencyType: agencyType,
          draftDetails: getFormDetails(),
          status: 'ready_for_review',
          authorId: scope.userId || ''
        });
      }
      
      await window.api.promoteFinalReportDraft({
        incidentId: incident.id,
        authorId: scope.userId || ''
      });
      
      onReportPublished();
      onClose();
    } catch (error: any) {
      setSaveError(error.message || 'Failed to publish report');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    
    try {
      await window.api.deleteFinalReportDraft(incident.id);
      setDraft(null);
      setPnpForm({ ...defaultPnpForm });
      setBfpForm({ ...defaultBfpForm });
      setPdrrmoForm({ ...defaultPdrrmoForm });
    } catch (error: any) {
      setSaveError(error.message || 'Failed to delete draft');
    }
  };

  const getAgencyIcon = () => {
    switch (agencyType) {
      case 'pnp': return <Shield className="text-blue-600" size={24} />;
      case 'bfp': return <Flame className="text-red-600" size={24} />;
      case 'pdrrmo': return <Waves className="text-cyan-600" size={24} />;
      default: return <FileText size={24} />;
    }
  };

  const getAgencyColor = () => {
    switch (agencyType) {
      case 'pnp': return 'blue';
      case 'bfp': return 'red';
      case 'pdrrmo': return 'cyan';
      default: return 'gray';
    }
  };

  // Format details for display
  const formatReportDetails = (details: any) => {
    if (!details) return null;
    
    const entries = Object.entries(details).filter(([key, value]) => {
      // Skip internal fields and empty values
      if (key === 'timestamp' || key.endsWith('_data')) return false;
      if (value === '' || value === '0' || value === null || value === undefined) return false;
      return true;
    });
    
    return entries;
  };

  if (!isOpen) return null;

  const color = getAgencyColor();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className={`p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between rounded-t-xl bg-gradient-to-r ${
          color === 'blue' ? 'from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20' :
          color === 'red' ? 'from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20' :
          'from-cyan-50 to-cyan-100 dark:from-cyan-900/30 dark:to-cyan-800/20'
        }`}>
          <div className="flex items-center gap-3">
            {getAgencyIcon()}
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                {agencyType.toUpperCase()} Final Report
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Incident #{incident?.id?.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('draft')}
            className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'draft'
                ? `text-${color}-600 border-b-2 border-${color}-600 bg-${color}-50/50 dark:bg-${color}-900/10`
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Edit3 size={16} />
            Draft 
            {draft && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                draftStatus === 'ready_for_review' 
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' 
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {draftStatus === 'ready_for_review' ? 'Ready' : 'In Progress'}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('published')}
            className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'published'
                ? `text-${color}-600 border-b-2 border-${color}-600 bg-${color}-50/50 dark:bg-${color}-900/10`
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <FileText size={16} />
            Published 
            {existingFinalReport && (
              <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 rounded-full">
                Final
              </span>
            )}
          </button>
        </div>

        {/* Error Banner */}
        {saveError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertCircle size={18} />
            <span className="text-sm">{saveError}</span>
            <button onClick={() => setSaveError(null)} className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-800/50 rounded">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className={`animate-spin rounded-full h-12 w-12 border-b-2 border-${color}-600`}></div>
            </div>
          ) : activeTab === 'draft' ? (
            <div className="space-y-6">
              {/* Incident Info Header */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Incident Information
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Type:</span>
                    <span className="ml-2 font-medium text-gray-800 dark:text-white">{incident?.agency_type?.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Date:</span>
                    <span className="ml-2 font-medium text-gray-800 dark:text-white">
                      {incident?.created_at ? new Date(incident.created_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Reporter:</span>
                    <span className="ml-2 font-medium text-gray-800 dark:text-white">{incident?.reporter_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Location:</span>
                    <span className="ml-2 font-medium text-gray-800 dark:text-white">{incident?.location_address || 'N/A'}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400 text-sm">Description:</span>
                  <p className="mt-1 text-sm text-gray-800 dark:text-white">{incident?.description || 'N/A'}</p>
                </div>
              </div>

              {/* Agency-specific form */}
              {agencyType === 'pnp' && (
                <PnpForm form={pnpForm} setForm={setPnpForm} errors={errors} setErrors={setErrors} />
              )}
              {agencyType === 'bfp' && (
                <BfpForm form={bfpForm} setForm={setBfpForm} errors={errors} setErrors={setErrors} />
              )}
              {agencyType === 'pdrrmo' && (
                <PdrrmoForm form={pdrrmoForm} setForm={setPdrrmoForm} errors={errors} setErrors={setErrors} />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {existingFinalReport ? (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Check className="text-green-600" size={20} />
                    <span className="font-semibold text-green-800 dark:text-green-200">Published Final Report</span>
                  </div>
                  
                  {/* Formatted display */}
                  <div className="space-y-3">
                    {formatReportDetails(existingFinalReport.report_details)?.map(([key, value]) => (
                      <div key={key} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-green-100 dark:border-green-800">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <p className="mt-1 text-gray-800 dark:text-white whitespace-pre-wrap">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-green-200 dark:border-green-800">
                    Completed at: {new Date(existingFinalReport.completed_at).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No published report yet</p>
                  <p className="text-sm">Complete the draft and publish to finalize</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {activeTab === 'draft' && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-b-xl">
            <div>
              {draft && (
                <button
                  onClick={handleDeleteDraft}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={16} />
                  Delete Draft
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSaveDraft('draft')}
                disabled={saving}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                onClick={() => handleSaveDraft('ready_for_review')}
                disabled={saving}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Send size={16} />
                Submit for Review
              </button>
              <button
                onClick={handlePublish}
                disabled={saving}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors text-white ${
                  color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' :
                  color === 'red' ? 'bg-red-600 hover:bg-red-700' :
                  'bg-cyan-600 hover:bg-cyan-700'
                }`}
              >
                <Check size={16} />
                Publish Final Report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// PNP FORM COMPONENT (matches PnpReportFormActivity.java)
// ============================================
function PnpForm({ form, setForm, errors, setErrors }: { 
  form: PnpFormData; 
  setForm: React.Dispatch<React.SetStateAction<PnpFormData>>;
  errors: ValidationErrors;
  setErrors: React.Dispatch<React.SetStateAction<ValidationErrors>>;
}) {
  const addPerson = (type: 'suspects' | 'victims') => {
    setForm(prev => ({
      ...prev,
      [type]: [...prev[type], { ...emptyPerson }]
    }));
  };

  const removePerson = (type: 'suspects' | 'victims', index: number) => {
    setForm(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  const updatePerson = (type: 'suspects' | 'victims', index: number, field: keyof PersonEntry, value: string) => {
    setForm(prev => ({
      ...prev,
      [type]: prev[type].map((p, i) => i === index ? { ...p, [field]: value } : p)
    }));
  };

  return (
    <div className="space-y-6">
      {/* Case Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Case Number
        </label>
        <input
          type="text"
          value={form.caseNumber}
          onChange={(e) => setForm(prev => ({ ...prev, caseNumber: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="e.g., 2024-001234"
        />
      </div>

      {/* Narrative */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Incident Narrative <span className="text-red-500">*</span>
        </label>
        <textarea
          value={form.narrative}
          onChange={(e) => {
            setForm(prev => ({ ...prev, narrative: e.target.value }));
            if (errors.narrative) setErrors(prev => ({ ...prev, narrative: '' }));
          }}
          rows={5}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors.narrative ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
          placeholder="Provide a detailed narrative of the incident, including what happened, when, and how..."
        />
        {errors.narrative && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} /> {errors.narrative}
          </p>
        )}
        <p className="mt-1 text-xs text-gray-500">Minimum 20 characters required</p>
      </div>

      {/* Suspects Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <User size={18} className="text-red-500" />
            Suspects ({form.suspects.filter(s => s.firstName || s.lastName).length})
          </h3>
          <button
            type="button"
            onClick={() => addPerson('suspects')}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center gap-1 transition-colors"
          >
            <Plus size={14} /> Add Suspect
          </button>
        </div>
        <div className="space-y-4">
          {form.suspects.map((suspect, index) => (
            <PersonCard
              key={index}
              person={suspect}
              index={index}
              type="Suspect"
              onUpdate={(field, value) => updatePerson('suspects', index, field, value)}
              onRemove={() => removePerson('suspects', index)}
              canRemove={form.suspects.length > 1}
            />
          ))}
        </div>
      </div>

      {/* Victims Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <User size={18} className="text-blue-500" />
            Victims ({form.victims.filter(v => v.firstName || v.lastName).length})
          </h3>
          <button
            type="button"
            onClick={() => addPerson('victims')}
            className="px-3 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg text-sm flex items-center gap-1 transition-colors"
          >
            <Plus size={14} /> Add Victim
          </button>
        </div>
        <div className="space-y-4">
          {form.victims.map((victim, index) => (
            <PersonCard
              key={index}
              person={victim}
              index={index}
              type="Victim"
              onUpdate={(field, value) => updatePerson('victims', index, field, value)}
              onRemove={() => removePerson('victims', index)}
              canRemove={form.victims.length > 1}
            />
          ))}
        </div>
      </div>

      {/* Evidence Count */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Evidence Count
        </label>
        <input
          type="number"
          min="0"
          value={form.evidenceCount}
          onChange={(e) => setForm(prev => ({ ...prev, evidenceCount: parseInt(e.target.value) || 0 }))}
          className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}

// Person Card Component (for suspects/victims)
function PersonCard({ person, index, type, onUpdate, onRemove, canRemove }: {
  person: PersonEntry;
  index: number;
  type: string;
  onUpdate: (field: keyof PersonEntry, value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{type} {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <input
          type="text"
          value={person.firstName}
          onChange={(e) => onUpdate('firstName', e.target.value)}
          placeholder="First Name"
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          value={person.middleName}
          onChange={(e) => onUpdate('middleName', e.target.value)}
          placeholder="Middle Name"
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          value={person.lastName}
          onChange={(e) => onUpdate('lastName', e.target.value)}
          placeholder="Last Name"
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          value={person.address}
          onChange={(e) => onUpdate('address', e.target.value)}
          placeholder="Address"
          className="col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          value={person.occupation}
          onChange={(e) => onUpdate('occupation', e.target.value)}
          placeholder="Occupation"
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}

// ============================================
// BFP FORM COMPONENT (matches BfpReportFormActivity.java)
// ============================================
function BfpForm({ form, setForm, errors, setErrors }: { 
  form: BfpFormData; 
  setForm: React.Dispatch<React.SetStateAction<BfpFormData>>;
  errors: ValidationErrors;
  setErrors: React.Dispatch<React.SetStateAction<ValidationErrors>>;
}) {
  return (
    <div className="space-y-4">
      {/* Fire Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Fire Location <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.fireLocation}
          onChange={(e) => {
            setForm(prev => ({ ...prev, fireLocation: e.target.value }));
            if (errors.fireLocation) setErrors(prev => ({ ...prev, fireLocation: '' }));
          }}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent ${
            errors.fireLocation ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
          placeholder="Exact location of the fire..."
        />
        {errors.fireLocation && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} /> {errors.fireLocation}
          </p>
        )}
      </div>

      {/* Area Ownership */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Area Ownership
        </label>
        <input
          type="text"
          value={form.areaOwnership}
          onChange={(e) => setForm(prev => ({ ...prev, areaOwnership: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
          placeholder="Owner of the affected area..."
        />
      </div>

      {/* Class of Fire */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Class of Fire <span className="text-red-500">*</span>
        </label>
        <select
          value={form.classOfFire}
          onChange={(e) => {
            setForm(prev => ({ ...prev, classOfFire: e.target.value }));
            if (errors.classOfFire) setErrors(prev => ({ ...prev, classOfFire: '' }));
          }}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent ${
            errors.classOfFire ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          <option value="">Select class of fire...</option>
          <option value="Class A">Class A - Ordinary Combustibles (wood, paper, cloth)</option>
          <option value="Class B">Class B - Flammable Liquids (gasoline, oil)</option>
          <option value="Class C">Class C - Electrical Equipment</option>
          <option value="Class D">Class D - Combustible Metals</option>
          <option value="Class K">Class K - Cooking Oils/Fats</option>
        </select>
        {errors.classOfFire && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} /> {errors.classOfFire}
          </p>
        )}
      </div>

      {/* Root Cause */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Root Cause / Origin of Fire
        </label>
        <textarea
          value={form.rootCause}
          onChange={(e) => setForm(prev => ({ ...prev, rootCause: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
          placeholder="Determined cause of the fire..."
        />
      </div>

      {/* People Injured & Estimated Damage */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            People Injured
          </label>
          <input
            type="text"
            value={form.peopleInjured}
            onChange={(e) => setForm(prev => ({ ...prev, peopleInjured: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
            placeholder="Number or names of injured..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Estimated Damage (₱)
          </label>
          <input
            type="text"
            value={form.estimatedDamage}
            onChange={(e) => setForm(prev => ({ ...prev, estimatedDamage: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
            placeholder="e.g., 500,000"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================
// PDRRMO FORM COMPONENT (matches MdrrmoReportFormActivity.java)
// ============================================
function PdrrmoForm({ form, setForm, errors, setErrors }: { 
  form: PdrrmoFormData; 
  setForm: React.Dispatch<React.SetStateAction<PdrrmoFormData>>;
  errors: ValidationErrors;
  setErrors: React.Dispatch<React.SetStateAction<ValidationErrors>>;
}) {
  return (
    <div className="space-y-4">
      {/* Call Classification */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nature of Call <span className="text-red-500">*</span>
          </label>
          <select
            value={form.natureOfCall}
            onChange={(e) => {
              setForm(prev => ({ ...prev, natureOfCall: e.target.value }));
              if (errors.natureOfCall) setErrors(prev => ({ ...prev, natureOfCall: '' }));
            }}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
              errors.natureOfCall ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            <option value="">Select...</option>
            <option value="Emergency">Emergency</option>
            <option value="Non-Emergency">Non-Emergency</option>
            <option value="Transfer">Transfer</option>
            <option value="Standby">Standby</option>
          </select>
          {errors.natureOfCall && (
            <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
              <AlertCircle size={14} /> {errors.natureOfCall}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Emergency Type
          </label>
          <select
            value={form.emergencyType}
            onChange={(e) => setForm(prev => ({ ...prev, emergencyType: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="Medical">Medical</option>
            <option value="Trauma">Trauma</option>
            <option value="Vehicular Accident">Vehicular Accident</option>
            <option value="Drowning">Drowning</option>
            <option value="Rescue">Rescue</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Area Type
          </label>
          <select
            value={form.areaType}
            onChange={(e) => setForm(prev => ({ ...prev, areaType: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="Urban">Urban</option>
            <option value="Rural">Rural</option>
            <option value="Highway">Highway</option>
            <option value="Coastal">Coastal</option>
          </select>
        </div>
      </div>

      {/* Incident Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Incident Location <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.incidentLocation}
          onChange={(e) => {
            setForm(prev => ({ ...prev, incidentLocation: e.target.value }));
            if (errors.incidentLocation) setErrors(prev => ({ ...prev, incidentLocation: '' }));
          }}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
            errors.incidentLocation ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        {errors.incidentLocation && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} /> {errors.incidentLocation}
          </p>
        )}
      </div>

      {/* Response Timeline */}
      <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
        <h4 className="font-medium text-cyan-800 dark:text-cyan-200 mb-3">Response Timeline</h4>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Time of Call', key: 'timeCall' },
            { label: 'Dispatch', key: 'timeDispatch' },
            { label: 'Arrival at Scene', key: 'timeScene' },
            { label: 'Departure', key: 'timeDeparture' },
            { label: 'Arrival at Facility', key: 'timeFacility' },
            { label: 'Patient Handover', key: 'timeHandover' },
            { label: 'Clear', key: 'timeClear' },
            { label: 'Return to Base', key: 'timeBase' }
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-xs text-cyan-700 dark:text-cyan-300 mb-1">{label}</label>
              <input
                type="time"
                value={(form as any)[key]}
                onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border border-cyan-300 dark:border-cyan-700 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Facility Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Receiving Facility Type
          </label>
          <select
            value={form.facilityType}
            onChange={(e) => setForm(prev => ({ ...prev, facilityType: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="Hospital">Hospital</option>
            <option value="Clinic">Clinic</option>
            <option value="Health Center">Health Center</option>
            <option value="None">None (On-site treatment)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Facility Name
          </label>
          <input
            type="text"
            value={form.facilityName}
            onChange={(e) => setForm(prev => ({ ...prev, facilityName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="Name of hospital/clinic..."
          />
        </div>
      </div>

      {/* Patients Count */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Number of Patients
        </label>
        <input
          type="number"
          min="0"
          value={form.patientsCount}
          onChange={(e) => setForm(prev => ({ ...prev, patientsCount: parseInt(e.target.value) || 0 }))}
          className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
      </div>

      {/* Narrative */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Incident Narrative
        </label>
        <textarea
          value={form.narrative}
          onChange={(e) => setForm(prev => ({ ...prev, narrative: e.target.value }))}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="Detailed narrative of the emergency response..."
        />
      </div>
    </div>
  );
}
