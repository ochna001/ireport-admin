import {
    Activity,
    AlertTriangle,
    BarChart3,
    Calendar,
    CheckCircle,
    Clock,
    Download,
    FileSpreadsheet,
    FileText,
    Filter,
    Info,
    MapPin,
    PieChart,
    Printer,
    RefreshCw,
    TrendingUp
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { barangaysByMunicipality, municipalities } from '../data/camarinesNorteLocations';
import { getSessionScope, isStationScoped, SessionScope } from '../utils/sessionScope';

interface ReportStats {
  total: number;
  pending: number;
  responding: number;
  resolved: number;
  byAgency: { agency_type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byDay: { date: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
  mostActiveArea?: { area: string; count: number } | null;
  avgResponseTime?: number | null;    // in minutes
  avgResolutionTime?: number | null;  // in minutes
}

interface ReportConfig {
  dateRange: 'today' | '7d' | '30d' | '90d' | 'custom';
  customStartDate: string;
  customEndDate: string;
  agencies: string[];
  statuses: string[];
  municipality: string;
  barangay: string;
  includeFields: {
    description: boolean;
    location: boolean;
    reporter: boolean;
    timeline: boolean;
    media: boolean;
  };
  format: 'csv' | 'pdf';
  groupBy: 'none' | 'agency' | 'status' | 'date' | 'location';
}

const AGENCIES = ['PNP', 'BFP', 'PDRRMO'];
const STATUSES = ['pending', 'assigned', 'responding', 'resolved', 'closed'];

function Reports() {
  const initialScope = getSessionScope();
  const [sessionScope, setSessionScope] = useState<SessionScope>(initialScope);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedAgency, setSelectedAgency] = useState(
    initialScope.role === 'Chief' && initialScope.agencyShortName
      ? initialScope.agencyShortName.toLowerCase()
      : 'all'
  );
  const [generating, setGenerating] = useState(false);
  const [showReportBuilder, setShowReportBuilder] = useState(false);
  const [skipCacheNext, setSkipCacheNext] = useState(false);
  
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    dateRange: '30d',
    customStartDate: '',
    customEndDate: '',
    agencies:
      initialScope.role === 'Chief' && initialScope.agencyShortName
        ? [initialScope.agencyShortName.toUpperCase()]
        : [],
    statuses: [],
    municipality: '',
    barangay: '',
    includeFields: {
      description: true,
      location: true,
      reporter: true,
      timeline: true,
      media: false,
    },
    format: 'csv',
    groupBy: 'none',
  });
  const stationScopeActive = isStationScoped(sessionScope);

  const barangayOptions = useMemo(
    () => (reportConfig.municipality ? barangaysByMunicipality[reportConfig.municipality] || [] : []),
    [reportConfig.municipality]
  );

  useEffect(() => {
    loadStats();
  }, [dateRange, selectedAgency, customStart, customEnd]);

  useEffect(() => {
    if (stationScopeActive) {
      // Set agency filter
      if (sessionScope.agencyShortName) {
        const scopedAgency = sessionScope.agencyShortName.toUpperCase();
        setReportConfig(prev => ({
          ...prev,
          agencies: [scopedAgency],
          // Also default municipality to station's municipality if available
          municipality: sessionScope.stationMunicipality || prev.municipality,
        }));
        setSelectedAgency(sessionScope.agencyShortName.toLowerCase());
      }
      // Default municipality to station's municipality
      if (sessionScope.stationMunicipality) {
        setReportConfig(prev => ({
          ...prev,
          municipality: sessionScope.stationMunicipality || prev.municipality,
        }));
      }
    }
  }, [stationScopeActive, sessionScope.agencyShortName, sessionScope.stationMunicipality]);

  const loadStats = async (skipCache = false) => {
    if (skipCache) setSkipCacheNext(true);
    setLoading(true);
    try {
      const dateFilters = (() => {
        const to = new Date();
        let from: Date | null = null;

        switch (dateRange) {
          case 'today':
            from = new Date(to);
            from.setHours(0, 0, 0, 0);
            break;
          case '7d':
            from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
            break;
          case '90d':
            from = new Date(to.getTime() - 89 * 24 * 60 * 60 * 1000);
            break;
          case '1y':
            from = new Date(to.getTime() - 364 * 24 * 60 * 60 * 1000);
            break;
          case 'custom':
            if (!customStart || !customEnd) return null;
            from = new Date(customStart);
            const customTo = new Date(customEnd);
            customTo.setHours(23, 59, 59, 999);
            return { from: from.toISOString(), to: customTo.toISOString() };
          default:
            break;
        }

        if (from) {
          const toCopy = new Date(to);
          toCopy.setHours(23, 59, 59, 999);
          return { from: from.toISOString(), to: toCopy.toISOString() };
        }
        return null;
      })();

      const payload: any = dateFilters ? { ...dateFilters } : {};
      const scope = getSessionScope();
      setSessionScope(scope);

      if (isStationScoped(scope)) {
        payload.stationId = scope.stationId;
        if (scope.agencyShortName) {
          payload.agency = scope.agencyShortName.toLowerCase();
        }
      } else if (selectedAgency !== 'all') {
        payload.agency = selectedAgency;
      }

      if (skipCacheNext || skipCache) {
        payload.skipCache = true;
      }

      const data = await window.api.getStats(Object.keys(payload).length ? payload : undefined);
      // Use real data from API
      setStats({
        ...data,
        byStatus: [
          { status: 'pending', count: data.pending },
          { status: 'responding', count: data.responding },
          { status: 'resolved', count: data.resolved },
        ],
        byDay: data.dailyTrend || [],
        dailyTrend: data.dailyTrend || [],
        mostActiveArea: data.mostActiveArea,
        avgResponseTime: data.avgResponseTime,
        avgResolutionTime: data.avgResolutionTime,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
      setSkipCacheNext(false);
    }
  };

  const getAgencyColor = (agency: string) => {
    switch (agency.toLowerCase()) {
      case 'pnp': return 'bg-blue-500';
      case 'bfp': return 'bg-red-500';
      case 'pdrrmo': return 'bg-teal-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'responding': return 'bg-orange-500';
      case 'resolved': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  // Format duration in minutes to human-readable string
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    } else if (minutes < 60 * 24) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    } else {
      const days = Math.floor(minutes / (60 * 24));
      const hours = Math.floor((minutes % (60 * 24)) / 60);
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
  };

  const toggleAgency = (agency: string) => {
    if (stationScopeActive) return;
    setReportConfig(prev => ({
      ...prev,
      agencies: prev.agencies.includes(agency)
        ? prev.agencies.filter(a => a !== agency)
        : [...prev.agencies, agency]
    }));
  };

  const toggleStatus = (status: string) => {
    setReportConfig(prev => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status]
    }));
  };

  const toggleField = (field: keyof ReportConfig['includeFields']) => {
    setReportConfig(prev => ({
      ...prev,
      includeFields: {
        ...prev.includeFields,
        [field]: !prev.includeFields[field]
      }
    }));
  };

  const getDateRangeLabel = () => {
    switch (reportConfig.dateRange) {
      case 'today': return 'Today';
      case '7d': return 'Last 7 days';
      case '30d': return 'Last 30 days';
      case '90d': return 'Last 90 days';
      case 'custom': return 'Custom range';
      default: return 'All time';
    }
  };

  const generateFilename = (extension: string) => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    
    // Build descriptive filename parts
    const parts = ['iReport', 'Incident_Report'];
    
    // Add date range
    if (reportConfig.dateRange === 'custom' && reportConfig.customStartDate && reportConfig.customEndDate) {
      parts.push(`${reportConfig.customStartDate}_to_${reportConfig.customEndDate}`);
    } else {
      parts.push(reportConfig.dateRange.replace('d', 'days'));
    }
    
    // Add agencies if filtered
    if (reportConfig.agencies.length > 0) {
      parts.push(reportConfig.agencies.join('-'));
    }
    
    // Add statuses if filtered
    if (reportConfig.statuses.length > 0) {
      parts.push(reportConfig.statuses.join('-'));
    }
    
    // Add timestamp
    parts.push(`${dateStr}_${timeStr}`);
    
    return `${parts.join('_')}.${extension}`;
  };

  const generateReport = async () => {
    // Validation
    if (reportConfig.dateRange === 'custom') {
      if (!reportConfig.customStartDate || !reportConfig.customEndDate) {
        alert('Please select both start and end dates');
        return;
      }
      if (new Date(reportConfig.customStartDate) > new Date(reportConfig.customEndDate)) {
        alert('Start date cannot be later than end date');
        return;
      }
    }

    setGenerating(true);
    try {
      // Get incidents with filters
      const filters: any = {};
      
      if (reportConfig.agencies.length > 0) {
        filters.agency = reportConfig.agencies[0].toLowerCase(); // API supports single agency for now
      }
      if (reportConfig.statuses.length > 0) {
        filters.status = reportConfig.statuses[0]; // API supports single status for now
      }
      if (reportConfig.municipality) {
        filters.municipality = reportConfig.municipality;
      }
      if (reportConfig.barangay) {
        filters.barangay = reportConfig.barangay;
      }

      const scope = getSessionScope();
      setSessionScope(scope);
      if (isStationScoped(scope)) {
        filters.stationId = scope.stationId;
        filters.agency = scope.agencyShortName?.toLowerCase();
      }

      // Use high limit to get all incidents for report generation
      const response: any = await window.api.getIncidents({ ...filters, limit: 10000 });
      // Handle both paginated response and legacy array response
      const incidents = Array.isArray(response) ? response : (response.data || []);
      
      // Filter by date range
      let filteredIncidents = incidents;
      const now = new Date();

      if (isStationScoped(scope) && scope.stationId) {
        filteredIncidents = filteredIncidents.filter((i: any) => i.assigned_station_id === scope.stationId);
      }
      
      if (reportConfig.dateRange !== 'custom') {
        const daysMap: Record<string, number> = {
          'today': 1,
          '7d': 7,
          '30d': 30,
          '90d': 90,
        };
        const days = daysMap[reportConfig.dateRange] || 365;
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        filteredIncidents = incidents.filter((i: any) => new Date(i.created_at) >= cutoff);
      } else if (reportConfig.customStartDate && reportConfig.customEndDate) {
        const start = new Date(reportConfig.customStartDate);
        const end = new Date(reportConfig.customEndDate);
        end.setHours(23, 59, 59, 999);
        filteredIncidents = incidents.filter((i: any) => {
          const date = new Date(i.created_at);
          return date >= start && date <= end;
        });
      }

      // Filter by multiple agencies/statuses if needed
      if (reportConfig.agencies.length > 0) {
        filteredIncidents = filteredIncidents.filter((i: any) => 
          reportConfig.agencies.map(a => a.toLowerCase()).includes(i.agency_type?.toLowerCase())
        );
      }
      if (reportConfig.statuses.length > 0) {
        filteredIncidents = filteredIncidents.filter((i: any) => 
          reportConfig.statuses.includes(i.status)
        );
      }
      if (reportConfig.municipality) {
        const muni = reportConfig.municipality.toLowerCase();
        filteredIncidents = filteredIncidents.filter((i: any) => 
          (i.location_address || '').toLowerCase().includes(muni)
        );
      }
      if (reportConfig.barangay) {
        const brgy = reportConfig.barangay.toLowerCase();
        filteredIncidents = filteredIncidents.filter((i: any) => 
          (i.location_address || '').toLowerCase().includes(brgy)
        );
      }

      // Build report data based on included fields
      const reportData = filteredIncidents.map((incident: any) => {
        const row: any = {
          id: incident.id,
          agency: incident.agency_type?.toUpperCase(),
          status: incident.status,
          created_at: incident.created_at,
        };

        if (reportConfig.includeFields.description) {
          row.description = incident.description;
        }
        if (reportConfig.includeFields.location) {
          row.location_address = incident.location_address;
          row.latitude = incident.latitude;
          row.longitude = incident.longitude;
        }
        if (reportConfig.includeFields.reporter) {
          row.reporter_name = incident.reporter_name;
          row.reporter_age = incident.reporter_age;
        }
        if (reportConfig.includeFields.timeline) {
          row.updated_at = incident.updated_at;
        }
        if (reportConfig.includeFields.media) {
          row.media_urls = incident.media_urls;
        }

        return row;
      });

      // Group data if needed
      let finalData: any = reportData;
      if (reportConfig.groupBy !== 'none') {
        const grouped: Record<string, any[]> = {};
        reportData.forEach((item: any) => {
          let key = '';
          switch (reportConfig.groupBy) {
            case 'agency': key = item.agency || 'Unknown'; break;
            case 'status': key = item.status || 'Unknown'; break;
            case 'date': key = item.created_at?.split('T')[0] || 'Unknown'; break;
            case 'location': key = item.location_address?.split(',')[0] || 'Unknown'; break;
          }
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(item);
        });
        finalData = grouped;
      }

      // Generate file based on format
      let content = '';
      let filename = '';
      let mimeType = '';

      if (reportConfig.format === 'csv') {
        if (reportConfig.groupBy !== 'none') {
          // Flatten grouped data for CSV
          const flatData: any[] = [];
          Object.entries(finalData).forEach(([group, items]) => {
            (items as any[]).forEach(item => {
              flatData.push({ group, ...item });
            });
          });
          finalData = flatData;
        }
        
        if (Array.isArray(finalData) && finalData.length > 0) {
          const headers = Object.keys(finalData[0]);
          const csvRows = [headers.join(',')];
          finalData.forEach((row: any) => {
            const values = headers.map(h => {
              const val = row[h];
              if (val === null || val === undefined) return '';
              const str = String(val).replace(/"/g, '""');
              return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
            });
            csvRows.push(values.join(','));
          });
          content = csvRows.join('\n');
        }
        filename = generateFilename('csv');
        mimeType = 'text/csv';
      } else if (reportConfig.format === 'pdf') {
        // Generate PDF with preview first
        const html = generatePrintableHTML(finalData, reportConfig);
        const pdfFilename = generateFilename('pdf');
        
        try {
          // Open preview window - save dialog appears when user clicks Save
          await window.api.previewPdf({ html, filename: pdfFilename });
        } catch (err) {
          console.error('Failed to preview PDF:', err);
          alert('Failed to generate PDF preview. Please try again.');
        }
        setGenerating(false);
        return;
      }

      // Download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const generatePrintableHTML = (data: any, config: ReportConfig) => {
    const title = `Incident Report - ${getDateRangeLabel()}`;
    const generatedAt = new Date().toLocaleString();
    
    let tableRows = '';
    const items = Array.isArray(data) ? data : Object.values(data).flat();
    
    (items as any[]).forEach((item: any) => {
      // Format media URLs for display
      let mediaCell = '-';
      if (config.includeFields.media && item.media_urls) {
        const urls = Array.isArray(item.media_urls) ? item.media_urls : 
          (typeof item.media_urls === 'string' ? JSON.parse(item.media_urls || '[]') : []);
        if (urls.length > 0) {
          mediaCell = `${urls.length} file(s)`;
        }
      }
      
      tableRows += `
        <tr>
          <td>${item.id?.substring(0, 8).toUpperCase() || '-'}</td>
          <td>${item.agency || '-'}</td>
          <td>${item.status || '-'}</td>
          ${config.includeFields.description ? `<td>${item.description || '-'}</td>` : ''}
          ${config.includeFields.location ? `<td>${item.location_address || '-'}</td>` : ''}
          ${config.includeFields.reporter ? `<td>${item.reporter_name || 'Anonymous'}</td>` : ''}
          ${config.includeFields.media ? `<td>${mediaCell}</td>` : ''}
          <td>${item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
        </tr>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1e40af; margin-bottom: 5px; }
          .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f3f4f6; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9fafb; }
          .summary { margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>iReport - ${title}</h1>
        <p class="meta">Generated: ${generatedAt} | Total Records: ${(items as any[]).length}</p>
        
        <div class="summary">
          <strong>Filters Applied:</strong>
          ${config.agencies.length > 0 ? `Agencies: ${config.agencies.join(', ')}` : 'All Agencies'} | 
          ${config.statuses.length > 0 ? `Status: ${config.statuses.join(', ')}` : 'All Statuses'}
        </div>
        
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Agency</th>
              <th>Status</th>
              ${config.includeFields.description ? '<th>Description</th>' : ''}
              ${config.includeFields.location ? '<th>Location</th>' : ''}
              ${config.includeFields.reporter ? '<th>Reporter</th>' : ''}
              ${config.includeFields.media ? '<th>Media</th>' : ''}
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const totalIncidents = stats?.total || 0;
  const resolvedRate = totalIncidents > 0 
    ? Math.round((stats?.resolved || 0) / totalIncidents * 100) 
    : 0;

  return (
    <div className="p-6 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Reports & Analytics</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Incident statistics and trends</p>
        </div>
        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
            <option value="custom">Custom</option>
          </select>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
              />
              <span className="text-gray-500 dark:text-gray-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white text-sm"
              />
            </div>
          )}
          <button
            onClick={() => setShowReportBuilder(!showReportBuilder)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
            Generate Report
          </button>
          <button
            onClick={() => loadStats(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors dark:text-white"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {stationScopeActive && (
        <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-100">
          Reports are limited to your station{sessionScope.stationName ? ` (${sessionScope.stationName})` : ''}. Agency selection is locked to your station.
        </div>
      )}

      {/* Report Builder Panel */}
      {showReportBuilder && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Custom Report Builder
            </h3>
            <button
              onClick={() => setShowReportBuilder(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Filters */}
            <div className="space-y-4">
              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Date Range
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['today', '7d', '30d', '90d', 'custom'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setReportConfig(prev => ({ ...prev, dateRange: range }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        reportConfig.dateRange === range
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {range === 'today' ? 'Today' : range === 'custom' ? 'Custom' : `Last ${range.replace('d', ' days')}`}
                    </button>
                  ))}
                </div>
                {reportConfig.dateRange === 'custom' && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="date"
                      value={reportConfig.customStartDate}
                      onChange={(e) => setReportConfig(prev => ({ ...prev, customStartDate: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm"
                    />
                    <span className="text-gray-500 dark:text-gray-400 self-center">to</span>
                    <input
                      type="date"
                      value={reportConfig.customEndDate}
                      onChange={(e) => setReportConfig(prev => ({ ...prev, customEndDate: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Agencies */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Agencies (leave empty for all)
                </label>
                <div className="flex flex-wrap gap-2">
                  {AGENCIES.map((agency) => (
                    <button
                      key={agency}
                      onClick={() => toggleAgency(agency)}
                      disabled={stationScopeActive}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        reportConfig.agencies.includes(agency)
                          ? agency === 'PNP' ? 'bg-blue-600 text-white' 
                            : agency === 'BFP' ? 'bg-red-600 text-white'
                            : 'bg-teal-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      } ${
                        stationScopeActive ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                    >
                      {agency}
                    </button>
                  ))}
                </div>
              </div>

              {/* Statuses */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status (leave empty for all)
                </label>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                        reportConfig.statuses.includes(status)
                          ? status === 'pending' ? 'bg-yellow-500 text-white'
                            : status === 'assigned' ? 'bg-blue-500 text-white'
                            : status === 'responding' ? 'bg-orange-500 text-white'
                            : status === 'resolved' ? 'bg-green-500 text-white'
                            : status === 'closed' ? 'bg-gray-800 text-white'
                            : 'bg-green-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Municipality / Barangay */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Municipality
                  </label>
                  <select
                    value={reportConfig.municipality}
                    onChange={(e) => {
                      const value = e.target.value;
                      setReportConfig(prev => ({ ...prev, municipality: value, barangay: '' }));
                    }}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option value="">All Municipalities</option>
                    {municipalities.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Barangay
                  </label>
                  <select
                    value={reportConfig.barangay}
                    onChange={(e) => setReportConfig(prev => ({ ...prev, barangay: e.target.value }))}
                    disabled={!reportConfig.municipality}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm disabled:opacity-60"
                  >
                    <option value="">All Barangays</option>
                    {barangayOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right Column - Options */}
            <div className="space-y-4">
              {/* Include Fields */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Include Fields
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(reportConfig.includeFields).map(([field, enabled]) => (
                    <label
                      key={field}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleField(field as keyof ReportConfig['includeFields'])}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{field}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Group By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Group By
                </label>
                <select
                  value={reportConfig.groupBy}
                  onChange={(e) => setReportConfig(prev => ({ ...prev, groupBy: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="none">No Grouping</option>
                  <option value="agency">Agency</option>
                  <option value="status">Status</option>
                  <option value="date">Date</option>
                  <option value="location">Location</option>
                </select>
              </div>

              {/* Export Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Export Format
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReportConfig(prev => ({ ...prev, format: 'csv' }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                      reportConfig.format === 'csv'
                        ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400'
                        : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    CSV
                  </button>
                  <button
                    onClick={() => setReportConfig(prev => ({ ...prev, format: 'pdf' }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                      reportConfig.format === 'pdf'
                        ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400'
                        : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Printer className="w-4 h-4" />
                    Print/PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium">Preview:</span>{' '}
              {getDateRangeLabel()} • {reportConfig.agencies.length > 0 ? reportConfig.agencies.join(', ') : 'All Agencies'} • {reportConfig.statuses.length > 0 ? reportConfig.statuses.join(', ') : 'All Statuses'} • {reportConfig.format.toUpperCase()}
            </div>
            <button
              onClick={generateReport}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Generate & Download
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
<span className="text-xs text-gray-400 italic" title="Trend data coming soon">--</span>
          </div>
          <p className="text-3xl font-bold text-gray-800 dark:text-white">{stats?.total || 0}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Incidents</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
<span className="text-xs text-gray-400 italic" title="Trend data coming soon">--</span>
          </div>
          <p className="text-3xl font-bold text-gray-800 dark:text-white">{stats?.pending || 0}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pending Response</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
<span className="text-xs text-gray-400 italic" title="Trend data coming soon">--</span>
          </div>
          <p className="text-3xl font-bold text-gray-800 dark:text-white">{stats?.resolved || 0}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Resolved</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-800 dark:text-white">{resolvedRate}%</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Resolution Rate</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Incidents by Agency */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-gray-400" />
            Incidents by Agency
          </h3>
          <div className="space-y-4">
            {stats?.byAgency.map((item) => {
              const percentage = totalIncidents > 0 
                ? Math.round(item.count / totalIncidents * 100) 
                : 0;
              return (
                <div key={item.agency_type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase">
                      {item.agency_type}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {item.count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getAgencyColor(item.agency_type)} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(!stats?.byAgency || stats.byAgency.length === 0) && (
              <p className="text-gray-400 text-center py-8">No data available</p>
            )}
          </div>
        </div>

        {/* Incidents by Status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-400" />
            Incidents by Status
          </h3>
          <div className="space-y-4">
            {stats?.byStatus.map((item) => {
              const percentage = totalIncidents > 0 
                ? Math.round(item.count / totalIncidents * 100) 
                : 0;
              return (
                <div key={item.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                      {item.status}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {item.count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStatusColor(item.status)} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 md:p-6">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-400" />
          Daily Incident Trend
          <span className="text-sm font-normal text-gray-400 ml-2">
            {dateRange === 'custom' && customStart && customEnd
              ? `${customStart} to ${customEnd}`
              : dateRange === 'today'
                ? 'Today'
                : dateRange === '7d'
                  ? 'Last 7 days'
                  : dateRange === '30d'
                    ? 'Last 30 days'
                    : dateRange === '90d'
                      ? 'Last 90 days'
                      : dateRange === '1y'
                        ? 'Last year'
                        : 'All time'}
          </span>
        </h3>
        {stats?.dailyTrend && stats.dailyTrend.length > 0 ? (
          <div className="flex flex-col gap-4">
            {/* Bar Chart with horizontal scroll when many days */}
            <div className="overflow-x-auto pb-3">
              <div
                className="flex items-end gap-3 px-3 md:px-6 pt-2 pb-4 min-h-[12rem]"
                style={{
                  minWidth: stats.dailyTrend.length < 14 ? '100%' : `${stats.dailyTrend.length * 46}px`,
                  justifyContent: stats.dailyTrend.length < 14 ? 'space-between' : 'flex-start',
                }}
              >
                {(() => {
                  const maxCount = Math.max(...stats.dailyTrend.map(d => d.count), 1);
                  const totalDays = stats.dailyTrend.length;
                  const labelStep = totalDays > 42 ? 4 : totalDays > 28 ? 3 : totalDays > 16 ? 2 : 1;

                  return stats.dailyTrend.map((day, index) => {
                    const heightPercent = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                    const dayName = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNum = new Date(day.date).getDate();
                    const showLabel = (index % labelStep === 0) || index === totalDays - 1;
                    
                    return (
                      <div key={index} className="w-8 flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {day.count}
                        </span>
                        <div className="w-full h-40 flex items-end">
                          <div 
                            className={`w-full rounded-t-md transition-all duration-500 hover:bg-blue-600 cursor-pointer ${day.count > 0 ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                            style={{ height: `${day.count > 0 ? heightPercent : 4}%` }}
                            title={`${day.date}: ${day.count} incidents`}
                          />
                        </div>
                        <div className="text-center h-8">
                          {showLabel ? (
                            <>
                              <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 leading-tight">{dayName}</p>
                              <p className="text-[10px] text-gray-400 leading-tight">{dayNum}</p>
                            </>
                          ) : (
                            <span className="text-[10px] text-transparent select-none">.</span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            {/* Summary */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm px-3 md:px-6">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">
                  Total this week:
                </span>
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {stats.dailyTrend.reduce((sum, d) => sum + d.count, 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">
                  Daily avg:
                </span>
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {(stats.dailyTrend.reduce((sum, d) => sum + d.count, 0) / Math.max(stats.dailyTrend.length, 1)).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <BarChart3 className="w-12 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No Data Yet</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm">Trend data will appear once incidents are recorded</p>
            </div>
          </div>
        )}
      </div>

      {/* Response Time Stats */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-white">Performance Metrics</h3>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 ${stats?.avgResponseTime == null ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                  {stats?.avgResponseTime != null ? formatDuration(stats.avgResponseTime) : '--'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg. Response Time</p>
              </div>
            </div>
            {stats?.avgResponseTime != null ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Time to first response</p>
            ) : (
              <p className="text-xs text-gray-400 italic">No response data yet</p>
            )}
          </div>

          <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 ${stats?.avgResolutionTime == null ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                  {stats?.avgResolutionTime != null ? formatDuration(stats.avgResolutionTime) : '--'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg. Resolution Time</p>
              </div>
            </div>
            {stats?.avgResolutionTime != null ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Time to resolve incident</p>
            ) : (
              <p className="text-xs text-gray-400 italic">
                {stats?.resolved === 0 ? 'No resolved incidents in this period' : 'No resolution data yet'}
              </p>
            )}
          </div>

          <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 ${!stats?.mostActiveArea ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                  {stats?.mostActiveArea?.count || '--'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Most Active Area</p>
              </div>
            </div>
            {stats?.mostActiveArea ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate" title={stats.mostActiveArea.area}>
                {stats.mostActiveArea.area}
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic">No location data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;
