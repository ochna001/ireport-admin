import { HelpCircle } from 'lucide-react';
import { getAgencyPresentation } from '../../utils/agencyPresentation';

interface AgencyBadgeProps {
  agency?: string | null;
  variant?: 'short' | 'full';
  className?: string;
}

/**
 * Single source of truth for agency color/label — reads from
 * utils/agencyPresentation.ts only.
 */
export function AgencyBadge({ agency, variant = 'short', className = '' }: AgencyBadgeProps) {
  const presentation = getAgencyPresentation(agency);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.badgeClass} ${className}`}>
      {!presentation.isApproved && <HelpCircle size={13} />}
      {variant === 'full' ? presentation.fullLabel : presentation.shortLabel}
    </span>
  );
}

export default AgencyBadge;
