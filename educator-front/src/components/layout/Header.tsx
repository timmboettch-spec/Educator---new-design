import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight } from "lucide-react";
import LogoutIcon from "../../../public/assets/dashboard/logout_svg.svg";
import { toast } from "../../components/common/Toast";
import { LogoutRequest, resetLogout } from "../../redux/auth/LogoutRedux";
import {
  logout,
  restoreSession,
  selectLoginResponse,
} from "../../redux/auth/LoginRedux";
import {
  fetchNotifications,
  fetchUnreadCount,
  resetNotifications,
} from "../../redux/notifications/NotificationsRedux";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { AUTH_MESSAGES } from "../../utils/messages/auth";
import ConfirmModal from "../modal/ConfirmationModal";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import {
  clearAuthData,
  getParsedUser,
  getSecondaryToken,
  getSecondaryUser,
  getToken,
  swapRoles,
} from "../../utils/storage";
import NotificationPanel from "./NotificationPanel";

type User = {
  full_name?: string;
  fullname?: string;
  profile_image?: string | null;
  profile_picture?: string | null;
  avatar?: string | null;
  role?: string | { role_name?: string };
};

const getProfileData = () => {
  const user = getParsedUser() as User | null;
  return {
    fullName: user?.full_name || user?.fullname || "",
    profileImage:
      user?.profile_picture || user?.profile_image || user?.avatar || null,
  };
};

export default function Header() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [{ fullName, profileImage }, setProfileData] = useState(getProfileData);
  useAppSelector(selectLoginResponse);
  const secondaryToken = getSecondaryToken();
  const secondaryUser = getSecondaryUser();
  const hasDualRole = !!secondaryToken && !!secondaryUser;
  const secondaryRoleRaw = (() => {
    if (!secondaryUser) return "";
    const roleField = secondaryUser.role;
    if (typeof roleField === "string") return roleField.toLowerCase();
    if (roleField && typeof roleField === "object") {
      const name = (roleField as Record<string, unknown>).role_name;
      if (typeof name === "string") return name.toLowerCase();
    }
    return "";
  })();
  const secondaryRole: "educator" | "admin" =
    secondaryRoleRaw === "educator" ? "educator" : "admin";
  const switchLabel =
    secondaryRole === "educator"
      ? "Switch to Educator"
      : "Switch to Administrator";

  const handleSwitchRole = () => {
    if (!swapRoles()) return;
    const newToken = getToken();
    const newUser = getParsedUser();
    if (!newToken || !newUser) return;
    dispatch(resetNotifications());
    dispatch(
      restoreSession({
        data: { tokens: { accessToken: newToken }, user: newUser },
        message: "",
        status: "success",
      }),
    );
    void dispatch(fetchNotifications());
    void dispatch(fetchUnreadCount());

    toast.success(
      secondaryRole === "educator"
        ? AUTH_MESSAGES.TOAST.SWITCHED_TO_EDUCATOR
        : AUTH_MESSAGES.TOAST.SWITCHED_TO_ADMIN,
    );
    navigate(
      secondaryRole === "educator" ? "/educator-dashboard" : "/admin-dashboard",
    );
  };

  useEffect(() => {
    const refresh = () => setProfileData(getProfileData());
    window.addEventListener("profile-updated", refresh);
    return () => window.removeEventListener("profile-updated", refresh);
  }, []);

  // Portal label reflects the active user's role (updates on role switch, since
  // this component re-renders on the login response).
  const currentUser = getParsedUser() as User | null;
  const currentRoleRaw = (() => {
    const r = currentUser?.role;
    if (typeof r === "string") return r.toLowerCase();
    if (r && typeof r === "object") {
      const name = (r as Record<string, unknown>).role_name;
      if (typeof name === "string") return name.toLowerCase();
    }
    return "";
  })();
  const portalLabel =
    currentRoleRaw === "educator" ? "Educator Portal" : "Administrator Portal";

  const handleLogout = async () => {
    setShowConfirm(false);
    try {
      await dispatch(LogoutRequest()).unwrap();
      clearAuthData();
      toast.success(
        (localStorage.getItem("app_language")?.toLowerCase() === "es"
          ? loginEs
          : loginEn
        ).signOutModal.successToast,
      );
      window.location.href = "/login";
    } catch {
      toast.error(AUTH_MESSAGES.TOAST.LOGOUT_FAILED);
    } finally {
      clearAuthData();
      dispatch(logout());
      dispatch(resetLogout());
      navigate("/login", { replace: true });
    }
  };

  return (
    <>
      {showConfirm && (
        <ConfirmModal
          isOpen={showConfirm}
          title={
            (localStorage.getItem("app_language")?.toLowerCase() === "es"
              ? loginEs
              : loginEn
            ).signOutModal.title
          }
          message={
            (localStorage.getItem("app_language")?.toLowerCase() === "es"
              ? loginEs
              : loginEn
            ).signOutModal.message
          }
          onConfirm={handleLogout}
          onCancel={() => setShowConfirm(false)}
          cancelText={
            (localStorage.getItem("app_language")?.toLowerCase() === "es"
              ? loginEs
              : loginEn
            ).signOutModal.cancel
          }
          confirmText={
            (localStorage.getItem("app_language")?.toLowerCase() === "es"
              ? loginEs
              : loginEn
            ).signOutModal.confirm
          }
        />
      )}

      <header role="banner" className="h-16 bg-white relative z-40 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-gray-200 min-w-0 overflow-visible shrink-0">
        <span className="text-sm sm:text-base font-semibold text-[#5f6060] truncate min-w-0">
          {portalLabel}
        </span>
        <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
          {hasDualRole && (
            <button
              type="button"
              onClick={handleSwitchRole}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary-200 bg-primary-50 text-primary text-sm font-medium hover:bg-primary-100 hover:border-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-colors"
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
            onClick={() => navigate("/account")}
            className="w-9 h-9 rounded-full overflow-hidden border border-gray-200 shrink-0 aspect-square hover:border-primary-300 hover:ring-2 hover:ring-primary-200 focus:outline-none focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-300 transition-[border-color,box-shadow]"
            title="My Account"
          >
            {profileImage ? (
              <img
                src={profileImage}
                alt={fullName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#5f6060] text-white text-sm font-semibold">
                {fullName.charAt(0).toUpperCase() || "U"}
              </div>
            )}
          </button>

          <button
            onClick={() => setShowConfirm(true)}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <img src={LogoutIcon} alt="Logout" className="w-5 h-5" />
          </button>
        </div>
      </header>
    </>
  );
}
