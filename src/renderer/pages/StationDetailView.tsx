import {
    AlertTriangle,
    ArrowLeft,
    Building2,
    CheckCircle2,
    Clock,
    Flame,
    Loader2,
    MapPin,
    Phone,
    RefreshCw,
    Shield,
    Truck,
    User,
    Users,
    Waves,
    Wrench,
    AlertCircle,
    ExternalLink,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

interface Agency {
    id: number;
    name: string;
    short_name: string;
}

interface Station {
    id: number;
    agency_id: number;
    name: string;
    latitude: number;
    longitude: number;
    contact_number: string | null;
    address: string | null;
    agencies?: Agency;
}

interface Resource {
    id: number;
    station_id: number;
    name: string;
    type: 'vehicle' | 'equipment' | 'personnel';
    status: 'available' | 'deployed' | 'maintenance';
    description: string | null;
}

interface Member {
    id: string;
    display_name: string;
    email: string;
    role: string;
    phone_number: string | null;
    station_id: number | null;
    agencies?: { name: string; short_name: string };
}

interface Incident {
    id: string;
    description: string;
    short_code?: string | null;
    status: string;
    agency_type: string;
    location_address: string | null;
    created_at: string;
    updated_at?: string | null;
    assigned_officer_id: string | null;
    assigned_officer_ids: string[] | null;
    assigned_resource_ids: number[] | null;
    assigned_station_id: number | null;
}

interface StationDetailViewProps {
    station: Station;
    agencies: Agency[];
    onBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    in_progress: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    responding: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    resolved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    closed: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    fake_report: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const ACTIVE_STATUSES = ['pending', 'assigned', 'in_progress', 'responding'];

function getAgencyColor(shortName?: string) {
    switch (shortName?.toUpperCase()) {
        case 'PNP': return 'bg-blue-500';
        case 'BFP': return 'bg-red-500';
        case 'MDRRMO': return 'bg-teal-500';
        default: return 'bg-slate-500';
    }
}

function getAgencyIcon(shortName?: string) {
    switch (shortName?.toUpperCase()) {
        case 'PNP': return <Shield className="w-5 h-5" />;
        case 'BFP': return <Flame className="w-5 h-5" />;
        case 'MDRRMO': return <Waves className="w-5 h-5" />;
        default: return <Building2 className="w-5 h-5" />;
    }
}

function getResourceIcon(type: string) {
    switch (type) {
        case 'vehicle': return <Truck className="w-4 h-4" />;
        case 'equipment': return <Wrench className="w-4 h-4" />;
        case 'personnel': return <User className="w-4 h-4" />;
        default: return <Truck className="w-4 h-4" />;
    }
}

function getResourceStatusStyle(status: string) {
    switch (status) {
        case 'available': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
        case 'deployed': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
        case 'maintenance': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
        default: return 'bg-slate-100 text-slate-600';
    }
}

function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatAge(dateStr: string) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m waiting`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m waiting`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h waiting`;
}

function getIncidentPriority(incident: Incident) {
    const text = `${incident.description} ${incident.status}`.toLowerCase();
    const severity = /fire|shoot|weapon|life|medical|accident|emergency/.test(text) ? 2 : 0;
    const unassigned = incident.assigned_officer_ids?.length || incident.assigned_officer_id ? 0 : 1;
    return severity + unassigned;
}

export function StationDetailView({ station, agencies, onBack }: StationDetailViewProps) {
    const [members, setMembers] = useState<Member[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [visibleActiveIncidentCount, setVisibleActiveIncidentCount] = useState(6);

    const agency = agencies.find(a => a.id === station.agency_id);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersData, resourcesData, incidentsData] = await Promise.all([
                window.api.getUsers({ stationId: station.id }),
                window.api.getResources?.() ?? Promise.resolve([]),
                window.api.getIncidents({ stationId: station.id, limit: 200 }),
            ]);

            setMembers(usersData.filter((u: any) => u.station_id === station.id));
            setResources((resourcesData as Resource[]).filter(r => r.station_id === station.id));
            const raw = incidentsData as any;
            setIncidents(Array.isArray(raw) ? raw : (raw?.data ?? []));
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to load station details', err);
            setError('Station data could not be refreshed. The figures below may be stale.');
        } finally {
            setLoading(false);
        }
    }, [station.id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setVisibleActiveIncidentCount(6);
    }, [station.id]);

    // Build lookup: officer_id => list of active incidents they are assigned to
    const officerIncidentMap = new Map<string, Incident[]>();
    incidents.forEach(inc => {
        if (!ACTIVE_STATUSES.includes(inc.status)) return;
        const ids = inc.assigned_officer_ids?.length
            ? inc.assigned_officer_ids
            : inc.assigned_officer_id
                ? [inc.assigned_officer_id]
                : [];
        ids.forEach(id => {
            if (!officerIncidentMap.has(id)) officerIncidentMap.set(id, []);
            officerIncidentMap.get(id)!.push(inc);
        });
    });

    // Active incidents for this station
    const activeIncidents = incidents.filter(i => ACTIVE_STATUSES.includes(i.status));
    const resolvedIncidents = incidents.filter(i => !ACTIVE_STATUSES.includes(i.status));
    const sortedActiveIncidents = [...activeIncidents].sort((a, b) => {
        const priorityDifference = getIncidentPriority(b) - getIncidentPriority(a);
        if (priorityDifference !== 0) return priorityDifference;
        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
    });
    const visibleActiveIncidents = sortedActiveIncidents.slice(0, visibleActiveIncidentCount);
    const canShowMoreActiveIncidents = visibleActiveIncidentCount < sortedActiveIncidents.length;
    const hasExpandedActiveIncidentList = visibleActiveIncidents.length > 6;

    const availableMembers = members.filter(m => !officerIncidentMap.has(m.id));
    const busyMembers = members.filter(m => officerIncidentMap.has(m.id));

    // Build lookup: resource_id => list of active incidents they are assigned to
    const resourceIncidentMap = new Map<number, Incident[]>();
    incidents.forEach(inc => {
        if (!ACTIVE_STATUSES.includes(inc.status)) return;
        const ids = inc.assigned_resource_ids || [];
        ids.forEach(id => {
            if (!resourceIncidentMap.has(id)) resourceIncidentMap.set(id, []);
            resourceIncidentMap.get(id)!.push(inc);
        });
    });

    const dynamicResources = resources.map(r => ({
        ...r,
        assignmentStatus: (resourceIncidentMap.get(r.id) ?? []).length > 0 ? 'deployed' : 'unassigned',
    }));

    const availableResources = dynamicResources.filter(r => r.status === 'available' && r.assignmentStatus === 'unassigned');
    const deployedResources = dynamicResources.filter(r => r.assignmentStatus === 'deployed');
    const maintenanceResources = dynamicResources.filter(r => r.status === 'maintenance');
    const unassignedIncidents = activeIncidents.filter(i => !(i.assigned_officer_ids?.length || i.assigned_officer_id));

    return (
        <div className="min-h-full dark:bg-slate-950 p-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 min-h-10 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Stations
                </button>
            </div>

            {/* Station Identity Banner */}
            <div className={`rounded-xl p-5 mb-6 text-white relative overflow-hidden ${agency?.short_name === 'PNP' ? 'bg-gradient-to-r from-blue-700 to-blue-500' :
                agency?.short_name === 'BFP' ? 'bg-gradient-to-r from-red-700 to-red-500' :
                    agency?.short_name === 'MDRRMO' ? 'bg-gradient-to-r from-teal-700 to-teal-500' :
                        'bg-gradient-to-r from-slate-700 to-slate-500'
                }`}>
                <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)',
                    backgroundSize: '12px 12px'
                }} />
                <div className="relative flex items-start justify-between">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                            {getAgencyIcon(agency?.short_name)}
                        </div>
                        <div>
                            <p className="text-white/70 text-sm uppercase tracking-wider font-semibold">{agency?.short_name} · {agency?.name}</p>
                            <h1 className="text-2xl font-bold mt-0.5">{station.name}</h1>
                            <div className="flex flex-wrap items-center gap-4 mt-2 text-white/80 text-sm">
                                {station.address && (
                                    <span className="flex items-center gap-1.5">
                                        <MapPin className="w-4 h-4" /> {station.address}
                                    </span>
                                )}
                                {station.contact_number && (
                                    <span className="flex items-center gap-1.5">
                                        <Phone className="w-4 h-4" /> {station.contact_number}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                     <div className="flex flex-col items-end gap-2 shrink-0">
                         <button
                             onClick={fetchData}
                             disabled={loading}
                             className="flex items-center gap-2 min-h-10 px-3 py-2 bg-white/20 hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg text-sm transition-colors"
                         >
                             <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                         </button>
                         <span className="text-xs text-white/80" aria-live="polite">
                             {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not yet refreshed'}
                         </span>
                     </div>
                 </div>
             </div>

             {error && (
                 <div role="alert" className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                     <span>{error}</span>
                     <button type="button" onClick={fetchData} className="min-h-10 rounded-lg border border-red-300 px-3 font-semibold hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-700 dark:hover:bg-red-900/40">Retry</button>
                 </div>
             )}

            {loading ? (
                <div className="flex justify-center items-center py-24" role="status" aria-label="Loading station details">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Quick Stats Row */}
                     <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                        {[
                            { label: 'Total Members', value: members.length, icon: <Users className="w-5 h-5" />, color: 'blue' },
                            { label: 'Available Officers', value: availableMembers.length, icon: <CheckCircle2 className="w-5 h-5" />, color: 'green' },
                            { label: 'Busy Officers', value: busyMembers.length, icon: <AlertTriangle className="w-5 h-5" />, color: 'orange' },
                            { label: 'Total Resources', value: resources.length, icon: <Truck className="w-5 h-5" />, color: 'blue' },
                             { label: 'Ready Resources', value: availableResources.length, icon: <CheckCircle2 className="w-5 h-5" />, color: 'green' },
                             { label: 'Unassigned Incidents', value: unassignedIncidents.length, icon: <AlertCircle className="w-5 h-5" />, color: 'red' },
                         ].map(({ label, value, icon, color }) => (
                             <div key={label} className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
                                 <div className={`flex items-center gap-2 ${color === 'blue' ? 'text-blue-600 dark:text-blue-400' : color === 'green' ? 'text-green-600 dark:text-green-400' : color === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'} text-xs font-semibold uppercase tracking-wide mb-2`}>
                                     {icon} {label}
                                 </div>
                                 <p className={`text-3xl font-bold ${color === 'blue' ? 'text-blue-600 dark:text-blue-400' : color === 'green' ? 'text-green-600 dark:text-green-400' : color === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Active Incidents Alert */}
                     {activeIncidents.length > 0 ? (
                         <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-semibold min-w-0">
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    <span className="truncate">
                                         {activeIncidents.length} Active {activeIncidents.length === 1 ? 'Incident' : 'Incidents'} Linked to This Station
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {hasExpandedActiveIncidentList && (
                                        <button
                                            onClick={() => setVisibleActiveIncidentCount(6)}
                                             className="min-h-10 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-orange-700 border border-orange-200 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:bg-slate-800 dark:text-orange-300 dark:border-orange-800 dark:hover:bg-orange-900/30 transition-colors"
                                        >
                                            Show less
                                        </button>
                                    )}
                                    {canShowMoreActiveIncidents && (
                                        <button
                                            onClick={() => setVisibleActiveIncidentCount(prev => prev + 6)}
                                             className="min-h-10 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60 transition-colors"
                                        >
                                            Show more (+6)
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className={`grid grid-cols-1 gap-2 ${hasExpandedActiveIncidentList ? 'max-h-[420px] overflow-y-auto pr-1' : ''}`}>
                                {visibleActiveIncidents.map(inc => (
                                    <div key={inc.id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-3 border border-orange-100 dark:border-orange-800/50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`shrink-0 px-2 py-0.5 text-xs font-bold rounded-full capitalize ${STATUS_COLORS[inc.status] ?? ''}`}>
                                                {inc.status.replace('_', ' ')}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                                                 {inc.short_code && <span className="text-slate-500 mr-1.5 font-mono">#{inc.short_code}</span>}
                                                     {inc.description || 'No description provided'}
                                                </p>
                                                {inc.location_address && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                                        <MapPin className="w-3 h-3 shrink-0" /> {inc.location_address}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 ml-4">
                                            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                 <span className="font-semibold text-slate-700 dark:text-slate-200">{formatAge(inc.created_at)}</span>
                                            </span>
                                            <button
                                                onClick={() => { window.location.hash = `#/incidents/${inc.id}`; }}
                                                 className="min-h-10 min-w-10 flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded-lg transition-colors text-orange-600 dark:text-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                                                 aria-label={`Open incident ${inc.short_code ?? inc.id}`}
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {canShowMoreActiveIncidents && (
                                <p className="mt-2 text-xs text-orange-700/80 dark:text-orange-300/80">
                                    Showing {visibleActiveIncidents.length} of {activeIncidents.length} active incidents.
                                </p>
                            )}
                         </div>
                     ) : (
                         <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
                             No active incidents are currently linked to this station.
                         </div>
                     )}

                    <div className="grid grid-cols-2 gap-6">
                        {/* Members Panel */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-600" />
                                    Station Members
                                    <span className="text-sm text-slate-400 font-normal">({members.length})</span>
                                </h2>
                                <div className="flex items-center gap-2 text-xs font-medium">
                                    <span className="flex items-center gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        {availableMembers.length} Available
                                    </span>
                                    <span className="flex items-center gap-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                        {busyMembers.length} Busy
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 max-h-[500px]">
                                {members.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                                        No members assigned to this station
                                    </div>
                                ) : (
                                    members.map(member => {
                                        const assignedIncidents = officerIncidentMap.get(member.id) ?? [];
                                        const isBusy = assignedIncidents.length > 0;

                                        return (
                                            <div key={member.id} className={`p-4 ${isBusy ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${getAgencyColor(agency?.short_name)}`}>
                                                            {(member.display_name || member.email).charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-800 dark:text-white truncate">{member.display_name || member.email}</p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">{member.role}</p>
                                                            {member.phone_number && (
                                                                <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                                                                    <Phone className="w-3 h-3" /> {member.phone_number}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className={`shrink-0 px-2.5 py-1 text-xs font-bold rounded-full ${isBusy
                                                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                                                        : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                                        }`}>
                                                        {isBusy ? 'Busy' : 'Available'}
                                                    </span>
                                                </div>

                                                {/* Assigned Incidents */}
                                                {assignedIncidents.length > 0 && (
                                                    <div className="mt-3 space-y-1.5 pl-13">
                                                        {assignedIncidents.map(inc => (
                                                            <button
                                                                key={inc.id}
                                                             onClick={() => { window.location.hash = `#/incidents/${inc.id}`; }}
                                                                 aria-label={`Open incident ${inc.short_code ?? inc.id}`}
                                                                 className="w-full min-h-10 text-left flex items-start gap-2 p-2 bg-white dark:bg-slate-700 border border-orange-200 dark:border-orange-800/50 rounded-lg hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors group"
                                                            >
                                                                <AlertCircle className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                                                            {inc.short_code && <span className="text-slate-500 mr-1.5 font-mono opacity-80">#{inc.short_code}</span>}
                                                         {inc.description || 'No description provided'}
                                                                        </p>
                                                                        <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded capitalize ${STATUS_COLORS[inc.status] ?? ''}`}>
                                                                            {inc.status.replace('_', ' ')}
                                                                        </span>
                                                                    </div>
                                                                    {inc.location_address && (
                                                                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{inc.location_address}</p>
                                                                    )}
                                                                </div>
                                                                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-orange-500 shrink-0 mt-0.5 transition-colors" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Resources Panel */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Truck className="w-5 h-5 text-blue-600" />
                                    Station Resources
                                    <span className="text-sm text-slate-400 font-normal">({resources.length})</span>
                                </h2>
                                <div className="flex items-center gap-2 text-xs font-medium">
                                    <span className="flex items-center gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                                        {availableResources.length} Available
                                    </span>
                                    <span className="flex items-center gap-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-0.5 rounded-full">
                                        {deployedResources.length} Deployed
                                    </span>
                                    {maintenanceResources.length > 0 && (
                                        <span className="flex items-center gap-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
                                            {maintenanceResources.length} Maintenance
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 max-h-[500px]">
                                {dynamicResources.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                                        No resources assigned to this station
                                    </div>
                                ) : (
                                    dynamicResources.map(resource => {
                                        const deployedToIncidents = resourceIncidentMap.get(resource.id) ?? [];

                                        return (
                                             <div key={resource.id} className={`p-4 ${resource.assignmentStatus === 'deployed' ? 'bg-orange-50/50 dark:bg-orange-900/10' : resource.status === 'maintenance' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                         <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${resource.status === 'available' && resource.assignmentStatus === 'unassigned'
                                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                                             : resource.assignmentStatus === 'deployed'
                                                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                                                                : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                            }`}>
                                                            {getResourceIcon(resource.type)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-800 dark:text-white truncate">{resource.name}</p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{resource.type}</p>
                                                            {resource.description && (
                                                                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{resource.description}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                     <div className="flex items-center gap-1.5 shrink-0">
                                                         <span className={`px-2.5 py-1 text-xs font-bold rounded-full capitalize ${getResourceStatusStyle(resource.status)}`}>
                                                             {resource.status}
                                                         </span>
                                                         {resource.assignmentStatus === 'deployed' && (
                                                             <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                                                 Deployed
                                                             </span>
                                                         )}
                                                     </div>
                                                </div>

                                                {/* Assigned Incidents */}
                                                 {resource.assignmentStatus === 'deployed' && deployedToIncidents.length > 0 && (
                                                    <div className="mt-3 pl-13">
                                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide font-semibold">
                                                            Assigned to:
                                                        </p>
                                                        {deployedToIncidents.map(inc => (
                                                            <button
                                                                key={inc.id}
                                                                 onClick={() => { window.location.hash = `#/incidents/${inc.id}`; }}
                                                                 aria-label={`Open incident ${inc.short_code ?? inc.id}`}
                                                                 className="w-full min-h-10 text-left flex items-start gap-2 p-2 bg-white dark:bg-slate-700 border border-orange-200 dark:border-orange-800/50 rounded-lg hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors group mb-1.5"
                                                            >
                                                                <AlertCircle className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                                                        {inc.short_code && <span className="text-slate-500 mr-1.5 font-mono opacity-80">#{inc.short_code}</span>}
                                                                        {inc.description}
                                                                    </p>
                                                                    <span className={`text-[10px] font-bold capitalize ${STATUS_COLORS[inc.status] ?? ''}`}>
                                                                        {inc.status.replace('_', ' ')}
                                                                    </span>
                                                                </div>
                                                                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-orange-500 shrink-0 mt-0.5 transition-colors" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                {resource.status === 'maintenance' && (
                                                    <div className="mt-2 pl-13 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                                                        <Wrench className="w-3 h-3" /> Currently under maintenance
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Incident History */}
                    {resolvedIncidents.length > 0 && (
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-700">
                                <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-slate-400" />
                                    Resolved Incident History
                                    <span className="text-sm text-slate-400 font-normal">({resolvedIncidents.length})</span>
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
                                        <tr>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Description</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Location</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Reported</th>
                                            <th className="px-5 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {resolvedIncidents.slice(0, 20).map(inc => (
                                            <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                                <td className="px-5 py-3">
                                                    <p className="font-medium text-slate-800 dark:text-white truncate max-w-[280px]">
                                                        {inc.short_code && <span className="text-slate-500 mr-1.5 font-mono">#{inc.short_code}</span>}
                                                        {inc.description}
                                                    </p>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full capitalize ${STATUS_COLORS[inc.status] ?? ''}`}>
                                                        {inc.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                                                    {inc.location_address ?? '—'}
                                                </td>
                                                <td className="px-5 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                    {formatTime(inc.created_at)}
                                                </td>
                                                <td className="px-5 py-3">
                                                         <button
                                                             onClick={() => { window.location.hash = `#/incidents/${inc.id}`; }}
                                                             className="min-h-10 min-w-10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                             aria-label={`Open incident ${inc.short_code ?? inc.id}`}
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default StationDetailView;
