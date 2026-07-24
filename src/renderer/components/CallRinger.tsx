import { useEffect, useRef, useState } from 'react';
import { ArrowRight, PhoneIncoming, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  active: boolean;
  muted: boolean;
  onUnmute: () => void;
}

export default function CallRinger({ active, muted, onUnmute }: Props) {
  const navigate = useNavigate();
  const ctxRef = useRef<AudioContext | null>(null);
  const osc1Ref = useRef<OscillatorNode | null>(null);
  const osc2Ref = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const startedRef = useRef(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!active || muted) {
      setBlocked(false);
      return;
    }

    let cancelled = false;
    let ctx: AudioContext | null = null;

    const start = async () => {
      try {
        ctx = new AudioContext();
        if (ctx.state === 'suspended') {
          await ctx.resume();
          if (ctx.state === 'suspended') {
            setBlocked(true);
            return;
          }
        }

        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);

        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 880;
        osc1.connect(gain);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 1100;
        osc2.connect(gain);

        const now = ctx.currentTime;
        const ringOn = 0.5;
        const ringGap = 0.25;
        const pause = 1.0;
        const cycle = ringOn + ringGap + ringOn + ringGap + pause;
        const TWO_MIN = 120;
        const cycles = Math.ceil(TWO_MIN / cycle);

        for (let i = 0; i < cycles && !cancelled; i++) {
          const base = now + i * cycle;

          gain.gain.setValueCurveAtTime(
            new Float32Array([0, 0.10, 0.10, 0]),
            base,
            ringOn,
          );
          gain.gain.setValueCurveAtTime(
            new Float32Array([0, 0, 0, 0]),
            base + ringOn,
            ringGap,
          );
          gain.gain.setValueCurveAtTime(
            new Float32Array([0, 0.10, 0.10, 0]),
            base + ringOn + ringGap,
            ringOn,
          );
          gain.gain.setValueCurveAtTime(
            new Float32Array([0, 0, 0, 0]),
            base + ringOn + ringGap + ringOn,
            ringGap + pause,
          );
        }

        osc1.start();
        osc2.start();
        ctxRef.current = ctx;
        osc1Ref.current = osc1;
        osc2Ref.current = osc2;
        gainRef.current = gain;
        startedRef.current = true;
        setBlocked(false);
      } catch {
        setBlocked(true);
      }
    };

    start();

    return () => {
      cancelled = true;
      try { osc1Ref.current?.stop(); osc1Ref.current?.disconnect(); } catch {}
      try { osc2Ref.current?.stop(); osc2Ref.current?.disconnect(); } catch {}
      try { gainRef.current?.disconnect(); } catch {}
      try { ctx?.close(); } catch {}
    };
  }, [active, muted]);

  if (!active) return null;

  const audioUnavailable = blocked || !startedRef.current || muted;

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-50 flex min-h-16 items-center justify-between gap-4 border-b border-red-800 bg-red-700 px-5 py-3 text-white shadow-lg"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
          <PhoneIncoming className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Incoming emergency call</p>
          <p className="text-sm text-red-100">
            Open the call queue to review caller details and respond.
            {audioUnavailable ? ' Audio alert is unavailable.' : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {audioUnavailable && (
          <button
            type="button"
            onClick={onUnmute}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/35 px-3 py-2 text-sm font-medium hover:bg-white/10"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            Enable sound
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/calls')}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Open calls
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
