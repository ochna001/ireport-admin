export interface ChunkedTranscriberOptions {
  stream: MediaStream;
  label: string;
  apiBaseUrl: string;
  intervalMs?: number;
  language?: string;
  minBytes?: number;
  flushOnlyOnStop?: boolean;
  onText: (text: string, label: string) => void;
  onError?: (err: string) => void;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return undefined;
}

function transcribeUrl(apiBaseUrl: string, label: string, language?: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({ label });
  // Whisper auto-detect is unreliable on short, noisy emergency clips and often
  // misfires (e.g. mistakes Tagalog for Indonesian/Portuguese). For an app whose
  // UI says "Filipino / English auto-detect", biasing to "tl" gives the best
  // real-world accuracy — Whisper still handles English code-switching fine
  // when language=tl is set. Use "" / "auto" only if the caller really wants
  // unbiased detection.
  const raw = (language ?? '').trim().toLowerCase();
  // 'auto' = unbiased Whisper auto-detect (omit language). 'multi' / 'fil' /
  // 'tagalog' / blank = bias to Tagalog because Whisper auto-detect misfires
  // badly on short, noisy emergency audio.
  if (raw === 'auto') {
    return `${base}/transcribe?${params.toString()}`;
  }
  const filipinoBias = new Set(['', 'multi', 'multilingual', 'fil', 'fil-ph', 'filipino', 'tagalog', 'tl-ph']);
  const aliases: Record<string, string> = {
    'en-us': 'en',
    english: 'en',
  };
  if (filipinoBias.has(raw)) {
    params.set('language', 'tl');
  } else {
    params.set('language', aliases[raw] ?? raw);
  }
  return `${base}/transcribe?${params.toString()}`;
}

function transcribeUrlCandidates(apiBaseUrl: string, label: string, language?: string): string[] {
  const primary = transcribeUrl(apiBaseUrl, label, language);
  const candidates = [primary];
  const fallbackApiBase = 'https://call.ochana0101.click';
  const fallback = transcribeUrl(fallbackApiBase, label, language);
  if (!candidates.includes(fallback)) candidates.push(fallback);
  return candidates;
}

export class ChunkedTranscriber {
  private recorder?: MediaRecorder;
  private timer?: number;
  private mimeType: string | undefined;
  private stopped = false;
  private forceFlushOnStop = false;

  constructor(private options: ChunkedTranscriberOptions) {
    this.mimeType = pickMimeType();
  }

  start(): void {
    if (!this.mimeType) {
      this.options.onError?.('Live transcription is not supported by this browser.');
      return;
    }
    this.stopped = false;
    this.startRecorder();
    if (this.options.flushOnlyOnStop) return;
    this.timer = window.setInterval(() => this.cycle(), this.options.intervalMs ?? 30000);
  }

  /**
   * Force-finalise the current chunk and transcribe it regardless of size.
   * Use this when a call is forcibly ended so the dispatcher still gets the
   * tail end of the conversation. Subsequent audio (if `start()` is called
   * again later) starts a fresh recorder.
   */
  flush(): void {
    this.forceFlushOnStop = true;
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch {}
    }
    if (!this.stopped) this.startRecorder();
  }

  stop(): void {
    this.stopped = true;
    this.forceFlushOnStop = true;
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch {}
    }
  }

  private cycle(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch {}
    }
    if (!this.stopped) this.startRecorder();
  }

  private startRecorder(): void {
    if (!this.mimeType) return;
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(this.options.stream, { mimeType: this.mimeType });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = () => {
      if (chunks.length === 0) {
        console.debug('[ChunkedTranscriber] no chunks captured this window', this.options.label);
        return;
      }
      const blob = new Blob(chunks, { type: this.mimeType });
      const minBytes = this.options.minBytes ?? 6000;
      if (!this.forceFlushOnStop && blob.size < minBytes) {
        console.debug(`[ChunkedTranscriber] ${this.options.label} chunk too small (${blob.size}B < ${minBytes}B), skipping`);
        return;
      }
      this.forceFlushOnStop = false;
      console.debug(`[ChunkedTranscriber] ${this.options.label} sending ${blob.size}B (${this.mimeType})`);
      void this.send(blob);
    };

    recorder.onerror = (event) => {
      this.options.onError?.(`Live transcription recorder error: ${(event as any)?.error?.message ?? 'unknown'}`);
    };

    recorder.start();
    this.recorder = recorder;
  }

  private async send(blob: Blob): Promise<void> {
    let lastError = '';
    for (const url of transcribeUrlCandidates(this.options.apiBaseUrl, this.options.label, this.options.language)) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'audio/webm' },
          body: blob,
        });
        if (!response.ok) {
          const body = await response.text();
          lastError = `Live transcription failed (${response.status}): ${body.slice(0, 200)}`;
          continue;
        }
        const data = await response.json() as { text?: string };
        const text = String(data.text || '').trim();
        if (text) {
          this.options.onText(text, this.options.label);
        } else {
          console.debug(`[ChunkedTranscriber] ${this.options.label} got 200 but empty text from`, new URL(url).origin);
        }
        return;
      } catch (error: any) {
        lastError = `Live transcription failed at ${new URL(url).origin}: ${error?.message || 'unknown error'}`;
      }
    }
    this.options.onError?.(lastError || 'Live transcription failed');
  }
}
