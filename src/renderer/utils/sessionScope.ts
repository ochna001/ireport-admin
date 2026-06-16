export interface SessionScope {
  role?: string;
  agencyId?: number;
  agencyShortName?: string;
  stationId?: number;
  stationName?: string;
  stationAddress?: string;
  stationMunicipality?: string;
  userId?: string;
  displayName?: string;
}

const CURRENT_USER_KEY = 'ireport_admin_current_user';
const ADMIN_DISPATCHER_ID_KEY = 'ireport_admin_dispatcher_id';

const getOrCreateAdminDispatcherId = (): string => {
  const existing = String(localStorage.getItem(ADMIN_DISPATCHER_ID_KEY) || '').trim();
  // Old format "admin-xxx" is not a valid UUID; discard and regenerate
  if (existing && !existing.startsWith('admin-')) return existing;

  const generated = crypto.randomUUID();
  localStorage.setItem(ADMIN_DISPATCHER_ID_KEY, generated);
  return generated;
};

export const getSessionScope = (): SessionScope => {
  try {
    // Prefer login-based current user scope
    const currentUserStr = localStorage.getItem(CURRENT_USER_KEY);
    if (currentUserStr) {
      const user = JSON.parse(currentUserStr);
      const resolvedUserId =
        user?.id || user?.userId || user?.user_id || user?.sub || user?.uuid || user?.email ||
        (user?.role === 'Admin' ? getOrCreateAdminDispatcherId() : undefined);
      const scope = {
        role: user?.role,
        agencyId: user?.agency_id ?? user?.agencyId,
        agencyShortName: user?.agencyShortName || user?.agencies?.short_name,
        stationId: user?.station_id ?? user?.stationId,
        stationName: user?.stationName,
        stationAddress: user?.stationAddress,
        stationMunicipality: user?.stationMunicipality,
        userId: resolvedUserId,
        displayName: user?.display_name || user?.displayName,
      };
      // session resolved silently
      return scope;
    }

    // Fallback to legacy settings-based session (backward compatibility)
    const settingsStr = localStorage.getItem('ireport_admin_settings');
    if (!settingsStr) {
      console.warn('[SessionScope] No current_user or settings found in localStorage');
      return {};
    }
    const parsed = JSON.parse(settingsStr);
    const fallbackScope = parsed.session || {};
    console.log('[SessionScope] Resolved from settings fallback:', fallbackScope);
    return fallbackScope;
  } catch (error) {
    console.error('[SessionScope] Failed to read session scope from storage:', error);
    return {};
  }
};

export const isChiefScoped = (scope: SessionScope): boolean => {
  return scope.role === 'Chief' && !!scope.stationId;
};

export const isDeskOfficerScoped = (scope: SessionScope): boolean => {
  return scope.role === 'Desk Officer' && !!scope.stationId;
};

export const isStationScoped = (scope: SessionScope): boolean => {
  return (scope.role === 'Chief' || scope.role === 'Desk Officer') && !!scope.stationId;
};

