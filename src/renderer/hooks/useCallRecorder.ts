import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Records the full call audio by mixing the resident remote track and the
 * admin's local mic into a single MediaRecorder, mirroring the
 * ireport-call-test prototype's `playbackRecorder` pipeline.
 *
 * Output is exposed as a Blob URL ready for an <audio controls> element and
 * a download anchor. The most recent recording is persisted to localStorage
 * (per-room) as a data URL so dispatchers can replay/download even after the
 * call panel re-mounts.
 */

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

const lastRecordingKey = (room: string) => `ireport_call_recording_${room || 'unknown'}`;

const pickMime = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
};

interface UseCallRecorderOptions {
  /** LiveKit remote (resident) audio track, after `track.attach()` has been called. */
  remoteTrack: MediaStreamTrack | null;
  /** LiveKit local (admin) mic track. Optional — if missing, only resident audio is captured. */
  localTrack: MediaStreamTrack | null;
  /** Room id, used as the localStorage key for persistence. */
  room: string;
  /** When false, any in-progress recording is stopped and finalised. */
  active: boolean;
}

export function useCallRecorder({ remoteTrack, localTrack, room, active }: UseCallRecorderOptions) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const remoteSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const localSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingMime, setRecordingMime] = useState<string | undefined>(undefined);
  const [recordingSize, setRecordingSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load any previously persisted recording for this room
  useEffect(() => {
    if (!room) return;
    try {
      const dataUrl = localStorage.getItem(lastRecordingKey(room));
      if (dataUrl) {
        setRecordingUrl(dataUrl);
      } else {
        setRecordingUrl(null);
      }
    } catch {
      setRecordingUrl(null);
    }
    setRecordingSize(0);
  }, [room]);

  const persistToStorage = useCallback(async (blob: Blob, key: string) => {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      localStorage.setItem(key, dataUrl);
    } catch {
      // localStorage may be full — non-fatal, blob URL still works for this session.
    }
  }, []);

  const teardownGraph = useCallback(() => {
    try { remoteSrcRef.current?.disconnect(); } catch {}
    try { localSrcRef.current?.disconnect(); } catch {}
    remoteSrcRef.current = null;
    localSrcRef.current = null;
    try { destRef.current?.disconnect(); } catch {}
    destRef.current = null;
    try { ctxRef.current?.close(); } catch {}
    ctxRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (recorderRef.current) return;
    if (!remoteTrack && !localTrack) {
      setError('No audio tracks available to record');
      return;
    }
    const mime = pickMime();
    if (!mime) {
      setError('Recording is not supported by this browser');
      return;
    }
    setError(null);
    mimeRef.current = mime;
    chunksRef.current = [];

    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    ctxRef.current = ctx;
    destRef.current = dest;

    if (remoteTrack) {
      try {
        const stream = new MediaStream([remoteTrack]);
        const src = ctx.createMediaStreamSource(stream);
        src.connect(dest);
        remoteSrcRef.current = src;
      } catch (err) {
        console.warn('[useCallRecorder] failed to wire remote track:', err);
      }
    }
    if (localTrack) {
      try {
        const stream = new MediaStream([localTrack]);
        const src = ctx.createMediaStreamSource(stream);
        src.connect(dest);
        localSrcRef.current = src;
      } catch (err) {
        console.warn('[useCallRecorder] failed to wire local track:', err);
      }
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(dest.stream, { mimeType: mime });
    } catch (err: any) {
      setError(`Recorder init failed: ${err?.message || 'unknown'}`);
      teardownGraph();
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      teardownGraph();
      setRecording(false);
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: mime });
      if (objectUrlRef.current) {
        try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
      }
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setRecordingUrl(url);
      setRecordingMime(mime);
      setRecordingSize(blob.size);
      if (room) void persistToStorage(blob, lastRecordingKey(room));
    };
    recorder.onerror = (event) => {
      setError(`Recorder error: ${(event as any)?.error?.message ?? 'unknown'}`);
    };

    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, [remoteTrack, localTrack, room, persistToStorage, teardownGraph]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    if (recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
  }, []);

  // Auto start/stop based on `active` and presence of any track
  useEffect(() => {
    if (active && (remoteTrack || localTrack)) {
      start();
    } else {
      stop();
    }
    return () => {
      // No teardown here — `stop()` runs on the next effect, and final cleanup
      // is in the unmount-only effect below to avoid stopping prematurely.
    };
  }, [active, remoteTrack, localTrack, start, stop]);

  // Unmount cleanup (revoke blob URLs, drop recorder)
  useEffect(() => {
    return () => {
      stop();
      if (objectUrlRef.current) {
        try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
        objectUrlRef.current = null;
      }
    };
  }, [stop]);

  /** Fetch the most recent recording (if any) as a Blob suitable for upload. */
  const getBlob = useCallback(async (): Promise<Blob | null> => {
    if (!recordingUrl) return null;
    try {
      const resp = await fetch(recordingUrl);
      return await resp.blob();
    } catch {
      return null;
    }
  }, [recordingUrl]);

  return {
    recording,
    recordingUrl,
    recordingMime,
    recordingSize,
    error,
    start,
    stop,
    getBlob,
  };
}
