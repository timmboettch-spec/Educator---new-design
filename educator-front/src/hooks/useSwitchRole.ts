import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../components/common/Toast';
import loginEn from '../locales/auth/login/en.json';
import loginEs from '../locales/auth/login/es.json';
import { refreshCsrfToken } from '../redux/api';
import { restoreSession } from '../redux/auth/LoginRedux';
import { SelectRoleRequest } from '../redux/auth/SelectRoleRedux';
import {
  fetchNotifications,
  fetchUnreadCount,
  resetNotifications,
} from '../redux/notifications/NotificationsRedux';
import { useAppDispatch } from '../store/hooks';
import { forceLogout, LOGOUT_MESSAGES } from '../utils/forceLogout';
import { AUTH_MESSAGES } from '../utils/messages/auth';
import {
  findRoleById,
  getActiveRole,
  getSwitchTargetRole,
  isSupportedRoleSlug,
  normalizeAuthUser,
  type StoredRole,
} from '../utils/normalizeAuthUser';
import {
  getParsedUser,
  getSecondaryToken,
  getSecondaryUser,
  getToken,
  isRememberMe,
  setAuthData,
  swapRoles,
} from '../utils/storage';

export type SwitchableRole = 'educator' | 'admin';

type SwitchTarget =
  | { kind: 'api'; role: SwitchableRole; storedRole: StoredRole }
  | { kind: 'legacy'; role: SwitchableRole };

const getLegacyRoleName = (user: Record<string, unknown>): string => {
  const roleField = user.role;
  if (typeof roleField === 'string') return roleField.toLowerCase();
  const name = (roleField as { role_name?: unknown } | null)?.role_name;
  return typeof name === 'string' ? name.toLowerCase() : '';
};

/**
 * Resolves which role the current session can switch to. Accounts signed in
 * through `select-role` switch by calling it again with the other role id;
 * sessions from the older dual-token login still swap the stored secondary
 * token pair.
 */
export const getRoleSwitchTarget = (): SwitchTarget | null => {
  const storedRole = getSwitchTargetRole(getParsedUser());
  if (storedRole) {
    return {
      kind: 'api',
      role: storedRole.slug === 'educator' ? 'educator' : 'admin',
      storedRole,
    };
  }

  const secondaryUser = getSecondaryToken() ? getSecondaryUser() : null;
  if (secondaryUser) {
    return {
      kind: 'legacy',
      role:
        getLegacyRoleName(secondaryUser) === 'educator' ? 'educator' : 'admin',
    };
  }

  return null;
};

/**
 * "Switch to …" action for multi-role accounts (header button, admin report
 * notifications). Swaps the session to the other role and lands on that
 * role's dashboard. `switchRole` resolves to whether the switch happened.
 */
export const useSwitchRole = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [isSwitching, setIsSwitching] = useState(false);
  const target = getRoleSwitchTarget();

  const finishSwitch = (role: SwitchableRole, path: string) => {
    // The header seeds its name/photo from storage once and refreshes on this
    // event; the new role has its own profile.
    window.dispatchEvent(new Event('profile-updated'));
    dispatch(resetNotifications());
    void dispatch(fetchNotifications());
    void dispatch(fetchUnreadCount());
    toast.success(
      role === 'educator'
        ? AUTH_MESSAGES.TOAST.SWITCHED_TO_EDUCATOR
        : AUTH_MESSAGES.TOAST.SWITCHED_TO_ADMIN
    );
    navigate(path);
  };

  const switchLegacy = (role: SwitchableRole): boolean => {
    if (!swapRoles()) return false;
    const newToken = getToken();
    const newUser = getParsedUser();
    if (!newToken || !newUser) return false;
    dispatch(
      restoreSession({
        data: { tokens: { accessToken: newToken }, user: newUser },
        message: '',
        status: 'success',
      })
    );
    finishSwitch(
      role,
      role === 'educator' ? '/educator-dashboard' : '/admin-dashboard'
    );
    return true;
  };

  const switchViaApi = async (
    role: SwitchableRole,
    storedRole: StoredRole
  ): Promise<boolean> => {
    const locale =
      localStorage.getItem('app_language')?.toLowerCase() === 'es'
        ? loginEs
        : loginEn;

    setIsSwitching(true);
    try {
      // The request interceptor attaches the current access token, which
      // select-role accepts for switching an already-authenticated session.
      const res = await dispatch(
        SelectRoleRequest({ roleId: storedRole.id })
      ).unwrap();

      // `userRoles[0]` says nothing about the choice: trust an explicit
      // `activeRole`, else the role that was requested.
      const activeRole =
        (res.data.activeRole
          ? getActiveRole(res.data.user, res.data.activeRole)
          : null) ?? findRoleById(res.data.user, storedRole.id);

      if (!activeRole || !isSupportedRoleSlug(activeRole.slug)) {
        toast.error(locale.toast.roleNotSupported);
        return false;
      }
      if (!res.data.tokens?.accessToken) {
        toast.error(locale.toast.genericError);
        return false;
      }

      const user = normalizeAuthUser(res.data.user, activeRole) ?? {};
      setAuthData(res.data.tokens, user, isRememberMe());
      if (!res.data.tokens.csrfToken) void refreshCsrfToken();
      dispatch(
        restoreSession({
          data: { tokens: res.data.tokens, user },
          message: '',
          status: 'success',
        })
      );

      const path =
        activeRole.slug === 'educator'
          ? '/educator-dashboard'
          : user.is_license_active === true
            ? '/admin-dashboard'
            : '/redeem';
      finishSwitch(role, path);
      return true;
    } catch (err: unknown) {
      const { message: msg, status } = err as {
        message?: string;
        status?: number;
      };
      // 401: the role is no longer on this account (or the session lapsed).
      // The backend's advice is to go back through login, not retry.
      if (status === 401) {
        forceLogout(LOGOUT_MESSAGES.SESSION_EXPIRED);
      } else {
        toast.error(msg || locale.toast.roleSelectionFailed);
      }
      return false;
    } finally {
      setIsSwitching(false);
    }
  };

  const switchRole = async (): Promise<boolean> => {
    if (!target || isSwitching) return false;
    if (target.kind === 'api') {
      return switchViaApi(target.role, target.storedRole);
    }
    return switchLegacy(target.role);
  };

  return {
    targetRole: target?.role ?? null,
    isSwitching,
    switchRole,
  };
};
