import { PageHeader } from '../../../components/common/PageHeader';
import { toast } from '../../../components/common/Toast';
import { useAppDispatch } from '../../../store/hooks';
import { X, Plus } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { changePasswordRequest } from '../../../redux/auth/ChangePasswordRedux';
import { updateProfileRequest } from '../../../redux/auth/UpdateProfileRedux';
import { removeProfilePictureRequest } from '../../../redux/auth/RemoveProfilePictureRedux';
import RedeemCode from '../../../pages/auth/RedeemCode/index';
import { clearRedeemError } from '@/redux/auth/RedeemRedux';
import { ACCOUNT_VALIDATION } from '../../../utils/messages/account';
import { getCurrentUserRequest } from '../../../redux/users/GetUserRedux';
import { getParsedUser, updateStoredUser } from '../../../utils/storage';
import { RedeemRequest } from '@/redux/auth/RedeemRedux';
import EditProfileModal from '@/components/modal/EditProfileModal';
import PasswordModal from '@/components/modal/PasswordModal';
import { ApplyUserData } from '@/utils/applyUserData';
import { isValidPassword, isValidProfileImageFile } from '../../../utils/validation';
import {
  hasUnsafePasswordPattern,
  hasUnsafeMarkupOrScriptPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasNameCodeLikePattern,
  trimBoundaryWhitespace,
  sanitizeTextForTyping,
} from '../../../utils/inputSecurity';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import RequestSeatsModal from '@/components/modal/RequestSeatsModal';
import NotificationPreferences from '../../../components/account/NotificationPreferences';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

export default function Account() {
  const location = useLocation();
  // Settings-icon deep-link (from the notification panel / center): scroll the
  // Notification Preferences section to the top of the viewport.
  useEffect(() => {
    if (
      (location.state as { scrollTo?: string } | null)?.scrollTo ===
      'notification-preferences'
    ) {
      const t = setTimeout(() => {
        document
          .getElementById('notification-preferences')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return () => clearTimeout(t);
    }
  }, [location.state]);

  const sanitizeSafeName = (value: string) =>
    sanitizeTextForTyping(value ?? '', 50).replace(/^ +/, '').replace(/  +/g, ' ');

  const isInvalidProfileName = (value: string) =>
    !trimBoundaryWhitespace(value) ||
    hasUnsafeMarkupOrScriptPattern(value) ||
    hasDisallowedClassNameChars(value) ||
    hasSqlInjectionLikePattern(value) ||
    hasBlockedCodingKeyword(value) ||
    hasCodeLikeSyntaxPattern(value) ||
    hasNameCodeLikePattern(value);

  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const accountCopy = {
    pageTitle: locale?.account?.pageTitle ?? 'Account Settings',
    pageSubtitle: locale?.account?.pageSubtitle ?? 'Manage your profile and preferences',
    addSubscription: locale?.account?.addSubscription ?? 'Add Subscription',
    totalSeats: locale?.account?.totalSeats ?? 'Total Seats',
    usedSeats: locale?.account?.usedSeats ?? 'Used Seats',
    remainingSeats: locale?.account?.remainingSeats ?? 'Remaining Seats',
    profileInformation: locale?.account?.profileInformation ?? 'Profile Information',
    changePassword: locale?.account?.changePassword ?? 'Change Password',
    updatePhoto: locale?.account?.updatePhoto ?? 'Update Photo',
    removePhoto: locale?.account?.removePhoto ?? 'Remove Photo',
    addPhoto: locale?.account?.addPhoto ?? 'Add Photo',
    fullName: locale?.account?.fullName ?? 'Full Name',
    email: locale?.account?.email ?? 'Email',
    editProfile: locale?.account?.editProfile ?? 'Edit Profile',
  };
  const cachedUser = getParsedUser() ?? {};
  const cachedName = (cachedUser?.full_name as string) || (cachedUser?.fullname as string) || '';
  const cachedImage = (cachedUser?.profile_picture as string) || (cachedUser?.profile_image as string) || '';
  const [fullName, setFullName] = useState(() =>
    isInvalidProfileName(cachedName) ? '' : sanitizeSafeName(cachedName),
  );
  const [email, setEmail] = useState((cachedUser?.email as string) || '');
  const [profileImage, setProfileImage] = useState(cachedImage);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isChangingPasswordRef = useRef(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [fullNameError, setFullNameError] = useState('');
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const redeemModalRef = useRef<HTMLDivElement>(null);
  const [isRequestSeatsOpen, setIsRequestSeatsOpen] = useState(false);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const [role, setRole] = useState<string>(
    typeof cachedUser?.role === 'string'
      ? cachedUser.role
      : (cachedUser?.role as Record<string, string>)?.role_name || '',
  );

  const [errors, setErrors] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    apiError: '',
  });
  useEffect(() => {
    if (!showRedeemModal) return;
    const modal = redeemModalRef.current;
    if (!modal) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getFocusable = () =>
      Array.from(modal.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
        (el) => !el.hasAttribute('disabled'),
      );

    const timer = setTimeout(() => {
      const els = getFocusable();
      if (els.length) els[0].focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRedeemModal(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const els = getFocusable();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (modal && !modal.contains(e.target as Node)) {
        e.stopPropagation();
        const els = getFocusable();
        if (els.length) els[0].focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, [showRedeemModal]);

  useEffect(() => {
    const el = pageContentRef.current;
    if (!el) return;
    const anyModalOpen = showRedeemModal || showPasswordModal || showEditProfileModal;
    if (anyModalOpen) {
      el.setAttribute('inert', '');
    } else {
      el.removeAttribute('inert');
    }
  }, [showRedeemModal, showPasswordModal, showEditProfileModal]);

  const [originalData, setOriginalData] = useState({
    fullName: cachedName,
    profileImage: cachedImage,
  });

  useEffect(() => {
    const parsed = getParsedUser();
    if (!parsed) return;
    const name = (parsed.full_name as string) || (parsed.fullname as string) || '';
    const safeName = isInvalidProfileName(name) ? '' : sanitizeSafeName(name);
    const image = (parsed.profile_picture as string) || (parsed.profile_image as string) || '';
    const emailVal = (parsed.email as string) || '';
    if (safeName && !fullName) setFullName(safeName);
    if (emailVal && !email) setEmail(emailVal);
    if (image && !profileImage) setProfileImage(image);
    if (safeName && !originalData.fullName) setOriginalData({ fullName: safeName, profileImage: image });
  }, []);

  const [tokenData, setTokenData] = useState(() => {
    const cached = getParsedUser();
    if (!cached) return { purchased: 0, consumed: 0, remaining: 0, percentage: 0 };
    const cachedRole =
      typeof cached.role === 'string'
        ? cached.role
        : (cached.role as Record<string, string>)?.role_name || '';
    let purchased = 0,
      remaining = 0,
      consumed = 0;
    if (cachedRole === 'District Admin') {
      const subs = (cached.subscriptions as Record<string, number>[]) || [];
      purchased = subs.reduce((t, s) => t + (s?.ai_seats || 0), 0);
      remaining = subs.reduce((t, s) => t + (s?.seats_available || 0), 0);
      consumed = purchased - remaining;
    } else {
      consumed = Number(cached.total_tokens) || Number(cached.allocated_tokens) || 0;
      remaining = Number(cached.tokens) || 0;
      purchased = consumed + remaining;
    }
    const percentage = purchased > 0 ? Math.min((consumed / purchased) * 100, 100) : 0;
    return { purchased, consumed, remaining, percentage };
  });
  const [tokenLoaded, setTokenLoaded] = useState(true);

  useEffect(() => {
    const promise = dispatch(getCurrentUserRequest());
    promise.unwrap()
      .then(async (result) => {
        await ApplyUserData(result.data as unknown as Record<string, unknown>, {
          setFullName,
          setEmail,
          setProfileImage,
          setRole,
          setOriginalData,
          setTokenData,
        });
        const freshName =
          ((result.data as unknown as Record<string, unknown>)?.full_name as string) ||
          ((result.data as unknown as Record<string, unknown>)?.fullname as string) ||
          '';
        const safeFreshName = isInvalidProfileName(freshName) ? '' : sanitizeSafeName(freshName);
        if (safeFreshName) setFullName(safeFreshName);
        updateStoredUser({
          ...(result.data as unknown as Record<string, unknown>),
          full_name: safeFreshName || freshName,
        });
      })
      .catch(() => { /* non-fatal — display cached data */ });
    return () => { promise.abort?.(); };
  }, [role, dispatch]);

  const fetchUser = async () => {
    try {
      const resultAction = await dispatch(getCurrentUserRequest()).unwrap();
      await ApplyUserData(resultAction.data as unknown as Record<string, unknown>, {
        setFullName,
        setEmail,
        setProfileImage,
        setRole,
        setOriginalData,
        setTokenData,
      });
      const freshName =
        ((resultAction.data as unknown as Record<string, unknown>)?.full_name as string) ||
        ((resultAction.data as unknown as Record<string, unknown>)?.fullname as string) ||
        '';
      const safeFreshName = isInvalidProfileName(freshName) ? '' : sanitizeSafeName(freshName);
      if (safeFreshName) {
        setFullName(safeFreshName);
      }
      updateStoredUser({
        ...(resultAction.data as unknown as Record<string, unknown>),
        full_name: safeFreshName || freshName,
      });
    } catch {
      return;
    } finally {
      setTokenLoaded(true);
    }
  };

  const handleSave = async (nameOverride?: string) => {
    const nameToSave = nameOverride ?? fullName;
    if (!nameToSave.trim()) {
      setFullNameError(ACCOUNT_VALIDATION.FULL_NAME_REQUIRED);
      return;
    }
    if (isInvalidProfileName(nameToSave)) {
      setFullNameError('Full name cannot include HTML, script, or code-like content');
      return;
    }
    setFullNameError('');

    if (nameToSave === originalData.fullName) {
      toast.error(ACCOUNT_VALIDATION.NO_CHANGES);
      return;
    }

    try {
      const resultAction = await dispatch(updateProfileRequest({ full_name: nameToSave }));
      if (updateProfileRequest.fulfilled.match(resultAction)) {
        const responseData = resultAction.payload;
        const updatedName = sanitizeSafeName(responseData?.data?.full_name || nameToSave);
        setFullName(updatedName);
        updateStoredUser({ full_name: updatedName });
        window.dispatchEvent(new Event('profile-updated'));
        setOriginalData((prev) => ({ ...prev, fullName: updatedName }));
        toast.success(responseData?.message || ACCOUNT_VALIDATION.PROFILE_UPDATED);
      } else {
        toast.error(String(resultAction.payload) || ACCOUNT_VALIDATION.UPDATE_FAILED);
      }
    } catch {
      toast.error(ACCOUNT_VALIDATION.SOMETHING_WENT_WRONG);
    }
  };

  const uploadProfileImage = async (file: File) => {
    const hadExistingPhoto = Boolean(originalData.profileImage?.trim());

    if (!isValidProfileImageFile(file)) {
      toast.error(ACCOUNT_VALIDATION.IMAGE_TYPE_INVALID);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(ACCOUNT_VALIDATION.IMAGE_TOO_LARGE);
      return;
    }

    setProfileImage(URL.createObjectURL(file));

    try {
      const resultAction = await dispatch(
        updateProfileRequest({ full_name: fullName, profile_image: file }),
      );
      if (updateProfileRequest.fulfilled.match(resultAction)) {
        const responseData = resultAction.payload;
        const updatedImage = responseData?.data?.profile_picture || '';
        const updatedName = responseData?.data?.full_name || fullName;
        setProfileImage(updatedImage);
        updateStoredUser({ full_name: updatedName, profile_picture: updatedImage });
        window.dispatchEvent(new Event('profile-updated'));
        setOriginalData((prev) => ({ ...prev, profileImage: updatedImage }));
        toast.success(
          hadExistingPhoto
            ? ACCOUNT_VALIDATION.PROFILE_IMAGE_UPDATED
            : ACCOUNT_VALIDATION.PROFILE_IMAGE_ADDED,
        );
      } else {
        setProfileImage(originalData.profileImage);
        toast.error(String(resultAction.payload) || ACCOUNT_VALIDATION.UPDATE_FAILED);
      }
    } catch {
      setProfileImage(originalData.profileImage);
      toast.error(ACCOUNT_VALIDATION.SOMETHING_WENT_WRONG);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    await uploadProfileImage(file);
  };

  const handleProfileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    await uploadProfileImage(file);
  };

  const handleProfileDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleRemovePhoto = async () => {
    try {
      const resultAction = await dispatch(removeProfilePictureRequest());
      if (removeProfilePictureRequest.fulfilled.match(resultAction)) {
        setProfileImage('');
        updateStoredUser({ profile_picture: '' });
        window.dispatchEvent(new Event('profile-updated'));
        setOriginalData((prev) => ({ ...prev, profileImage: '' }));
        toast.success(resultAction.payload?.message || 'Photo removed successfully');
      } else {
        toast.error(String(resultAction.payload) || ACCOUNT_VALIDATION.UPDATE_FAILED);
      }
    } catch {
      toast.error(ACCOUNT_VALIDATION.SOMETHING_WENT_WRONG);
    }
  };

  const openPasswordModal = () => {
    toast.dismiss();
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({ oldPassword: '', newPassword: '', confirmPassword: '', apiError: '' });
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setIsChangingPassword(false);
    isChangingPasswordRef.current = false;
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({ oldPassword: '', newPassword: '', confirmPassword: '', apiError: '' });
  };

  const handleChangePassword = async () => {
    if (isChangingPasswordRef.current) return;
    let hasError = false;
    const newErrors = { oldPassword: '', newPassword: '', confirmPassword: '', apiError: '' };

    if (!oldPassword) {
      newErrors.oldPassword = ACCOUNT_VALIDATION.OLD_PASSWORD_REQUIRED;
      hasError = true;
    }
    if (!newPassword) {
      newErrors.newPassword = ACCOUNT_VALIDATION.NEW_PASSWORD_REQUIRED;
      hasError = true;
    } else if (hasUnsafePasswordPattern(newPassword)) {
      newErrors.newPassword = 'Password cannot include HTML or script-like content';
      hasError = true;
    } else if (!isValidPassword(newPassword)) {
      newErrors.newPassword = ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY;
      hasError = true;
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = ACCOUNT_VALIDATION.CONFIRM_PASSWORD_REQUIRED;
      hasError = true;
    } else if (hasUnsafePasswordPattern(confirmPassword)) {
      newErrors.confirmPassword = 'Password cannot include HTML or script-like content';
      hasError = true;
    } else if (!isValidPassword(confirmPassword)) {
      newErrors.confirmPassword = ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY;
      hasError = true;
    }
    if (
      newPassword &&
      confirmPassword &&
      isValidPassword(newPassword) &&
      isValidPassword(confirmPassword) &&
      newPassword !== confirmPassword
    ) {
      newErrors.confirmPassword = ACCOUNT_VALIDATION.PASSWORD_MISMATCH;
      hasError = true;
    }
    if (oldPassword && newPassword && isValidPassword(newPassword) && oldPassword === newPassword) {
      newErrors.newPassword = ACCOUNT_VALIDATION.OLD_NEW_PASSWORD_SAME;
      hasError = true;
    }

    setErrors(newErrors);
    if (hasError) return;

    isChangingPasswordRef.current = true;
    setIsChangingPassword(true);

    try {
      const user = getParsedUser();
      if (!user) return;
      await dispatch(
        changePasswordRequest({
          user_id: user?.id as string,
          old_password: oldPassword,
          new_password: newPassword,
        }),
      ).unwrap();
      toast.success(ACCOUNT_VALIDATION.PASSWORD_UPDATED);
      setTimeout(() => closePasswordModal(), 1500);
    } catch (err: unknown) {
      const errorMessage =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || ACCOUNT_VALIDATION.SOMETHING_WENT_WRONG;
      toast.error(errorMessage);
      isChangingPasswordRef.current = false;
      setIsChangingPassword(false);
    }
  };

  const safeDisplayName =
    !isInvalidProfileName(originalData?.fullName || '') && trimBoundaryWhitespace(originalData?.fullName || '')
      ? sanitizeSafeName(originalData.fullName)
      : !isInvalidProfileName(fullName || '') && trimBoundaryWhitespace(fullName || '')
        ? sanitizeSafeName(fullName)
        : '';

  const displayName = safeDisplayName || email || 'User';

  const handleBlurOldPassword = () => {
    if (!oldPassword) {
      setErrors((prev) => ({ ...prev, oldPassword: ACCOUNT_VALIDATION.OLD_PASSWORD_REQUIRED }));
    } else {
      setErrors((prev) => ({ ...prev, oldPassword: '' }));
    }
  };

  const handleBlurNewPassword = () => {
    if (!newPassword) {
      setErrors((prev) => ({ ...prev, newPassword: ACCOUNT_VALIDATION.NEW_PASSWORD_REQUIRED }));
    } else if (hasUnsafePasswordPattern(newPassword)) {
      setErrors((prev) => ({ ...prev, newPassword: 'Password cannot include HTML or script-like content' }));
    } else if (!isValidPassword(newPassword)) {
      setErrors((prev) => ({ ...prev, newPassword: ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY }));
    } else if (oldPassword && newPassword === oldPassword) {
      setErrors((prev) => ({ ...prev, newPassword: ACCOUNT_VALIDATION.OLD_NEW_PASSWORD_SAME }));
    } else {
      setErrors((prev) => ({ ...prev, newPassword: '' }));
    }
  };

  const handleBlurConfirmPassword = () => {
    if (!confirmPassword) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword: ACCOUNT_VALIDATION.CONFIRM_PASSWORD_REQUIRED,
      }));
    } else if (hasUnsafePasswordPattern(confirmPassword)) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword: 'Password cannot include HTML or script-like content',
      }));
    } else if (!isValidPassword(confirmPassword)) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword: ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY,
      }));
    } else if (newPassword && confirmPassword !== newPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: ACCOUNT_VALIDATION.PASSWORD_MISMATCH }));
    } else {
      setErrors((prev) => ({ ...prev, confirmPassword: '' }));
    }
  };

  const onSubmitSubscribe = async (code: string) => {
    const isTrialFlow = sessionStorage.getItem('skipped_redeem') === 'true';
    setIsLoading(true);
    try {
      const res = await dispatch(
        RedeemRequest({
          code,
        }),
      ).unwrap();

      const userResponse = await dispatch(getCurrentUserRequest()).unwrap();
      updateStoredUser({
        ...(userResponse.data as unknown as Record<string, unknown>),
        is_license_active: true,
      });
      if (isTrialFlow) {
        sessionStorage.removeItem('skipped_redeem');
        sessionStorage.setItem('firstSubscribeToastShown', 'true');
        window.location.href = '/admin-dashboard';
      }
      toast.success(res.message);
      setShowRedeemModal(false);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Redeem failed');
      throw err;
    } finally {
      setIsLoading(false);
      fetchUser();
    }
  };

  return (
    <div className="p-6">
      <div ref={pageContentRef}>
        <div className="px-4">
          <PageHeader title={accountCopy.pageTitle} sub_text={accountCopy.pageSubtitle} />
        </div>

        {/* Seat summary — educators only; admin seat info + Add Entitlement Key now live on My Products */}
        {role !== 'District Admin' && (
        <div className="px-4 mt-4 flex justify-end">
          <div className="flex items-center gap-4 text-sm bg-gray-100 px-4 py-2 rounded-lg">
            <span className="text-gray-600">
              {accountCopy.totalSeats}:{' '}
              <span className="font-semibold text-gray-900">
                {tokenLoaded ? tokenData.purchased : '—'}
              </span>
            </span>
            {role === 'District Admin' && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-600">
                  {accountCopy.usedSeats}:{' '}
                  <span className="font-semibold text-gray-900">
                    {tokenLoaded ? tokenData.consumed : '—'}
                  </span>
                </span>
              </>
            )}
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">
              {accountCopy.remainingSeats}:{' '}
              <span className="font-semibold text-primary-500">
                {tokenLoaded ? tokenData.remaining : '—'}
              </span>
            </span>
            {role !== 'District Admin' && (
            <Button
              type="button"
              onClick={() => setIsRequestSeatsOpen(true)}
              variant="gradient"
              className="text-xs sm:text-sm font-semibold text-white py-2 px-3 sm:px-4 rounded-full whitespace-nowrap"
              aria-label={locale.dashboard.requestMoreSeats ?? 'Request More Seats'}
            >
              {locale.dashboard.requestMoreSeats ?? 'Request More Seats'}
            </Button>
            )}
          </div>
        </div>
        )}
        <input
          type="file"
          aria-label="Upload profile photo"
          accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="mt-6 bg-white border border-gray-300 rounded-md shadow-xl overflow-hidden">
          <div className="flex justify-between items-center bg-[#e9e9e9] px-4 py-3">
            <p className="text-[20px] font-semibold text-primary-500">{accountCopy.profileInformation}</p>
            <Button onClick={openPasswordModal} variant="gradient" size="lg">
              {accountCopy.changePassword}
            </Button>
          </div>

          {/* Profile Content */}
          <div
            className="flex items-start justify-between gap-4 p-4"
            onDrop={handleProfileDrop}
            onDragOver={handleProfileDragOver}
            data-testid="profile-photo-dropzone"
          >
            <div className="flex gap-4 min-w-0">
            {profileImage ? (
              <img
                src={profileImage}
                className="w-16 h-16 rounded-full object-cover shrink-0 aspect-square"
              />
            ) : (
              <p className="w-16 h-16 rounded-full text-center text-[40px] bg-[#5f6060] flex items-center justify-center text-white shrink-0 aspect-square">
                {displayName.charAt(0)}
              </p>
            )}
            <div className="flex flex-col justify-center">
              <p className="text-[18px] font-semibold">{displayName}</p>
              {profileImage ? (
                <div className="flex items-center gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[14px] text-primary-500 hover:underline"
                  >
                    {accountCopy.updatePhoto}
                  </button>
                  <span className="text-gray-300 text-sm">|</span>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="text-[14px] text-red-500 hover:text-red-600 hover:underline"
                  >
                    {accountCopy.removePhoto}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[14px] text-primary-500 hover:underline mt-1 text-left"
                >
                  {accountCopy.addPhoto}
                </button>
              )}
            </div>
            </div>
            <Button
              onClick={() => {
                setEditName(safeDisplayName);
                setFullNameError('');
                setShowEditProfileModal(true);
              }}
              variant="gradient"
              size="lg"
              className="shrink-0"
            >
              {accountCopy.editProfile}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
            <div className="flex flex-col gap-1.5">
              <span id="account-fullname-label" className="text-sm font-medium text-gray-700">{accountCopy.fullName}</span>
              <div role="text" aria-labelledby="account-fullname-label" className="min-h-[38px] px-3 rounded-xl border-2 border-gray-300 bg-white flex items-center text-sm text-gray-900 overflow-hidden">
                <span className="truncate w-full">{safeDisplayName || '—'}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span id="account-email-label" className="text-sm font-medium text-gray-700">{accountCopy.email}</span>
              <div role="text" aria-labelledby="account-email-label" className="min-h-[38px] px-3 rounded-xl border-2 border-gray-300 bg-white flex items-center text-sm text-gray-500 overflow-hidden">
                <span className="truncate w-full">{email || '—'}</span>
              </div>
            </div>
          </div>

        </div>

        <NotificationPreferences role={role} />


      </div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        showEditProfileModal={showEditProfileModal}
        setShowEditProfileModal={setShowEditProfileModal}
        editName={editName}
        setEditName={setEditName}
        setFullNameError={setFullNameError}
        setFullName={setFullName}
        email={email}
        handleSave={handleSave}
        fullNameError={fullNameError}
        copy={{
          title: locale?.account?.editProfileTitle ?? 'Edit Profile',
          cancel: locale?.account?.cancel ?? 'Cancel',
          saveChanges: locale?.account?.saveChanges ?? 'Save Changes',
          fullName: accountCopy.fullName,
          fullNamePlaceholder: locale?.account?.fullNamePlaceholder ?? 'Enter Full Name',
          email: accountCopy.email,
        }}
      />

      {/* Redeem Modal */}
      {showRedeemModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        >
          <div
            ref={redeemModalRef}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl relative flex flex-col overflow-hidden max-h-[min(calc(100vh-2rem),calc(100dvh-2rem))]"
          >
            <Button
              onClick={() => {
                setShowRedeemModal(false);
                dispatch(clearRedeemError());
              }}
              variant="ghost"
              size="icon"
              aria-label="Close"
              className="absolute top-4 right-4 z-10"
            >
              <X aria-hidden="true" />
            </Button>
            <div className="flex-1 overflow-y-auto">
              <RedeemCode
                isLoading={isLoading}
                isModal={true}
                onSubmitSubscribe={onSubmitSubscribe}
              />
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      <PasswordModal
        showPasswordModal={showPasswordModal}
        oldPassword={oldPassword}
        setOldPassword={setOldPassword}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        errors={errors}
        isChangingPassword={isChangingPassword}
        handleChangePassword={handleChangePassword}
        closePasswordModal={closePasswordModal}
        onBlurOldPassword={handleBlurOldPassword}
        onBlurNewPassword={handleBlurNewPassword}
        onBlurConfirmPassword={handleBlurConfirmPassword}
        copy={{
          title: accountCopy.changePassword,
          cancel: locale?.account?.cancel ?? 'Cancel',
          updatePassword: locale?.account?.updatePassword ?? 'Update Password',
          updating: locale?.account?.updating ?? 'Updating...',
          oldPassword: locale?.account?.oldPassword ?? 'Old Password',
          oldPasswordPlaceholder: locale?.account?.oldPasswordPlaceholder ?? 'Old Password',
          newPassword: locale?.account?.newPassword ?? 'New Password',
          newPasswordPlaceholder: locale?.account?.newPasswordPlaceholder ?? 'New Password',
          confirmPassword: locale?.account?.confirmPassword ?? 'Confirm Password',
          confirmPasswordPlaceholder:
            locale?.account?.confirmPasswordPlaceholder ?? 'Confirm Password',
        }}
      />
      <RequestSeatsModal
        isOpen={isRequestSeatsOpen}
        onClose={() => setIsRequestSeatsOpen(false)}
        remainingSeats={tokenData.remaining}
        labels={{
          title: locale.dashboard.requestSeatsModalTitle ?? 'Request more AI seats',
          description:
            locale.dashboard.requestSeatsModalDescription ??
            "Notify your admin that you'd like additional AI simulation seats allocated to your account.",
          amountLabel: locale.dashboard.requestSeatsAmountLabel ?? 'Seats needed (optional)',
          amountPlaceholder: locale.dashboard.requestSeatsAmountPlaceholder ?? 'e.g. 25',
          noteLabel: locale.dashboard.requestSeatsNoteLabel ?? 'Add a note (optional)',
          notePlaceholder:
            locale.dashboard.requestSeatsNotePlaceholder ??
            'Share why you need more seats.',
          submit: locale.dashboard.requestSeatsSubmit ?? 'Send Request',
          cancel: locale.dashboard.requestSeatsCancel ?? 'Cancel',
          sending: locale.dashboard.requestSeatsSending ?? 'Sending...',
          successToast:
            locale.dashboard.requestSeatsSuccess ?? 'Your request was sent to the admin.',
          errorToast:
            locale.dashboard.requestSeatsError ?? 'Could not send your request. Please try again.',
          noteMax: locale.dashboard.requestSeatsNoteMax ?? 'Note must be 500 characters or fewer.',
          remainingTemplate:
            locale.dashboard.requestSeatsRemainingLabel ??
            'You currently have {{remaining}} AI seat(s) remaining.',
        }}
      />
    </div>
  );
}
