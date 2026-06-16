import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface Props {
  active: boolean;
  muted: boolean;
  onUnmute: () => void;
}

export default function CallRinger({ active, muted, onUnmute }: Props) {
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

  if (blocked || !startedRef.current) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={onUnmute}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-sm font-medium shadow-lg animate-pulse"
        >
          <Volume2 className="w-4 h-4" />
          Enable call alerts
        </button>
      </div>
    );
  }

  if (muted) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={onUnmute}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs"
        >
          <VolumeX className="w-3 h-3" />
          Muted
        </button>
      </div>
    );
  }

  return null;
}
