export interface SessionScope {
  role?: string;
  agencyId?: number;
  agencyShortName?: string;
  stationId?: number;
  stationName?: string;
  stationAddress?: string;
  stationMunicipality?: string;
  userId?: string;
}

const CURRENT_USER_KEY = 'ireport_admin_current_user';

export const getSessionScope = (): SessionScope => {
  try {
    // Prefer login-based current user scope
    const currentUserStr = localStorage.getItem(CURRENT_USER_KEY);
    if (currentUserStr) {
      const user = JSON.parse(currentUserStr);
      return {
        role: user?.role,
        agencyId: user?.agency_id ?? user?.agencyId,
        agencyShortName: user?.agencyShortName || user?.agencies?.short_name,
        stationId: user?.station_id ?? user?.stationId,
        stationName: user?.stationName,
        stationAddress: user?.stationAddress,
        stationMunicipality: user?.stationMunicipality,
        userId: user?.id,
      };
    }

    // Fallback to legacy settings-based session (backward compatibility)
    const settingsStr = localStorage.getItem('ireport_admin_settings');
    if (!settingsStr) return {};
    const parsed = JSON.parse(settingsStr);
    return parsed.session || {};
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

