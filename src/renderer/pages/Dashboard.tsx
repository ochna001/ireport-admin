import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, HelpCircle, Clock3, Flame,
  MapPin, RefreshCw, Shield, Siren, Timer, Users, Waves,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardMap } from '../components/DashboardMap';
import { getAgencyPresentation } from '../utils/agencyPresentation';
import { getIncidentStatus } from '../utils/incidentStatus';
import { getIncidentReference } from '../utils/incidentReference';
import { getSessionScope, isStationScoped, SessionScope } from '../utils/sessionScope';

interface QueueIncident {
  id: string;
  short_code?: string;
  incident_reference?: string | null;
  reference_year?: number | null;
  reference_number?: number | null;
  agency_type: string;
  status: string;
  description?: string;
  location_address?: string;
  created_at: string;
  age_minutes: number;
  is_unassigned: boolean;
  is_overdue: boolean;
  assigned_station_id?: number;
  casualties_count?: number;
  casualties_category?: string;
  ai_severity?: number;
}

interface Stats {
  total: number;
  pending: number;
  responding: number;
  resolved: number;
  active?: number;
  unassigned?: number;
  overdue?: number;
  casualtyAlerts?: number;
  activeQueue?: QueueIncident[];
  byAgency: Array<{ agency_type: string; count: number }>;
  recentActivity: Array<{ incident_id: string; incident_reference?: string | null; status: string; changed_by: string; changed_at: string; agency_type?: string | null }>;
  avgResponseTime?: number | null;
  multiAgencyCount?: number;
  _offline?: boolean;
  _error?: string;
}

const formatAge = (minutes: number) => minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d`;
const formatDuration = (minutes?: number | null) => minutes == null ? 'No data' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<SessionScope>({});
  const [workspaceTab, setWorkspaceTab] = useState<'queue' | 'map'>('queue');

  const loadStats = async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    try {
      const sessionScope = getSessionScope();
      setScope(sessionScope);
      const filters: Record<string, unknown> = {};
      if (sessionScope.role !== 'Admin') {
        if (sessionScope.stationId) filters.stationId = sessionScope.stationId;
        if (sessionScope.agencyShortName) filters.agency = sessionScope.agencyShortName.toLowerCase();
      }
      const data = await window.api.getStats(Object.keys(filters).length ? filters : undefined);
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load operations data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStats();
    const unsubscribe = window.api.onIncidentUpdated(() => loadStats(true));
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="min-h-full p-6" aria-label="Loading operations dashboard">
        <div className="mb-5 h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}</div>
        <div className="mt-5 h-80 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  const queue = (stats?.activeQueue || []).slice(0, 5);
  const attentionCount = (stats?.unassigned || 0) + (stats?.overdue || 0) + (stats?.casualtyAlerts || 0);
  const isDeskOfficer = scope.role === 'Desk Officer';
  const title = isDeskOfficer ? 'Dispatch workspace' : isStationScoped(scope) ? `${scope.stationName || 'Station'} operations` : 'Provincial operations';

  return (
    <div className="min-h-full bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            <span className={`h-2 w-2 rounded-full ${stats?._offline ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {stats?._offline ? 'Last available snapshot' : 'Live operations'}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {isDeskOfficer ? 'Triage new reports, assign response units, and monitor acknowledgements.' : 'Monitor workload, response readiness, and incidents requiring intervention.'}
          </p>
        </div>
        <button type="button" onClick={() => loadStats(true)} disabled={refreshing} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {(error || stats?._offline) && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <div><p className="font-semibold">Live data is unavailable</p><p className="text-sm">Do not treat displayed values as current. {error || stats?._error}</p></div>
          <button type="button" onClick={() => loadStats(true)} className="rounded-lg border border-amber-400 px-3 py-2 text-sm font-medium hover:bg-amber-100">Retry</button>
        </div>
      )}

      <section aria-labelledby="attention-heading" className={`mb-5 rounded-xl border p-4 ${attentionCount ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${attentionCount ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>{attentionCount ? <Siren size={20} /> : <CheckCircle2 size={20} />}</span>
            <div><h2 id="attention-heading" className="font-semibold text-slate-950 dark:text-white">{attentionCount ? `${attentionCount} attention signal${attentionCount === 1 ? '' : 's'}` : 'No immediate exceptions detected'}</h2><p className="text-sm text-slate-600 dark:text-slate-300">{attentionCount ? 'Review unassigned, overdue, and casualty-related incidents first.' : 'Continue monitoring the active response queue.'}</p></div>
          </div>
          <button type="button" onClick={() => navigate('/incidents')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">Open full queue <ArrowRight size={16} /></button>
        </div>
      </section>

      <section aria-label="Current workload" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active incidents" value={stats?.active ?? stats?.responding ?? 0} hint="Open in current scope" icon={<AlertTriangle />} tone="blue" onClick={() => navigate('/incidents')} />
        <Metric label="Unassigned" value={stats?.unassigned || 0} hint={`Of ${stats?.active ?? 0} active incidents`} icon={<Users />} tone="red" onClick={() => navigate('/incidents?status=pending')} />
        <Metric label="Over 15 minutes" value={stats?.overdue || 0} hint={`No first response in scope`} icon={<Timer />} tone="amber" onClick={() => navigate('/incidents')} />
        <Metric label="Average response" value={formatDuration(stats?.avgResponseTime)} hint="Created to first response" icon={<Clock3 />} tone="slate" />
      </section>

      <div className="mb-5 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 lg:hidden dark:border-slate-800 dark:bg-slate-900" role="tablist" aria-label="Operations workspace view">
        {(['queue', 'map'] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={workspaceTab === tab} onClick={() => setWorkspaceTab(tab)} className={`min-h-10 flex-1 rounded-md px-3 py-2 text-sm font-semibold capitalize ${workspaceTab === tab ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{tab === 'queue' ? 'Priority queue' : 'Live map'}</button>)}
      </div>

      <div className={`mb-5 grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.7fr)] ${workspaceTab === 'map' ? 'hidden lg:grid' : ''}`}>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-labelledby="queue-heading">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div><h2 id="queue-heading" className="font-semibold text-slate-950 dark:text-white">Priority response queue</h2><p className="text-xs text-slate-500 dark:text-slate-400">Unassigned, casualty-related, and overdue incidents appear first</p></div><span className="text-xs font-medium text-slate-500">{queue.length} shown</span></div>
          {queue.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{queue.map(incident => <QueueRow key={incident.id} incident={incident} onOpen={() => navigate(`/incidents/${incident.id}`)} />)}</div> : <div className="p-10 text-center"><CheckCircle2 className="mx-auto mb-3 text-emerald-600" /><p className="font-medium text-slate-800 dark:text-slate-100">No active incidents in this scope</p><p className="mt-1 text-sm text-slate-500">New reports will appear here automatically.</p></div>}
        </section>

        {!isDeskOfficer && <AgencyWorkload stats={stats} onOpen={agency => navigate(`/incidents?agency=${agency}`)} />}
        {isDeskOfficer && <RecentActivity activities={stats?.recentActivity || []} onOpen={id => navigate(`/incidents/${id}`)} />}
      </div>

      <section aria-labelledby="map-heading" className={workspaceTab === 'queue' ? 'hidden lg:block' : ''}><div className="mb-3 flex items-end justify-between"><div><h2 id="map-heading" className="font-semibold text-slate-950 dark:text-white">Incident location map</h2><p className="text-sm text-slate-500 dark:text-slate-400">Review incident locations, agency coverage, and response context.</p></div></div><DashboardMap /></section>
    </div>
  );
}

function Metric({ label, value, hint, icon, tone, onClick }: { label: string; value: string | number; hint: string; icon: React.ReactNode; tone: 'blue' | 'red' | 'amber' | 'slate'; onClick?: () => void }) {
  const tones = { blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300', red: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300', amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300', slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' };
  const Tag = onClick ? 'button' : 'div';
  return <Tag {...(onClick ? { type: 'button', onClick } : {})} className={`flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900 ${onClick ? 'hover:border-blue-400 hover:shadow-sm' : ''}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span><span><span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span><span className="block text-2xl font-bold text-slate-950 dark:text-white">{value}</span><span className="block text-xs text-slate-500">{hint}</span></span></Tag>;
}

function QueueRow({ incident, onOpen }: { incident: QueueIncident; onOpen: () => void }) {
  const status = getIncidentStatus(incident.status);
  const agency = getAgencyPresentation(incident.agency_type);
  const AgencyIcon = agency.key === 'pnp' ? Shield : agency.key === 'bfp' ? Flame : agency.key === 'mdrrmo' ? Waves : HelpCircle;
  const reason = incident.casualties_count ? `${incident.casualties_count} affected` : incident.is_unassigned ? 'Needs assignment' : incident.is_overdue ? 'SLA breach' : 'Review status';
  return <div className="grid gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={agency.fullLabel}><AgencyIcon size={15} /></span><button type="button" onClick={onOpen} className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"><span className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[11px] font-semibold text-slate-500">{getIncidentReference(incident)}</span>{!agency.isApproved && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">AWAITING AGENCY APPROVAL</span>}{incident.is_unassigned && agency.isApproved && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">UNASSIGNED</span>}{incident.is_overdue && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">OVERDUE</span>}{incident.casualties_count != null && incident.casualties_count > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">{incident.casualties_count} AFFECTED</span>}</span><span className="mt-0.5 block truncate text-[13px] font-medium leading-5 text-slate-900 dark:text-white">{incident.description || 'No description provided'}</span><span className="mt-0.5 flex items-center gap-1 truncate text-[11px] leading-4 text-slate-500"><MapPin size={11} />{incident.location_address || 'Location unavailable'}</span></button><span className="flex items-center justify-between gap-2 sm:min-w-[250px] sm:justify-end"><span className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium ${status.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span><span className={`text-[11px] font-semibold ${incident.is_overdue ? 'text-red-700 dark:text-red-300' : 'text-slate-500'}`}>{formatAge(incident.age_minutes)}</span><span className="hidden text-[11px] text-slate-500 lg:inline">{reason}</span><button type="button" onClick={onOpen} aria-label={`Review incident ${getIncidentReference(incident).replace(/^#/, '')}`} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-200">Review <ArrowRight size={12} /></button></span></div>;
}

function AgencyWorkload({ stats, onOpen }: { stats: Stats | null; onOpen: (agency: string) => void }) {
  const agencies = [{ id: 'pnp', label: 'PNP', icon: Shield, color: 'text-blue-700 bg-blue-50 dark:bg-blue-950/30' }, { id: 'bfp', label: 'BFP', icon: Flame, color: 'text-red-700 bg-red-50 dark:bg-red-950/30' }, { id: 'mdrrmo', label: 'MDRRMO', icon: Waves, color: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/30' }];
  return <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-labelledby="agency-heading"><h2 id="agency-heading" className="font-semibold text-slate-950 dark:text-white">Agency workload</h2><p className="mb-4 text-xs text-slate-500">Assignments in the current scope; incidents may appear more than once.</p><div className="space-y-2">{agencies.map(a => { const Icon = a.icon; const count = stats?.byAgency.find(x => x.agency_type === a.id)?.count || 0; return <button key={a.id} type="button" onClick={() => onOpen(a.id)} className="flex min-h-14 w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700"><span className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.color}`}><Icon size={17} /></span><span className="font-medium text-slate-800 dark:text-slate-100">{a.label}</span></span><span className="text-xl font-bold text-slate-950 dark:text-white">{count}</span></button>; })}</div>{(stats?.multiAgencyCount || 0) > 0 && <div className="mt-3 flex items-center gap-2 rounded-lg bg-purple-50 p-3 text-sm text-purple-800 dark:bg-purple-950/30 dark:text-purple-200"><Users size={16} />{stats?.multiAgencyCount} multi-agency incidents</div>}</section>;
}

function RecentActivity({ activities, onOpen }: { activities: Stats['recentActivity']; onOpen: (id: string) => void }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-950 dark:text-white">Latest updates</h2><p className="mb-4 text-xs text-slate-500">Most recent status changes</p><div className="space-y-1">{activities.slice(0, 6).map((a, index) => <button key={`${a.incident_id}-${index}`} onClick={() => onOpen(a.incident_id)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><span><span className="block font-mono text-xs text-slate-500">{getIncidentReference({ id: a.incident_id, incident_reference: a.incident_reference })}</span><span className="text-sm font-medium text-slate-800 dark:text-slate-100">{getIncidentStatus(a.status).label}</span></span><ArrowRight size={15} className="text-slate-400" /></button>)}</div></section>;
}

export default Dashboard;
