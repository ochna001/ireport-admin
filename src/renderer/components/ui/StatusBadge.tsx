import { getIncidentStatus } from '../../utils/incidentStatus';

interface StatusBadgeProps {
  status?: string | null;
  className?: string;
}

/**
 * Single source of truth for incident status color/label — reads from
 * utils/incidentStatus.ts only. Replaces the parallel STATUS_OPTIONS map
 * that used to live inside IncidentDetail.tsx and could drift out of sync.
 */
export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const info = getIncidentStatus(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${info.badge} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
      {info.label}
    </span>
  );
}

export default StatusBadge;
