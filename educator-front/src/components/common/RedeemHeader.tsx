import { Bell, LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/common/Toast";
import { selectLoginResponse, logout } from "../../redux/auth/LoginRedux";
import { LogoutRequest, resetLogout } from "../../redux/auth/LogoutRedux";
import { selectSignUpResponse } from "../../redux/auth/SignUpRedux";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { AUTH_MESSAGES } from "../../utils/messages/auth";
import ConfirmModal from "../modal/ConfirmationModal";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import { clearAuthData, getParsedUser } from "../../utils/storage";

interface Props {
  showNotification?: boolean;
  onClickSignout?: () => void;
  onClickNotification?: () => void;
}

export default function RedeemHeader({
  showNotification,
  onClickNotification,
}: Props) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const loginResponse = useAppSelector(selectLoginResponse);
  const signUpResponse = useAppSelector(selectSignUpResponse);
  const [showConfirm, setShowConfirm] = useState(false);

  type User = {
    full_name?: string;
    fullname?: string;
    profile_image?: string | null;
    avatar?: string | null;
  };

  const user: User | null =
    loginResponse?.data?.user ||
    signUpResponse?.data?.user ||
    (getParsedUser() as User | null);

  const fullName = user?.full_name || user?.fullname || "";
  const profileImage = user?.profile_image || user?.avatar || null;
  const profileLabel = fullName.charAt(0).toUpperCase() || "U";

  const handleSignout = async () => {
    setShowConfirm(false);
    try {
      await dispatch(LogoutRequest()).unwrap();
      toast.success(
        (localStorage.getItem("app_language")?.toLowerCase() === "es"
          ? loginEs
          : loginEn
        ).signOutModal.successToast,
      );
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
    <div className="w-full px-8 pt-6">
      {/*  Confirm Modal */}
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
          onConfirm={handleSignout}
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

      <div className="flex flex-row items-center justify-between rounded-full bg-white px-8 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-3">
          <img
            src="/assets/RealityworksAI_logo.svg"
            alt="Realityworks Logo"
            className="h-9 w-auto"
          />
          <span className="text-xl font-bold text-gray-800 tracking-tight">
            Realityworks <span className="text-primary-500">AI</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {showNotification ? (
            <img
              src="/assets/redeem/BellIcon.svg"
              alt="Bell"
              width={40}
              height={40}
              className="rounded-full"
            />
          ) : (
            <Bell onClick={onClickNotification} width={20} height={20} />
          )}

          <div className="rounded-full bg-gradient-to-r from-[#db8833] to-primary-400 p-[2px]">
            <div className="rounded-full bg-white p-[2px]">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={fullName}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5f6060] text-sm font-semibold text-white">
                  {profileLabel}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            className="w-9 h-9 bg-gray-50 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:text-red-400 transition"
          >
            <LogOut width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
