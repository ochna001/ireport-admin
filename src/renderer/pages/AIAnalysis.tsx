import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import {
  BrainCircuit,
  RefreshCw,
  Play,
  FileText,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Search,
  Image as ImageIcon,
  Wifi,
  WifiOff
} from 'lucide-react';

interface AIReportRecord {
  id: number;
  incident_id: string;
  status: 'completed' | 'failed' | 'processing' | 'queued';
  severity: number;
  summary: string;
  hazards: string[];
  processing_time_ms: number;
  model_metadata: any;
  rag_context: any;
  raw_vlm_output?: any;
  created_at: string;
  incidents?: {
    description: string;
    location_address: string;
    status: string;
    created_at: string;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ManualIncidentOption {
  id: string;
  description?: string;
  location_address?: string;
  agency_type?: string;
  status?: string;
  created_at?: string;
  is_fast_report?: boolean;
}

interface CallDraftSummary {
  description?: string;
  recommended_agency?: string;
  severity?: number;
  confidence?: number;
  hazards?: string[];
  missing_info?: string[];
  rationale?: string;
}

type TabType = 'records' | 'manual' | 'pipeline-log';

function AIAnalysis() {
  const location = useLocation();
  const navigate = useNavigate();

  // Admin-only page: dispatchers/chiefs/officers should never see raw model
  // output or worker internals. Those now live in ireport-service-manager,
  // a separate operator-only tool. Route-level guard (defense in depth
  // alongside the hidden nav link in Layout.tsx) — computed here, but the
  // actual early-out happens at the final return so hooks below still run
  // unconditionally on every render, per the rules of hooks.
  let currentUser: any = null;
  try {
    currentUser = JSON.parse(localStorage.getItem('ireport_admin_current_user') || 'null');
  } catch {
    currentUser = null;
  }
  const isAdmin = currentUser?.role === 'Admin';

  const [activeTab, setActiveTab] = useState<TabType>('records');
  const [records, setRecords] = useState<AIReportRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [weeklyMetrics, setWeeklyMetrics] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  const [manualIncidentId, setManualIncidentId] = useState('');
  const [manualRunning, setManualRunning] = useState(false);
  const [manualResult, setManualResult] = useState('');
  const [manualSearch, setManualSearch] = useState('');
  const [manualIncidents, setManualIncidents] = useState<ManualIncidentOption[]>([]);
  const [manualIncidentsLoading, setManualIncidentsLoading] = useState(false);
  const [manualIncidentsError, setManualIncidentsError] = useState('');
  const [selectedLogIncidentId, setSelectedLogIncidentId] = useState('');
  const [selectedLogReport, setSelectedLogReport] = useState<AIReportRecord | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState('');

  const [callTranscript, setCallTranscript] = useState('');
  const [callReporterName, setCallReporterName] = useState('');
  const [callReporterPhone, setCallReporterPhone] = useState('');
  const [callIncidentLocation, setCallIncidentLocation] = useState('');
  const [callReporterLocation, setCallReporterLocation] = useState('');
  const [callIncidentLat, setCallIncidentLat] = useState('');
  const [callIncidentLon, setCallIncidentLon] = useState('');
  const [callReporterLat, setCallReporterLat] = useState('');
  const [callReporterLon, setCallReporterLon] = useState('');
  const [callDispatcherNotes, setCallDispatcherNotes] = useState('');
  const [callReporterAge, setCallReporterAge] = useState('');
  const [callSummaryDraft, setCallSummaryDraft] = useState<CallDraftSummary | null>(null);
  const [callSummarizing, setCallSummarizing] = useState(false);
  const [callCreating, setCallCreating] = useState(false);
  const [callDraftStatus, setCallDraftStatus] = useState('');
  const [createdCallIncidentId, setCreatedCallIncidentId] = useState('');

  // Fetch AI records from Supabase via IPC
  const fetchRecords = useCallback(async (reset = false) => {
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const currentPage = reset ? 1 : page;
      const response = await window.api.getAIAnalysisRecords({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery || undefined,
        page: currentPage,
        limit: PAGE_SIZE
      });
      if (reset) {
        setRecords(response.data || []);
        setPage(2);
      } else {
        setRecords(prev => [...prev, ...(response.data || [])]);
        setPage(currentPage + 1);
      }
      setHasMore((response.data || []).length === PAGE_SIZE);
    } catch (e: any) {
      setRecordsError(e.message || 'Failed to load records');
    }
    setRecordsLoading(false);
  }, [statusFilter, searchQuery, page]);

  useEffect(() => {
    if (activeTab === 'records') {
      fetchRecords(true);
    }
  }, [activeTab, statusFilter]);

  useEffect(() => {
    window.api.getAIWeeklyMetrics().then(setWeeklyMetrics).catch(() => setWeeklyMetrics([]));
  }, []);

  // Re-run failed analysis
  const rerunAnalysis = async (incidentId: string) => {
    try {
      await window.api.triggerAIReanalysis(incidentId);
      alert('Re-analysis triggered. Check back shortly.');
      fetchRecords(true);
    } catch (e: any) {
      alert('Failed to trigger re-analysis: ' + e.message);
    }
  };

  // Manual analysis
  const fetchManualIncidents = useCallback(async () => {
    setManualIncidentsLoading(true);
    setManualIncidentsError('');
    try {
      const data = await window.api.listAIAnalysisIncidents({
        search: manualSearch || undefined,
        limit: 50
      });
      setManualIncidents(data || []);
    } catch (e: any) {
      setManualIncidentsError(e.message || 'Failed to load incidents');
    }
    setManualIncidentsLoading(false);
  }, [manualSearch]);

  useEffect(() => {
    if (activeTab !== 'manual') return;
    const timer = window.setTimeout(() => {
      fetchManualIncidents();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeTab, fetchManualIncidents]);

  const loadPipelineLog = useCallback(async (incidentId: string) => {
    if (!incidentId.trim()) return;
    setSelectedLogIncidentId(incidentId);
    setLogLoading(true);
    setLogError('');
    try {
      const report = await window.api.getIncidentAIReport(incidentId);
      setSelectedLogReport(report);
      if (!report) {
        setLogError('No saved AI analysis report found yet for this incident.');
      }
    } catch (e: any) {
      setSelectedLogReport(null);
      setLogError(e.message || 'Failed to load AI analysis log');
    }
    setLogLoading(false);
  }, []);

  const openPipelineLog = useCallback((incidentId: string) => {
    setActiveTab('pipeline-log');
    loadPipelineLog(incidentId);
  }, [loadPipelineLog]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const targetTab = params.get('tab');
    const incidentId = (params.get('incidentId') || '').trim();

    if (targetTab === 'pipeline-log') {
      setActiveTab('pipeline-log');
      if (incidentId) {
        loadPipelineLog(incidentId);
      }
    }
  }, [location.search, loadPipelineLog]);

  const runManualAnalysis = async () => {
    if (!manualIncidentId.trim()) return;
    setManualRunning(true);
    setManualResult('');
    const incidentId = manualIncidentId.trim();
    setSelectedLogIncidentId(incidentId);
    setSelectedLogReport(null);
    setLogError('Analysis queued. Waiting for the worker to save the AI report...');
    setActiveTab('pipeline-log');
    try {
      await window.api.triggerAIReanalysis(incidentId);
      setManualResult('Analysis triggered successfully. The result will appear in the Pipeline Log tab shortly.');
      window.setTimeout(() => loadPipelineLog(incidentId), 3000);
      window.setTimeout(() => loadPipelineLog(incidentId), 8000);
      window.setTimeout(() => loadPipelineLog(incidentId), 15000);
    } catch (e: any) {
      setManualResult('Error: ' + e.message);
      setLogError('Error: ' + e.message);
    }
    setManualRunning(false);
  };

  const parseOptionalNumber = (value: string): number | undefined => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const generateCallDraft = async () => {
    if (!callTranscript.trim()) {
      setCallDraftStatus('Please paste transcript text first.');
      return;
    }

    setCallSummarizing(true);
    setCallDraftStatus('');
    setCreatedCallIncidentId('');
    try {
      const response = await window.api.summarizeCallTranscript({
        transcript: callTranscript.trim(),
        reporter_name: callReporterName.trim() || undefined,
        reporter_phone: callReporterPhone.trim() || undefined,
        incident_location: callIncidentLocation.trim() || undefined,
        reporter_location: callReporterLocation.trim() || undefined,
        dispatcher_notes: callDispatcherNotes.trim() || undefined,
      });

      const summary = response?.summary;
      if (!summary || typeof summary !== 'object') {
        throw new Error('Invalid summary response from AI worker');
      }
      setCallSummaryDraft(summary as CallDraftSummary);
      setCallDraftStatus('Draft summary generated. Review and create incident when ready.');
    } catch (e: any) {
      setCallSummaryDraft(null);
      setCallDraftStatus(`Error: ${e.message || 'Failed to summarize transcript'}`);
    }
    setCallSummarizing(false);
  };

  const createIncidentFromDraft = async () => {
    if (!callSummaryDraft) {
      setCallDraftStatus('Generate a call summary draft first.');
      return;
    }

    setCallCreating(true);
    setCallDraftStatus('');
    try {
      const response = await window.api.createIncidentFromCallDraft({
        summary: callSummaryDraft,
        reporter_name: callReporterName.trim() || undefined,
        reporter_phone: callReporterPhone.trim() || undefined,
        reporter_age: parseOptionalNumber(callReporterAge),
        incident_latitude: parseOptionalNumber(callIncidentLat),
        incident_longitude: parseOptionalNumber(callIncidentLon),
        reporter_latitude: parseOptionalNumber(callReporterLat),
        reporter_longitude: parseOptionalNumber(callReporterLon),
        location_address: callIncidentLocation.trim() || undefined,
        dispatcher_notes: callDispatcherNotes.trim() || undefined,
      });

      const incidentId = response?.incident?.id;
      if (!incidentId) {
        throw new Error('Incident was created but no incident ID was returned');
      }

      setCreatedCallIncidentId(incidentId);
      setSelectedLogIncidentId(incidentId);
      setCallDraftStatus(`Incident created: ${incidentId}`);
    } catch (e: any) {
      setCallDraftStatus(`Error: ${e.message || 'Failed to create incident from draft'}`);
    }
    setCallCreating(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full"><CheckCircle size={12} /> Completed</span>;
      case 'failed':
        return <span className="flex items-center gap-1 text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full"><AlertTriangle size={12} /> Failed</span>;
      case 'processing':
        return <span className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full"><Loader2 size={12} className="animate-spin" /> Processing</span>;
      default:
        return <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">{status}</span>;
    }
  };

  const getSeverityBadge = (severity: number) => {
    const colors = ['bg-slate-400', 'bg-green-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-600'];
    return (
      <span className={`text-xs px-2 py-1 rounded-full text-white font-bold ${colors[severity - 1] || colors[0]}`}>
        L{severity}
      </span>
    );
  };

  const getMainReport = (report: AIReportRecord | null) => {
    const raw = report?.raw_vlm_output;
    return raw?.grounded_report || raw || {};
  };

  const formatMs = (ms?: number) => {
    if (!ms) return '-';
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
  };

  // Route-level guard: dispatchers/chiefs/officers should never reach this
  // page's content, even via direct URL navigation. Model/worker internals
  // and free-form prompting now live in ireport-service-manager.
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BrainCircuit size={28} className="text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI Analysis</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Review AI triage reports and run manual analysis. Model configuration lives in the Service Manager tool.</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-slate-700">
        {[
          { key: 'records' as TabType, label: 'Records', icon: FileText },
          { key: 'manual' as TabType, label: 'Manual Analysis', icon: Play },
          { key: 'pipeline-log' as TabType, label: 'Pipeline Log', icon: ImageIcon },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Records Tab */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40" aria-label="AI weekly monitoring">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Weekly monitoring</h2><p className="text-xs text-slate-500 dark:text-slate-400">Reviewer feedback, not model confidence, drives these measures.</p></div>
              <span className="text-xs text-slate-500">{weeklyMetrics[0]?.reviewed_count || 0} reviews this week</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><span className="block text-slate-500">Accepted</span><strong>{weeklyMetrics[0]?.accepted_count || 0}</strong></div>
              <div><span className="block text-slate-500">Modified</span><strong>{weeklyMetrics[0]?.modified_count || 0}</strong></div>
              <div><span className="block text-slate-500">Rejected</span><strong>{weeklyMetrics[0]?.rejected_count || 0}</strong></div>
              <div><span className="block text-slate-500">Severity match</span><strong>{weeklyMetrics[0]?.severity_exact_match_rate == null ? '—' : `${Math.round(Number(weeklyMetrics[0].severity_exact_match_rate) * 100)}%`}</strong></div>
            </div>
          </section>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by incident ID or summary..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchRecords(true)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="processing">Processing</option>
              <option value="queued">Queued</option>
            </select>
            <button
              onClick={() => fetchRecords(true)}
              disabled={recordsLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              <RefreshCw size={14} className={recordsLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {recordsError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {recordsError}
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Incident</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Severity</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Summary</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Time</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white truncate max-w-[200px]">
                        {record.incident_id.substring(0, 8)}...
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                        {record.incidents?.location_address || 'Unknown location'}
                      </div>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(record.status)}</td>
                    <td className="px-4 py-3">{getSeverityBadge(record.severity)}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700 dark:text-slate-300 truncate max-w-[300px]">
                        {record.summary || 'No summary'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {record.model_metadata?.vlm_model || 'unknown'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {record.processing_time_ms ? `${record.processing_time_ms}ms` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openPipelineLog(record.incident_id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                      >
                        <ImageIcon size={12} />
                        View Log
                      </button>
                      {record.status === 'failed' && (
                        <button
                          onClick={() => rerunAnalysis(record.incident_id)}
                          className="inline-flex items-center gap-1 ml-2 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50"
                        >
                          <RefreshCw size={12} />
                          Re-run
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {records.length === 0 && !recordsLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                      No AI reports found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {recordsLoading && (
              <div className="p-4 text-center">
                <Loader2 size={20} className="animate-spin mx-auto text-blue-500" />
              </div>
            )}
            {hasMore && records.length > 0 && (
              <div className="p-3 text-center border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => fetchRecords(false)}
                  disabled={recordsLoading}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                  Load more
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Call Transcript Draft</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Paste transcript, generate an AI draft, then create a dispatcher-confirmed incident.
              </p>
            </div>

            <textarea
              value={callTranscript}
              onChange={(e) => setCallTranscript(e.target.value)}
              placeholder="caller: ...\ndispatcher: ..."
              rows={8}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={callReporterName}
                onChange={(e) => setCallReporterName(e.target.value)}
                placeholder="Reporter name"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterPhone}
                onChange={(e) => setCallReporterPhone(e.target.value)}
                placeholder="Reporter phone"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callIncidentLocation}
                onChange={(e) => setCallIncidentLocation(e.target.value)}
                placeholder="Incident location address"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterLocation}
                onChange={(e) => setCallReporterLocation(e.target.value)}
                placeholder="Reporter location (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterAge}
                onChange={(e) => setCallReporterAge(e.target.value)}
                placeholder="Reporter age (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callDispatcherNotes}
                onChange={(e) => setCallDispatcherNotes(e.target.value)}
                placeholder="Dispatcher notes (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callIncidentLat}
                onChange={(e) => setCallIncidentLat(e.target.value)}
                placeholder="Incident latitude (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callIncidentLon}
                onChange={(e) => setCallIncidentLon(e.target.value)}
                placeholder="Incident longitude (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterLat}
                onChange={(e) => setCallReporterLat(e.target.value)}
                placeholder="Reporter latitude (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterLon}
                onChange={(e) => setCallReporterLon(e.target.value)}
                placeholder="Reporter longitude (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={generateCallDraft}
                disabled={callSummarizing || !callTranscript.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {callSummarizing ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
                Generate Draft
              </button>
              <button
                onClick={createIncidentFromDraft}
                disabled={callCreating || !callSummaryDraft}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {callCreating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Create Incident
              </button>
              {createdCallIncidentId && (
                <button
                  onClick={() => navigate(`/incidents/${createdCallIncidentId}`)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  Open Incident
                </button>
              )}
            </div>

            {callSummaryDraft && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-3 text-sm space-y-2">
                <div><span className="font-medium">Agency:</span> {(callSummaryDraft.recommended_agency || 'mdrrmo').toUpperCase()}</div>
                <div><span className="font-medium">Severity:</span> {callSummaryDraft.severity ?? '-'}</div>
                <div><span className="font-medium">Confidence:</span> {callSummaryDraft.confidence ?? '-'}</div>
                <div>
                  <span className="font-medium">Description:</span>
                  <p className="mt-1 whitespace-pre-wrap">{callSummaryDraft.description || 'No description returned'}</p>
                </div>
              </div>
            )}

            {callDraftStatus && (
              <div className={`p-3 rounded-lg text-sm ${callDraftStatus.startsWith('Error') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'}`}>
                {callDraftStatus}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Analysis Tab */}
      {activeTab === 'manual' && (
        <div className="max-w-3xl">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Search Incident
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  placeholder="Search by incident ID, description, or location"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Select an incident to analyze
                </span>
                <button
                  onClick={fetchManualIncidents}
                  disabled={manualIncidentsLoading}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                  <RefreshCw size={12} className={manualIncidentsLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {manualIncidentsError && (
                <div className="p-3 text-sm text-red-600 dark:text-red-400">
                  {manualIncidentsError}
                </div>
              )}

              {!manualIncidentsError && manualIncidentsLoading && manualIncidents.length === 0 && (
                <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 size={18} className="animate-spin mx-auto mb-2" />
                  Loading incidents...
                </div>
              )}

              {!manualIncidentsError && !manualIncidentsLoading && manualIncidents.length === 0 && (
                <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                  No incidents found.
                </div>
              )}

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
                {manualIncidents.map((incident) => (
                  <button
                    key={incident.id}
                    type="button"
                    onClick={() => setManualIncidentId(incident.id)}
                    className={`w-full text-left p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${
                      manualIncidentId === incident.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-slate-900 dark:text-white truncate">
                          {incident.id}
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1 mt-1">
                          {incident.description || 'No description'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-1">
                          {incident.location_address || 'Unknown location'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase">
                          {incident.status || 'unknown'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {incident.agency_type || 'unknown'}
                        </span>
                        {incident.is_fast_report && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            Fast
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Selected Incident ID
              </label>
              <input
                type="text"
                value={manualIncidentId}
                onChange={(e) => setManualIncidentId(e.target.value)}
                placeholder="Select from the list or paste an incident UUID"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              />
            </div>
            <button
              onClick={runManualAnalysis}
              disabled={manualRunning || !manualIncidentId.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {manualRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Run Analysis
            </button>
            {manualResult && (
              <div className={`p-3 rounded-lg text-sm ${manualResult.startsWith('Error') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'}`}>
                {manualResult}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pipeline Log Tab */}
      {activeTab === 'pipeline-log' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Incident ID
                </label>
                <input
                  type="text"
                  value={selectedLogIncidentId}
                  onChange={(e) => setSelectedLogIncidentId(e.target.value)}
                  placeholder="Paste or select an incident ID"
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
              <button
                onClick={() => loadPipelineLog(selectedLogIncidentId)}
                disabled={logLoading || !selectedLogIncidentId.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw size={16} className={logLoading ? 'animate-spin' : ''} />
                Load Saved Log
              </button>
            </div>
          </div>

          {logError && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg text-sm">
              {logError}
            </div>
          )}

          {selectedLogReport && (() => {
            const mainReport = getMainReport(selectedLogReport);
            const visualItems = Array.isArray(mainReport.visual_confirmation)
              ? mainReport.visual_confirmation
              : Array.isArray(selectedLogReport.hazards)
                ? selectedLogReport.hazards
                : [];
            const modelMeta = selectedLogReport.model_metadata || {};
            return (
              <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
                <div className="bg-slate-950 text-slate-100 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">AI Pipeline Log</p>
                      <h3 className="font-mono text-sm text-white break-all">IMAGE / INCIDENT: {selectedLogReport.incident_id}</h3>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-300 border border-green-500/30">
                      {selectedLogReport.status}
                    </span>
                  </div>

                  <div className="p-4 space-y-4 font-mono text-sm">
                    <section>
                      <p className="text-blue-300">Analyzing: {selectedLogReport.incident_id}</p>
                      <p className="text-slate-400">Report saved: {new Date(selectedLogReport.created_at).toLocaleString()}</p>
                      <p className="text-slate-400">Vision model: {modelMeta.vision_model || 'siglip2'} | VLM: {modelMeta.vlm_model || 'unknown'}</p>
                      <p className="text-slate-400">Processing time: {formatMs(selectedLogReport.processing_time_ms)}</p>
                    </section>

                    <section className="space-y-2">
                      <p className="text-purple-300">Grounded Response:</p>
                      <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-3">
                        <div>
                          <p className="text-slate-500 text-xs uppercase">Image Description</p>
                          <p className="text-slate-100 whitespace-pre-wrap">{mainReport.image_description || 'No image description saved.'}</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <p className="text-slate-500 text-xs uppercase">Incident Type</p>
                            <p className="text-orange-300">{mainReport.incident_type || 'unknown'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs uppercase">Severity</p>
                            <p className="text-red-300">L{mainReport.severity || selectedLogReport.severity || '-'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs uppercase">Agency</p>
                            <p className="text-cyan-300">{mainReport.recommended_agency || 'unknown'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs uppercase">Confidence</p>
                            <p className="text-green-300">{mainReport.confidence ?? '-'}%</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs uppercase">Summary</p>
                          <p className="text-slate-100 whitespace-pre-wrap">{mainReport.summary || selectedLogReport.summary || 'No summary saved.'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs uppercase">Agency Reasoning</p>
                          <p className="text-slate-100 whitespace-pre-wrap">{mainReport.agency_reasoning || 'No agency reasoning saved.'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs uppercase mb-2">Visual Confirmation</p>
                          <ul className="space-y-1">
                            {visualItems.length > 0 ? visualItems.map((item: string, idx: number) => (
                              <li key={idx} className="flex gap-2 text-slate-100">
                                <span className="text-green-400">-</span>
                                <span>{item}</span>
                              </li>
                            )) : <li className="text-slate-500">No visual confirmation saved.</li>}
                          </ul>
                        </div>
                      </div>
                    </section>

                    <p className="text-green-300">⏱️ Sample time: {formatMs(selectedLogReport.processing_time_ms)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Triage Summary</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                        <p className="text-slate-500 dark:text-slate-400">Severity</p>
                        <div className="mt-1">{getSeverityBadge(mainReport.severity || selectedLogReport.severity || 1)}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                        <p className="text-slate-500 dark:text-slate-400">Agency</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white uppercase">{mainReport.recommended_agency || 'unknown'}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                        <p className="text-slate-500 dark:text-slate-400">Incident Type</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white">{mainReport.incident_type || 'unknown'}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                        <p className="text-slate-500 dark:text-slate-400">Runtime</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatMs(selectedLogReport.processing_time_ms)}</p>
                      </div>
                    </div>
                  </div>

                  <details className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <summary className="cursor-pointer font-semibold text-slate-900 dark:text-white">Raw Saved Output</summary>
                    <pre className="mt-3 max-h-[420px] overflow-auto text-xs bg-slate-950 text-slate-100 rounded-lg p-3">
                      {JSON.stringify(selectedLogReport.raw_vlm_output || selectedLogReport, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            );
          })()}

          {!selectedLogReport && !logLoading && !logError && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
              <ImageIcon size={36} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Select an incident from Records or Manual Analysis to view its saved AI pipeline log.</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default AIAnalysis;
