import {
    Building2,
    Calendar,
    CheckCircle,
    Edit,
    Key,
    Phone,
    Plus,
    RefreshCw,
    Search,
    Shield,
    Trash2,
    UserCog,
    UserPlus,
    AlertCircle,
    X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSessionScope, isStationScoped } from '../utils/sessionScope';
import { Modal } from '../components/ui';

interface User {
  id: string;
  display_name: string;
  email: string;
  role: string;
  agency_id: number | null;
  station_id?: number | null;
  phone_number: string | null;
  age: number | null;
  date_of_birth?: string | null;
  created_at: string;
  agencies?: {
    name: string;
    short_name: string;
  };
  agency_stations?: {
    id: number;
    name: string;
    agency_id: number;
  } | null;
}

interface Agency {
  id: number;
  name: string;
  short_name: string;
}

interface Station {
  id: number;
  name: string;
  agency_id: number;
}

const ROLES = ['Resident', 'Desk Officer', 'Field Officer', 'Chief'];
const OFFICER_ROLES = ['Desk Officer', 'Field Officer', 'Chief'];

// Validation helpers
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhoneNumber = (phone: string): boolean => {
  if (!phone) return true; // Optional field
  // Philippine phone format: +63 or 09 followed by 9-10 digits
  const phoneRegex = /^(\+63|0)?[0-9]{9,10}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
};

const isValidName = (name: string): boolean => {
  // At least 2 characters, only letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[a-zA-Z\s'-]{2,50}$/;
  return nameRegex.test(name.trim());
};

const isValidPassword = (password: string): boolean => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  return password.length >= 8 && 
         /[A-Z]/.test(password) && 
         /[a-z]/.test(password) && 
         /[0-9]/.test(password);
};

interface NewUserData {
  email: string;
  password: string;
  displayName: string;
  role: string;
  agencyId?: number;
  stationId?: number;
  phoneNumber?: string;
  dateOfBirth?: string; // YYYY-MM-DD format
}

interface ValidationErrors {
  displayName?: string;
  email?: string;
  password?: string;
  role?: string;
  agencyId?: string;
  stationId?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
}

function Users() {
  const initialScope = useMemo(() => getSessionScope(), []);
  const stationScopeActive = isStationScoped(initialScope);
  const [users, setUsers] = useState<User[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState(
    stationScopeActive && initialScope.agencyShortName ? initialScope.agencyShortName.toLowerCase() : ''
  );
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserData, setNewUserData] = useState<NewUserData>({
    email: '',
    password: '',
    displayName: '',
    role: 'Field Officer',
    // Auto-set agency/station for Chiefs
    agencyId: stationScopeActive ? initialScope.agencyId : undefined,
    stationId: stationScopeActive ? initialScope.stationId : undefined,
    phoneNumber: '',
    dateOfBirth: '',
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  
  // Password Reset Modal State
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof User | 'agency_name'; direction: 'asc' | 'desc' } | null>(null);
  const hasFilters = Boolean(searchQuery || roleFilter || agencyFilter);

  // ... existing code ...

  const handleSort = (key: keyof User | 'agency_name') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedUsers = [...users].sort((a, b) => {
    if (!sortConfig) return 0;
    
    let aValue: any = a[sortConfig.key as keyof User];
    let bValue: any = b[sortConfig.key as keyof User];

    if (sortConfig.key === 'agency_name') {
      aValue = a.agencies?.short_name || '';
      bValue = b.agencies?.short_name || '';
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!pageMessage) return;
    const timeout = window.setTimeout(() => setPageMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [pageMessage]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadUsers();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, roleFilter, agencyFilter]);

  const loadData = async () => {
    try {
      setLoadError(null);
      const scope = getSessionScope();
      const [usersData, agenciesData, stationsData] = await Promise.all([
        window.api.getUsers({
          stationId: isStationScoped(scope) ? scope.stationId : undefined,
          agency: isStationScoped(scope) ? scope.agencyId?.toString() : undefined,
        }),
        window.api.getAgencies(),
        window.api.getAgencyStations(),
      ]);
      setUsers(usersData);
      setAgencies(agenciesData);
      setStations(stationsData || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoadError('Users could not be loaded. Refresh to retry.');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const scope = getSessionScope();
      const agencyParam = isStationScoped(scope)
        ? scope.agencyId?.toString()
        : (agencyFilter || undefined);
      const data = await window.api.getUsers({
        role: roleFilter || undefined,
        agency: agencyParam,
        stationId: isStationScoped(scope) ? scope.stationId : undefined,
        search: searchQuery || undefined,
      });
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
      setLoadError('Users could not be refreshed. The displayed list may be stale.');
    }
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setShowEditModal(true);
  };

  const handleSaveUser = async (updates: Partial<User>) => {
    if (!selectedUser) return;
    
    try {
      await window.api.updateUser({ id: selectedUser.id, updates });
      await window.api.logSecurityAction({
        action: 'user_updated',
        details: { user_id: selectedUser.id, updates }
      });
      setShowEditModal(false);
      setSelectedUser(null);
      loadUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
      setPageMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update user' });
      throw error;
    }
  };

  // Calculate age from date of birth
  const calculateAge = (dob: string): number => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const validateCreateForm = (): boolean => {
    const errors: ValidationErrors = {};
    
    // Validate display name
    if (!newUserData.displayName.trim()) {
      errors.displayName = 'Full name is required';
    } else if (!isValidName(newUserData.displayName)) {
      errors.displayName = 'Please enter a valid name (letters, spaces, hyphens only)';
    }
    
    // Validate date of birth
    if (!newUserData.dateOfBirth) {
      errors.dateOfBirth = 'Date of birth is required';
    } else {
      const age = calculateAge(newUserData.dateOfBirth);
      if (age < 18) {
        errors.dateOfBirth = 'Officer must be at least 18 years old';
      } else if (age > 100) {
        errors.dateOfBirth = 'Please enter a valid date of birth';
      }
    }
    
    // Validate email
    if (!newUserData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!isValidEmail(newUserData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    // Validate password
    if (!newUserData.password) {
      errors.password = 'Password is required';
    } else if (!isValidPassword(newUserData.password)) {
      errors.password = 'Password must be at least 8 characters with uppercase, lowercase, and number';
    }
    
    // Validate agency for officers
    if (OFFICER_ROLES.includes(newUserData.role) && !newUserData.agencyId) {
      errors.agencyId = 'Agency is required for officers';
    }

    // Validate station for operational accounts
    if (OFFICER_ROLES.includes(newUserData.role) && !newUserData.stationId) {
      errors.stationId = 'Station is required for officer accounts';
    }
    
    // Validate phone number if provided
    if (newUserData.phoneNumber && !isValidPhoneNumber(newUserData.phoneNumber)) {
      errors.phoneNumber = 'Please enter a valid phone number';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async () => {
    // Clear previous errors
    setCreateError(null);
    
    // Validate form
    if (!validateCreateForm()) {
      return;
    }

    setCreatingUser(true);
    
    try {
      await window.api.createUser({
        ...newUserData,
        email: newUserData.email.trim().toLowerCase(),
        displayName: newUserData.displayName.trim(),
        stationId: newUserData.stationId,
        phoneNumber: newUserData.phoneNumber?.trim() || undefined,
      });
      setShowCreateModal(false);
       setNewUserData({
        email: '',
        password: '',
        displayName: '',
        role: 'Field Officer',
         agencyId: stationScopeActive ? initialScope.agencyId : undefined,
         stationId: stationScopeActive ? initialScope.stationId : undefined,
        phoneNumber: '',
        dateOfBirth: '',
      });
      setValidationErrors({});
      loadUsers();
    } catch (error: any) {
      console.error('Failed to create user:', error);
      // Parse error message for user-friendly display
      const errorMsg = error.message || 'Failed to create user';
      if (errorMsg.includes('email')) {
        setValidationErrors(prev => ({ ...prev, email: 'This email is already registered' }));
      } else {
        setCreateError(errorMsg);
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Disable this account? The user will no longer be able to sign in, but their audit history will be retained.')) {
      return;
    }
    
    try {
      await window.api.deleteUser(userId);
      loadUsers();
      setPageMessage({ type: 'success', text: 'Account disabled' });
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      setPageMessage({ type: 'error', text: error.message || 'Failed to disable account' });
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) return;
    
    if (!isValidPassword(newPassword)) {
      setPageMessage({ type: 'error', text: 'Password must be at least 8 characters with uppercase, lowercase, and number' });
      return;
    }
    
    setResettingPassword(true);
    try {
      await window.api.resetUserPassword({ userId: selectedUser.id, newPassword });
      setShowResetPasswordModal(false);
      setNewPassword('');
      setSelectedUser(null);
      setPageMessage({ type: 'success', text: 'Password reset successfully' });
      window.setTimeout(() => {
        window.api.focusWindow?.().catch(() => {});
        (document.querySelector('input[placeholder="Search by name or email..."]') as HTMLInputElement | null)?.focus();
      }, 50);
    } catch (error: any) {
      console.error('Failed to reset password:', error);
      setPageMessage({ type: 'error', text: error.message || 'Failed to reset password' });
    } finally {
      setResettingPassword(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Chief':
        return 'bg-purple-100 text-purple-700';
      case 'Field Officer':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getAgencyColor = (shortName?: string) => {
    switch (shortName) {
      case 'PNP':
        return 'bg-blue-500';
      case 'BFP':
        return 'bg-red-500';
      case 'MDRRMO':
        return 'bg-teal-500';
      default:
        return 'bg-slate-400';
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-950" role="status" aria-label="Loading user directory">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
          Loading access directory
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      {pageMessage && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border ${
          pageMessage.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/90 dark:border-green-700 dark:text-green-100'
            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/90 dark:border-red-700 dark:text-red-100'
        }`}>
          {pageMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{pageMessage.text}</span>
          <button
            onClick={() => setPageMessage(null)}
            className="ml-2 rounded hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <section className="relative mb-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 px-5 py-5 text-white shadow-sm sm:px-6">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-blue-600/20 to-transparent" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/15">
              <Shield className="h-5 w-5 text-blue-300" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Access Directory</h1>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  {stationScopeActive ? 'Station scope' : 'System scope'}
                </span>
              </div>
              <p className="max-w-2xl text-sm text-slate-300">Review identities, operational authority, and station assignments from one controlled roster.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 hidden border-r border-slate-700 pr-4 text-right sm:block">
              <p className="text-xl font-bold tabular-nums">{users.length}</p>
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Visible records</p>
            </div>
          <button
            type="button"
            onClick={loadUsers}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <UserPlus className="h-4 w-4" />
            Add Officer
          </button>
        </div>
      </div>
      </section>

      {stationScopeActive && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
          <Building2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
          <span><strong>{initialScope.stationName || 'Current station'}</strong> directory scope is active. Agency selection is locked to prevent cross-station changes.</span>
        </div>
      )}

      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError(null)} aria-label="Dismiss user management error" className="min-h-8 min-w-8 rounded-lg hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-900/40"><X size={16} /></button>
        </div>
      )}

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Directory filters</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Narrow the roster by identity or assigned authority.</p>
          </div>
          {hasFilters && (
            <button type="button" onClick={() => { setSearchQuery(''); setRoleFilter(''); if (!stationScopeActive) setAgencyFilter(''); }} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/20">Clear all</button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_180px_220px]">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Name or email</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search directory"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Operational role</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All Roles</option>
              {ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Assigned agency</span>
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              disabled={stationScopeActive}
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All Agencies</option>
              {agencies.map(agency => (
                <option key={agency.id} value={agency.id}>{agency.short_name} - {agency.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className={`mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${initialScope.role === 'Admin' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <div className="border-b border-r border-slate-200 p-4 dark:border-slate-700 lg:border-b-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <UserCog className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-950 dark:text-white">{users.length}</p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Matching records</p>
            </div>
          </div>
        </div>
        <div className="border-b border-slate-200 p-4 dark:border-slate-700 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/30">
              <Shield className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-950 dark:text-white">
                {users.filter(u => u.role === 'Chief').length}
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Chief authority</p>
            </div>
          </div>
        </div>
        <div className={`p-4 ${initialScope.role === 'Admin' ? 'border-r border-slate-200 dark:border-slate-700' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
              <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-950 dark:text-white">
                {users.filter(u => u.role === 'Field Officer').length}
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Field responders</p>
            </div>
          </div>
        </div>
        {initialScope.role === 'Admin' && (
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <UserCog className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-slate-950 dark:text-white">
                {users.filter(u => u.role === 'Resident').length}
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Resident profiles</p>
            </div>
          </div>
        </div>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Operational roster</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Authority and assignment records for the current directory scope.</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">{sortedUsers.length} shown</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/60">
            <tr>
              <th 
                className="cursor-pointer px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                onClick={() => handleSort('display_name')}
              >
                User {sortConfig?.key === 'display_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                onClick={() => handleSort('role')}
              >
                Role {sortConfig?.key === 'role' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                onClick={() => handleSort('agency_name')}
              >
                Agency {sortConfig?.key === 'agency_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Station</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Contact</th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                onClick={() => handleSort('created_at')}
              >
                Joined {sortConfig?.key === 'created_at' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {sortedUsers.length === 0 ? (
              <tr>
                 <td colSpan={7} className="px-6 py-14 text-center text-slate-500 dark:text-slate-400">
                   <UserCog className="mx-auto mb-3 h-9 w-9 text-slate-300 dark:text-slate-600" />
                   <p className="font-medium text-slate-700 dark:text-slate-200">No users match these filters</p>
                   <p className="mt-1 text-sm">Try a different search or clear the active filters.</p>
                   {hasFilters && <button type="button" onClick={() => { setSearchQuery(''); setRoleFilter(''); if (!stationScopeActive) setAgencyFilter(''); }} className="mt-3 min-h-10 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/20">Clear filters</button>}
                 </td>
              </tr>
            ) : (
              sortedUsers.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-950/20">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm ${getAgencyColor(user.agencies?.short_name)}`}>
                        {user.display_name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white">{user.display_name || 'Unknown'}</p>
                        <p className="mt-0.5 max-w-[240px] truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.agencies ? (
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getAgencyColor(user.agencies.short_name)}`}></div>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{user.agencies.short_name}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.agency_stations?.name ? (
                      <span className="text-sm text-slate-700 dark:text-slate-300">{user.agency_stations.name}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {user.phone_number && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <Phone className="w-3 h-3" />
                          {user.phone_number}
                        </div>
                      )}
                      {user.age && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                          Age: {user.age}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Calendar className="w-3 h-3" />
                      {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Desk Officers can only edit Residents, not other officers/chiefs */}
                      {(initialScope.role === 'Admin' || initialScope.role === 'Chief' || 
                        (initialScope.role === 'Desk Officer' && user.role === 'Resident')) && (
                         <button
                           type="button"
                           aria-label={`Edit ${user.display_name || 'user'}`}
                          onClick={() => handleEditUser(user)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-colors hover:border-slate-200 hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                          title="Edit User"
                        >
                          <Edit className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        </button>
                      )}
                      {initialScope.role === 'Admin' && (
                        <>
                           <button
                             type="button"
                             aria-label={`Reset password for ${user.display_name || user.email}`}
                            onClick={() => {
                              setSelectedUser(user);
                              setShowResetPasswordModal(true);
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-colors hover:border-orange-200 hover:bg-orange-50 focus-visible:ring-2 focus-visible:ring-orange-500 dark:hover:border-orange-800 dark:hover:bg-orange-900/30"
                            title="Reset Password"
                          >
                            <Key className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          </button>
                          {user.role !== 'Resident' && (
                             <button
                               type="button"
                               aria-label={`Disable ${user.display_name || user.email}`}
                              onClick={() => handleDeleteUser(user.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-colors hover:border-red-200 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:border-red-800 dark:hover:bg-red-900/30"
                              title="Disable Account"
                            >
                              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                            </button>
                          )}
                        </>
                      )}
                      {/* Show disabled state for Desk Officers trying to edit officers */}
                      {initialScope.role === 'Desk Officer' && user.role !== 'Resident' && (
                        <button
                           disabled
                           aria-label={`${user.display_name || 'User'} cannot be edited with your role`}
                          className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg opacity-30"
                          title="You can only edit Residents"
                        >
                          <Edit className="w-4 h-4 text-slate-400" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
         </tbody>
         </table>
       </div>
      </section>

       {/* Edit Modal */}
      {showEditModal && selectedUser && (
        <EditUserModal
          user={selectedUser}
          agencies={agencies}
          stations={stations}
          isAdmin={initialScope.role === 'Admin'}
          onClose={() => {
            setShowEditModal(false);
            setSelectedUser(null);
          }}
          onSave={handleSaveUser}
        />
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreateError(null); setValidationErrors({}); }}
        busy={creatingUser}
        size="md"
        title="Add New Officer"
        description="Create a new officer account"
        icon={<UserPlus className="h-5 w-5 text-blue-600" />}
        footer={
          <>
            <button
              type="button"
              onClick={() => { setShowCreateModal(false); setCreateError(null); setValidationErrors({}); }}
              disabled={creatingUser}
              className="min-h-10 rounded-lg border border-border-token px-4 py-2 text-sm font-medium text-fg-default hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateUser}
              disabled={creatingUser}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              {creatingUser ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creatingUser ? 'Creating…' : 'Create Officer'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400" role="alert">
              {createError}
            </div>
          )}

              {/* Organization Section */}
              <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                  Organization
                </h3>
                
                <div className="space-y-4">
                  {/* For Chiefs: Show fixed agency/station info */}
                  {stationScopeActive ? (
                    <>
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>Agency:</strong> {initialScope.agencyShortName?.toUpperCase()}
                        </p>
                        <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                          <strong>Station:</strong> {stations.find(s => s.id === initialScope.stationId)?.name || 'Your Station'}
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                          New officers will be assigned to your station automatically.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Agency <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={newUserData.agencyId || ''}
                          onChange={(e) => {
                            setNewUserData({ 
                              ...newUserData, 
                              agencyId: e.target.value ? parseInt(e.target.value) : undefined,
                              stationId: undefined,
                            });
                            if (validationErrors.agencyId) {
                              setValidationErrors(prev => ({ ...prev, agencyId: undefined }));
                            }
                          }}
                          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${
                            validationErrors.agencyId ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                          }`}
                        >
                          <option value="">Select Agency</option>
                          {agencies.map(agency => (
                            <option key={agency.id} value={agency.id}>{agency.short_name} - {agency.name}</option>
                          ))}
                        </select>
                        {validationErrors.agencyId && (
                          <p className="mt-1 text-sm text-red-500">{validationErrors.agencyId}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Station {OFFICER_ROLES.includes(newUserData.role) && <span className="text-red-500">*</span>}
                        </label>
                        <select
                          value={newUserData.stationId || ''}
                          onChange={(e) => {
                            setNewUserData({ ...newUserData, stationId: e.target.value ? parseInt(e.target.value) : undefined });
                            if (validationErrors.stationId) {
                              setValidationErrors(prev => ({ ...prev, stationId: undefined }));
                            }
                          }}
                          disabled={!newUserData.agencyId}
                          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${
                            validationErrors.stationId ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                          } ${!newUserData.agencyId ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select Station</option>
                          {stations
                            .filter(station => !newUserData.agencyId || station.agency_id === newUserData.agencyId)
                            .map(station => (
                              <option key={station.id} value={station.id}>
                                {station.name}
                              </option>
                            ))}
                        </select>
                        {validationErrors.stationId && (
                          <p className="mt-1 text-sm text-red-500">{validationErrors.stationId}</p>
                        )}
                        <p className="mt-1 text-xs text-slate-400">
                          Required for officer accounts.
                        </p>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Role <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newUserData.role}
                      onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    >
                      <option value="Desk Officer">Desk Officer</option>
                      <option value="Field Officer">Field Officer</option>
                      <option value="Chief">Chief</option>
                    </select>
                    <p className="mt-1 text-xs text-slate-400">
                      {newUserData.role === 'Desk Officer' && 'Handles incident dispatch and monitoring from station'}
                      {newUserData.role === 'Field Officer' && 'Responds to incidents in the field'}
                      {newUserData.role === 'Chief' && 'Agency head with full administrative access'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Personal Details Section */}
              <div className="pt-1">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                  Personal Details
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newUserData.displayName}
                      onChange={(e) => {
                        setNewUserData({ ...newUserData, displayName: e.target.value });
                        if (validationErrors.displayName) {
                          setValidationErrors(prev => ({ ...prev, displayName: undefined }));
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${
                        validationErrors.displayName ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                      }`}
                      placeholder="Juan Dela Cruz"
                    />
                    {validationErrors.displayName && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.displayName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Date of Birth <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={newUserData.dateOfBirth || ''}
                      onChange={(e) => {
                        setNewUserData({ ...newUserData, dateOfBirth: e.target.value });
                        if (validationErrors.dateOfBirth) {
                          setValidationErrors(prev => ({ ...prev, dateOfBirth: undefined }));
                        }
                      }}
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${
                        validationErrors.dateOfBirth ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                      }`}
                    />
                    {validationErrors.dateOfBirth && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.dateOfBirth}</p>
                    )}
                    {newUserData.dateOfBirth && !validationErrors.dateOfBirth && (
                      <p className="mt-1 text-xs text-slate-400">
                        Age: {calculateAge(newUserData.dateOfBirth)} years old
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={newUserData.email}
                      onChange={(e) => {
                        setNewUserData({ ...newUserData, email: e.target.value });
                        if (validationErrors.email) {
                          setValidationErrors(prev => ({ ...prev, email: undefined }));
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${
                        validationErrors.email ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                      }`}
                      placeholder="officer@agency.gov.ph"
                    />
                    {validationErrors.email && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.email}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Phone Number <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={newUserData.phoneNumber || ''}
                      onChange={(e) => {
                        setNewUserData({ ...newUserData, phoneNumber: e.target.value });
                        if (validationErrors.phoneNumber) {
                          setValidationErrors(prev => ({ ...prev, phoneNumber: undefined }));
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${
                        validationErrors.phoneNumber ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                      }`}
                      placeholder="+63 9XX XXX XXXX or 09XX XXX XXXX"
                    />
                    {validationErrors.phoneNumber && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.phoneNumber}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={newUserData.password}
                      onChange={(e) => {
                        setNewUserData({ ...newUserData, password: e.target.value });
                        if (validationErrors.password) {
                          setValidationErrors(prev => ({ ...prev, password: undefined }));
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${
                        validationErrors.password ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
                      }`}
                      placeholder="Min 8 chars, uppercase, lowercase, number"
                    />
                    {validationErrors.password && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.password}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      Must contain at least 8 characters, one uppercase, one lowercase, and one number
                    </p>
                  </div>
                </div>
              </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={showResetPasswordModal && !!selectedUser}
        onClose={() => { setShowResetPasswordModal(false); setNewPassword(''); setSelectedUser(null); }}
        busy={resettingPassword}
        size="sm"
        title="Reset Password"
        description={selectedUser?.email}
        icon={<Key className="h-5 w-5 text-orange-600" />}
        footer={
          <>
            <button
              type="button"
              onClick={() => { setShowResetPasswordModal(false); setNewPassword(''); setSelectedUser(null); }}
              disabled={resettingPassword}
              className="min-h-10 rounded-lg border border-border-token px-4 py-2 text-sm font-medium text-fg-default hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resettingPassword || !newPassword}
              className="min-h-10 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50"
            >
              {resettingPassword ? 'Resetting…' : 'Reset Password'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-fg-default">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-border-token bg-surface px-4 py-2 text-sm text-fg-strong focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700"
              placeholder="Min 8 chars, uppercase, lowercase, number"
            />
          </div>
          <p className="text-xs text-fg-muted">Use at least 8 characters with one uppercase letter, one lowercase letter, and one number.</p>
        </div>
      </Modal>
    </div>
  );
}

// Edit User Modal Component
function EditUserModal({ 
  user, 
  agencies, 
  stations,
  isAdmin,
  onClose, 
  onSave 
}: { 
  user: User; 
  agencies: Agency[];
  stations: Station[];
  isAdmin: boolean;
  onClose: () => void; 
  onSave: (updates: Partial<User>) => void;
}) {
  const [formData, setFormData] = useState({
    display_name: user.display_name || '',
    role: user.role,
    agency_id: user.agency_id?.toString() || '',
    phone_number: user.phone_number || '',
    station_id: user.station_id?.toString() || '',
    date_of_birth: user.date_of_birth || '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: { [key: string]: string } = {};
    if (!formData.display_name.trim()) newErrors.display_name = 'Name is required';
    if (!formData.role) newErrors.role = 'Role is required';
    // For officers, agency is required
    if (['Desk Officer', 'Field Officer', 'Chief'].includes(formData.role) && !formData.agency_id) {
      newErrors.agency_id = 'Agency is required for officers';
    }
    // For operational accounts, station is required
    if (['Desk Officer', 'Field Officer', 'Chief'].includes(formData.role) && !formData.station_id) {
      newErrors.station_id = 'Station is required for officer accounts';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        display_name: formData.display_name,
        role: formData.role,
        agency_id: formData.agency_id ? parseInt(formData.agency_id) : null,
        phone_number: formData.phone_number || null,
        station_id: formData.station_id ? parseInt(formData.station_id) : null,
        date_of_birth: formData.date_of_birth || null,
      });
    } catch (error) {
      console.error('Error saving user:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={saving}
      size="md"
      title="Edit User"
      description={user.email}
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white ${
                errors.display_name ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
              }`}
            />
            {errors.display_name && <p className="text-xs text-red-500 mt-1">{errors.display_name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              disabled={formData.role === 'Resident'}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            {formData.role === 'Resident' && <p className="text-xs text-slate-400 mt-1">Resident role cannot be changed</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Agency</label>
            <select
              value={formData.agency_id}
              onChange={(e) => setFormData({ ...formData, agency_id: e.target.value, station_id: '' })}
              disabled={!isAdmin || formData.role === 'Resident'}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                errors.agency_id ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
              }`}
            >
              <option value="">No Agency</option>
              {agencies.map(agency => (
                <option key={agency.id} value={agency.id}>{agency.short_name} - {agency.name}</option>
              ))}
            </select>
            {errors.agency_id && <p className="text-xs text-red-500 mt-1">{errors.agency_id}</p>}
            {!isAdmin && <p className="text-xs text-slate-400 mt-1">Only admins can change agency assignment</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Station</label>
            <select
              value={formData.station_id}
              onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
              disabled={!isAdmin || !formData.agency_id || formData.role === 'Resident'}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                errors.station_id ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'
              }`}
            >
              <option value="">Select Station</option>
              {stations
                .filter(station => !formData.agency_id || station.agency_id.toString() === formData.agency_id)
                .map(station => (
                  <option key={station.id} value={station.id}>{station.name}</option>
                ))}
            </select>
            {errors.station_id && <p className="text-xs text-red-500 mt-1">{errors.station_id}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date of Birth</label>
            <input
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
            />
            {formData.date_of_birth && (
              <p className="mt-1 text-xs text-slate-400">
                Age: {calculateAge(formData.date_of_birth)} years old
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
            <input
              type="tel"
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
              placeholder="+63 XXX XXX XXXX"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              aria-label="Cancel editing user"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
    </Modal>
  );
}

export default Users;
