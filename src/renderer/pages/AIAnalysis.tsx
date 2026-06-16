import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  RefreshCw,
  Play,
  MessageSquare,
  Settings as SettingsIcon,
  FileText,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Search,
  Send,
  Image as ImageIcon,
  X,
  ChevronDown,
  ChevronUp,
  Cpu,
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

type TabType = 'records' | 'manual' | 'pipeline-log' | 'models' | 'prompt-lab';

function AIAnalysis() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('records');
  const [records, setRecords] = useState<AIReportRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  const [workerUrl, setWorkerUrl] = useState('http://127.0.0.1:8000');
  const [workerHealth, setWorkerHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);

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

  const [modelConfig, setModelConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [newProvider, setNewProvider] = useState('ollama');
  const [newModel, setNewModel] = useState('');
  const fallbackModels = newProvider === 'ollama'
    ? ['gemma3:4b', 'gemma4:e2b-it-q4_K_M', 'qwen3-vl:4b', 'qwen3.5:4b']
    : ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  const availableModels = Array.from(new Set([
    ...(Array.isArray(modelConfig?.available_models) ? modelConfig.available_models : []),
    ...fallbackModels
  ]));

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatIncidentId, setChatIncidentId] = useState('');
  const [chatIncludeContext, setChatIncludeContext] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load worker URL from settings
  useEffect(() => {
    window.api.getAIWorkerUrl()
      .then((url) => {
        if (url) {
          setWorkerUrl(url);
          localStorage.setItem('ireport_admin_ai_worker_url', url);
        }
      })
      .catch(() => {
        const saved = localStorage.getItem('ireport_admin_ai_worker_url');
        if (saved) setWorkerUrl(saved);
      });
  }, []);

  // Save worker URL
  const saveWorkerUrl = useCallback(() => {
    localStorage.setItem('ireport_admin_ai_worker_url', workerUrl);
    window.api.setAIWorkerUrl(workerUrl).catch(console.error);
  }, [workerUrl]);

  // Check worker health
  const checkHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      await window.api.setAIWorkerUrl(workerUrl);
      const data = await window.api.getAIModelConfig();
      setWorkerHealth({ ...data, status: 'ok' });
    } catch (e) {
      setWorkerHealth(null);
    }
    setHealthLoading(false);
  }, [workerUrl]);

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

  // Fetch model config from worker
  const fetchModelConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      await window.api.setAIWorkerUrl(workerUrl);
      const data = await window.api.getAIModelConfig();
      setModelConfig(data);
      setNewProvider(data.vlm_provider || 'ollama');
      setNewModel(data.vlm_model || '');
    } catch (e) {
      setModelConfig(null);
    }
    setConfigLoading(false);
  }, [workerUrl]);

  useEffect(() => {
    if (activeTab === 'models') {
      fetchModelConfig();
    }
  }, [activeTab]);

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

  // Update model config
  const updateModelConfig = async () => {
    try {
      await window.api.setAIModelConfig({ vlm_provider: newProvider, vlm_model: newModel || undefined });
      alert('Model config updated. Changes are active until worker restart.');
      fetchModelConfig();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  // Chat prompt
  const sendChatPrompt = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatSending(true);
    const promptText = chatInput;
    const recentHistory = chatMessages.slice(-8).map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    setChatInput('');

    try {
      const data = await window.api.sendAIChatPrompt({
        prompt: promptText,
        history: recentHistory,
        include_context: chatIncludeContext,
        incident_id: chatIncidentId || undefined
      });
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.response || JSON.stringify(data),
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: 'Error: ' + e.message,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    }
    setChatSending(false);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full"><CheckCircle size={12} /> Completed</span>;
      case 'failed':
        return <span className="flex items-center gap-1 text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full"><AlertTriangle size={12} /> Failed</span>;
      case 'processing':
        return <span className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full"><Loader2 size={12} className="animate-spin" /> Processing</span>;
      default:
        return <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">{status}</span>;
    }
  };

  const getSeverityBadge = (severity: number) => {
    const colors = ['bg-gray-400', 'bg-green-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-600'];
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BrainCircuit size={28} className="text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Analysis</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage AI triage pipeline, review reports, and interact with models</p>
        </div>
      </div>

      {/* Worker Connection Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 border border-gray-200 dark:border-gray-700 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[300px]">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Worker URL:</span>
          <input
            type="text"
            value={workerUrl}
            onChange={(e) => setWorkerUrl(e.target.value)}
            onBlur={saveWorkerUrl}
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="http://127.0.0.1:8000"
          />
        </div>
        <button
          onClick={checkHealth}
          disabled={healthLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {healthLoading ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
          Test Connection
        </button>
        {workerHealth && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle size={14} className="text-green-500" />
            <span className="text-green-600 dark:text-green-400">Connected</span>
            <span className="text-gray-400">|</span>
            <Cpu size={14} className="text-gray-400" />
            <span className="text-gray-600 dark:text-gray-400">{workerHealth.vlm_model}</span>
          </div>
        )}
        {workerHealth === null && !healthLoading && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <WifiOff size={14} />
            <span>Unreachable</span>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {[
          { key: 'records' as TabType, label: 'Records', icon: FileText },
          { key: 'manual' as TabType, label: 'Manual Analysis', icon: Play },
          { key: 'pipeline-log' as TabType, label: 'Pipeline Log', icon: ImageIcon },
          { key: 'models' as TabType, label: 'Model Settings', icon: SettingsIcon },
          { key: 'prompt-lab' as TabType, label: 'Prompt Lab', icon: MessageSquare },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
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
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by incident ID or summary..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchRecords(true)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
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

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Incident</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Severity</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Summary</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Time</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                        {record.incident_id.substring(0, 8)}...
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                        {record.incidents?.location_address || 'Unknown location'}
                      </div>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(record.status)}</td>
                    <td className="px-4 py-3">{getSeverityBadge(record.severity)}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 truncate max-w-[300px]">
                        {record.summary || 'No summary'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {record.model_metadata?.vlm_model || 'unknown'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {record.processing_time_ms ? `${record.processing_time_ms}ms` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openPipelineLog(record.incident_id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
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
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
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
              <div className="p-3 text-center border-t border-gray-200 dark:border-gray-700">
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

          <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Call Transcript Draft</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Paste transcript, generate an AI draft, then create a dispatcher-confirmed incident.
              </p>
            </div>

            <textarea
              value={callTranscript}
              onChange={(e) => setCallTranscript(e.target.value)}
              placeholder="caller: ...\ndispatcher: ..."
              rows={8}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={callReporterName}
                onChange={(e) => setCallReporterName(e.target.value)}
                placeholder="Reporter name"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterPhone}
                onChange={(e) => setCallReporterPhone(e.target.value)}
                placeholder="Reporter phone"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callIncidentLocation}
                onChange={(e) => setCallIncidentLocation(e.target.value)}
                placeholder="Incident location address"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterLocation}
                onChange={(e) => setCallReporterLocation(e.target.value)}
                placeholder="Reporter location (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterAge}
                onChange={(e) => setCallReporterAge(e.target.value)}
                placeholder="Reporter age (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callDispatcherNotes}
                onChange={(e) => setCallDispatcherNotes(e.target.value)}
                placeholder="Dispatcher notes (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callIncidentLat}
                onChange={(e) => setCallIncidentLat(e.target.value)}
                placeholder="Incident latitude (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callIncidentLon}
                onChange={(e) => setCallIncidentLon(e.target.value)}
                placeholder="Incident longitude (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterLat}
                onChange={(e) => setCallReporterLat(e.target.value)}
                placeholder="Reporter latitude (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={callReporterLon}
                onChange={(e) => setCallReporterLon(e.target.value)}
                placeholder="Reporter longitude (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Open Incident
                </button>
              )}
            </div>

            {callSummaryDraft && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3 text-sm space-y-2">
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
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search Incident
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  placeholder="Search by incident ID, description, or location"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
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
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 size={18} className="animate-spin mx-auto mb-2" />
                  Loading incidents...
                </div>
              )}

              {!manualIncidentsError && !manualIncidentsLoading && manualIncidents.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  No incidents found.
                </div>
              )}

              <div className="max-h-80 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
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
                        <p className="font-mono text-xs text-gray-900 dark:text-white truncate">
                          {incident.id}
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1 mt-1">
                          {incident.description || 'No description'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-1">
                          {incident.location_address || 'Unknown location'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase">
                          {incident.status || 'unknown'}
                        </span>
                        <span className="text-[11px] text-gray-400">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Selected Incident ID
              </label>
              <input
                type="text"
                value={manualIncidentId}
                onChange={(e) => setManualIncidentId(e.target.value)}
                placeholder="Select from the list or paste an incident UUID"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
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
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Incident ID
                </label>
                <input
                  type="text"
                  value={selectedLogIncidentId}
                  onChange={(e) => setSelectedLogIncidentId(e.target.value)}
                  placeholder="Paste or select an incident ID"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
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
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Triage Summary</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <p className="text-gray-500 dark:text-gray-400">Severity</p>
                        <div className="mt-1">{getSeverityBadge(mainReport.severity || selectedLogReport.severity || 1)}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <p className="text-gray-500 dark:text-gray-400">Agency</p>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white uppercase">{mainReport.recommended_agency || 'unknown'}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <p className="text-gray-500 dark:text-gray-400">Incident Type</p>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">{mainReport.incident_type || 'unknown'}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <p className="text-gray-500 dark:text-gray-400">Runtime</p>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">{formatMs(selectedLogReport.processing_time_ms)}</p>
                      </div>
                    </div>
                  </div>

                  <details className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <summary className="cursor-pointer font-semibold text-gray-900 dark:text-white">Raw Saved Output</summary>
                    <pre className="mt-3 max-h-[420px] overflow-auto text-xs bg-gray-950 text-gray-100 rounded-lg p-3">
                      {JSON.stringify(selectedLogReport.raw_vlm_output || selectedLogReport, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            );
          })()}

          {!selectedLogReport && !logLoading && !logError && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
              <ImageIcon size={36} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Select an incident from Records or Manual Analysis to view its saved AI pipeline log.</p>
            </div>
          )}
        </div>
      )}

      {/* Model Settings Tab */}
      {activeTab === 'models' && (
        <div className="max-w-xl">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 space-y-4">
            {configLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                Loading config...
              </div>
            )}
            {!configLoading && !modelConfig && (
              <div className="text-sm text-red-500">Could not reach AI worker. Check the URL above.</div>
            )}
            {modelConfig && (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Current VLM Provider</span>
                    <p className="font-medium text-gray-900 dark:text-white capitalize">{modelConfig.vlm_provider}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Current VLM Model</span>
                    <p className="font-medium text-gray-900 dark:text-white">{modelConfig.vlm_model}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">YOLO Weights</span>
                    <p className="font-medium text-gray-900 dark:text-white">{modelConfig.yolo_weights}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">RAG Enabled</span>
                    <p className="font-medium text-gray-900 dark:text-white">{modelConfig.rag_enabled ? 'Yes' : 'No'}</p>
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">Switch Model</h3>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Provider</label>
                    <select
                      value={newProvider}
                      onChange={(e) => setNewProvider(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="ollama">Ollama (Local)</option>
                      <option value="gemini">Gemini (Cloud)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Model Name</label>
                    <select
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {availableModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={updateModelConfig}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <RefreshCw size={14} />
                    Apply Changes
                  </button>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Changes are volatile and last only until the worker restarts.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Prompt Lab Tab */}
      {activeTab === 'prompt-lab' && (
        <div className="max-w-3xl h-[calc(100vh-280px)] flex flex-col">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col flex-1 overflow-hidden">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-400 dark:text-gray-500 py-8">
                  <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Start a conversation with the AI model</p>
                  <p className="text-xs mt-1">You can optionally include Supabase incident context</p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}>
                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                    <span className={`text-[10px] mt-1 block ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {chatSending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                    <Loader2 size={14} className="animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <div className="flex gap-3 flex-wrap items-center">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={chatIncludeContext}
                    onChange={(e) => setChatIncludeContext(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Include incident context
                </label>
                {chatIncludeContext && (
                  <input
                    type="text"
                    value={chatIncidentId}
                    onChange={(e) => setChatIncidentId(e.target.value)}
                    placeholder="Incident ID"
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none w-40"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatPrompt()}
                  placeholder="Type your prompt..."
                  disabled={chatSending}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={sendChatPrompt}
                  disabled={chatSending || !chatInput.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIAnalysis;
