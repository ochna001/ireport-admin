import { AlertCircle, Check, Edit3, FileText, Flame, Plus, Save, Send, Shield, Trash2, User, Waves, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSessionScope } from '../utils/sessionScope';

interface FinalReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: any;
  existingFinalReport: any | null;
  onReportPublished: () => void;
  onDraftSaved?: () => void;
  latestUnitReport?: any;
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
  patients: PdrrmoPatientEntry[];
}

interface PdrrmoPatientEntry {
  id: string;
  name: string;
  age: string;
  sex: string;
  address: string;
  nextOfKin: string;
  chiefComplaint: string;
  condition: string;
  medications: string;
  allergies: string;
  vitals: {
    bp: string;
    pulse: string;
    resp: string;
    temp: string;
    spo2: string;
  };
}

const createEmptyPdrrmoPatient = (): PdrrmoPatientEntry => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  age: '',
  sex: '',
  address: '',
  nextOfKin: '',
  chiefComplaint: '',
  condition: '',
  medications: '',
  allergies: '',
  vitals: {
    bp: '',
    pulse: '',
    resp: '',
    temp: '',
    spo2: ''
  }
});

const parsePdrrmoPatients = (raw: any): PdrrmoPatientEntry[] => {
  if (!raw) return [];
  let parsed: any[] = [];
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse PDRRMO patients JSON', e);
      return [];
    }
  } else if (Array.isArray(raw)) {
    parsed = raw;
  } else if (raw?.patients && Array.isArray(raw.patients)) {
    parsed = raw.patients;
  } else {
    return [];
  }

  // Helper to extract vital value from nested object with t1/t2/t3 structure
  const extractVital = (vitalObj: any): string => {
    if (!vitalObj) return '';
    if (typeof vitalObj === 'string') return vitalObj;
    if (typeof vitalObj === 'object') {
      // Try t1, t2, t3 in order, return first non-empty
      return vitalObj.t1 || vitalObj.t2 || vitalObj.t3 || '';
    }
    return '';
  };

  return parsed.map((patient, index) => ({
    id: patient?.id || `patient-${index}-${Date.now()}`,
    name: patient?.name || '',
    age: patient?.age?.toString?.() || patient?.age || '',
    sex: patient?.sex || '',
    address: patient?.address || '',
    nextOfKin: patient?.nextOfKin || patient?.next_of_kin || '',
    chiefComplaint: patient?.chiefComplaint || patient?.chief_complaint || patient?.chiefComplaint || '',
    condition: patient?.condition || patient?.patient_narrative || '',
    medications: patient?.medications || patient?.meds || '',
    allergies: patient?.allergies || '',
    vitals: {
      bp: extractVital(patient?.vitals?.bp || patient?.bp),
      pulse: extractVital(patient?.vitals?.pulse || patient?.pulse || patient?.pulse_rate),
      resp: extractVital(patient?.vitals?.resp || patient?.resp || patient?.resp_rate),
      temp: extractVital(patient?.vitals?.temp || patient?.temp),
      spo2: extractVital(patient?.vitals?.spo2 || patient?.spo2)
    }
  }));
};

// ============================================
// MDRRMO DISASTER REPORT FIELDS (matches MdrrmoDisasterReportFormActivity.java)
// ============================================
interface MdrrmoDisasterFormData {
  disasterType: string;
  disasterTypeOther: string;
  affectedArea: string;
  casualtiesDead: number;
  casualtiesInjured: number;
  casualtiesMissing: number;
  familiesAffected: number;
  individualsAffected: number;
  damageLevel: string;
  damageDetails: string;
  narrative: string;
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

const buildDefaultPdrrmoForm = (): PdrrmoFormData => ({
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
  patientsCount: 0,
  patients: []
});

const defaultPdrrmoForm = buildDefaultPdrrmoForm();

const defaultMdrrmoDisasterForm: MdrrmoDisasterFormData = {
  disasterType: '',
  disasterTypeOther: '',
  affectedArea: '',
  casualtiesDead: 0,
  casualtiesInjured: 0,
  casualtiesMissing: 0,
  familiesAffected: 0,
  individualsAffected: 0,
  damageLevel: '',
  damageDetails: '',
  narrative: ''
};

export function FinalReportModal({ isOpen, onClose, incident, existingFinalReport, onReportPublished, onDraftSaved, latestUnitReport }: FinalReportModalProps) {
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
  const [pdrrmoForm, setPdrrmoForm] = useState<PdrrmoFormData>(buildDefaultPdrrmoForm());
  const [mdrrmoDisasterForm, setMdrrmoDisasterForm] = useState<MdrrmoDisasterFormData>({ ...defaultMdrrmoDisasterForm });
  
  // For PDRRMO, we can have either "Emergency" or "Disaster" report types
  const [pdrrmoReportType, setPdrrmoReportType] = useState<'emergency' | 'disaster'>('emergency');

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
        // Pre-fill both forms just in case
        setPdrrmoForm(prev => ({ ...prev, incidentLocation: prev.incidentLocation || incident.location_address }));
        setMdrrmoDisasterForm(prev => ({ ...prev, affectedArea: prev.affectedArea || incident.location_address }));
      } else if (agencyType === 'mdrrmo_disaster') {
        setMdrrmoDisasterForm(prev => ({ ...prev, affectedArea: prev.affectedArea || incident.location_address }));
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
        setDraftStatus(draftData.status as any);
        const details = draftData.draft_details;
        
        populateFormFromDetails(details);
        
        // Auto-detect report type for PDRRMO based on fields present
        if (agencyType === 'pdrrmo') {
          if (details.disaster_type || details.disasterType) {
            setPdrrmoReportType('disaster');
          } else {
            setPdrrmoReportType('emergency');
          }
        }
      } else {
        // No draft, try to load existing final report to pre-fill
        if (existingFinalReport) {
          const details = existingFinalReport.report_details;
          populateFormFromDetails(details);
          
          if (agencyType === 'pdrrmo') {
            if (details.disaster_type || details.disasterType) {
              setPdrrmoReportType('disaster');
            }
          }
        } else if (latestUnitReport && latestUnitReport.details) {
          // Pre-fill from latest unit report
          let details = latestUnitReport.details;
          if (typeof details === 'string') {
            try {
              details = JSON.parse(details);
            } catch (e) {
              console.error('Failed to parse unit report details', e);
              details = { narrative: latestUnitReport.details }; // Fallback
            }
          }
          
          console.log('Pre-filling from unit report:', details);
          populateFormFromDetails(details);
          
          // Auto-detect report type for PDRRMO based on unit report fields
          if (agencyType === 'pdrrmo') {
            if (details.disaster_type || details.disasterType) {
              setPdrrmoReportType('disaster');
            } else {
              setPdrrmoReportType('emergency');
            }
          }
        }
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
      let parseSuspects = details.suspects_data || details.suspects || [];
      let parseVictims = details.victims_data || details.victims || [];

      // Handle stringified JSON if necessary (legacy/edge case)
      if (typeof parseSuspects === 'string') {
        try {
          if (parseSuspects.trim().startsWith('[')) {
            parseSuspects = JSON.parse(parseSuspects);
          } else {
             // Fallback for simple string (e.g. "Name 1; Name 2") - don't try to parse as objects
             parseSuspects = [];
          }
        } catch (e) {
          console.error('Failed to parse suspects JSON:', e);
          parseSuspects = [];
        }
      }

      if (typeof parseVictims === 'string') {
        try {
          if (parseVictims.trim().startsWith('[')) {
            parseVictims = JSON.parse(parseVictims);
          } else {
            parseVictims = [];
          }
        } catch (e) {
          console.error('Failed to parse victims JSON:', e);
          parseVictims = [];
        }
      }
      
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
      const patients = parsePdrrmoPatients(details.patients || details.patients_data);
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
        patientsCount: patients.length || parseInt(details.patients_count || details.patientsCount || '0') || 0,
        patients: patients
      });
    } else if (agencyType === 'mdrrmo_disaster') {
      setMdrrmoDisasterForm({
        disasterType: details.disaster_type || details.disasterType || '',
        disasterTypeOther: details.disaster_type_other || details.disasterTypeOther || '',
        affectedArea: details.affected_area || details.affectedArea || incident?.location_address || '',
        casualtiesDead: parseInt(details.casualties_dead || details.casualtiesDead || '0') || 0,
        casualtiesInjured: parseInt(details.casualties_injured || details.casualtiesInjured || '0') || 0,
        casualtiesMissing: parseInt(details.casualties_missing || details.casualtiesMissing || '0') || 0,
        familiesAffected: parseInt(details.families_affected || details.familiesAffected || '0') || 0,
        individualsAffected: parseInt(details.individuals_affected || details.individualsAffected || '0') || 0,
        damageLevel: details.damage_level || details.damageLevel || '',
        damageDetails: details.damage_details || details.damageDetails || '',
        narrative: details.narrative || ''
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
      if (pdrrmoReportType === 'emergency') {
        if (!pdrrmoForm.incidentLocation.trim()) {
          newErrors.incidentLocation = 'Incident location is required';
        }
        if (!pdrrmoForm.natureOfCall) {
          newErrors.natureOfCall = 'Nature of call is required';
        }
      } else {
        // Disaster validation
        if (!mdrrmoDisasterForm.disasterType) {
          newErrors.disasterType = 'Disaster type is required';
        }
        if (mdrrmoDisasterForm.disasterType === 'Other' && !mdrrmoDisasterForm.disasterTypeOther.trim()) {
          newErrors.disasterTypeOther = 'Please specify the disaster type';
        }
        if (!mdrrmoDisasterForm.affectedArea.trim()) {
          newErrors.affectedArea = 'Affected area is required';
        }
        if (!mdrrmoDisasterForm.narrative.trim()) {
          newErrors.narrative = 'Narrative report is required';
        }
      }
    } else if (agencyType === 'mdrrmo_disaster') {
      if (!mdrrmoDisasterForm.disasterType) {
        newErrors.disasterType = 'Disaster type is required';
      }
      if (mdrrmoDisasterForm.disasterType === 'Other' && !mdrrmoDisasterForm.disasterTypeOther.trim()) {
        newErrors.disasterTypeOther = 'Please specify the disaster type';
      }
      if (!mdrrmoDisasterForm.affectedArea.trim()) {
        newErrors.affectedArea = 'Affected area is required';
      }
      if (!mdrrmoDisasterForm.narrative.trim()) {
        newErrors.narrative = 'Narrative report is required';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getFormDetails = (): any => {
    const timestamp = new Date().toISOString();
    
    // Helper to get media URLs safely
    const getMediaUrls = () => {
      if (!incident?.media_urls) return [];
      if (Array.isArray(incident.media_urls)) return incident.media_urls;
      try {
        return JSON.parse(incident.media_urls);
      } catch {
        return [];
      }
    };

    const mediaUrls = getMediaUrls();
    
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
        media_urls: mediaUrls,
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
        media_urls: mediaUrls,
        timestamp
      };
    } else if (agencyType === 'pdrrmo') {
      if (pdrrmoReportType === 'emergency') {
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
          patients_count: pdrrmoForm.patients.length.toString(),
          patients: pdrrmoForm.patients,
          patients_data: pdrrmoForm.patients,
          media_urls: mediaUrls,
          timestamp
        };
      } else {
        // PDRRMO Disaster Report
        const finalDisasterType = mdrrmoDisasterForm.disasterType === 'Other' 
          ? mdrrmoDisasterForm.disasterTypeOther 
          : mdrrmoDisasterForm.disasterType;
        
        return {
          report_type: 'DISASTER',
          disaster_type: finalDisasterType,
          affected_area: mdrrmoDisasterForm.affectedArea,
          casualties_dead: mdrrmoDisasterForm.casualtiesDead,
          casualties_injured: mdrrmoDisasterForm.casualtiesInjured,
          casualties_missing: mdrrmoDisasterForm.casualtiesMissing,
          families_affected: mdrrmoDisasterForm.familiesAffected,
          individuals_affected: mdrrmoDisasterForm.individualsAffected,
          damage_level: mdrrmoDisasterForm.damageLevel,
          damage_details: mdrrmoDisasterForm.damageDetails,
          narrative: mdrrmoDisasterForm.narrative,
          media_urls: mediaUrls,
          timestamp
        };
      }
    } else {
      // mdrrmo_disaster
      const finalDisasterType = mdrrmoDisasterForm.disasterType === 'Other' 
        ? mdrrmoDisasterForm.disasterTypeOther 
        : mdrrmoDisasterForm.disasterType;
      
      return {
        report_type: 'DISASTER',
        disaster_type: finalDisasterType,
        affected_area: mdrrmoDisasterForm.affectedArea,
        casualties_dead: mdrrmoDisasterForm.casualtiesDead,
        casualties_injured: mdrrmoDisasterForm.casualtiesInjured,
        casualties_missing: mdrrmoDisasterForm.casualtiesMissing,
        families_affected: mdrrmoDisasterForm.familiesAffected,
        individuals_affected: mdrrmoDisasterForm.individualsAffected,
        damage_level: mdrrmoDisasterForm.damageLevel,
        damage_details: mdrrmoDisasterForm.damageDetails,
        narrative: mdrrmoDisasterForm.narrative,
        media_urls: mediaUrls,
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
        authorId: scope.userId || undefined
      });
      setDraftStatus(status);
      await loadDraft();
      setSaveError(null);
      if (onDraftSaved) onDraftSaved();
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
          authorId: scope.userId || undefined
        });
      }
      
      await window.api.promoteFinalReportDraft({
        incidentId: incident.id,
        authorId: scope.userId || undefined
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
      setMdrrmoDisasterForm({ ...defaultMdrrmoDisasterForm });
      if (onDraftSaved) onDraftSaved();
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

    if (Array.isArray(content)) {
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

  if (!isOpen) return null;

  const color = getAgencyColor();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" style={{ isolation: 'isolate' }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative z-10">
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
                <div className="space-y-4">
                  {/* Report Type Selector */}
                  <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <button
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        pdrrmoReportType === 'emergency'
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                      onClick={() => setPdrrmoReportType('emergency')}
                    >
                      Emergency Report
                    </button>
                    <button
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        pdrrmoReportType === 'disaster'
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                      onClick={() => setPdrrmoReportType('disaster')}
                    >
                      Disaster Report
                    </button>
                  </div>

                  {pdrrmoReportType === 'emergency' ? (
                    <PdrrmoForm form={pdrrmoForm} setForm={setPdrrmoForm} errors={errors} setErrors={setErrors} />
                  ) : (
                    <MdrrmoDisasterForm form={mdrrmoDisasterForm} setForm={setMdrrmoDisasterForm} errors={errors} setErrors={setErrors} />
                  )}
                </div>
              )}
              {agencyType === 'mdrrmo_disaster' && (
                <MdrrmoDisasterForm form={mdrrmoDisasterForm} setForm={setMdrrmoDisasterForm} errors={errors} setErrors={setErrors} />
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
                        {renderReportValue(key, value)}
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
        <select
          value={form.areaOwnership}
          onChange={(e) => setForm(prev => ({ ...prev, areaOwnership: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
        >
          <option value="">Select area ownership...</option>
          <optgroup label="Residential">
            <option value="Residential - Private">Residential - Private</option>
            <option value="Residential - Rental">Residential - Rental</option>
            <option value="Residential - Government">Residential - Government</option>
          </optgroup>
          <optgroup label="Commercial">
            <option value="Commercial - Private">Commercial - Private</option>
            <option value="Commercial - Rental">Commercial - Rental</option>
            <option value="Commercial - Government">Commercial - Government</option>
          </optgroup>
          <optgroup label="Industrial">
            <option value="Industrial - Private">Industrial - Private</option>
            <option value="Industrial - Rental">Industrial - Rental</option>
            <option value="Industrial - Government">Industrial - Government</option>
          </optgroup>
          <optgroup label="Agricultural">
            <option value="Agricultural - Private">Agricultural - Private</option>
            <option value="Agricultural - Rental">Agricultural - Rental</option>
            <option value="Agricultural - Government">Agricultural - Government</option>
          </optgroup>
          <optgroup label="Institutional">
            <option value="Institutional - Private">Institutional - Private</option>
            <option value="Institutional - Government">Institutional - Government</option>
          </optgroup>
          <optgroup label="Other">
            <option value="Mixed Use - Private">Mixed Use - Private</option>
            <option value="Mixed Use - Rental">Mixed Use - Rental</option>
            <option value="Vacant Lot">Vacant Lot</option>
            <option value="Public Space">Public Space</option>
            <option value="Other">Other</option>
          </optgroup>
        </select>
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

      {/* Patients Section */}
      {form.patients.length > 0 && (
        <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
          <h4 className="font-medium text-cyan-800 dark:text-cyan-200 mb-3">
            Patient Details ({form.patients.length} patient{form.patients.length !== 1 ? 's' : ''})
          </h4>
          <div className="space-y-4">
            {form.patients.map((patient, index) => (
              <div key={patient.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-cyan-300 dark:border-cyan-700">
                <h5 className="font-semibold text-cyan-700 dark:text-cyan-300 mb-3">Patient {index + 1}</h5>
                
                {/* Basic Info */}
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name</label>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{patient.name || 'N/A'}</div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Age</label>
                    <div className="text-sm text-gray-900 dark:text-white">{patient.age || 'N/A'}</div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Sex</label>
                    <div className="text-sm text-gray-900 dark:text-white">{patient.sex || 'N/A'}</div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Next of Kin</label>
                    <div className="text-sm text-gray-900 dark:text-white">{patient.nextOfKin || 'N/A'}</div>
                  </div>
                </div>

                {/* Address */}
                {patient.address && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Address</label>
                    <div className="text-sm text-gray-900 dark:text-white">{patient.address}</div>
                  </div>
                )}

                {/* Chief Complaint */}
                {patient.chiefComplaint && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Chief Complaint</label>
                    <div className="text-sm text-gray-900 dark:text-white">{patient.chiefComplaint}</div>
                  </div>
                )}

                {/* Vitals */}
                {(patient.vitals.bp || patient.vitals.pulse || patient.vitals.resp || patient.vitals.temp || patient.vitals.spo2) && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">Vital Signs</label>
                    <div className="grid grid-cols-5 gap-2">
                      {patient.vitals.bp && (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">BP</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{patient.vitals.bp}</div>
                        </div>
                      )}
                      {patient.vitals.pulse && (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">Pulse</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{patient.vitals.pulse}</div>
                        </div>
                      )}
                      {patient.vitals.resp && (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">Resp</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{patient.vitals.resp}</div>
                        </div>
                      )}
                      {patient.vitals.temp && (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">Temp</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{patient.vitals.temp}</div>
                        </div>
                      )}
                      {patient.vitals.spo2 && (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">SpO2</div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{patient.vitals.spo2}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Medications & Allergies */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {patient.medications && (
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Medications</label>
                      <div className="text-sm text-gray-900 dark:text-white">{patient.medications}</div>
                    </div>
                  )}
                  {patient.allergies && (
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Allergies</label>
                      <div className="text-sm text-gray-900 dark:text-white">{patient.allergies}</div>
                    </div>
                  )}
                </div>

                {/* Condition/Narrative */}
                {patient.condition && (
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Patient Narrative</label>
                    <div className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{patient.condition}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

// ============================================
// MDRRMO DISASTER FORM COMPONENT (matches MdrrmoDisasterReportFormActivity.java)
// ============================================
function MdrrmoDisasterForm({ form, setForm, errors, setErrors }: { 
  form: MdrrmoDisasterFormData; 
  setForm: React.Dispatch<React.SetStateAction<MdrrmoDisasterFormData>>;
  errors: ValidationErrors;
  setErrors: React.Dispatch<React.SetStateAction<ValidationErrors>>;
}) {
  return (
    <div className="space-y-4">
      {/* Disaster Information */}
      <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
        <h4 className="font-medium text-cyan-800 dark:text-cyan-200 mb-3">Disaster Information</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Disaster Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.disasterType}
              onChange={(e) => {
                setForm(prev => ({ ...prev, disasterType: e.target.value }));
                if (errors.disasterType) setErrors(prev => ({ ...prev, disasterType: '' }));
              }}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
                errors.disasterType ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <option value="">Select...</option>
              <option value="Flood">Flood</option>
              <option value="Typhoon">Typhoon</option>
              <option value="Earthquake">Earthquake</option>
              <option value="Landslide">Landslide</option>
              <option value="Fire">Fire</option>
              <option value="Tsunami">Tsunami</option>
              <option value="Drought">Drought</option>
              <option value="Other">Other</option>
            </select>
            {errors.disasterType && (
              <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                <AlertCircle size={14} /> {errors.disasterType}
              </p>
            )}
          </div>
          {form.disasterType === 'Other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Specify Disaster Type <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.disasterTypeOther}
                onChange={(e) => {
                  setForm(prev => ({ ...prev, disasterTypeOther: e.target.value }));
                  if (errors.disasterTypeOther) setErrors(prev => ({ ...prev, disasterTypeOther: '' }));
                }}
                className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
                  errors.disasterTypeOther ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Specify other disaster type..."
              />
              {errors.disasterTypeOther && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle size={14} /> {errors.disasterTypeOther}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Affected Area / Barangay(s) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.affectedArea}
            onChange={(e) => {
              setForm(prev => ({ ...prev, affectedArea: e.target.value }));
              if (errors.affectedArea) setErrors(prev => ({ ...prev, affectedArea: '' }));
            }}
            rows={2}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
              errors.affectedArea ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="List affected areas, barangays, or sitios..."
          />
          {errors.affectedArea && (
            <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
              <AlertCircle size={14} /> {errors.affectedArea}
            </p>
          )}
        </div>
      </div>

      {/* Casualties */}
      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
        <h4 className="font-medium text-red-800 dark:text-red-200 mb-3">Casualties</h4>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-red-700 dark:text-red-300 mb-1">Dead</label>
            <input
              type="number"
              min="0"
              value={form.casualtiesDead}
              onChange={(e) => setForm(prev => ({ ...prev, casualtiesDead: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent text-center"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-orange-700 dark:text-orange-300 mb-1">Injured</label>
            <input
              type="number"
              min="0"
              value={form.casualtiesInjured}
              onChange={(e) => setForm(prev => ({ ...prev, casualtiesInjured: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-orange-300 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent text-center"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Missing</label>
            <input
              type="number"
              min="0"
              value={form.casualtiesMissing}
              onChange={(e) => setForm(prev => ({ ...prev, casualtiesMissing: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Families Affected</label>
            <input
              type="number"
              min="0"
              value={form.familiesAffected}
              onChange={(e) => setForm(prev => ({ ...prev, familiesAffected: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Number of families"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Individuals Affected</label>
            <input
              type="number"
              min="0"
              value={form.individualsAffected}
              onChange={(e) => setForm(prev => ({ ...prev, individualsAffected: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Number of individuals"
            />
          </div>
        </div>
      </div>

      {/* Damage Assessment */}
      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
        <h4 className="font-medium text-orange-800 dark:text-orange-200 mb-3">Damage Assessment</h4>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Damage Level</label>
          <select
            value={form.damageLevel}
            onChange={(e) => setForm(prev => ({ ...prev, damageLevel: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="Minor">Minor</option>
            <option value="Moderate">Moderate</option>
            <option value="Severe">Severe</option>
            <option value="Catastrophic">Catastrophic</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Damage Details</label>
          <textarea
            value={form.damageDetails}
            onChange={(e) => setForm(prev => ({ ...prev, damageDetails: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            placeholder="Describe infrastructure, property, or agricultural damage..."
          />
        </div>
      </div>

      {/* Narrative */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Narrative Report <span className="text-red-500">*</span>
        </label>
        <textarea
          value={form.narrative}
          onChange={(e) => {
            setForm(prev => ({ ...prev, narrative: e.target.value }));
            if (errors.narrative) setErrors(prev => ({ ...prev, narrative: '' }));
          }}
          rows={4}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
            errors.narrative ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
          placeholder="Provide a detailed chronological account of the disaster response..."
        />
        {errors.narrative && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} /> {errors.narrative}
          </p>
        )}
      </div>
    </div>
  );
}
