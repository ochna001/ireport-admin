import { AlertCircle, CheckCircle2, Clock3, Radio, Route, XCircle } from 'lucide-react';

export const INCIDENT_STATUSES = {
  pending: { label: 'Pending', badge: 'bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200', dot: 'bg-amber-500', icon: Clock3, active: true },
  received: { label: 'Received', badge: 'bg-sky-100 text-sky-900 dark:bg-sky-900/35 dark:text-sky-200', dot: 'bg-sky-500', icon: Radio, active: true },
  assigned: { label: 'Assigned', badge: 'bg-blue-100 text-blue-900 dark:bg-blue-900/35 dark:text-blue-200', dot: 'bg-blue-500', icon: Route, active: true },
  in_progress: { label: 'In progress', badge: 'bg-orange-100 text-orange-900 dark:bg-orange-900/35 dark:text-orange-200', dot: 'bg-orange-500', icon: AlertCircle, active: true },
  responding: { label: 'In progress', badge: 'bg-orange-100 text-orange-900 dark:bg-orange-900/35 dark:text-orange-200', dot: 'bg-orange-500', icon: AlertCircle, active: true },
  resolved: { label: 'Resolved', badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2, active: false },
  closed: { label: 'Closed', badge: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100', dot: 'bg-slate-500', icon: CheckCircle2, active: false },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-900 dark:bg-red-900/35 dark:text-red-200', dot: 'bg-red-500', icon: XCircle, active: false },
  cancelled: { label: 'Cancelled', badge: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100', dot: 'bg-slate-500', icon: XCircle, active: false },
} as const;

export type IncidentStatus = keyof typeof INCIDENT_STATUSES;

export function getIncidentStatus(status?: string | null) {
  return INCIDENT_STATUSES[(status || '').toLowerCase() as IncidentStatus] || {
    label: status ? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown',
    badge: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    dot: 'bg-slate-400',
    icon: AlertCircle,
    active: false,
  };
}

export const FILTERABLE_INCIDENT_STATUSES: IncidentStatus[] = [
  'pending', 'received', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected',
];
