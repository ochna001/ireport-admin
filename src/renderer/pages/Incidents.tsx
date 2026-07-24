import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Filter, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { barangaysByMunicipality, municipalities } from '../data/camarinesNorteLocations';
import { getSessionScope, isStationScoped, SessionScope } from '../utils/sessionScope';
import { exportIncidentsToPDF } from '../utils/exportUtils';
import { getAgencyPresentation } from '../utils/agencyPresentation';
import { FILTERABLE_INCIDENT_STATUSES, getIncidentStatus } from '../utils/incidentStatus';
import { getIncidentReference } from '../utils/incidentReference';

interface Incident {
  id: string;
  short_code?: string;
  short_id?: number;
  incident_reference?: string | null;
  reference_year?: number | null;
  reference_number?: number | null;
  agency_type: string;
  reporter_name: string;
  description: string;
  status: string;
  location_address: string;
  created_at: string;
  latitude?: number;
  longitude?: number;
  casualties_category?: string;
  casualties_count?: number;
  is_multi_agency?: boolean;
  agencies_count?: number;
  assigned_station_id?: number;
  assigned_officer_id?: string;
  assigned_officer_ids?: string[];
  assigned_resource_ids?: number[];
  ai_severity?: number;
  recommended_agency_type?: string | null;
  triage_severity?: number | null;
  triage_urgency?: string | null;
  first_response_at?: string;
}

interface PaginatedResponse {
  data: Incident[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function Incidents() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialScope = useMemo(() => getSessionScope(), []);
  const [sessionScope, setSessionScope] = useState<SessionScope>(initialScope);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Station-scoped users (Chief/Desk Officer) have locked agency
  const stationScopeActive = isStationScoped(initialScope);
  const [filterAgency, setFilterAgency] = useState(
    stationScopeActive && initialScope.agencyShortName
      ? initialScope.agencyShortName.toLowerCase()
      : searchParams.get('agency') || ''
  );
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') || '');
  const [filterMultiAgency, setFilterMultiAgency] = useState(false);
  // Station-scoped users have locked municipality based on their station
  const [filterMunicipality, setFilterMunicipality] = useState(''); // Default to all to allow cross-municipality assignments
  const [filterBarangay, setFilterBarangay] = useState('');
  const [filterFrom, setFilterFrom] = useState(() => searchParams.get('from') || '');
  const [filterTo, setFilterTo] = useState(() => searchParams.get('to') || '');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Incident; direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize] = useState(20);

  const barangayOptions = useMemo(
    () => (filterMunicipality ? barangaysByMunicipality[filterMunicipality] || [] : []),
    [filterMunicipality]
  );

  // Sync filter with URL parameter
  useEffect(() => {
    const agencyParam = searchParams.get('agency');
    if (agencyParam && !stationScopeActive) {
      setFilterAgency(agencyParam);
    }
    setFilterStatus(searchParams.get('status') || '');
    setFilterFrom(searchParams.get('from') || '');
    setFilterTo(searchParams.get('to') || '');
  }, [searchParams, stationScopeActive]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterAgency, filterStatus, filterMultiAgency, filterMunicipality, filterBarangay, filterFrom, filterTo]);

  useEffect(() => {
    loadIncidents();

    // Listen for real-time updates
    const unsubscribe = window.api.onIncidentUpdated(() => {
      loadIncidents();
    });

    return () => {
      unsubscribe();
    };
  }, [filterAgency, filterStatus, filterMunicipality, filterBarangay, filterFrom, filterTo, currentPage, debouncedSearch, sortConfig]);

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const scope = getSessionScope();
      setSessionScope(scope);

      const filters: any = {
        agency: filterAgency || undefined,
        status: filterStatus || undefined,
        municipality: filterMunicipality || undefined,
        barangay: filterBarangay || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        page: currentPage,
        pageSize: pageSize,
        search: debouncedSearch || undefined,
        sortBy: sortConfig.key,
        sortDirection: sortConfig.direction,
      };

      if (isStationScoped(scope)) {
        filters.agency = scope.agencyShortName?.toLowerCase();
        filters.stationId = scope.stationId;

        if (scope.agencyShortName) {
          const scopedAgency = scope.agencyShortName.toLowerCase();
          if (filterAgency !== scopedAgency) {
            setFilterAgency(scopedAgency);
          }
        }
      }

      const response = await window.api.getIncidents(filters) as any;

      // Handle both paginated and non-paginated responses
      if (Array.isArray(response)) {
        // Non-paginated response (legacy)
        setIncidents(response);
        setTotalPages(1);
        setTotalItems(response.length);
      } else {
        // Paginated response
        setIncidents(response.data || []);
        setTotalPages(response.totalPages || 1);
        setTotalItems(response.total || 0);
      }
      setError(null);
    } catch (error: any) {
      console.error('Failed to load incidents:', error?.message || error);
      setError(error?.message || 'Unable to load incident data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: keyof Incident) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Multi-agency filtering remains local because the server enriches this field after querying.
  const sortedIncidents = [...incidents]
    .filter(incident => {
      // Apply multi-agency filter
      if (filterMultiAgency) {
        return incident.is_multi_agency === true;
      }
      return true;
    })

  // Pagination helpers
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const getAgencyBadgeClass = (agency: string) => {
    return getAgencyPresentation(agency).badgeClass;
  };

  const formatAgency = (agency: string) => {
    return getAgencyPresentation(agency).shortLabel;
  };

  const getStatusBadgeClass = (status: string) => {
    return getIncidentStatus(status).badge;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleExportPDF = () => {
    const filters = {
      agency: filterAgency,
      status: filterStatus,
      municipality: filterMunicipality,
      barangay: filterBarangay,
      search: debouncedSearch
    };

    const doc = exportIncidentsToPDF(incidents, filters);
    const filename = `Incident_Reports_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  };

  const hasActiveFilters = Boolean(filterAgency || filterStatus || filterMunicipality || filterBarangay || filterMultiAgency || searchQuery || filterFrom || filterTo);
  const clearFilters = () => {
    setSearchQuery('');
    setFilterAgency(stationScopeActive && initialScope.agencyShortName ? initialScope.agencyShortName.toLowerCase() : '');
    setFilterStatus('');
    setFilterMunicipality('');
    setFilterBarangay('');
    setFilterMultiAgency(false);
    setFilterFrom('');
    setFilterTo('');
    setSearchParams({});
  };

  const getAssignmentLabel = (incident: Incident) => {
    if (incident.assigned_station_id) return `Station ${incident.assigned_station_id}`;
    if (['assigned', 'in_progress', 'responding'].includes(incident.status?.toLowerCase())) return 'Assignment incomplete';
    if (['resolved', 'closed'].includes(incident.status?.toLowerCase())) return 'No station recorded';
    return 'Unassigned';
  };

  return (
      <div className="min-h-full p-4 sm:p-6 dark:bg-slate-950">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Operations register</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Incidents</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Search, filter, and review all incident reports in your current scope.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            disabled={incidents.length === 0}
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <Download size={18} />
            Export PDF
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {totalItems} incidents
          </span>
        </div>
      </div>

      {stationScopeActive && (
        <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-100">
          <strong>Station scope active:</strong> {sessionScope.stationName || `Station ${sessionScope.stationId}`} ({sessionScope.agencyShortName || 'Agency'} • {sessionScope.role})
          {sessionScope.stationMunicipality && <span> • {sessionScope.stationMunicipality}</span>}
          <span className="block mt-1 text-purple-600 dark:text-purple-300">Agency filter is locked to your station.</span>
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              aria-label="Search incidents by ID, description, reporter, or location"
              placeholder="Search ID, location, reporter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Agency Filter */}
          <div className="flex items-center gap-2">
              <Filter size={17} className="text-slate-400" aria-hidden="true" />
            <select
              aria-label="Filter incidents by agency"
              value={filterAgency}
              onChange={(e) => setFilterAgency(e.target.value)}
              disabled={stationScopeActive}
              className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:opacity-60"
            >
              <option value="">All Agencies</option>
              <option value="unknown">Agency not assigned</option>
              <option value="pnp">PNP</option>
              <option value="bfp">BFP</option>
              <option value="mdrrmo">MDRRMO</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            aria-label="Filter incidents by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
              <option value="">All Statuses</option>
              {FILTERABLE_INCIDENT_STATUSES.map(status => (
                <option key={status} value={status}>{getIncidentStatus(status).label}</option>
              ))}
          </select>

          {/* Municipality Filter - locked for station-scoped users */}
          <select
            aria-label="Filter incidents by municipality"
            value={filterMunicipality}
            onChange={(e) => {
              const nextMunicipality = e.target.value;
              setFilterMunicipality(nextMunicipality);
              setFilterBarangay(''); // reset barangay when municipality changes
            }}
            className="min-h-10 min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All Municipalities</option>
            {municipalities.map((municipality) => (
              <option key={municipality} value={municipality}>
                {municipality}
              </option>
            ))}
          </select>

          {/* Barangay Filter */}
          <select
            aria-label="Filter incidents by barangay"
            value={filterBarangay}
            onChange={(e) => setFilterBarangay(e.target.value)}
            disabled={!filterMunicipality}
            className="min-h-10 min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:opacity-60"
          >
            <option value="">All Barangays</option>
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>

          {/* Multi-Agency Filter Toggle */}
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
            <input
              type="checkbox"
              checked={filterMultiAgency}
              onChange={(e) => setFilterMultiAgency(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
            />
            <span className="flex items-center gap-1 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
              <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              Multi-Agency
            </span>
          </label>
          {filterFrom && filterTo && (
            <span className="inline-flex min-h-10 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              Report window: {new Date(filterFrom).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(filterTo).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          {hasActiveFilters && <button type="button" onClick={clearFilters} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><X size={15} /> Clear filters</button>}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          <div>
            <p className="font-semibold">Incident data unavailable</p>
            <p className="text-sm">The queue may be stale. {error}</p>
          </div>
          <button type="button" onClick={loadIncidents} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40">Retry</button>
        </div>
      )}

      {/* Incidents List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : incidents.length === 0 && !error ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            No incidents found
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                  onClick={() => handleSort('id')}
                >
                  ID {sortConfig?.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                  onClick={() => handleSort('agency_type')}
                >
                  Agency {sortConfig?.key === 'agency_type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Incident / location</th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                  onClick={() => handleSort('reporter_name')}
                >
                  Reporter / casualties {sortConfig?.key === 'reporter_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                  onClick={() => handleSort('status')}
                >
                  Status / assignment {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                  <th
                   className="text-left px-4 py-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={() => handleSort('created_at')}
                >
                  Age {sortConfig?.key === 'created_at' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                 <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sortedIncidents.map((incident) => (
                <tr
                  key={incident.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                  onClick={() => navigate(`/incidents/${incident.id}`)}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-slate-600 dark:text-slate-400">
                      {getIncidentReference(incident)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getAgencyBadgeClass(incident.agency_type)}`}>
                          {formatAgency(incident.agency_type)}
                        </span>
                        {incident.is_multi_agency && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-purple-600 text-white flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                            </svg>
                            {incident.agencies_count}
                          </span>
                        )}
                      </div>
                      {!getAgencyPresentation(incident.agency_type).isApproved && incident.recommended_agency_type && (
                        <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                          AI recommends {getAgencyPresentation(incident.recommended_agency_type).shortLabel}
                        </p>
                      )}
                      {!getAgencyPresentation(incident.agency_type).isApproved && (incident.triage_severity || incident.triage_urgency) && (
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {incident.triage_severity ? `Severity ${incident.triage_severity}` : ''}{incident.triage_severity && incident.triage_urgency ? ' · ' : ''}{incident.triage_urgency || ''}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-sm truncate text-sm font-medium text-slate-800 dark:text-slate-200">{incident.description}</p>
                    <p className="mt-1 max-w-sm truncate text-xs text-slate-500 dark:text-slate-400">{incident.location_address || 'Location not provided'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {incident.reporter_name || 'Anonymous'}
                    </span>
                    {incident.casualties_count != null && <span className="mt-1 block text-xs font-medium text-red-700 dark:text-red-300">{incident.casualties_count} affected{incident.casualties_category ? ` • ${incident.casualties_category}` : ''}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${getStatusBadgeClass(incident.status)}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${getIncidentStatus(incident.status).dot}`} />
                      {getIncidentStatus(incident.status).label}
                    </span>
                    <span className={`mt-1 block text-xs ${getAssignmentLabel(incident) === 'Assignment incomplete' ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                      {getAssignmentLabel(incident)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {formatDate(incident.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight size={20} className="text-slate-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} incidents
          </div>

          <div className="flex items-center gap-1">
            {/* First page */}
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="First page"
            >
              <ChevronsLeft size={16} className="text-slate-600 dark:text-slate-400" />
            </button>

            {/* Previous page */}
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous page"
            >
              <ChevronLeft size={16} className="text-slate-600 dark:text-slate-400" />
            </button>

            {/* Page numbers */}
            {getPageNumbers().map((page, index) => (
              typeof page === 'number' ? (
                <button
                  key={index}
                  onClick={() => goToPage(page)}
                  className={`px-3 py-1 rounded-lg border text-sm font-medium ${currentPage === page
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                >
                  {page}
                </button>
              ) : (
                <span key={index} className="px-2 text-slate-400">...</span>
              )
            ))}

            {/* Next page */}
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next page"
            >
              <ChevronRight size={16} className="text-slate-600 dark:text-slate-400" />
            </button>

            {/* Last page */}
            <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Last page"
            >
              <ChevronsRight size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Incidents;
