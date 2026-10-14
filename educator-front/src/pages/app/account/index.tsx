import { PageHeader } from '../../../components/common/PageHeader';
import { toast } from '../../../components/common/Toast';
import { useAppDispatch } from '../../../store/hooks';
import { X, Plus } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Button } from '../../../components/ui/Button';
import { changePasswordRequest } from '../../../redux/auth/ChangePasswordRedux';
import { updateProfileRequest } from '../../../redux/auth/UpdateProfileRedux';
import { removeProfilePictureRequest } from '../../../redux/auth/RemoveProfilePictureRedux';
import RedeemCode from '../../../pages/auth/RedeemCode/index';
import { clearRedeemError } from '@/redux/auth/RedeemRedux';
import { ACCOUNT_VALIDATION } from '../../../utils/messages/account';
import { fetchCurrentUser } from '../../../redux/auth/MeRedux';
import { getAiSeats } from '../../../utils/normalizeAuthUser';
import { getParsedUser, updateStoredUser } from '../../../utils/storage';
import { RedeemRequest } from '@/redux/auth/RedeemRedux';
import EditProfileModal from '@/components/modal/EditProfileModal';
import PasswordModal from '@/components/modal/PasswordModal';
import { ProfileAvatar } from '@/components/account/ProfileAvatar';
import {
  ProfileCardSkeleton,
  ProfileUnavailable,
} from '@/components/account/ProfileCardStates';
import { ApplyUserData } from '@/utils/applyUserData';
import {
  isValidPassword,
  isValidProfileImageFile,
} from '../../../utils/validation';
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
import NotificationSettings from '@/components/notifications/NotificationSettings';
import { getRoleSwitchTarget } from '../../../hooks/useSwitchRole';
import {
  clearRedeemSkipped,
  hasSkippedRedeem,
} from '../../../utils/trialState';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

const NOTIFICATION_PREFERENCES_ID = 'notification-preferences';

export default function Account() {
  const sanitizeSafeName = (value: string) =>
    sanitizeTextForTyping(value ?? '', 50)
      .replace(/^ +/, '')
      .replace(/  +/g, ' ');

  const isInvalidProfileName = (value: string) =>
    !trimBoundaryWhitespace(value) ||
    hasUnsafeMarkupOrScriptPattern(value) ||
    hasDisallowedClassNameChars(value) ||
    hasSqlInjectionLikePattern(value) ||
    hasBlockedCodingKeyword(value) ||
    hasCodeLikeSyntaxPattern(value) ||
    hasNameCodeLikePattern(value);

  const dispatch = useAppDispatch();
  const { t } = useTranslation('account');
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const accountCopy = {
    pageTitle: locale?.account?.pageTitle ?? 'Account Settings',
    pageSubtitle:
      locale?.account?.pageSubtitle ?? 'Manage your profile and preferences',
    addSubscription: locale?.account?.addSubscription ?? 'Add Subscription',
    totalSeats: locale?.account?.totalSeats ?? 'Total Seats',
    usedSeats: locale?.account?.usedSeats ?? 'Used Seats',
    remainingSeats: locale?.account?.remainingSeats ?? 'Remaining Seats',
    profileInformation:
      locale?.account?.profileInformation ?? 'Profile Information',
    changePassword: locale?.account?.changePassword ?? 'Change Password',
    updatePhoto: locale?.account?.updatePhoto ?? 'Update Photo',
    removePhoto: locale?.account?.removePhoto ?? 'Remove Photo',
    addPhoto: locale?.account?.addPhoto ?? 'Add Photo',
    fullName: locale?.account?.fullName ?? 'Full Name',
    email: locale?.account?.email ?? 'Email',
    editProfile: locale?.account?.editProfile ?? 'Edit Profile',
  };
  const cachedUser = getParsedUser() ?? {};
  const cachedName =
    (cachedUser?.full_name as string) || (cachedUser?.fullname as string) || '';
  const cachedImage = (cachedUser?.profile_picture as string) || '';
  // With a saved copy the card shows it at once and refreshes quietly; without
  // one it shows a skeleton, then the details or a retry if the load fails.
  const [profileStatus, setProfileStatus] = useState<
    'loading' | 'ready' | 'failed'
  >(() => (cachedName || cachedUser?.email ? 'ready' : 'loading'));
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const [fullName, setFullName] = useState(() =>
    isInvalidProfileName(cachedName) ? '' : sanitizeSafeName(cachedName)
  );
  const [email, setEmail] = useState((cachedUser?.email as string) || '');
  const [profileImage, setProfileImage] = useState(cachedImage);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // One photo upload or removal at a time; the ref blocks a second one
  // before the state update lands.
  const [photoAction, setPhotoAction] = useState<
    'idle' | 'uploading' | 'removing'
  >('idle');
  const photoActionRef = useRef<'idle' | 'uploading' | 'removing'>('idle');
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
      : (cachedUser?.role as Record<string, string>)?.role_name || ''
  );

  const [errors, setErrors] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    apiError: '',
  });

  // The dashboard Notification Center's gear opens this page scrolled to the
  // notification preferences.
  const location = useLocation();
  useEffect(() => {
    const { scrollTo } = (location.state ?? {}) as { scrollTo?: unknown };
    if (scrollTo !== NOTIFICATION_PREFERENCES_ID) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(NOTIFICATION_PREFERENCES_ID)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.key, location.state]);

  useEffect(() => {
    if (!showRedeemModal) return;
    const modal = redeemModalRef.current;
    if (!modal) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getFocusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(focusableSelectors)
      ).filter((el) => !el.hasAttribute('disabled'));

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
    const anyModalOpen =
      showRedeemModal || showPasswordModal || showEditProfileModal;
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
    const name =
      (parsed.full_name as string) || (parsed.fullname as string) || '';
    const safeName = isInvalidProfileName(name) ? '' : sanitizeSafeName(name);
    const image = (parsed.profile_picture as string) || '';
    const emailVal = (parsed.email as string) || '';
    if (safeName && !fullName) setFullName(safeName);
    if (emailVal && !email) setEmail(emailVal);
    if (image && !profileImage) setProfileImage(image);
    if (safeName && !originalData.fullName)
      setOriginalData({ fullName: safeName, profileImage: image });
  }, []);

  const [tokenData, setTokenData] = useState(() => {
    const cached = getParsedUser();
    if (!cached)
      return { purchased: 0, consumed: 0, remaining: 0, percentage: 0 };
    const {
      total: purchased,
      available: remaining,
      consumed,
    } = getAiSeats(cached);
    const percentage =
      purchased > 0 ? Math.min((consumed / purchased) * 100, 100) : 0;
    return { purchased, consumed, remaining, percentage };
  });
  const [tokenLoaded, setTokenLoaded] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const promise = dispatch(fetchCurrentUser());
    promise
      .unwrap()
      .then(async (freshUser) => {
        await ApplyUserData(freshUser, {
          setFullName,
          setEmail,
          setProfileImage,
          setRole,
          setOriginalData,
          setTokenData,
        });
        const freshName =
          (freshUser?.full_name as string) ||
          (freshUser?.fullname as string) ||
          '';
        const safeFreshName = isInvalidProfileName(freshName)
          ? ''
          : sanitizeSafeName(freshName);
        // Only overwrite the shown/stored name when the API actually sent one.
        if (safeFreshName) {
          setFullName(safeFreshName);
          updateStoredUser({ full_name: safeFreshName });
        }
        if (!isCancelled) setProfileStatus('ready');
      })
      .catch(() => {
        // Non-fatal when cached data is already on screen.
        if (isCancelled) return;
        setProfileStatus((current) =>
          current === 'ready' ? 'ready' : 'failed'
        );
      });
    return () => {
      isCancelled = true;
      promise.abort?.();
    };
  }, [role, dispatch, profileLoadAttempt]);

  const retryProfileLoad = () => {
    setProfileStatus('loading');
    setProfileLoadAttempt((attempt) => attempt + 1);
  };

  const fetchUser = async () => {
    try {
      const freshUser = await dispatch(fetchCurrentUser()).unwrap();
      await ApplyUserData(freshUser, {
        setFullName,
        setEmail,
        setProfileImage,
        setRole,
        setOriginalData,
        setTokenData,
      });
      const freshName =
        (freshUser?.full_name as string) ||
        (freshUser?.fullname as string) ||
        '';
      const safeFreshName = isInvalidProfileName(freshName)
        ? ''
        : sanitizeSafeName(freshName);
      if (safeFreshName) {
        setFullName(safeFreshName);
        updateStoredUser({ full_name: safeFreshName });
      }
    } catch {
      return;
    } finally {
      setTokenLoaded(true);
    }
  };

  const getRejectedMessage = (payload: unknown) =>
    typeof payload === 'string' && payload
      ? payload
      : ACCOUNT_VALIDATION.UPDATE_FAILED;

  const setPhotoActionState = (action: 'idle' | 'uploading' | 'removing') => {
    photoActionRef.current = action;
    setPhotoAction(action);
  };

  /**
   * Saves the name and resolves to whether it was saved, so the Edit Profile
   * dialog can stay open on a failure. Failure messages go under the field.
   */
  const handleSave = async (nameOverride?: string): Promise<boolean> => {
    const nameToSave = nameOverride ?? fullName;
    if (!nameToSave.trim()) {
      setFullNameError(
        locale.validation.fullNameRequired ??
          ACCOUNT_VALIDATION.FULL_NAME_REQUIRED
      );
      return false;
    }
    if (isInvalidProfileName(nameToSave)) {
      setFullNameError(locale.validation.fullNameUnsafe);
      return false;
    }
    setFullNameError('');

    try {
      const resultAction = await dispatch(
        // The dialog's Save button shows "Saving…", so skip the full-page loader.
        updateProfileRequest({ fullName: nameToSave, silent: true })
      );
      if (updateProfileRequest.fulfilled.match(resultAction)) {
        const responseData = resultAction.payload;
        const updatedName = sanitizeSafeName(
          responseData?.data?.fullName || nameToSave
        );
        setFullName(updatedName);
        updateStoredUser({ full_name: updatedName });
        window.dispatchEvent(new Event('profile-updated'));
        setOriginalData((prev) => ({ ...prev, fullName: updatedName }));
        toast.success(
          responseData?.message || ACCOUNT_VALIDATION.PROFILE_UPDATED
        );
        return true;
      }
      setFullNameError(getRejectedMessage(resultAction.payload));
      return false;
    } catch {
      setFullNameError(ACCOUNT_VALIDATION.SOMETHING_WENT_WRONG);
      return false;
    }
  };

  /**
   * Re-reads the picture from `/auth/me`, the app's only source for it, and
   * shows what the backend now has.
   */
  const refreshProfileImage = async (): Promise<string> => {
    try {
      const freshUser = await dispatch(fetchCurrentUser()).unwrap();
      const image = (freshUser?.profile_picture as string) || '';
      setProfileImage(image);
      return image;
    } catch {
      setProfileImage('');
      return '';
    }
  };

  const uploadProfileImage = async (file: File) => {
    if (photoActionRef.current !== 'idle') return;
    const hadExistingPhoto = Boolean(originalData.profileImage?.trim());

    if (!isValidProfileImageFile(file)) {
      toast.error(ACCOUNT_VALIDATION.IMAGE_TYPE_INVALID);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(ACCOUNT_VALIDATION.IMAGE_TOO_LARGE);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setProfileImage(previewUrl);
    setPhotoActionState('uploading');

    try {
      const resultAction = await dispatch(
        // The avatar shows its own busy state, so skip the full-page loader.
        updateProfileRequest({ fullName, profile_image: file, silent: true })
      );
      if (updateProfileRequest.fulfilled.match(resultAction)) {
        const responseData = resultAction.payload;
        const updatedName = responseData?.data?.fullName || fullName;
        if (updatedName) {
          updateStoredUser({ full_name: updatedName });
        }
        // The picture is read back from /auth/me so this page has one source.
        const updatedImage = await refreshProfileImage();
        window.dispatchEvent(new Event('profile-updated'));
        setOriginalData((prev) => ({ ...prev, profileImage: updatedImage }));
        toast.success(
          hadExistingPhoto
            ? ACCOUNT_VALIDATION.PROFILE_IMAGE_UPDATED
            : ACCOUNT_VALIDATION.PROFILE_IMAGE_ADDED
        );
      } else {
        setProfileImage(originalData.profileImage);
        toast.error(getRejectedMessage(resultAction.payload));
      }
    } catch {
      setProfileImage(originalData.profileImage);
      toast.error(ACCOUNT_VALIDATION.SOMETHING_WENT_WRONG);
    } finally {
      URL.revokeObjectURL(previewUrl);
      setPhotoActionState('idle');
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
    if (photoActionRef.current !== 'idle') return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    await uploadProfileImage(file);
  };

  const handleProfileDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const openFileChooser = () => {
    if (photoActionRef.current !== 'idle') return;
    fileInputRef.current?.click();
  };

  const handleRemovePhoto = async () => {
    if (photoActionRef.current !== 'idle') return;
    setPhotoActionState('removing');
    try {
      const resultAction = await dispatch(
        removeProfilePictureRequest({ silent: true })
      );
      if (removeProfilePictureRequest.fulfilled.match(resultAction)) {
        const updatedImage = await refreshProfileImage();
        window.dispatchEvent(new Event('profile-updated'));
        setOriginalData((prev) => ({ ...prev, profileImage: updatedImage }));
        toast.success(
          locale?.account?.photoRemoved ?? 'Photo removed successfully'
        );
      } else {
        toast.error(getRejectedMessage(resultAction.payload));
      }
    } catch {
      toast.error(ACCOUNT_VALIDATION.SOMETHING_WENT_WRONG);
    } finally {
      setPhotoActionState('idle');
    }
  };

  const isPhotoBusy = photoAction !== 'idle';
  const photoStatus =
    photoAction === 'uploading'
      ? t('photo.uploading')
      : photoAction === 'removing'
        ? t('photo.removing')
        : '';
  const photoLinkClass = clsx(
    'text-[14px] hover:underline',
    isPhotoBusy && 'opacity-50 cursor-not-allowed hover:no-underline'
  );

  const openPasswordModal = () => {
    toast.dismiss();
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
      apiError: '',
    });
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setIsChangingPassword(false);
    isChangingPasswordRef.current = false;
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
      apiError: '',
    });
  };

  const handleChangePassword = async () => {
    if (isChangingPasswordRef.current) return;
    let hasError = false;
    const newErrors = {
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
      apiError: '',
    };

    if (!oldPassword) {
      newErrors.oldPassword =
        locale.account.oldPasswordRequired ??
        ACCOUNT_VALIDATION.OLD_PASSWORD_REQUIRED;
      hasError = true;
    }
    if (!newPassword) {
      newErrors.newPassword =
        locale.account.newPasswordRequired ??
        ACCOUNT_VALIDATION.NEW_PASSWORD_REQUIRED;
      hasError = true;
    } else if (hasUnsafePasswordPattern(newPassword)) {
      newErrors.newPassword = locale.validation.unsafePassword;
      hasError = true;
    } else if (!isValidPassword(newPassword)) {
      newErrors.newPassword =
        locale.account.passwordComplexity ??
        ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY;
      hasError = true;
    }
    if (!confirmPassword) {
      newErrors.confirmPassword =
        locale.account.confirmPasswordRequired ??
        ACCOUNT_VALIDATION.CONFIRM_PASSWORD_REQUIRED;
      hasError = true;
    } else if (hasUnsafePasswordPattern(confirmPassword)) {
      newErrors.confirmPassword = locale.validation.unsafePassword;
      hasError = true;
    } else if (!isValidPassword(confirmPassword)) {
      newErrors.confirmPassword =
        locale.account.passwordComplexity ??
        ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY;
      hasError = true;
    }
    if (
      newPassword &&
      confirmPassword &&
      isValidPassword(newPassword) &&
      isValidPassword(confirmPassword) &&
      newPassword !== confirmPassword
    ) {
      newErrors.confirmPassword =
        locale.account.passwordMismatch ?? ACCOUNT_VALIDATION.PASSWORD_MISMATCH;
      hasError = true;
    }
    if (
      oldPassword &&
      newPassword &&
      isValidPassword(newPassword) &&
      oldPassword === newPassword
    ) {
      newErrors.newPassword =
        locale.account.oldNewPasswordSame ??
        ACCOUNT_VALIDATION.OLD_NEW_PASSWORD_SAME;
      hasError = true;
    }

    setErrors(newErrors);
    if (hasError) return;

    isChangingPasswordRef.current = true;
    setIsChangingPassword(true);

    try {
      await dispatch(
        // The dialog's button shows "Updating...", so skip the full-page loader.
        changePasswordRequest({
          oldPassword,
          newPassword,
          silent: true,
        })
      ).unwrap();
      closePasswordModal();
      toast.success(ACCOUNT_VALIDATION.PASSWORD_UPDATED);
    } catch (err: unknown) {
      const errorMessage =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message ||
            ACCOUNT_VALIDATION.SOMETHING_WENT_WRONG;
      toast.error(errorMessage);
      isChangingPasswordRef.current = false;
      setIsChangingPassword(false);
    }
  };

  const safeDisplayName =
    !isInvalidProfileName(originalData?.fullName || '') &&
    trimBoundaryWhitespace(originalData?.fullName || '')
      ? sanitizeSafeName(originalData.fullName)
      : !isInvalidProfileName(fullName || '') &&
          trimBoundaryWhitespace(fullName || '')
        ? sanitizeSafeName(fullName)
        : '';

  const displayName = safeDisplayName || email || 'User';

  const handleBlurOldPassword = () => {
    if (!oldPassword) {
      setErrors((prev) => ({
        ...prev,
        oldPassword:
          locale.account.oldPasswordRequired ??
          ACCOUNT_VALIDATION.OLD_PASSWORD_REQUIRED,
      }));
    } else {
      setErrors((prev) => ({ ...prev, oldPassword: '' }));
    }
  };

  const handleBlurNewPassword = () => {
    if (!newPassword) {
      setErrors((prev) => ({
        ...prev,
        newPassword:
          locale.account.newPasswordRequired ??
          ACCOUNT_VALIDATION.NEW_PASSWORD_REQUIRED,
      }));
    } else if (hasUnsafePasswordPattern(newPassword)) {
      setErrors((prev) => ({
        ...prev,
        newPassword: locale.validation.unsafePassword,
      }));
    } else if (!isValidPassword(newPassword)) {
      setErrors((prev) => ({
        ...prev,
        newPassword:
          locale.account.passwordComplexity ??
          ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY,
      }));
    } else if (oldPassword && newPassword === oldPassword) {
      setErrors((prev) => ({
        ...prev,
        newPassword:
          locale.account.oldNewPasswordSame ??
          ACCOUNT_VALIDATION.OLD_NEW_PASSWORD_SAME,
      }));
    } else {
      setErrors((prev) => ({ ...prev, newPassword: '' }));
    }
  };

  const handleBlurConfirmPassword = () => {
    if (!confirmPassword) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword:
          locale.account.confirmPasswordRequired ??
          ACCOUNT_VALIDATION.CONFIRM_PASSWORD_REQUIRED,
      }));
    } else if (hasUnsafePasswordPattern(confirmPassword)) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword: locale.validation.unsafePassword,
      }));
    } else if (!isValidPassword(confirmPassword)) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword:
          locale.account.passwordComplexity ??
          ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY,
      }));
    } else if (newPassword && confirmPassword !== newPassword) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword:
          locale.account.passwordMismatch ??
          ACCOUNT_VALIDATION.PASSWORD_MISMATCH,
      }));
    } else {
      setErrors((prev) => ({ ...prev, confirmPassword: '' }));
    }
  };

  const onSubmitSubscribe = async (code: string) => {
    const isTrialFlow = hasSkippedRedeem();
    setIsLoading(true);
    try {
      await dispatch(
        RedeemRequest({
          code,
        })
      ).unwrap();

      updateStoredUser({ is_license_active: true });
      try {
        // Refreshes seats/profile; non-critical — the redeem itself already
        // succeeded, so a failed refresh here must not block the success
        // toast or leave the dialog stuck open.
        await dispatch(fetchCurrentUser()).unwrap();
        updateStoredUser({ is_license_active: true });
      } catch {
        // non-critical, ignore
      }
      if (isTrialFlow) {
        clearRedeemSkipped();
        sessionStorage.setItem('firstSubscribeToastShown', 'true');
        window.location.href = '/admin-dashboard';
      }
      toast.success(
        locale?.redeem?.licenseActivatedSuccess ??
          'License activated successfully'
      );
      setShowRedeemModal(false);
    } catch (err: unknown) {
      toast.error(locale?.redeem?.redeemFailed ?? 'Redeem failed');
      throw err;
    } finally {
      setIsLoading(false);
      fetchUser();
    }
  };

  return (
    <div className="px-6 pt-6 pb-2">
      <div ref={pageContentRef}>
        <div className="px-4">
          <PageHeader
            title={accountCopy.pageTitle}
            sub_text={accountCopy.pageSubtitle}
            actionButton={
              role === 'District Admin' && (
                <Button
                  onClick={() => setShowRedeemModal(true)}
                  variant="gradient"
                  size="lg"
                  className="flex items-center gap-2 rounded-full shadow-md"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  {accountCopy.addSubscription}
                </Button>
              )
            }
          />
        </div>

        {/* AI Tokens Summary */}
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
                aria-label={
                  locale.dashboard.requestMoreSeats ?? 'Request More Seats'
                }
              >
                {locale.dashboard.requestMoreSeats ?? 'Request More Seats'}
              </Button>
            )}
          </div>
        </div>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Profile Information */}
        <div className="px-4 mt-6">
          <div className="bg-white border border-gray-300 rounded-md shadow-xl overflow-hidden">
            <div className="flex justify-between items-center bg-[#e9e9e9] px-4 py-3">
              <p className="text-[20px] font-semibold text-primary-500">
                {accountCopy.profileInformation}
              </p>
              <Button onClick={openPasswordModal} variant="gradient" size="lg">
                {accountCopy.changePassword}
              </Button>
            </div>

            {profileStatus === 'loading' ? (
              <ProfileCardSkeleton />
            ) : profileStatus === 'failed' ? (
              <ProfileUnavailable onRetry={retryProfileLoad} />
            ) : (
              <>
                {/* Profile Content */}
                <div
                  className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4"
                  onDrop={handleProfileDrop}
                  onDragOver={handleProfileDragOver}
                  data-testid="profile-photo-dropzone"
                >
                  <div className="flex gap-4 min-w-0">
                    <ProfileAvatar
                      imageUrl={profileImage}
                      initial={displayName.charAt(0)}
                      isBusy={isPhotoBusy}
                    />
                    <div className="flex flex-col justify-center min-w-0">
                      <p className="text-[18px] font-semibold truncate">
                        {displayName}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        {profileImage ? (
                          <>
                            <button
                              type="button"
                              onClick={openFileChooser}
                              aria-disabled={isPhotoBusy}
                              className={clsx(
                                photoLinkClass,
                                'text-primary-500'
                              )}
                            >
                              {accountCopy.updatePhoto}
                            </button>
                            <span className="text-gray-300 text-sm">|</span>
                            <button
                              type="button"
                              onClick={handleRemovePhoto}
                              aria-disabled={isPhotoBusy}
                              className={clsx(
                                photoLinkClass,
                                'text-red-500',
                                !isPhotoBusy && 'hover:text-red-600'
                              )}
                            >
                              {accountCopy.removePhoto}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={openFileChooser}
                            aria-disabled={isPhotoBusy}
                            className={clsx(
                              photoLinkClass,
                              'text-primary-500 text-left'
                            )}
                          >
                            {accountCopy.addPhoto}
                          </button>
                        )}
                        {/* Visible and announced while a photo is saving or being removed. */}
                        <span
                          role="status"
                          aria-live="polite"
                          className="text-[14px] text-gray-500"
                        >
                          {photoStatus}
                        </span>
                      </div>
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
                    className="shrink-0 self-end sm:self-auto"
                    // A photo upload sends the current name too, so a rename
                    // mid-upload could be overwritten when the upload lands.
                    disabled={isPhotoBusy}
                  >
                    {accountCopy.editProfile}
                  </Button>
                </div>

                <dl className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                  <div className="flex flex-col gap-1.5">
                    <dt className="text-sm font-medium text-gray-700">
                      {accountCopy.fullName}
                    </dt>
                    <dd className="min-h-[38px] px-3 rounded-xl border-2 border-gray-300 bg-white flex items-center text-sm text-gray-900 overflow-hidden">
                      <span className="truncate w-full">
                        {safeDisplayName || '—'}
                      </span>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <dt className="text-sm font-medium text-gray-700">
                      {accountCopy.email}
                    </dt>
                    <dd className="min-h-[38px] px-3 rounded-xl border-2 border-gray-300 bg-white flex items-center text-sm text-gray-500 overflow-hidden">
                      <span className="truncate w-full">{email || '—'}</span>
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </div>
        </div>

        {/* Notification Settings — full width, directly below profile */}
        <div id={NOTIFICATION_PREFERENCES_ID} className="px-4 my-5 scroll-mt-4">
          <NotificationSettings
            role={role.toLowerCase().includes('admin') ? 'admin' : 'educator'}
            isDualRole={getRoleSwitchTarget() !== null}
            language={language}
          />
        </div>
      </div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        showEditProfileModal={showEditProfileModal}
        setShowEditProfileModal={setShowEditProfileModal}
        editName={editName}
        savedName={safeDisplayName}
        setEditName={setEditName}
        setFullNameError={setFullNameError}
        email={email}
        handleSave={handleSave}
        fullNameError={fullNameError}
        copy={{
          title: locale?.account?.editProfileTitle ?? 'Edit Profile',
          cancel: locale?.account?.cancel ?? 'Cancel',
          saveChanges: locale?.account?.saveChanges ?? 'Save Changes',
          fullName: accountCopy.fullName,
          fullNamePlaceholder:
            locale?.account?.fullNamePlaceholder ?? 'Enter Full Name',
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
              className="absolute top-4 right-4 z-10"
            >
              <X />
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
          oldPasswordPlaceholder:
            locale?.account?.oldPasswordPlaceholder ?? 'Old Password',
          newPassword: locale?.account?.newPassword ?? 'New Password',
          newPasswordPlaceholder:
            locale?.account?.newPasswordPlaceholder ?? 'New Password',
          confirmPassword:
            locale?.account?.confirmPassword ?? 'Confirm Password',
          confirmPasswordPlaceholder:
            locale?.account?.confirmPasswordPlaceholder ?? 'Confirm Password',
        }}
      />
      <RequestSeatsModal
        isOpen={isRequestSeatsOpen}
        onClose={() => setIsRequestSeatsOpen(false)}
        remainingSeats={tokenData.remaining}
        labels={{
          title:
            locale.dashboard.requestSeatsModalTitle ?? 'Request more AI seats',
          description:
            locale.dashboard.requestSeatsModalDescription ??
            "Notify your admin that you'd like additional AI simulation seats allocated to your account.",
          amountLabel:
            locale.dashboard.requestSeatsAmountLabel ??
            'Seats needed (optional)',
          amountPlaceholder:
            locale.dashboard.requestSeatsAmountPlaceholder ?? 'e.g. 25',
          noteLabel:
            locale.dashboard.requestSeatsNoteLabel ?? 'Add a note (optional)',
          notePlaceholder:
            locale.dashboard.requestSeatsNotePlaceholder ??
            'Share why you need more seats.',
          submit: locale.dashboard.requestSeatsSubmit ?? 'Send Request',
          cancel: locale.dashboard.requestSeatsCancel ?? 'Cancel',
          sending: locale.dashboard.requestSeatsSending ?? 'Sending...',
          successToast:
            locale.dashboard.requestSeatsSuccess ??
            'Your request was sent to the admin.',
          errorToast:
            locale.dashboard.requestSeatsError ??
            'Could not send your request. Please try again.',
          noteMax:
            locale.dashboard.requestSeatsNoteMax ??
            'Note must be 500 characters or fewer.',
          remainingTemplate:
            locale.dashboard.requestSeatsRemainingLabel ??
            'You currently have {{remaining}} AI seat(s) remaining.',
        }}
      />
    </div>
  );
}
