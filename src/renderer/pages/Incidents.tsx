import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { barangaysByMunicipality, municipalities } from '../data/camarinesNorteLocations';
import { getSessionScope, isStationScoped, SessionScope } from '../utils/sessionScope';

interface Incident {
  id: string;
  agency_type: string;
  reporter_name: string;
  description: string;
  status: string;
  location_address: string;
  created_at: string;
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
  const [searchParams] = useSearchParams();
  const initialScope = getSessionScope();
  const [sessionScope, setSessionScope] = useState<SessionScope>(initialScope);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Station-scoped users (Chief/Desk Officer) have locked agency
  const stationScopeActive = isStationScoped(initialScope);
  const [filterAgency, setFilterAgency] = useState(
    stationScopeActive && initialScope.agencyShortName
      ? initialScope.agencyShortName.toLowerCase()
      : searchParams.get('agency') || ''
  );
  const [filterStatus, setFilterStatus] = useState('');
  // Station-scoped users have locked municipality based on their station
  const [filterMunicipality, setFilterMunicipality] = useState(
    stationScopeActive && initialScope.stationMunicipality
      ? initialScope.stationMunicipality
      : ''
  );
  const [filterBarangay, setFilterBarangay] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Incident; direction: 'asc' | 'desc' } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize] = useState(20);

  const barangayOptions = useMemo(
    () => (filterMunicipality ? barangaysByMunicipality[filterMunicipality] || [] : []),
    [filterMunicipality]
  );

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
  }, [filterAgency, filterStatus, filterMunicipality, filterBarangay]);

  useEffect(() => {
    loadIncidents();

    // Listen for real-time updates
    window.api.onIncidentUpdated(() => {
      loadIncidents();
    });

    return () => {
      window.api.removeAllListeners('incident-updated');
    };
  }, [filterAgency, filterStatus, filterMunicipality, filterBarangay, currentPage, debouncedSearch]);

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
        page: currentPage,
        pageSize: pageSize,
        search: debouncedSearch || undefined,
      };

      if (isStationScoped(scope)) {
        filters.agency = scope.agencyShortName?.toLowerCase();
        filters.stationId = scope.stationId;
        // Also apply municipality filter from station
        if (scope.stationMunicipality) {
          filters.municipality = scope.stationMunicipality;
        }

        if (scope.agencyShortName) {
          const scopedAgency = scope.agencyShortName.toLowerCase();
          if (filterAgency !== scopedAgency) {
            setFilterAgency(scopedAgency);
          }
        }
      }

      const response: PaginatedResponse = await window.api.getIncidents(filters);
      setIncidents(response.data);
      setTotalPages(response.totalPages);
      setTotalItems(response.total);
    } catch (error: any) {
      console.error('Failed to load incidents:', error?.message || error);
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

  // Client-side sorting (server already handles filtering/pagination)
  const sortedIncidents = [...incidents].sort((a, b) => {
    if (!sortConfig) return 0;
    const aValue = a[sortConfig.key] || '';
    const bValue = b[sortConfig.key] || '';
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

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
    switch (agency.toLowerCase()) {
      case 'pnp': return 'bg-blue-600';
      case 'bfp': return 'bg-red-600';
      case 'pdrrmo': return 'bg-cyan-600';
      default: return 'bg-gray-600';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'received': return 'bg-blue-100 text-blue-800';
      case 'responding': return 'bg-orange-100 text-orange-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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

  return (
    <div className="p-6 dark:bg-gray-950">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Incidents</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {totalItems} incidents
        </span>
      </div>

      {stationScopeActive && (
        <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-100">
          <strong>Station scope active:</strong> {sessionScope.stationName || `Station ${sessionScope.stationId}`} ({sessionScope.agencyShortName || 'Agency'} • {sessionScope.role})
          {sessionScope.stationMunicipality && <span> • {sessionScope.stationMunicipality}</span>}
          <span className="block mt-1 text-purple-600 dark:text-purple-300">Agency and municipality filters are locked to your station.</span>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search incidents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Agency Filter */}
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-400" />
            <select
              value={filterAgency}
              onChange={(e) => setFilterAgency(e.target.value)}
              disabled={stationScopeActive}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white disabled:opacity-60"
            >
              <option value="">All Agencies</option>
              <option value="pnp">PNP</option>
              <option value="bfp">BFP</option>
              <option value="pdrrmo">PDRRMO</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Municipality Filter - locked for station-scoped users */}
          <select
            value={filterMunicipality}
            onChange={(e) => {
              const nextMunicipality = e.target.value;
              setFilterMunicipality(nextMunicipality);
              setFilterBarangay(''); // reset barangay when municipality changes
            }}
            disabled={stationScopeActive && !!sessionScope.stationMunicipality}
            className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white min-w-[180px] disabled:opacity-60"
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
            value={filterBarangay}
            onChange={(e) => setFilterBarangay(e.target.value)}
            disabled={!filterMunicipality}
            className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white min-w-[180px] disabled:opacity-60"
          >
            <option value="">All Barangays</option>
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Incidents List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No incidents found
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th 
                  className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={() => handleSort('id')}
                >
                  ID {sortConfig?.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={() => handleSort('agency_type')}
                >
                  Agency {sortConfig?.key === 'agency_type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-300">Description</th>
                <th 
                  className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={() => handleSort('reporter_name')}
                >
                  Reporter {sortConfig?.key === 'reporter_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={() => handleSort('status')}
                >
                  Status {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-6 py-4 text-sm font-medium text-gray-500 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={() => handleSort('created_at')}
                >
                  Date {sortConfig?.key === 'created_at' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {sortedIncidents.map((incident) => (
                <tr
                  key={incident.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() => navigate(`/incidents/${incident.id}`)}
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                      #{incident.id.substring(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium text-white ${getAgencyBadgeClass(incident.agency_type)}`}>
                      {incident.agency_type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate max-w-xs">
                      {incident.description}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {incident.reporter_name || 'Anonymous'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeClass(incident.status)}`}>
                      {incident.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(incident.created_at)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <ChevronRight size={20} className="text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} incidents
          </div>
          
          <div className="flex items-center gap-1">
            {/* First page */}
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="First page"
            >
              <ChevronsLeft size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
            
            {/* Previous page */}
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous page"
            >
              <ChevronLeft size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
            
            {/* Page numbers */}
            {getPageNumbers().map((page, index) => (
              typeof page === 'number' ? (
                <button
                  key={index}
                  onClick={() => goToPage(page)}
                  className={`px-3 py-1 rounded-lg border text-sm font-medium ${
                    currentPage === page
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {page}
                </button>
              ) : (
                <span key={index} className="px-2 text-gray-400">...</span>
              )
            ))}
            
            {/* Next page */}
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next page"
            >
              <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
            
            {/* Last page */}
            <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Last page"
            >
              <ChevronsRight size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Incidents;
