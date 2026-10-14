import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LogoutIcon from '../../../public/assets/dashboard/logout_svg.svg';
import { toast } from '../../components/common/Toast';
import { LogoutRequest, resetLogout } from '../../redux/auth/LogoutRedux';
import { logout, selectLoginResponse } from '../../redux/auth/LoginRedux';
import { useSessionIdentity } from '../../features/auth/model/useSessionIdentity';
import { ROLE, type RoleSlug } from '../../features/auth/model/roles';
import { useSwitchRole } from '../../hooks/useSwitchRole';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { AUTH_MESSAGES } from '../../utils/messages/auth';
import ConfirmModal from '../modal/ConfirmationModal';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import { clearAuthData, getParsedUser } from '../../utils/storage';
import NotificationPanel from './NotificationPanel';
import { useImageFallback } from '@/hooks/useImageFallback';

type User = {
  full_name?: string;
  fullname?: string;
  /** Written by normalizeAuthUser from the active role's profile. */
  profile_picture?: string | null;
  role?: string | { role_name?: string };
};

const getProfileData = () => {
  const user = getParsedUser() as User | null;
  return {
    fullName: user?.full_name || user?.fullname || '',
    profileImage: user?.profile_picture || null,
  };
};

// Typed on RoleSlug so adding a role fails to compile until its title is chosen.
const PORTAL_TITLE_KEY = {
  [ROLE.EDUCATOR]: 'header.portal.educator',
  [ROLE.DISTRICT_ADMIN]: 'header.portal.admin',
} as const satisfies Record<RoleSlug, string>;

function PortalTitle() {
  const { t } = useTranslation('common');
  const { role } = useSessionIdentity();

  // Always rendered, even before the role resolves, so the actions group on the
  // right never shifts once this span picks up real text (a bare `justify-between`
  // with a single child pins that child to the left, not the right).
  return (
    <span className="text-sm sm:text-base font-semibold text-neutral-600 truncate min-w-0">
      {role && t(PORTAL_TITLE_KEY[role])}
    </span>
  );
}

export default function Header() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [{ fullName, profileImage }, setProfileData] = useState(getProfileData);
  const {
    hasImage: hasProfileImage,
    handleImageError: handleProfileImageError,
  } = useImageFallback(profileImage);
  useAppSelector(selectLoginResponse);
  const { targetRole, isSwitching, switchRole } = useSwitchRole();
  const isEs = localStorage.getItem('app_language')?.toLowerCase() === 'es';
  const locale = isEs ? loginEs : loginEn;
  const switchLabel =
    targetRole === 'educator'
      ? locale.header.switchToEducator
      : locale.header.switchToAdmin;

  useEffect(() => {
    const refresh = () => setProfileData(getProfileData());
    window.addEventListener('profile-updated', refresh);
    return () => window.removeEventListener('profile-updated', refresh);
  }, []);

  const handleLogout = async () => {
    setShowConfirm(false);
    try {
      await dispatch(LogoutRequest()).unwrap();
      clearAuthData();
      toast.success(
        (localStorage.getItem('app_language')?.toLowerCase() === 'es'
          ? loginEs
          : loginEn
        ).signOutModal.successToast
      );
      window.location.href = '/login';
    } catch {
      toast.error(AUTH_MESSAGES.TOAST.LOGOUT_FAILED);
    } finally {
      clearAuthData();
      dispatch(logout());
      dispatch(resetLogout());
      navigate('/login', { replace: true });
    }
  };

  return (
    <>
      {showConfirm && (
        <ConfirmModal
          isOpen={showConfirm}
          title={
            (localStorage.getItem('app_language')?.toLowerCase() === 'es'
              ? loginEs
              : loginEn
            ).signOutModal.title
          }
          message={
            (localStorage.getItem('app_language')?.toLowerCase() === 'es'
              ? loginEs
              : loginEn
            ).signOutModal.message
          }
          onConfirm={handleLogout}
          onCancel={() => setShowConfirm(false)}
          cancelText={
            (localStorage.getItem('app_language')?.toLowerCase() === 'es'
              ? loginEs
              : loginEn
            ).signOutModal.cancel
          }
          confirmText={
            (localStorage.getItem('app_language')?.toLowerCase() === 'es'
              ? loginEs
              : loginEn
            ).signOutModal.confirm
          }
        />
      )}

      {/* z-45: above page sticky toolbars (z-40), below the sidebar toggle and inline modals (z-50). */}
      <header className="h-16 bg-white relative z-[45] flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 border-b border-gray-200 min-w-0 overflow-visible shrink-0">
        <PortalTitle />
        <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
          {targetRole && (
            <button
              type="button"
              onClick={() => void switchRole()}
              disabled={isSwitching}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-orange-200 bg-orange-50 text-primary text-sm font-medium hover:bg-orange-100 hover:border-orange-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 transition-colors disabled:opacity-50"
              title={switchLabel}
              aria-label={switchLabel}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span className="hidden sm:inline whitespace-nowrap">
                {switchLabel}
              </span>
            </button>
          )}

          <NotificationPanel />

          <button
            onClick={() => navigate('/account')}
            className="w-9 h-9 rounded-full overflow-hidden border border-gray-200 shrink-0 aspect-square hover:border-orange-300 hover:ring-2 hover:ring-orange-200 focus:outline-none focus-visible:border-orange-400 focus-visible:ring-2 focus-visible:ring-orange-300 transition-[border-color,box-shadow]"
            title={locale.header.myAccount}
            aria-label={locale.header.myAccount}
          >
            {hasProfileImage && profileImage ? (
              <img
                src={profileImage}
                alt={fullName}
                className="w-full h-full object-cover"
                onError={handleProfileImageError}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white text-orange-500 text-sm font-semibold">
                {fullName.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </button>

          <button
            onClick={() => setShowConfirm(true)}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
            title={locale.header.logout}
            aria-label={locale.header.logout}
          >
            <img
              src={LogoutIcon}
              alt={locale.header.logout}
              className="w-5 h-5"
            />
          </button>
        </div>
      </header>
    </>
  );
}
