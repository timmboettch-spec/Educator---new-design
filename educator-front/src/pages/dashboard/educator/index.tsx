import React, { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildClassesAttentionPath } from '../../../routes/routePath';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '../../../components/common/PageHeader';
import ClassesNeedingAttentionCard from '../../../components/class/ClassesNeedingAttentionCard';
import { ActivityOverview } from '../../../components/dashboard/ActivityOverview';
import { SimulationsCompletedChart } from '../../../components/dashboard/SimulationsCompletedChart';
import { NotificationCenter } from '../../../components/dashboard/NotificationCenter';
import { YourSchoolsCard } from '../../../components/dashboard/YourSchoolsCard';
import { getEducatorSchools } from '@/utils/dashboardSchools';
import { MyProductsUsage } from '../../../components/dashboard/productsUsage/MyProductsUsage';
import {
  FetchClassesRequest,
  selectClassStatus,
  selectClassError,
} from '../../../redux/class/GetClassRedux';
import type { AppDispatch } from '../../../store';
import { getParsedUser, updateStoredUser } from '@/utils/storage';
import { GetEducatorSimulationReports } from '@/redux/reports/EducatorReportsRedux';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import { setLoading } from '@/redux/loader/loaderSlice';
import RequestSeatsModal from '../../../components/modal/RequestSeatsModal';
import {
  finishLmsLaunchSession,
  runLtiLaunchSyncIfNeeded,
  resyncLmsRostersIfConfigured,
} from '@/utils/lmsLaunchSync';
import { resyncGoogleClassroomRostersIfConfigured } from '@/utils/googleClassroomRosterSync';
import { fetchCurrentUser } from '@/redux/auth/MeRedux';
import { getAiSeats, getEducatorId } from '@/utils/normalizeAuthUser';
import { useDashboardCardState } from '@/hooks/useDashboardCardState';
import {
  getDashboardProducts,
  toSeatRequestOptions,
} from '@/utils/dashboardProducts';
import {
  hasUnsafeMarkupOrScriptPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasNameCodeLikePattern,
  trimBoundaryWhitespace,
  sanitizeTextForTyping,
} from '../../../utils/inputSecurity';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

export default function EducatorDashboard() {
  const { t } = useTranslation('dashboard');
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [isRequestSeatsOpen, setIsRequestSeatsOpen] = React.useState(false);
  const [alertsOverviewOpen, setAlertsOverviewOpen] = useDashboardCardState(
    'alerts',
    true
  );
  const classStatus = useSelector(selectClassStatus);
  const classError = useSelector(selectClassError);
  const storedUser = getParsedUser();
  const [currentUser, setCurrentUser] = React.useState(storedUser);
  const user = currentUser;
  const educatorUserId = user?.role === 'Educator' ? getEducatorId(user) : null;
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const sanitizeSafeName = (value: string) =>
    sanitizeTextForTyping(value ?? '', 50)
      .replace(/^ +/, '')
      .replace(/  +/g, ' ');
  const hasFetched = useRef(false);
  const isInvalidProfileName = (value: string) =>
    !trimBoundaryWhitespace(value) ||
    hasUnsafeMarkupOrScriptPattern(value) ||
    hasDisallowedClassNameChars(value) ||
    hasSqlInjectionLikePattern(value) ||
    hasBlockedCodingKeyword(value) ||
    hasCodeLikeSyntaxPattern(value) ||
    hasNameCodeLikePattern(value);

  const seats = useMemo(() => getAiSeats(user), [user]);
  const schools = useMemo(() => getEducatorSchools(user), [user]);
  // Placeholder products until a products API exists (see dashboardProducts.ts).
  const products = useMemo(() => getDashboardProducts(), []);
  const seatRequestProducts = useMemo(
    () => toSeatRequestOptions(products),
    [products]
  );

  useEffect(() => {
    const raw = sessionStorage.getItem('rwai_post_switch_nav');
    if (!raw) return;
    try {
      const { to, state } = JSON.parse(raw) as { to: string; state: unknown };
      sessionStorage.removeItem('rwai_post_switch_nav');
      if (to) navigate(to, { state });
    } catch {
      sessionStorage.removeItem('rwai_post_switch_nav');
    }
  }, []);

  useEffect(() => {
    if (!educatorUserId || hasFetched.current) return;

    hasFetched.current = true;

    const fetchClasses = async () => {
      dispatch(setLoading(true));

      try {
        await runLtiLaunchSyncIfNeeded(dispatch).catch(() => {});
        await resyncLmsRostersIfConfigured(dispatch).catch(() => {});
        await resyncGoogleClassroomRostersIfConfigured(dispatch).catch(
          () => {}
        );

        await Promise.allSettled([
          dispatch(FetchClassesRequest()).unwrap(),
          dispatch(
            GetEducatorSimulationReports({ educatorId: educatorUserId })
          ).unwrap(),
        ]);

        finishLmsLaunchSession();
      } finally {
        dispatch(setLoading(false));
      }
    };

    void fetchClasses();
  }, [dispatch, educatorUserId]);

  useEffect(() => {
    const promise = dispatch(fetchCurrentUser());

    promise
      .unwrap()
      .then((freshUser) => {
        const freshName =
          (freshUser.full_name as string) ||
          (freshUser.fullname as string) ||
          '';

        const safeFreshName = isInvalidProfileName(freshName)
          ? ''
          : sanitizeSafeName(freshName);

        // Only overwrite the stored name when the API actually sent one.
        if (safeFreshName) {
          updateStoredUser({ full_name: safeFreshName });
        }

        // IMPORTANT: read back the merged user so fields the response omits
        // (e.g. ai_seats) are kept.
        setCurrentUser(getParsedUser() ?? freshUser);
      })
      .catch(() => {
        // cached user data will remain
      });

    return () => {
      promise.abort?.();
    };
  }, [dispatch]);

  return (
    <>
      <div className="w-full min-w-0 pb-6">
        <div className="sticky top-0 z-20 bg-white px-3 sm:px-5 pt-3 sm:pt-5 pb-3 sm:pb-4 border-b border-gray-100 min-w-0">
          <PageHeader
            title={locale.dashboard.title}
            sub_text={locale.dashboard.subText}
          />
          {classStatus === 'failed' && (
            <div
              data-testid="metrics-error"
              className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"
            >
              {classError ??
                'Failed to load dashboard metrics. Please try again.'}
            </div>
          )}
        </div>

        <div className="mx-3 sm:mx-5">
          <NotificationCenter />
        </div>

        <div className="mx-3 sm:mx-5 mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setAlertsOverviewOpen((open) => !open)}
            aria-expanded={alertsOverviewOpen}
            className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 min-h-[44px] text-left hover:bg-[#e9e9e9]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
          >
            <h2 className="text-sm sm:text-base font-semibold text-gray-800 m-0">
              {t('alertsActivity.title')}
            </h2>
            <ChevronDown
              size={20}
              className={`text-gray-500 shrink-0 transition-transform duration-200 ${
                alertsOverviewOpen ? '' : '-rotate-90'
              }`}
              aria-hidden="true"
            />
          </button>

          {alertsOverviewOpen && (
            <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <div className="h-full flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                  {t('alertsActivity.alertsLabel')}
                </h3>
                <ClassesNeedingAttentionCard
                  onFilter={(measure) =>
                    navigate(buildClassesAttentionPath(measure))
                  }
                />
              </div>

              <ActivityOverview
                onTileClick={(measure) =>
                  navigate(buildClassesAttentionPath(measure))
                }
              />
            </div>
          )}
        </div>

        {schools.length > 1 && (
          <div className="mx-3 sm:mx-5 mt-4">
            <YourSchoolsCard schools={schools} />
          </div>
        )}

        <div className="mx-3 sm:mx-5 mt-4">
          <MyProductsUsage
            products={products}
            seats={seats}
            onRequestSeats={() => setIsRequestSeatsOpen(true)}
          />
        </div>

        <SimulationsCompletedChart />
      </div>
      <RequestSeatsModal
        isOpen={isRequestSeatsOpen}
        onClose={() => setIsRequestSeatsOpen(false)}
        remainingSeats={seats.available}
        products={seatRequestProducts}
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
    </>
  );
}
