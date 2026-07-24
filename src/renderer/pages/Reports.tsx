import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Calendar,
    CheckCircle,
    Clock,
    Download,
    FileSpreadsheet,
    FileText,
    Filter,
    Info,
    Map,
    MapPin,
    PieChart,
    Printer,
    RefreshCw,
    TrendingUp,
    X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { barangaysByMunicipality, municipalities } from '../data/camarinesNorteLocations';
import { ReportsMap } from '../components/ReportsMap';
import { getAgencyPresentation } from '../utils/agencyPresentation';
import { getIncidentReference } from '../utils/incidentReference';
import { getSessionScope, isStationScoped, SessionScope } from '../utils/sessionScope';

interface ReportStats {
  total: number;
  pending: number;
  responding: number;
  resolved: number;
  active?: number;
  unassigned?: number;
  overdue?: number;
  casualtyAlerts?: number;
  awaitingDispatchDecision?: number;
  byAgency: { agency_type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byDay: { date: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
  mostActiveArea?: { area: string; count: number } | null;
  avgResponseTime?: number | null;    // in minutes
  avgResolutionTime?: number | null;  // in minutes
  responseSampleSize?: number;
  resolutionSampleSize?: number;
  trendGranularity?: 'day' | 'week' | 'month';
}

interface ReportConfig {
  dateRange: 'today' | '7d' | '30d' | '90d' | '1y' | 'custom';
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

const AGENCIES = ['PNP', 'BFP', 'MDRRMO'];
const STATUSES = ['pending', 'assigned', 'in_progress', 'responding', 'resolved', 'closed', 'rejected'];
const normalizeAgency = (agency?: string) => agency?.toLowerCase() === 'pdrrmo' ? 'mdrrmo' : agency;
const formatAgency = (agency?: string) => getAgencyPresentation(agency).shortLabel;
const parseLocalDate = (value: string) => new Date(`${value}T00:00:00`);

function getDateWindow(dateRange: string, customStart: string, customEnd: string) {
  const to = new Date();
  let from: Date | null = null;

  if (dateRange === 'today') {
    from = new Date(to);
    from.setHours(0, 0, 0, 0);
  } else if (dateRange === '7d') {
    from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  } else if (dateRange === '30d') {
    from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  } else if (dateRange === '90d') {
    from = new Date(to.getTime() - 89 * 24 * 60 * 60 * 1000);
  } else if (dateRange === '1y') {
    from = new Date(to.getTime() - 364 * 24 * 60 * 60 * 1000);
  } else if (dateRange === 'custom' && customStart && customEnd) {
    from = parseLocalDate(customStart);
    const customTo = parseLocalDate(customEnd);
    customTo.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: customTo.toISOString() };
  }

  if (!from) return null;
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: end.toISOString() };
}

function getVisibleDateLabel(dateRange: string, customStart: string, customEnd: string) {
  if (dateRange === 'custom') return customStart && customEnd ? `${customStart} to ${customEnd}` : 'Custom range needs dates';
  if (dateRange === 'today') return 'Today';
  if (dateRange === '7d') return 'Last 7 days';
  if (dateRange === '30d') return 'Last 30 days';
  if (dateRange === '90d') return 'Last 90 days';
  return 'Last year';
}

function Reports() {
  const navigate = useNavigate();
  const initialScope = useMemo(() => getSessionScope(), []);
  const [sessionScope, setSessionScope] = useState<SessionScope>(initialScope);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState<ReportConfig['dateRange']>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedAgency, setSelectedAgency] = useState(
    initialScope.role === 'Chief' && initialScope.agencyShortName
      ? initialScope.agencyShortName.toLowerCase()
      : 'all'
  );
  const [generating, setGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportMatchCount, setReportMatchCount] = useState<number | null>(null);
  const [showReportBuilder, setShowReportBuilder] = useState(false);
  const [skipCacheNext, setSkipCacheNext] = useState(false);
  const [activeTab, setActiveTab] = useState<'analytics' | 'map'>('analytics');
  
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    dateRange: dateRange as ReportConfig['dateRange'],
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

  const syncReportScope = () => {
    setReportConfig((current) => ({
      ...current,
      dateRange: dateRange as ReportConfig['dateRange'],
      customStartDate: customStart,
      customEndDate: customEnd,
      agencies: stationScopeActive && sessionScope.agencyShortName
        ? [sessionScope.agencyShortName.toUpperCase()]
        : selectedAgency === 'all' ? [] : [selectedAgency.toUpperCase()],
    }));
    setReportError(null);
    setReportMatchCount(null);
    setShowReportBuilder(true);
  };

  const barangayOptions = useMemo(
    () => (reportConfig.municipality ? barangaysByMunicipality[reportConfig.municipality] || [] : []),
    [reportConfig.municipality]
  );

  useEffect(() => {
    if (dateRange === 'custom' && (!customStart || !customEnd)) {
      setLoading(false);
      setStats(null);
      setLoadError('Choose both a start and end date to load a custom analytics range.');
      return;
    }
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
    setLoadError(null);
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
      setStats({
        ...data,
        byStatus: data.byStatus || [
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
      setLastLoadedAt(new Date());
    } catch (error) {
      console.error('Failed to load stats:', error);
      setLoadError(stats
        ? 'Live analytics could not be refreshed. The displayed snapshot may be stale.'
        : 'Live analytics are unavailable. No unverified fallback values are being shown.');
    } finally {
      setLoading(false);
      setSkipCacheNext(false);
    }
  };

  const getAgencyColor = (agency: string) => {
    switch (normalizeAgency(agency)?.toLowerCase()) {
      case 'pnp': return 'bg-blue-500';
      case 'bfp': return 'bg-red-500';
      case 'mdrrmo': return 'bg-cyan-500';
      default: return 'bg-amber-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'responding': return 'bg-orange-500';
      case 'resolved': return 'bg-green-500';
      default: return 'bg-slate-500';
    }
  };

  const getStatusLabel = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

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
      case '1y': return 'Last year';
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
    setReportError(null);
    setReportMatchCount(null);
    // Validation
    if (reportConfig.dateRange === 'custom') {
      if (!reportConfig.customStartDate || !reportConfig.customEndDate) {
        setReportError('Choose both a start and end date before exporting.');
        return;
      }
      if (parseLocalDate(reportConfig.customStartDate) > parseLocalDate(reportConfig.customEndDate)) {
        setReportError('The start date cannot be later than the end date.');
        return;
      }
    }

    setGenerating(true);
    try {
      // Get incidents with filters
      const filters: any = {};
      
      if (reportConfig.agencies.length === 1) {
        filters.agency = reportConfig.agencies[0].toLowerCase();
      }
      if (reportConfig.statuses.length === 1) {
        filters.status = reportConfig.statuses[0];
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

      // Read every page so multi-select exports cannot silently omit records.
      const incidents: any[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response: any = await window.api.getIncidents({ ...filters, page, pageSize: 500 });
        if (Array.isArray(response)) {
          incidents.push(...response);
          totalPages = 1;
        } else {
          incidents.push(...(response?.data || []));
          totalPages = Math.max(1, Number(response?.totalPages || 1));
        }
        page += 1;
      } while (page <= totalPages);
      
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
         filteredIncidents = filteredIncidents.filter((i: any) => new Date(i.created_at) >= cutoff);
      } else if (reportConfig.customStartDate && reportConfig.customEndDate) {
        const start = parseLocalDate(reportConfig.customStartDate);
        const end = parseLocalDate(reportConfig.customEndDate);
        end.setHours(23, 59, 59, 999);
         filteredIncidents = filteredIncidents.filter((i: any) => {
          const date = new Date(i.created_at);
          return date >= start && date <= end;
        });
      }

      // Filter by multiple agencies/statuses if needed
      if (reportConfig.agencies.length > 0) {
        filteredIncidents = filteredIncidents.filter((i: any) => 
          reportConfig.agencies.map(a => a.toLowerCase()).includes(normalizeAgency(i.agency_type)?.toLowerCase() || '')
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

      setReportMatchCount(filteredIncidents.length);
      if (filteredIncidents.length === 0) {
        setReportError('No incidents match this export scope. Adjust the filters and try again.');
        return;
      }

      // Build report data based on included fields
      const reportData = filteredIncidents.map((incident: any) => {
        const row: any = {
          incident_reference: getIncidentReference(incident),
          agency: formatAgency(incident.agency_type),
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
          setReportError('The PDF preview could not be generated. Try again or export CSV.');
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
      setReportError('The export could not be generated. Check the connection and try again.');
    } finally {
      setGenerating(false);
    }
  };

  const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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
          <td>${escapeHtml(item.incident_reference || '-')}</td>
          <td>${escapeHtml(item.agency || '-')}</td>
          <td>${escapeHtml(item.status || '-')}</td>
          ${config.includeFields.description ? `<td>${escapeHtml(item.description || '-')}</td>` : ''}
          ${config.includeFields.location ? `<td>${escapeHtml(item.location_address || '-')}</td>` : ''}
          ${config.includeFields.reporter ? `<td>${escapeHtml(item.reporter_name || 'Anonymous')}</td>` : ''}
          ${config.includeFields.media ? `<td>${escapeHtml(mediaCell)}</td>` : ''}
          <td>${escapeHtml(item.created_at ? new Date(item.created_at).toLocaleDateString() : '-')}</td>
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
              <th>Incident reference</th>
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
      <div className="flex h-full items-center justify-center" role="status" aria-label="Loading reports and analytics">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="sr-only">Loading reports and analytics</span>
      </div>
    );
  }

  const totalIncidents = stats?.total || 0;
  const awaitingApprovalIncidents = stats?.awaitingDispatchDecision ?? (
    stats?.byAgency
      ?.filter((item) => !normalizeAgency(item.agency_type) || normalizeAgency(item.agency_type)?.toLowerCase() === 'unknown')
      .reduce((sum, item) => sum + item.count, 0) || 0
  );
  const resolvedRate = totalIncidents > 0 
    ? Math.round((stats?.resolved || 0) / totalIncidents * 100) 
    : 0;

  return (
    <div className="min-h-full bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Operational statistics and trends</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Scope: {stationScopeActive ? `${sessionScope.stationName || 'Your station'}${sessionScope.agencyShortName ? ` · ${sessionScope.agencyShortName.toUpperCase()}` : ''}` : selectedAgency === 'all' ? 'All agencies' : selectedAgency.toUpperCase()}
            {' · '}{getVisibleDateLabel(dateRange, customStart, customEnd)}
            {lastLoadedAt && ` · Updated ${lastLoadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           {!stationScopeActive && (
             <select
               value={selectedAgency}
               onChange={(e) => setSelectedAgency(e.target.value)}
               aria-label="Analytics agency scope"
               className="min-h-10 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
             >
               <option value="all">All agencies</option>
               {AGENCIES.map((agency) => <option key={agency} value={agency.toLowerCase()}>{agency}</option>)}
             </select>
           )}
           <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
             aria-label="Analytics date range"
             className="min-h-10 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
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
                className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
              />
              <span className="text-slate-500 dark:text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
              />
            </div>
          )}
          {activeTab === 'analytics' && <button
            type="button"
            onClick={syncReportScope}
            aria-expanded={showReportBuilder}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <FileText className="w-4 h-4" />
            Create export
          </button>}
          <button
            type="button"
            onClick={() => loadStats(true)}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
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

      {loadError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError(null)} aria-label="Dismiss analytics error" className="min-h-8 min-w-8 rounded-lg hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-900/40"><X size={16} /></button>
        </div>
      )}

      {/* Tab Switcher */}
      <div role="tablist" aria-label="Reports views" className="mb-5 flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          onClick={() => setActiveTab('analytics')}
           className={`flex min-h-10 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            activeTab === 'analytics'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'map'}
          onClick={() => setActiveTab('map')}
           className={`flex min-h-10 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            activeTab === 'map'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Map className="w-4 h-4" />
          Incident Map
        </button>
      </div>

      {!stats && activeTab === 'analytics' && (
        <section className="rounded-xl border border-red-200 bg-white p-8 text-center dark:border-red-900/60 dark:bg-slate-900" aria-live="polite">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Verified analytics are unavailable</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-300">No placeholder counts are shown because the statistics service did not return verified data. Check the connection and retry.</p>
          <button type="button" onClick={() => loadStats(true)} className="mt-4 min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Retry analytics</button>
        </section>
      )}

      {/* Map Tab */}
      {activeTab === 'map' && (
        <ReportsMap
          agency={selectedAgency}
          dateRange={dateRange}
          customStart={customStart}
          customEnd={customEnd}
          stationId={stationScopeActive ? sessionScope.stationId : undefined}
          scopeLabel={stationScopeActive ? sessionScope.stationName || 'Your station' : undefined}
        />
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && stats && (<>
      {/* Report Builder Panel */}
      {showReportBuilder && (
         <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/60 dark:bg-blue-950/20 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Custom Report Builder
            </h3>
             <button
               type="button"
               onClick={() => setShowReportBuilder(false)}
               aria-label="Close report builder"
               className="min-h-10 min-w-10 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
             >
               <X size={18} />
            </button>
          </div>

          <p className="mb-4 text-xs text-slate-600 dark:text-slate-300">
            Export scope starts from the visible analytics filters. Choose additional fields or grouping below, then verify the matching record count before downloading.
          </p>
          {reportError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{reportError}</div>}
          {reportMatchCount !== null && !reportError && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{reportMatchCount.toLocaleString()} matching incident{reportMatchCount === 1 ? '' : 's'} ready to export.</div>}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Left Column - Filters */}
            <div className="space-y-4">
              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Date Range
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['today', '7d', '30d', '90d', '1y', 'custom'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setReportConfig(prev => ({ ...prev, dateRange: range }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        reportConfig.dateRange === range
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {range === 'today' ? 'Today' : range === 'custom' ? 'Custom' : range === '1y' ? 'Last year' : `Last ${range.replace('d', ' days')}`}
                    </button>
                  ))}
                </div>
                {reportConfig.dateRange === 'custom' && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="date"
                      value={reportConfig.customStartDate}
                      onChange={(e) => setReportConfig(prev => ({ ...prev, customStartDate: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
                    />
                    <span className="text-slate-500 dark:text-slate-400 self-center">to</span>
                    <input
                      type="date"
                      value={reportConfig.customEndDate}
                      onChange={(e) => setReportConfig(prev => ({ ...prev, customEndDate: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Agencies */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                            : status === 'closed' ? 'bg-slate-800 text-white'
                            : 'bg-green-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Municipality
                  </label>
                  <select
                    value={reportConfig.municipality}
                    onChange={(e) => {
                      const value = e.target.value;
                      setReportConfig(prev => ({ ...prev, municipality: value, barangay: '' }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
                  >
                    <option value="">All Municipalities</option>
                    {municipalities.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Barangay
                  </label>
                  <select
                    value={reportConfig.barangay}
                    onChange={(e) => setReportConfig(prev => ({ ...prev, barangay: e.target.value }))}
                    disabled={!reportConfig.municipality}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm disabled:opacity-60"
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Include Fields
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(reportConfig.includeFields).map(([field, enabled]) => (
                    <label
                      key={field}
                      className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleField(field as keyof ReportConfig['includeFields'])}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">{field}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Group By */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Group By
                </label>
                <select
                  value={reportConfig.groupBy}
                  onChange={(e) => setReportConfig(prev => ({ ...prev, groupBy: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Export Format
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReportConfig(prev => ({ ...prev, format: 'csv' }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                      reportConfig.format === 'csv'
                        ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400'
                        : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
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
                        : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
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
          <div className="mt-6 flex flex-col gap-3 border-t border-blue-100 pt-4 dark:border-blue-900/60 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium">Preview:</span>{' '}
              {getDateRangeLabel()} • {reportConfig.agencies.length > 0 ? reportConfig.agencies.join(', ') : 'All Agencies'} • {reportConfig.statuses.length > 0 ? reportConfig.statuses.join(', ') : 'All Statuses'} • {reportConfig.format.toUpperCase()}
            </div>
            <button
              onClick={generateReport}
              disabled={generating}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Operational summary */}
      <section aria-label="Operational summary" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Incidents in scope', value: totalIncidents, hint: 'Created in selected period', icon: BarChart3, tone: 'blue', onClick: () => navigate('/incidents') },
          { label: 'Awaiting assignment', value: stats?.unassigned ?? stats?.pending ?? 0, hint: 'No station or officer assigned', icon: AlertTriangle, tone: 'amber', onClick: () => navigate('/incidents?status=pending') },
          { label: 'Overdue first response', value: stats?.overdue ?? 0, hint: 'Open for more than 15 minutes', icon: Clock, tone: 'red', onClick: () => navigate('/incidents') },
          { label: 'Resolved rate', value: `${resolvedRate}%`, hint: `${stats?.resolved || 0} resolved of ${totalIncidents}`, icon: CheckCircle, tone: 'green', onClick: () => navigate('/incidents?status=resolved') },
        ].map(({ label, value, hint, icon: Icon, tone, onClick }) => (
          <button key={label} type="button" onClick={onClick} className="group flex min-h-[112px] items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : tone === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : tone === 'green' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}><Icon size={20} /></span>
            <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span><span className="mt-1 block text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{value}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span></span>
          </button>
        ))}
      </section>

       {awaitingApprovalIncidents > 0 && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between" role="status">
            <div className="flex min-w-0 items-start gap-3">
              <Info size={18} className="mt-0.5 shrink-0" />
              <span><strong>{awaitingApprovalIncidents} incident{awaitingApprovalIncidents === 1 ? '' : 's'}</strong> await a dispatcher agency decision. AI recommendations remain advisory until approved.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const dateWindow = getDateWindow(dateRange, customStart, customEnd);
                const params = new URLSearchParams({ status: 'pending' });
                if (dateWindow) {
                  params.set('from', dateWindow.from);
                  params.set('to', dateWindow.to);
                }
                navigate(`/incidents?${params.toString()}`);
              }}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:border-amber-400 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50 sm:self-auto"
            >
              Review incidents
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        )}

       <div className="grid grid-cols-1 gap-4 mb-5 xl:grid-cols-2">
        {/* Incidents by Agency */}
         <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-slate-400" />
            Incidents by Agency
          </h3>
          <div className="space-y-4">
            {stats?.byAgency.map((item) => {
              const percentage = totalIncidents > 0 
                ? Math.round(item.count / totalIncidents * 100) 
                : 0;
              return (
                <button type="button" key={item.agency_type} onClick={() => navigate(`/incidents?agency=${encodeURIComponent(normalizeAgency(item.agency_type) || 'unknown')}`)} className="block w-full rounded-lg p-1 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                       {formatAgency(item.agency_type)}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {item.count} ({percentage}%)
                    </span>
                  </div>
                   <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden" role="progressbar" aria-label={`${formatAgency(item.agency_type)} incidents`} aria-valuenow={item.count} aria-valuemin={0} aria-valuemax={Math.max(totalIncidents, 1)}>
                    <div
                      className={`h-full ${getAgencyColor(item.agency_type)} transition-all duration-500 motion-reduce:transition-none`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </button>
              );
            })}
            {(!stats?.byAgency || stats.byAgency.length === 0) && (
              <p className="text-slate-400 text-center py-8">No data available</p>
            )}
          </div>
        </div>

        {/* Incidents by Status */}
         <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-400" />
            Incidents by Status
          </h3>
          <div className="space-y-4">
            {stats?.byStatus.map((item) => {
              const percentage = totalIncidents > 0 
                ? Math.round(item.count / totalIncidents * 100) 
                : 0;
              return (
                <button type="button" key={item.status} onClick={() => navigate(`/incidents?status=${encodeURIComponent(item.status)}`)} className="block w-full rounded-lg p-1 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
                       {getStatusLabel(item.status)}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {item.count} ({percentage}%)
                    </span>
                  </div>
                   <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden" role="progressbar" aria-label={`${getStatusLabel(item.status)} incidents`} aria-valuenow={item.count} aria-valuemin={0} aria-valuemax={Math.max(totalIncidents, 1)}>
                    <div
                      className={`h-full ${getStatusColor(item.status)} transition-all duration-500 motion-reduce:transition-none`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trend Chart */}
       <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 md:p-5">
         <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
         <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <TrendingUp className="w-5 h-5 text-slate-400" />
          Incident Volume Over Time
           <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
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
         <span className="text-xs text-slate-500 dark:text-slate-400">{stats?.trendGranularity === 'month' ? 'Monthly' : stats?.trendGranularity === 'week' ? 'Weekly' : 'Daily'} buckets · incident creation date</span>
         </div>
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
                    const parsedDate = new Date(`${day.date}${day.date.length === 10 ? 'T12:00:00' : '-01T12:00:00'}`);
                    const granularity = stats.trendGranularity || 'day';
                    const dayName = granularity === 'month'
                      ? parsedDate.toLocaleDateString('en-US', { month: 'short' })
                      : granularity === 'week'
                        ? 'Week'
                        : parsedDate.toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNum = granularity === 'month'
                      ? parsedDate.getFullYear()
                      : granularity === 'week'
                        ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : parsedDate.getDate();
                    const showLabel = (index % labelStep === 0) || index === totalDays - 1;
                    
                    return (
                      <div key={index} className="w-8 flex flex-col items-center gap-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {day.count}
                        </span>
                        <div className="w-full h-40 flex items-end">
                          <button
                            type="button"
                            aria-label={`${day.date}: ${day.count} incidents. Open matching incidents.`}
                            onClick={() => navigate(`/incidents?from=${encodeURIComponent(day.date)}&to=${encodeURIComponent(day.date)}`)}
                            className={`w-full rounded-t-md transition-colors duration-200 hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transition-none ${day.count > 0 ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                            style={{ height: `${day.count > 0 ? heightPercent : 4}%` }}
                          />
                        </div>
                        <div className="text-center h-8">
                          {showLabel ? (
                            <>
                              <p className="text-[10px] font-medium text-slate-600 dark:text-slate-300 leading-tight">{dayName}</p>
                              <p className="text-[10px] text-slate-400 leading-tight">{dayNum}</p>
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
            <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-sm px-3 md:px-6">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  Total in period:
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {stats.dailyTrend.reduce((sum, d) => sum + d.count, 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  Average per {stats.trendGranularity || 'day'}:
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {(stats.dailyTrend.reduce((sum, d) => sum + d.count, 0) / Math.max(stats.dailyTrend.length, 1)).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-600">
            <div className="text-center">
              <BarChart3 className="w-12 h-14 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
               <p className="font-medium text-slate-700 dark:text-slate-200">No incidents in this period</p>
               <p className="text-sm text-slate-400 dark:text-slate-500">Try a wider date range or clear the agency filter.</p>
               <button type="button" onClick={() => { setDateRange('30d'); setSelectedAgency('all'); }} className="mt-3 min-h-10 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/20">Show last 30 days</button>
            </div>
          </div>
        )}
      </div>

      {/* Response Time Stats */}
       <div className="mt-5">
         <div className="mb-3 flex items-center justify-between gap-3">
           <h3 className="font-semibold text-slate-800 dark:text-white">Performance Metrics</h3>
           <p className="text-xs text-slate-500 dark:text-slate-400">Complete timestamp records only</p>
         </div>
         <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
           <div className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 ${stats?.avgResponseTime == null ? '' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                  {stats?.avgResponseTime != null ? formatDuration(stats.avgResponseTime) : '--'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Avg. Response Time</p>
              </div>
            </div>
            {stats?.avgResponseTime != null ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Time to first response · n={stats.responseSampleSize || 0}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">No response data yet</p>
            )}
          </div>

           <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                  {stats?.avgResolutionTime != null ? formatDuration(stats.avgResolutionTime) : '--'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Avg. Resolution Time</p>
              </div>
            </div>
            {stats?.avgResolutionTime != null ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Time to resolve · n={stats.resolutionSampleSize || 0}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">
                {stats?.resolved === 0 ? 'No resolved incidents in this period' : 'No resolution data yet'}
              </p>
            )}
          </div>

           <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                  {stats?.mostActiveArea?.count || '--'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Most Active Area</p>
              </div>
            </div>
            {stats?.mostActiveArea ? (
              <p className="text-sm text-slate-600 dark:text-slate-400 truncate" title={stats.mostActiveArea.area}>
                {stats.mostActiveArea.area}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">No location data available</p>
            )}
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
}

export default Reports;
