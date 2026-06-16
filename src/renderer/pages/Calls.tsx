import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Phone, PhoneCall, PhoneOff, RefreshCw, Settings, Sparkles, ChevronDown, ChevronUp, Mic, MicOff, Radio, Volume2, VolumeX, Download, Disc } from 'lucide-react';
import { getSessionScope } from '../utils/sessionScope';
import { useLiveKitRoom } from '../hooks/useLiveKitRoom';
import { useCallRecorder } from '../hooks/useCallRecorder';
import { ChunkedTranscriber } from '../utils/chunkedTranscriber';

type CallSessionStatus = 'initiated' | 'ringing' | 'active' | 'ended' | 'cancelled' | 'failed';

type CallSession = {
  id: string;
  room: string;
  caller_user_id?: string | null;
  receiver_user_id?: string | null;
  incident_id?: string | null;
  status: CallSessionStatus;
  started_at?: string | null;
  ended_at?: string | null;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
};

type TranscriptLine = {
  id?: number;
  session_id?: string;
  speaker?: 'caller' | 'receiver' | 'dispatcher' | 'system';
  text?: string;
  created_at?: string;
};

type CallDraftSummary = {
  description?: string;
  recommended_agency?: string;
  severity?: number;
  confidence?: number;
  hazards?: string[];
  missing_info?: string[];
  rationale?: string;
};

const STATUS_OPTIONS: Array<{ value: CallSessionStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'initiated', label: 'Initiated' },
  { value: 'ringing', label: 'Ringing' },
  { value: 'active', label: 'Active' },
  { value: 'ended', label: 'Ended' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
];

const fmt = (date?: string | null) => {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString();
  } catch {
    return date;
  }
};

const elfmt = (started?: string | null, ended?: string | null) => {
  if (!started) return '—';
  const start = new Date(started).getTime();
  const end = ended ? new Date(ended).getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
};

const callerLabel = (meta?: any): string =>
  String(meta?.reporter_name || '').trim() || 'Anonymous caller';

const callerPhone = (meta?: any): string =>
  String(meta?.reporter_phone || '').trim() || 'Not provided';

const callerLocation = (meta?: any): string =>
  String(meta?.incident_location || meta?.reporter_location || '').trim() || 'Not provided';

export default function Calls() {
  const navigate = useNavigate();
  const sessionScope = useMemo(() => getSessionScope(), []);
  const currentUserId = String(sessionScope.userId || '').trim() || null;
  const [callWebUrl, setCallWebUrl] = useState(
    (localStorage.getItem('ireport_call_web_url') || 'https://ireport-call-test.onrender.com').replace(/\/+$/, ''),
  );
  const [statusFilter, setStatusFilter] = useState<CallSessionStatus | 'all'>('all');
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [dispatcherLine, setDispatcherLine] = useState('');

  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);
  const [busyStatus, setBusyStatus] = useState<CallSessionStatus | ''>('');
  const [sendingLine, setSendingLine] = useState(false);

  const [callSummaryDraft, setCallSummaryDraft] = useState<CallDraftSummary | null>(null);
  const [callDraftStatus, setCallDraftStatus] = useState('');
  const [reporterAgeInput, setReporterAgeInput] = useState('');
  const [incidentLatInput, setIncidentLatInput] = useState('');
  const [incidentLonInput, setIncidentLonInput] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [creatingIncident, setCreatingIncident] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [liveTranscriptionStatus, setLiveTranscriptionStatus] = useState('');
  const [transcriptionLanguage, setTranscriptionLanguage] = useState(
    localStorage.getItem('ireport_call_transcription_language') || 'multi',
  );
  const [transcriptionChunkMode, setTranscriptionChunkMode] = useState(
    localStorage.getItem('ireport_call_transcription_chunk_mode') || '30',
  );

  const saveCallWebUrl = useCallback(() => {
    const normalized = callWebUrl.trim().replace(/\/+$/, '');
    if (!normalized) return;
    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Call web URL must use http/https');
      }
    } catch {
      setCallDraftStatus('Error: Invalid call web base URL');
      return;
    }
    localStorage.setItem('ireport_call_web_url', normalized);
    setCallWebUrl(normalized);
    setCallDraftStatus('Call web URL saved.');
  }, [callWebUrl]);

  const saveTranscriptionLanguage = useCallback((language: string) => {
    setTranscriptionLanguage(language);
    localStorage.setItem('ireport_call_transcription_language', language);
  }, []);

  const saveTranscriptionChunkMode = useCallback((mode: string) => {
    setTranscriptionChunkMode(mode);
    localStorage.setItem('ireport_call_transcription_chunk_mode', mode);
  }, []);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  );

  // LiveKit voice integration
  const liveKit = useLiveKitRoom({
    serverUrl: 'wss://ireport-call-lxjaryqm.livekit.cloud',
    tokenUrl: 'https://call.ochana0101.click/token',
    roomName: selectedSession?.room || '',
    role: 'receiver',
  });

  const selectedOwnedByOther = useMemo(() => {
    if (!selectedSession?.receiver_user_id) return false;
    if (!currentUserId) return false;
    return String(selectedSession.receiver_user_id) !== currentUserId;
  }, [selectedSession?.receiver_user_id, currentUserId]);

  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const rows = await window.api.listCallSessions({
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 100,
      });
      const normalized = Array.isArray(rows) ? rows : [];
      setSessions(normalized);

      if (normalized.length === 0) {
        setSelectedSessionId('');
        setTranscripts([]);
      } else if (!normalized.some((row) => row.id === selectedSessionId)) {
        setSelectedSessionId(normalized[0].id);
      }
    } catch (error: any) {
      console.error('Failed to load call sessions:', error);
    }
    setLoadingSessions(false);
  }, [selectedSessionId, statusFilter]);

  const refreshTranscripts = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setTranscripts([]);
      return;
    }

    setLoadingTranscripts(true);
    try {
      const rows = await window.api.listCallTranscripts({ sessionId });
      setTranscripts(Array.isArray(rows) ? rows : []);
    } catch (error: any) {
      console.error('Failed to load call transcripts:', error);
    }
    setLoadingTranscripts(false);
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!selectedSessionId) return;
    refreshTranscripts(selectedSessionId);
  }, [selectedSessionId, refreshTranscripts]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshSessions();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [refreshSessions]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const timer = window.setInterval(() => {
      refreshTranscripts(selectedSessionId);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [selectedSessionId, refreshTranscripts]);

  const transcriberRef = useRef<ChunkedTranscriber | null>(null);

  useEffect(() => {
    if (!selectedSessionId || !selectedSession?.room || selectedSession.status !== 'active' || !liveKit.remoteAudioTrack) {
      setLiveTranscriptionStatus('');
      transcriberRef.current = null;
      return;
    }

    const stream = new MediaStream([liveKit.remoteAudioTrack]);
    const transcriber = new ChunkedTranscriber({
      stream,
      label: 'Resident',
      apiBaseUrl: callWebUrl,
      intervalMs: transcriptionChunkMode === 'end' ? undefined : Number(transcriptionChunkMode) * 1000,
      flushOnlyOnStop: transcriptionChunkMode === 'end',
      language: transcriptionLanguage,
      onText: async (text) => {
        try {
          await window.api.addCallTranscriptLine({
            sessionId: selectedSessionId,
            room: selectedSession.room,
            speaker: 'caller',
            text,
          });
          await refreshTranscripts(selectedSessionId);
          setTranscriptOpen(true);
          setLiveTranscriptionStatus('Live transcription active');
        } catch (error: any) {
          setLiveTranscriptionStatus(`Live transcription save failed: ${error?.message || 'unknown error'}`);
        }
      },
      onError: (message) => {
        setLiveTranscriptionStatus(message);
      },
    });

    transcriber.start();
    transcriberRef.current = transcriber;
    setLiveTranscriptionStatus('Live transcription active');

    return () => {
      transcriber.stop();
      if (transcriberRef.current === transcriber) {
        transcriberRef.current = null;
      }
    };
  }, [
    selectedSessionId,
    selectedSession?.room,
    selectedSession?.status,
    liveKit.remoteAudioTrack,
    callWebUrl,
    transcriptionLanguage,
    transcriptionChunkMode,
    refreshTranscripts,
  ]);

  // Full-call mixed-audio recorder (resident remote + admin local mic).
  // Mirrors the ireport-call-test prototype's playbackRecorder so dispatchers
  // can replay and download the call afterwards.
  const callRecorder = useCallRecorder({
    remoteTrack: liveKit.remoteAudioTrack,
    localTrack: liveKit.localAudioTrack,
    room: selectedSession?.room || '',
    active: selectedSession?.status === 'active',
  });

  // Disconnect LiveKit when switching away from active call
  useEffect(() => {
    return () => {
      liveKit.disconnect();
    };
  }, [selectedSessionId]);

  const updateStatus = async (status: CallSessionStatus) => {
    if (!selectedSessionId) return;
    if (!currentUserId) {
      console.warn('[Calls] currentUserId missing. sessionScope:', sessionScope);
      setCallDraftStatus('Error: Missing current user identity. Make sure you are logged in.');
      return;
    }
    if (status === 'active' && selectedOwnedByOther) {
      setCallDraftStatus('Error: This call is already claimed by another dispatcher.');
      return;
    }
    setBusyStatus(status);
    try {
      await window.api.updateCallSessionStatus({
        sessionId: selectedSessionId,
        status,
        receiverUserId: currentUserId,
      });
      await refreshSessions();

      // Connect/disconnect LiveKit voice
      if (status === 'active') {
        liveKit.connect();
      } else if (status === 'ended' || status === 'cancelled' || status === 'failed') {
        // Force-flush any buffered audio so the dispatcher gets the tail end
        // of the conversation regardless of chunk-window length.
        try { transcriberRef.current?.flush(); } catch {}
        liveKit.disconnect();
      }
    } catch (error: any) {
      setCallDraftStatus(`Error: ${error.message || 'Failed to update call status'}`);
    }
    setBusyStatus('');
  };

  const addDispatcherLine = async () => {
    if (!selectedSessionId || !dispatcherLine.trim()) return;

    setSendingLine(true);
    try {
      await window.api.addCallTranscriptLine({
        sessionId: selectedSessionId,
        room: selectedSession?.room,
        speaker: 'dispatcher',
        text: dispatcherLine.trim(),
      });
      setDispatcherLine('');
      await refreshTranscripts(selectedSessionId);
    } catch (error: any) {
      setCallDraftStatus(`Error: ${error.message || 'Failed to append transcript line'}`);
    }
    setSendingLine(false);
  };

  const summarizeSelectedSession = async () => {
    if (!selectedSessionId) return;

    setSummarizing(true);
    setCallDraftStatus('');
    setCallSummaryDraft(null);
    try {
      const transcriptResult = await window.api.getCallTranscriptText({ sessionId: selectedSessionId });
      const transcript = String(transcriptResult?.transcript || '').trim();
      if (!transcript) {
        throw new Error('No transcript available yet for this session');
      }

      const metadata = selectedSession?.metadata || {};
      const summaryResponse = await window.api.summarizeCallTranscript({
        transcript,
        reporter_name: metadata?.reporter_name || 'Anonymous',
        reporter_phone: metadata?.reporter_phone || '',
        incident_location: metadata?.incident_location || '',
        reporter_location: metadata?.reporter_location || '',
      });

      const summary = summaryResponse?.summary ?? summaryResponse?.result;
      if (!summary || typeof summary !== 'object') {
        throw new Error('Invalid summary response from AI worker');
      }

      setCallSummaryDraft(summary as CallDraftSummary);
      setCallDraftStatus('Draft summary generated. Review and create incident when ready.');
    } catch (error: any) {
      setCallDraftStatus(`Error: ${error.message || 'Failed to summarize call session'}`);
    }
    setSummarizing(false);
  };

  const createIncidentFromDraft = async () => {
    if (!selectedSession || !callSummaryDraft) return;

    setCreatingIncident(true);
    setCallDraftStatus('');
    try {
      const metadata = selectedSession?.metadata || {};
      const ageInputNum = Number(reporterAgeInput);
      const reporterAge = Number.isFinite(ageInputNum) && ageInputNum >= 13 && ageInputNum <= 120
        ? Math.floor(ageInputNum)
        : undefined;

      // Prefer dispatcher's manual lat/lon override; fall back to whatever
      // the resident's mobile app stashed in the call session metadata.
      const parseCoord = (v: unknown): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const dispatchedLat = parseCoord(incidentLatInput);
      const dispatchedLon = parseCoord(incidentLonInput);
      const incidentLatitude = dispatchedLat ?? parseCoord(metadata?.incident_latitude);
      const incidentLongitude = dispatchedLon ?? parseCoord(metadata?.incident_longitude);
      const reporterLatitude = parseCoord(metadata?.reporter_latitude);
      const reporterLongitude = parseCoord(metadata?.reporter_longitude);

      const response = await window.api.createIncidentFromCallDraft({
        summary: callSummaryDraft,
        reporter_id: selectedSession.caller_user_id || undefined,
        reporter_name: metadata?.reporter_name || 'Anonymous',
        reporter_phone: metadata?.reporter_phone || '',
        reporter_age: reporterAge,
        incident_latitude: incidentLatitude,
        incident_longitude: incidentLongitude,
        reporter_latitude: reporterLatitude,
        reporter_longitude: reporterLongitude,
        location_address: metadata?.incident_location || '',
      });

      const incidentId = response?.incident?.id;
      if (!incidentId) {
        throw new Error('Incident created but no ID returned');
      }

      setCallDraftStatus(`Incident created: ${incidentId}`);
      navigate(`/incidents/${incidentId}`);
    } catch (error: any) {
      setCallDraftStatus(`Error: ${error.message || 'Failed to create incident from call draft'}`);
    }
    setCreatingIncident(false);
  };

  const openVoiceBridge = async () => {
    if (!selectedSession?.room) return;
    const url = `${callWebUrl}/livekit-receiver.html?room=${encodeURIComponent(selectedSession.room)}`;
    try {
      await window.api.openExternal(url);
    } catch (error: any) {
      setCallDraftStatus(`Error: ${error.message || 'Failed to open voice bridge'}`);
    }
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      if (!value.trim()) return;
      await navigator.clipboard.writeText(value);
      setCallDraftStatus(successMessage);
    } catch {
      setCallDraftStatus('Error: Failed to copy to clipboard');
    }
  };

  const copyRoomId = async () => {
    if (!selectedSession?.room) return;
    await copyToClipboard(selectedSession.room, `Room copied: ${selectedSession.room}`);
  };

  const copyResidentBridgeLink = async () => {
    if (!selectedSession?.room) return;
    const url = `${callWebUrl}/livekit-caller.html?room=${encodeURIComponent(selectedSession.room)}`;
    await copyToClipboard(url, 'Resident voice link copied');
  };

  const copyAdminBridgeLink = async () => {
    if (!selectedSession?.room) return;
    const url = `${callWebUrl}/livekit-receiver.html?room=${encodeURIComponent(selectedSession.room)}`;
    await copyToClipboard(url, 'Admin voice link copied');
  };

  // Active call state
  const activeCall = useMemo(() => {
    if (!selectedSession) return null;
    const isIncoming = selectedSession.status === 'initiated' || selectedSession.status === 'ringing';
    const isActive = selectedSession.status === 'active';
    const isEnded = selectedSession.status === 'ended' || selectedSession.status === 'cancelled' || selectedSession.status === 'failed';
    return { session: selectedSession, isIncoming, isActive, isEnded };
  }, [selectedSession]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Emergency Calls</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Incoming calls appear here — accept to assist the caller
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as CallSessionStatus | 'all')}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm"
            onClick={refreshSessions}
          >
            {loadingSessions ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Session list sidebar */}
        <div className="w-72 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Calls ({sessions.length})
          </div>
          <div className="flex-1 overflow-auto">
            {sessions.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center mt-8">
                No calls yet. When a resident starts a call, it appears here.
              </div>
            ) : (
              sessions.map((session) => {
                const isSelected = selectedSessionId === session.id;
                const isIncoming = session.status === 'initiated' || session.status === 'ringing';
                const isActive = session.status === 'active';
                const cls = isSelected
                  ? 'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500'
                  : 'border-l-2 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800';

                return (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 ${cls}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">
                        {callerLabel(session.metadata)}
                      </span>
                      <span
                        className={`ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
                          isIncoming
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                            : isActive
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        }`}
                      >
                        {session.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                      <span>{callerPhone(session.metadata)}</span>
                      <span>{fmt(session.created_at)}</span>
                    </div>
                    {isActive && (
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        Call in progress
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
          {!activeCall ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a call or wait for an incoming emergency call</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Call status banner */}
              <div
                className={`px-6 py-4 text-center ${
                  activeCall.isIncoming
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800'
                    : activeCall.isActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-200 dark:border-emerald-800'
                      : 'bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {activeCall.isIncoming ? 'Incoming Call' : activeCall.isActive ? 'Connected' : 'Call Ended'}
                </div>
                {activeCall.isActive && (
                  <div className="text-lg text-gray-600 dark:text-gray-400 font-mono mt-1">
                    {elfmt(activeCall.session.started_at)}
                  </div>
                )}
                {selectedOwnedByOther && !activeCall.isEnded && (
                  <div className="mt-2 text-sm text-red-600 dark:text-red-400 font-medium">
                    Handled by another dispatcher
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="px-6 py-4 flex items-center justify-center gap-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                {activeCall.isIncoming && (
                  <>
                    <button
                      className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-green-600 text-white text-lg font-semibold disabled:opacity-50 shadow-lg hover:bg-green-700 transition-colors"
                      onClick={() => updateStatus('active')}
                      disabled={busyStatus !== '' || selectedOwnedByOther}
                    >
                      {busyStatus === 'active' ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <PhoneCall className="w-6 h-6" />
                      )}
                      Accept
                    </button>
                    <button
                      className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-red-600 text-white text-lg font-semibold disabled:opacity-50 shadow-lg hover:bg-red-700 transition-colors"
                      onClick={() => updateStatus('cancelled')}
                      disabled={busyStatus !== ''}
                    >
                      {busyStatus === 'cancelled' ? <Loader2 className="w-6 h-6 animate-spin" /> : <PhoneOff className="w-6 h-6" />}
                      Decline
                    </button>
                  </>
                )}
                {activeCall.isActive && (
                  <>
                    <button
                      className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-amber-600 text-white text-lg font-semibold disabled:opacity-50 shadow-lg hover:bg-amber-700 transition-colors"
                      onClick={() => updateStatus('ended')}
                      disabled={busyStatus !== ''}
                    >
                      {busyStatus === 'ended' ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <PhoneOff className="w-6 h-6" />
                      )}
                      End Call
                    </button>
                    <button
                      className="inline-flex items-center gap-2 px-6 py-4 rounded-full border-2 border-teal-500 text-teal-700 dark:text-teal-300 font-semibold"
                      onClick={openVoiceBridge}
                    >
                      Open Voice Bridge
                    </button>
                  </>
                )}
                {activeCall.isEnded && (
                  <button
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-lg font-semibold"
                    onClick={() => setSelectedSessionId('')}
                  >
                    <Phone className="w-6 h-6" />
                    Clear
                  </button>
                )}
              </div>

              {/* LiveKit audio controls */}
              {activeCall.isActive && (
                <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {liveKit.connecting ? (
                        <span className="text-sm text-amber-600 flex items-center gap-1">
                          <Loader2 className="w-4 h-4 animate-spin" /> Connecting voice...
                        </span>
                      ) : liveKit.connected ? (
                        <span className="text-sm text-emerald-600 flex items-center gap-1">
                          <Radio className="w-4 h-4" /> Voice connected{liveKit.participants > 0 ? ` • ${liveKit.participants} participant${liveKit.participants > 1 ? 's' : ''}` : ''}
                        </span>
                      ) : liveKit.error ? (
                        <span className="text-sm text-red-600">Voice error: {liveKit.error}</span>
                      ) : (
                        <span className="text-sm text-gray-500">Voice not connected</span>
                      )}
                    </div>
                    {liveKit.connected && (
                      <button
                        onClick={liveKit.toggleMute}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${
                          liveKit.isMuted
                            ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {liveKit.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {liveKit.isMuted ? 'Unmute' : 'Mute'}
                      </button>
                    )}
                  </div>

                  {liveTranscriptionStatus && (
                    <div className={`text-xs ${liveTranscriptionStatus.includes('failed') || liveTranscriptionStatus.includes('not supported') ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {liveTranscriptionStatus}
                    </div>
                  )}

                  {/* Transcription controls (chunk length + language) */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-gray-500 dark:text-gray-400 block mb-1">Transcribe every</label>
                      <select
                        className="w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        value={transcriptionChunkMode}
                        onChange={(event) => saveTranscriptionChunkMode(event.target.value)}
                      >
                        <option value="15">15 seconds (low latency)</option>
                        <option value="30">30 seconds (recommended)</option>
                        <option value="45">45 seconds</option>
                        <option value="60">60 seconds</option>
                        <option value="90">90 seconds</option>
                        <option value="120">2 minutes</option>
                        <option value="end">Wait until call ends (best accuracy)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-500 dark:text-gray-400 block mb-1">Language</label>
                      <select
                        className="w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        value={transcriptionLanguage}
                        onChange={(event) => saveTranscriptionLanguage(event.target.value)}
                      >
                        <option value="multi">Filipino + English (recommended)</option>
                        <option value="tl">Filipino / Tagalog only</option>
                        <option value="en">English only</option>
                        <option value="auto">Auto-detect (Whisper)</option>
                      </select>
                    </div>
                  </div>

                  {/* Audio device controls */}
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-gray-500 dark:text-gray-400 block mb-1">Mic</label>
                      <select
                        className="w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        value={liveKit.selectedInput}
                        onChange={(e) => liveKit.setInputDevice(e.target.value)}
                        onClick={liveKit.refreshDevices}
                      >
                        <option value="">Default</option>
                        {liveKit.audioInputs.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-500 dark:text-gray-400 block mb-1">Speaker</label>
                      <select
                        className="w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        value={liveKit.selectedOutput}
                        onChange={(e) => liveKit.setOutputDevice(e.target.value)}
                        onClick={liveKit.refreshDevices}
                      >
                        <option value="">Default</option>
                        {liveKit.audioOutputs.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-500 dark:text-gray-400 block mb-1">
                        Volume ({Math.round(liveKit.volume * 100)}%)
                      </label>
                      <div className="flex items-center gap-1">
                        {liveKit.volume === 0 ? (
                          <VolumeX className="w-3 h-3 text-gray-400" />
                        ) : (
                          <Volume2 className="w-3 h-3 text-gray-400" />
                        )}
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={liveKit.volume}
                          onChange={(e) => liveKit.changeVolume(parseFloat(e.target.value))}
                          className="flex-1 h-1 accent-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/*
                    Audio element is now owned by useLiveKitRoom (it calls
                    track.attach() so the WebRTC receiver actually decodes audio,
                    which is required for the ChunkedTranscriber MediaRecorder
                    to capture real samples). Volume + sink are forwarded by the
                    hook. Do not render another <audio> here.
                  */}
                </div>
              )}

              {/* Status/error messages */}
              {callDraftStatus && callDraftStatus.startsWith('Error:') && (
                <div className="px-6 py-2 text-sm text-center text-red-600">
                  {callDraftStatus}
                </div>
              )}

              {/* Reporter info */}
              <div className="px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Caller</span>
                    <div className="font-medium text-gray-900 dark:text-white">{callerLabel(activeCall.session.metadata)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Phone</span>
                    <div className="font-medium text-gray-900 dark:text-white">{callerPhone(activeCall.session.metadata)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Location</span>
                    <div className="font-medium text-gray-900 dark:text-white">{callerLocation(activeCall.session.metadata)}</div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-4">
                {/* Call recording — full mixed audio (resident + admin), playable + downloadable */}
                {(callRecorder.recording || callRecorder.recordingUrl) && (
                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Disc className={`w-4 h-4 ${callRecorder.recording ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
                        Call Recording
                        {callRecorder.recording && (
                          <span className="text-xs text-red-600 font-normal">Recording…</span>
                        )}
                      </div>
                      {callRecorder.recordingUrl && !callRecorder.recording && (
                        <a
                          href={callRecorder.recordingUrl}
                          download={`call-${selectedSession?.room || 'recording'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <Download className="w-3 h-3" />
                          Download
                          {callRecorder.recordingSize > 0 && ` (${Math.round(callRecorder.recordingSize / 1024)} KB)`}
                        </a>
                      )}
                    </div>
                    {callRecorder.recordingUrl ? (
                      <audio
                        controls
                        src={callRecorder.recordingUrl}
                        className="w-full"
                        preload="metadata"
                      />
                    ) : (
                      <div className="text-xs text-gray-500">Audio will appear here when the call ends.</div>
                    )}
                    {callRecorder.error && (
                      <div className="text-xs text-amber-600">{callRecorder.error}</div>
                    )}
                  </div>
                )}

                {/* Call notes / Transcript */}
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900">
                  <button
                    className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 rounded-t-xl"
                    onClick={() => setTranscriptOpen(!transcriptOpen)}
                  >
                    <span>Call Notes ({transcripts.length} lines)</span>
                    {transcriptOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {transcriptOpen && (
                    <div className="px-4 pb-3 space-y-2">
                      <div className="h-48 overflow-auto border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-gray-950 text-sm">
                        {loadingTranscripts && <Loader2 className="w-4 h-4 animate-spin text-gray-500 mx-auto" />}
                        {!loadingTranscripts && transcripts.length === 0 && (
                          <div className="text-gray-500">No transcript lines yet.</div>
                        )}
                        {transcripts.map((line) => (
                          <div key={line.id || `${line.created_at}-${line.text}`}>
                            <span className="uppercase text-[10px] tracking-wide text-gray-500 mr-2">{line.speaker || 'caller'}</span>
                            <span className="text-gray-800 dark:text-gray-200">{line.text}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900"
                          placeholder="Add a note..."
                          value={dispatcherLine}
                          onChange={(event) => setDispatcherLine(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') addDispatcherLine();
                          }}
                        />
                        <button
                          className="px-3 py-2 rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 text-sm disabled:opacity-60"
                          onClick={addDispatcherLine}
                          disabled={!selectedSessionId || !dispatcherLine.trim() || sendingLine}
                        >
                          {sendingLine ? 'Sending...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Draft — secondary, post-call focused */}
                {(activeCall.isActive || activeCall.isEnded || transcripts.length > 0) && (
                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">AI Incident Draft</div>
                      <div className="flex gap-2">
                        <button
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-60"
                          onClick={summarizeSelectedSession}
                          disabled={!selectedSessionId || summarizing}
                        >
                          {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          Generate Draft
                        </button>
                        <button
                          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-60"
                          onClick={createIncidentFromDraft}
                          disabled={!callSummaryDraft || creatingIncident}
                        >
                          {creatingIncident ? 'Creating...' : 'Create Incident'}
                        </button>
                      </div>
                    </div>

                    {callSummaryDraft && (
                      <div className="text-sm border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-gray-50 dark:bg-gray-950 space-y-2">
                        <div><span className="text-gray-500">Agency:</span> {callSummaryDraft.recommended_agency || 'mdrrmo'}</div>
                        <div><span className="text-gray-500">Severity:</span> {callSummaryDraft.severity ?? '—'}</div>
                        <div className="whitespace-pre-wrap">{callSummaryDraft.description || 'No description generated.'}</div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <label className="text-xs text-gray-500">Reporter age:</label>
                          <input
                            type="number"
                            min={13}
                            max={120}
                            placeholder="13–120"
                            value={reporterAgeInput}
                            onChange={(event) => setReporterAgeInput(event.target.value)}
                            className="w-24 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900"
                          />
                          <span className="text-[11px] text-gray-400">defaults to 18 if blank</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-xs text-gray-500">Incident location:</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="Lat (e.g. 14.1124)"
                            value={incidentLatInput}
                            onChange={(event) => setIncidentLatInput(event.target.value)}
                            className="w-32 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900"
                          />
                          <input
                            type="number"
                            step="any"
                            placeholder="Lon (e.g. 122.9550)"
                            value={incidentLonInput}
                            onChange={(event) => setIncidentLonInput(event.target.value)}
                            className="w-36 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900"
                          />
                          <span className="text-[11px] text-gray-400">
                            defaults to reporter GPS, then Daet centroid
                          </span>
                        </div>
                      </div>
                    )}

                    {callDraftStatus && (
                      <div className={`text-sm ${callDraftStatus.startsWith('Error:') ? 'text-red-600' : 'text-emerald-600'}`}>
                        {callDraftStatus}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced / Troubleshooting panel */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          className="w-full px-6 py-2 flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          <Settings className="w-3 h-3" />
          {advancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Advanced / Troubleshooting
        </button>
        {advancedOpen && (
          <div className="px-6 pb-4 space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Call Web Base URL</div>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900"
                  value={callWebUrl}
                  onChange={(event) => setCallWebUrl(event.target.value)}
                  onBlur={saveCallWebUrl}
                  placeholder="https://ireport-call-test.onrender.com"
                />
                <button
                  className="px-3 py-2 rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 text-sm"
                  onClick={saveCallWebUrl}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              Dispatcher ID: {currentUserId || 'Not available'}
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Live Transcription Language</div>
              <select
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900"
                value={transcriptionLanguage}
                onChange={(event) => saveTranscriptionLanguage(event.target.value)}
              >
                <option value="multi">Filipino / English auto-detect</option>
                <option value="tl">Filipino / Tagalog</option>
                <option value="en">English</option>
              </select>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Live Transcription Chunk Time</div>
              <select
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900"
                value={transcriptionChunkMode}
                onChange={(event) => saveTranscriptionChunkMode(event.target.value)}
              >
                <option value="15">Every 15 seconds (low latency)</option>
                <option value="30">Every 30 seconds (recommended)</option>
                <option value="45">Every 45 seconds</option>
                <option value="60">Every 60 seconds</option>
                <option value="90">Every 90 seconds</option>
                <option value="120">Every 2 minutes</option>
                <option value="end">Wait until call ends (best accuracy)</option>
              </select>
            </div>

            {activeCall && (
              <div className="flex flex-wrap gap-2">
                <button
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs"
                  onClick={copyRoomId}
                >
                  Copy Room ID
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs"
                  onClick={copyResidentBridgeLink}
                >
                  Copy Resident Link
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs"
                  onClick={copyAdminBridgeLink}
                >
                  Copy Admin Link
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
