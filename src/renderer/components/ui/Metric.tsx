import type { ReactNode } from 'react';

export type MetricTone = 'blue' | 'red' | 'amber' | 'emerald' | 'slate';

const TONE_CLASSES: Record<MetricTone, string> = {
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

interface MetricProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  tone?: MetricTone;
  onClick?: () => void;
  /** Marks a non-interactive metric so it doesn't imply it's clickable. */
  isStatic?: boolean;
}

/**
 * Reusable KPI tile — extracted from the Dashboard metric row so every page
 * (Users, Reports, StationDetailView) renders stat cards identically instead
 * of hand-rolling the same div structure with slightly different classes.
 */
export function Metric({ label, value, hint, icon, tone = 'slate', onClick, isStatic }: MetricProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`flex w-full items-center gap-3 rounded-xl border border-border-token bg-surface p-4 text-left ${
        onClick ? 'hover:border-blue-400 hover:shadow-sm' : ''
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
          {label}
          {isStatic && <span className="rounded bg-surface-subtle px-1 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-fg-subtle">static</span>}
        </span>
        <span className="block text-2xl font-bold text-fg-strong">{value}</span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
    </Tag>
  );
}

export default Metric;
