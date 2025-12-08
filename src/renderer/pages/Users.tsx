import {
    Building2,
    Calendar,
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
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSessionScope, isStationScoped } from '../utils/sessionScope';

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
  const initialScope = getSessionScope();
  const stationScopeActive = isStationScoped(initialScope);
  const [users, setUsers] = useState<User[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [sortConfig, setSortConfig] = useState<{ key: keyof User | 'agency_name'; direction: 'asc' | 'desc' } | null>(null);

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
    const debounce = setTimeout(() => {
      loadUsers();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, roleFilter, agencyFilter]);

  const loadData = async () => {
    try {
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

    // Validate station for chiefs to support per-station scope
    if (newUserData.role === 'Chief' && !newUserData.stationId) {
      errors.stationId = 'Station is required for chiefs';
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
        agencyId: undefined,
        stationId: undefined,
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
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    
    try {
      await window.api.deleteUser(userId);
      loadUsers();
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      alert(error.message || 'Failed to delete user');
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) return;
    
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    
    setResettingPassword(true);
    try {
      await window.api.resetUserPassword({ userId: selectedUser.id, newPassword });
      setShowResetPasswordModal(false);
      setNewPassword('');
      setSelectedUser(null);
      alert('Password reset successfully');
    } catch (error: any) {
      console.error('Failed to reset password:', error);
      alert(error.message || 'Failed to reset password');
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
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getAgencyColor = (shortName?: string) => {
    switch (shortName) {
      case 'PNP':
        return 'bg-blue-500';
      case 'BFP':
        return 'bg-red-500';
      case 'PDRRMO':
        return 'bg-teal-500';
      default:
        return 'bg-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">User Management</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage system users and their roles</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Officer
          </button>
          <button
            onClick={loadUsers}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors dark:text-white"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {stationScopeActive && (
        <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-100">
          User list scoped to your station{initialScope.stationName ? ` (${initialScope.stationName})` : ''}. Agency filter locked.
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* Role Filter */}
          <div className="min-w-[150px]">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value="">All Roles</option>
              {ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          {/* Agency Filter */}
          <div className="min-w-[180px]">
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              disabled={stationScopeActive}
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value="">All Agencies</option>
              {agencies.map(agency => (
                <option key={agency.id} value={agency.id}>{agency.short_name} - {agency.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <UserCog className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{users.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Users</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">
                {users.filter(u => u.role === 'Chief').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Chiefs</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">
                {users.filter(u => u.role === 'Field Officer').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Field Officers</p>
            </div>
          </div>
        </div>
        {initialScope.role === 'Admin' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <UserCog className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">
                {users.filter(u => u.role === 'Resident').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Residents</p>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th 
                className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => handleSort('display_name')}
              >
                User {sortConfig?.key === 'display_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => handleSort('role')}
              >
                Role {sortConfig?.key === 'role' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => handleSort('agency_name')}
              >
                Agency {sortConfig?.key === 'agency_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Contact</th>
              <th 
                className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => handleSort('created_at')}
              >
                Joined {sortConfig?.key === 'created_at' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  No users found
                </td>
              </tr>
            ) : (
              sortedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${getAgencyColor(user.agencies?.short_name)}`}>
                        {user.display_name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">{user.display_name || 'Unknown'}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.agencies ? (
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getAgencyColor(user.agencies.short_name)}`}></div>
                        <span className="text-gray-700 dark:text-gray-300">{user.agencies.short_name}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {user.phone_number && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Phone className="w-3 h-3" />
                          {user.phone_number}
                        </div>
                      )}
                      {user.age && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          Age: {user.age}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Calendar className="w-3 h-3" />
                      {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Edit User"
                      >
                        <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      {initialScope.role === 'Admin' && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowResetPasswordModal(true);
                            }}
                            className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                            title="Reset Password"
                          >
                            <Key className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          </button>
                          {user.role !== 'Resident' && (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800">
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Add New Officer
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create a new officer account</p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                  setValidationErrors({});
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {createError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {createError}
                </div>
              )}

              {/* Organization Section */}
              <div className="pb-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                            validationErrors.agencyId ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Station {newUserData.role === 'Chief' && <span className="text-red-500">*</span>}
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
                          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                            validationErrors.stationId ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
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
                        <p className="mt-1 text-xs text-gray-400">
                          Required for Chiefs; optional for other officers.
                        </p>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Role <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newUserData.role}
                      onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    >
                      <option value="Desk Officer">Desk Officer</option>
                      <option value="Field Officer">Field Officer</option>
                      <option value="Chief">Chief</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      {newUserData.role === 'Desk Officer' && 'Handles incident dispatch and monitoring from station'}
                      {newUserData.role === 'Field Officer' && 'Responds to incidents in the field'}
                      {newUserData.role === 'Chief' && 'Agency head with full administrative access'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Personal Details Section */}
              <div className="pt-1">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Personal Details
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                        validationErrors.displayName ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                      }`}
                      placeholder="Juan Dela Cruz"
                    />
                    {validationErrors.displayName && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.displayName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                        validationErrors.dateOfBirth ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                      }`}
                    />
                    {validationErrors.dateOfBirth && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.dateOfBirth}</p>
                    )}
                    {newUserData.dateOfBirth && !validationErrors.dateOfBirth && (
                      <p className="mt-1 text-xs text-gray-400">
                        Age: {calculateAge(newUserData.dateOfBirth)} years old
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                        validationErrors.email ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                      }`}
                      placeholder="officer@agency.gov.ph"
                    />
                    {validationErrors.email && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.email}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Phone Number <span className="text-gray-400 font-normal">(optional)</span>
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
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                        validationErrors.phoneNumber ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                      }`}
                      placeholder="+63 9XX XXX XXXX or 09XX XXX XXXX"
                    />
                    {validationErrors.phoneNumber && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.phoneNumber}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                        validationErrors.password ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                      }`}
                      placeholder="Min 8 chars, uppercase, lowercase, number"
                    />
                    {validationErrors.password && (
                      <p className="mt-1 text-sm text-red-500">{validationErrors.password}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      Must contain at least 8 characters, one uppercase, one lowercase, and one number
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError(null);
                    setValidationErrors({});
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={creatingUser}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creatingUser ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Officer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Key className="w-5 h-5" />
                Reset Password
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedUser.email}</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setNewPassword('');
                    setSelectedUser(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={resettingPassword || !newPassword}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                  {resettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
    // For Chief, station is required
    if (formData.role === 'Chief' && !formData.station_id) {
      newErrors.station_id = 'Station is required for Chief';
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Edit User</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{user.email}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white ${
                errors.display_name ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
              }`}
            />
            {errors.display_name && <p className="text-xs text-red-500 mt-1">{errors.display_name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              disabled={formData.role === 'Resident'}
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            {formData.role === 'Resident' && <p className="text-xs text-gray-400 mt-1">Resident role cannot be changed</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agency</label>
            <select
              value={formData.agency_id}
              onChange={(e) => setFormData({ ...formData, agency_id: e.target.value, station_id: '' })}
              disabled={!isAdmin || formData.role === 'Resident'}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                errors.agency_id ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
              }`}
            >
              <option value="">No Agency</option>
              {agencies.map(agency => (
                <option key={agency.id} value={agency.id}>{agency.short_name} - {agency.name}</option>
              ))}
            </select>
            {errors.agency_id && <p className="text-xs text-red-500 mt-1">{errors.agency_id}</p>}
            {!isAdmin && <p className="text-xs text-gray-400 mt-1">Only admins can change agency assignment</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Station</label>
            <select
              value={formData.station_id}
              onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
              disabled={!isAdmin || !formData.agency_id || formData.role === 'Resident'}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                errors.station_id ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
              }`}
            >
              <option value="">No Station</option>
              {stations
                .filter(station => !formData.agency_id || station.agency_id.toString() === formData.agency_id)
                .map(station => (
                  <option key={station.id} value={station.id}>{station.name}</option>
                ))}
            </select>
            {errors.station_id && <p className="text-xs text-red-500 mt-1">{errors.station_id}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth</label>
            <input
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
            />
            {formData.date_of_birth && (
              <p className="mt-1 text-xs text-gray-400">
                Age: {calculateAge(formData.date_of_birth)} years old
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
            <input
              type="tel"
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
              placeholder="+63 XXX XXX XXXX"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
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
      </div>
    </div>
  );
}

export default Users;
