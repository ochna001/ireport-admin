export type AgencyKey = 'pnp' | 'bfp' | 'mdrrmo' | 'awaiting';

export interface AgencyPresentation {
  key: AgencyKey;
  isApproved: boolean;
  shortLabel: string;
  fullLabel: string;
  markerColor: string;
  badgeClass: string;
}

export function normalizeAgency(value?: string | null): AgencyKey {
  const agency = String(value || '').trim().toLowerCase();
  if (agency === 'pnp' || agency === 'bfp' || agency === 'mdrrmo') return agency;
  if (agency === 'pdrrmo') return 'mdrrmo';
  return 'awaiting';
}

export function getAgencyPresentation(value?: string | null): AgencyPresentation {
  switch (normalizeAgency(value)) {
    case 'pnp':
      return {
        key: 'pnp',
        isApproved: true,
        shortLabel: 'PNP',
        fullLabel: 'Philippine National Police',
        markerColor: '#2563eb',
        badgeClass: 'bg-blue-600 text-white',
      };
    case 'bfp':
      return {
        key: 'bfp',
        isApproved: true,
        shortLabel: 'BFP',
        fullLabel: 'Bureau of Fire Protection',
        markerColor: '#dc2626',
        badgeClass: 'bg-red-600 text-white',
      };
    case 'mdrrmo':
      return {
        key: 'mdrrmo',
        isApproved: true,
        shortLabel: 'MDRRMO',
        fullLabel: 'Municipal Disaster Risk Reduction Management Office',
        markerColor: '#0891b2',
        badgeClass: 'bg-cyan-600 text-white',
      };
    default:
      return {
        key: 'awaiting',
        isApproved: false,
        shortLabel: 'Agency not assigned',
        fullLabel: 'Agency assignment pending',
        markerColor: '#475569',
        badgeClass: 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800',
      };
  }
}
