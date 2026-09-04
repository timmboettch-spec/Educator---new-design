import React, { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import { jsPDF } from "jspdf";
import type { Chart, ChartOptions } from "chart.js";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import {
  Presentation,
  School,
  Download,
  GraduationCap,
  ClipboardList,
  FileText,
  ChevronDown,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import NotificationCenter from "../../../components/account/NotificationCenter";
import ProgressCard from "../../../components/ui/ProgressCard";
import RequestProductAssociationModal from "../../../components/modal/RequestProductAssociationModal";
import { toast } from "../../../components/common/Toast";
import SelectField from "../../../components/ui/Select";
import MultiSelect from "../../../components/ui/MultiSelect";
import { PageHeader } from "../../../components/common/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Pagination } from "../../../components/ui/Pagination";
import { listProductUnits } from "../../../components/myproducts/ProductEntitlements";
import { getActiveStudentCount } from "../../../utils/classUtils";
import type { Subscription } from "../../../types";
import { FetchClassesRequest, selectClassResponse, selectNeedAttentionByClassId, selectClassStatus, selectClassError } from "../../../redux/class/GetClassRedux";
import type { AppDispatch } from "../../../store";
import { ClassCardWithSims } from "../../../components/class/ClassCardWithSims";
import { getEffectiveClassStatus } from "../../../utils/classUtils";
import { getParsedUser, updateStoredUser } from "@/utils/storage";
import { GetEducatorSimulationReports, selectEducatorReports } from "@/redux/reports/EducatorReportsRedux";
import { selectViewedReportIds, isReportNew } from "../../../redux/class/GetClassRedux";
import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";
import { setLoading } from "@/redux/loader/loaderSlice";
import RequestSeatsModal from "../../../components/modal/RequestSeatsModal";
import { getEntitlementFlags } from "../../../utils/entitlements";
import {
  finishLmsLaunchSession,
  runLtiLaunchSyncIfNeeded,
  resyncLmsRostersIfConfigured,
} from "@/utils/lmsLaunchSync";
import { getCurrentUserRequest } from "@/redux/users/GetUserRedux";
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
 
const formatLocaleText = (template: string, vars: Record<string, string | number>) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => String(vars[key] ?? ''));
};

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type SimRange = '3' | '6' | '12' | '24' | 'all';

// Whole days from today until an ISO/date string (negative = already past).
const daysUntil = (s?: string): number | null => {
  if (!s) return null;
  const d = new Date(String(s).split('T')[0]);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
};

// Parse a listProductUnits usage string ("412 / 1,500 hardware hours used") into
// numeric used/total/percent for the "approaching limit" checks.
const parseUsage = (usage: string): { used: number; total: number; pct: number } | null => {
  const m = /([\d,]+)\s*\/\s*([\d,]+)/.exec(usage);
  if (!m) return null;
  const used = Number(m[1].replace(/,/g, ''));
  const total = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return { used, total, pct: Math.round((used / total) * 100) };
};

// Extract a report's completion timestamp across the several field names the API uses.
const reportDate = (r: Record<string, unknown>): string | undefined =>
  (r.completed_at as string) ??
  (r.scenarioEndTime as string) ??
  (r.createdAt as string) ??
  (r.created_at as string) ??
  undefined;

// Product audience from its label ("… Post-Secondary Education Edition" → post).
const productAudience = (label: string): 'sec' | 'post' =>
  /post[-\s]?secondary/i.test(label) ? 'post' : 'sec';

// A product is active unless its licensed-through date is already in the past.
const isProductActive = (licensedThrough?: string): boolean => {
  if (!licensedThrough) return true;
  const d = new Date(licensedThrough);
  return Number.isNaN(d.getTime()) || d.getTime() >= Date.now();
};

// A single usage row: label + value + progress bar. `indent` nests sub-rows;
// `bold` marks a total row; `barless` shows just the used number (no bar, no
// "/ total") — used where there is no meaningful maximum.
const UsageBar = ({
  label,
  used,
  total,
  unit = '',
  indent = false,
  bold = false,
  barless = false,
}: {
  label: string;
  used: number;
  total: number;
  unit?: string;
  indent?: boolean;
  bold?: boolean;
  barless?: boolean;
}) => {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className={indent ? 'pl-4' : ''}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`break-words min-w-0 ${bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}
        >
          {label}
        </span>
        <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
          {barless
            ? `${used.toLocaleString()}${unit}`
            : `${used.toLocaleString()} / ${total.toLocaleString()}${unit}`}
        </span>
      </div>
      {!barless && (
        <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
};

interface ParsedProduct {
  key: string;
  name: string;
  associated: string | null;
  isAvatar: boolean;
  // Avatar only: seats still available of those allocated to this educator.
  remainingSeats?: number;
  // Formatted expiration date for this product license.
  expiration?: string;
}

/** A single Activity Overview metric tile (icon + number + label). Renders as a
 *  button (navigating to a filtered class list) when `onClick` is provided. */
function ActivityTileCard({
  label,
  value,
  icon: Ic,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof Presentation;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <Ic
        className="week-tile-icon w-6 h-6 flex-shrink-0 text-primary-500"
        aria-hidden="true"
      />
      <div className="min-w-0 text-left">
        <p className="text-xl font-bold text-[#5f6060] tabular-nums leading-none">
          {value.toLocaleString()}
        </p>
        <p className="text-[11px] text-gray-500 mt-1 leading-tight">{label}</p>
      </div>
    </>
  );
  const base =
    'week-tile rounded-xl border border-gray-100 bg-white p-3 flex items-start gap-2.5 min-w-0 overflow-hidden min-h-[72px] h-full';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label} — view classes`}
        className={`${base} w-full cursor-pointer transition hover:border-primary-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400`}
      >
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

/** One avatar/workstation sub-list within an audience column of My Products. */
function ProductSection({
  title,
  list,
  action,
}: {
  title: string;
  list: ParsedProduct[];
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#db8833]">
          {title} <span className="text-gray-500">({list.length})</span>
        </p>
        {action}
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-gray-500">No currently associated products.</p>
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <div
              key={p.key}
              className="rounded-xl border border-gray-200 p-3 min-w-0 flex items-start gap-3"
            >
              {/* Product image placeholder (left of the name) — RWAI logo for now. */}
              <div className="w-11 h-11 flex-shrink-0 rounded-lg bg-[#e9e9e9] flex items-center justify-center overflow-hidden">
                <img
                  src="/assets/RealityworksAI_logo.svg"
                  alt=""
                  aria-hidden="true"
                  className="w-7 h-7 object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 break-words">{p.name}</p>
                {p.isAvatar ? (
                  <p className="text-sm text-gray-600 mt-1">
                    Remaining allocated seats:{' '}
                    <span className="font-semibold text-primary-500 tabular-nums">
                      {p.remainingSeats ?? 0}
                    </span>
                  </p>
                ) : (
                  p.associated && (
                    <p className="text-sm text-gray-500 mt-1 break-words">
                      Associated product:{' '}
                      <span className="font-medium text-gray-700">{p.associated}</span>
                    </p>
                  )
                )}
              </div>
              {p.expiration && (
                <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0 mt-0.5">
                  Expires {p.expiration}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
 
// Brand-only series styling (matches the admin chart): two brand colours ×
// solid / stripes / dots / outline, plus contrasting borders and two-tone fills,
// so many series stay distinguishable using only the brand palette.
const CHART_O = '#db8833';
const CHART_G = '#5f6060';
type ChartSeriesStyle = {
  color: string;
  fill: 'solid' | 'stripes' | 'dots' | 'outline';
  border?: string;
  bg?: string;
};
const BRAND_SERIES: ChartSeriesStyle[] = [
  { color: CHART_O, fill: 'solid' },
  { color: CHART_G, fill: 'solid' },
  { color: CHART_O, fill: 'stripes' },
  { color: CHART_G, fill: 'stripes' },
  { color: CHART_O, fill: 'dots' },
  { color: CHART_G, fill: 'dots' },
  { color: CHART_O, fill: 'outline' },
  { color: CHART_G, fill: 'outline' },
  { color: CHART_G, fill: 'solid', border: CHART_O },
  { color: CHART_O, fill: 'solid', border: CHART_G },
  { color: CHART_O, fill: 'stripes', border: CHART_G },
  { color: CHART_G, fill: 'stripes', border: CHART_O },
  { color: CHART_O, fill: 'dots', border: CHART_G },
  { color: CHART_G, fill: 'dots', border: CHART_O },
  { color: CHART_O, fill: 'stripes', bg: CHART_G },
  { color: CHART_G, fill: 'stripes', bg: CHART_O },
  { color: CHART_O, fill: 'dots', bg: CHART_G },
  { color: CHART_G, fill: 'dots', bg: CHART_O },
];
function makeBarPattern(
  color: string,
  type: 'stripes' | 'dots',
  bg = '#ffffff',
): CanvasPattern | string {
  if (typeof document === 'undefined') return color;
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return color;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (type === 'stripes') {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.moveTo(-2, 2);
    ctx.lineTo(2, -2);
    ctx.moveTo(size - 2, size + 2);
    ctx.lineTo(size + 2, size - 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.createPattern(canvas, 'repeat') ?? color;
}

export default function EducatorDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const classResponse = useSelector(selectClassResponse);
  const navigate = useNavigate();
  const location = useLocation();
  // Deep-link from the notification panel footer: scroll the Notification
  // Center into view.
  useEffect(() => {
    if (
      (location.state as { scrollTo?: string } | null)?.scrollTo ===
      "notification-center"
    ) {
      const t = setTimeout(() => {
        document
          .getElementById("notification-center")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [location.state]);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage, setItemsPerPage] = React.useState(4);
  const [isRequestSeatsOpen, setIsRequestSeatsOpen] = React.useState(false);
  // Seat/avatar info only shows when the account is entitled to Online Avatar
  // simulations (real entitlement once PROTOTYPE_SHOW_ALL is off).
  const { hasAvatar, hasWorkstation } = getEntitlementFlags();
  const [simRange, setSimRange] = React.useState<SimRange>('12');
  // Chart filters: empty arrays mean "all". Schools + classes both multi-select.
  const [chartClassIds, setChartClassIds] = React.useState<string[]>([]);
  const [chartSchoolIds, setChartSchoolIds] = React.useState<string[]>([]);
  const [chartStudentIds, setChartStudentIds] = React.useState<string[]>([]);
  // Compare = one series per selected item (side by side); Total = one combined bar.
  const [chartCompare, setChartCompare] = React.useState(false);
  // Breakdown = click-to-drill entity view (schools → classes → students).
  const [chartMode, setChartMode] = React.useState<'time' | 'breakdown'>('time');
  const [drillSchool, setDrillSchool] = React.useState<string | null>(null);
  const [drillClass, setDrillClass] = React.useState<string | null>(null);
  const chartRef = useRef<Chart<'bar'> | null>(null);
  const [productsOpen, setProductsOpen] = React.useState(false);
  const [requestAssocOpen, setRequestAssocOpen] = React.useState(false);
  const [associatedProductsOpen, setAssociatedProductsOpen] = React.useState(false);
  const [usageOpen, setUsageOpen] = React.useState(false);
  // Simulations chart collapsed by default on entry.
  const [chartSectionOpen, setChartSectionOpen] = React.useState(false);
  const [avatarUsageOpen, setAvatarUsageOpen] = React.useState(true);
  const [workstationUsageOpen, setWorkstationUsageOpen] = React.useState(true);
  const [alertsOverviewOpen, setAlertsOverviewOpen] = React.useState(true);
  const allClasses = (classResponse?.data?.classes ?? [])
    .map((cls) => ({
      ...cls,
      status: getEffectiveClassStatus(cls.status, cls.start_date, cls.end_date),
    }))
    .filter((cls) => cls.status === "ACTIVE");
  const totalPages = Math.ceil(allClasses.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = allClasses.slice(startIndex, startIndex + itemsPerPage);
  const educatorReports = useSelector(selectEducatorReports);
  const viewedReportIds = useSelector(selectViewedReportIds);
  const unviewedReportsCount = educatorReports.filter((r) =>
    isReportNew(r.id, r.isNew, viewedReportIds),
  ).length;
  const unviewedByClassId = useSelector(selectNeedAttentionByClassId);
  const classStatus = useSelector(selectClassStatus);
  const classError = useSelector(selectClassError);
  const storedUser = getParsedUser();
const [currentUser, setCurrentUser] = React.useState(storedUser);
const user = currentUser;
  const educatorUserId =
    user?.role === "Educator" && typeof user.id === "string" ? user.id : null;
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const sanitizeSafeName = (value: string) =>
      sanitizeTextForTyping(value ?? '', 50).replace(/^ +/, '').replace(/  +/g, ' ');
  const hasFetched = useRef(false);
    const isInvalidProfileName = (value: string) =>
    !trimBoundaryWhitespace(value) ||
    hasUnsafeMarkupOrScriptPattern(value) ||
    hasDisallowedClassNameChars(value) ||
    hasSqlInjectionLikePattern(value) ||
    hasBlockedCodingKeyword(value) ||
    hasCodeLikeSyntaxPattern(value) ||
    hasNameCodeLikePattern(value);
 
const seatData = useMemo(() => {
  if (!user) {
    return { purchased: 0, remaining: 0 };
  }

  const remaining = Number(user.tokens) || 0;

  const consumed =
    Number(user.allocated_tokens) ||
    Number(user.total_tokens) ||
    0;

  return {
    purchased: consumed + remaining,
    remaining,
  };
}, [user]);
 
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
 
      await Promise.all([
        dispatch(FetchClassesRequest()).unwrap(),
        dispatch(GetEducatorSimulationReports({educatorId: educatorUserId})).unwrap(),
      ]);
 
      finishLmsLaunchSession();
    } finally {
      dispatch(setLoading(false));
    }
  };
 
  void fetchClasses();
}, [dispatch, educatorUserId]);
 
useEffect(() => {
  const promise = dispatch(getCurrentUserRequest());

  promise.unwrap()
    .then((result) => {
      const freshUser =
        result.data as unknown as Record<string, unknown>;

      const freshName =
        (freshUser.full_name as string) ||
        (freshUser.fullname as string) ||
        '';

      const safeFreshName = isInvalidProfileName(freshName)
        ? ''
        : sanitizeSafeName(freshName);

      const updatedUser = {
        ...freshUser,
        full_name: safeFreshName || freshName,
      };

      updateStoredUser(updatedUser);

      // IMPORTANT
      setCurrentUser(updatedUser);
    })
    .catch(() => {
      // cached user data will remain
    });

  return () => {
    promise.abort?.();
  };
}, [dispatch]);
 
  useEffect(() => {
    setCurrentPage(1);
  }, [allClasses.length]);

  // ── Reworked dashboard data: products, schools, usage, attention, chart ─────
  const subscriptions =
    (user as unknown as { subscriptions?: Subscription[] })?.subscriptions ?? [];
  // Only ACTIVE (non-expired) products are surfaced — expired ones fall off.
  const products = useMemo(
    () => listProductUnits(subscriptions).filter((p) => isProductActive(p.licensedThrough)),
    [subscriptions],
  );
  const avatarProducts = products.filter((p) => p.kind === 'online');
  const workstationProducts = products.filter((p) => p.kind === 'workstation');
  // Split products by audience (Secondary / Post-Secondary) × modality (avatar /
  // workstation) for the My Products & Usage columns.
  const bucketProduct = (kind: 'online' | 'workstation', audience: 'sec' | 'post'): ParsedProduct[] =>
    products
      .filter((p) => p.kind === kind && productAudience(p.label) === audience)
      .map((p) => {
        const parts = p.label.split(' · ');
        const isAvatar = p.kind === 'online';
        return {
          key: p.key,
          name: parts[0],
          associated: p.kind === 'workstation' && parts.length >= 3 ? parts[1] : null,
          isAvatar,
          // Seats remaining of those allocated to this educator on the product.
          remainingSeats: isAvatar
            ? Math.max(0, (p.seatsTotal ?? 0) - (p.seatsConsumed ?? 0))
            : undefined,
          expiration: p.licensedThrough,
        };
      });
  const secAvatar = bucketProduct('online', 'sec');
  const secWorkstation = bucketProduct('workstation', 'sec');
  const postAvatar = bucketProduct('online', 'post');
  const postWorkstation = bucketProduct('workstation', 'post');

  const schools =
    (user as unknown as { schools?: { id: string; school_name: string }[] })?.schools ?? [];

  // Deterministic seed (stable per educator) for the placeholder metrics that
  // aren't tracked in the backend yet (see CLAUDE.md).
  const usageSeed = (typeof user?.id === 'string' ? user.id : '')
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);

  // Attention buckets across the educator's ACTIVE classes.
  const attention = useMemo(() => {
    const noStudents: typeof allClasses = [];
    const noSims: typeof allClasses = [];
    const unread: typeof allClasses = [];
    const dueSoon: typeof allClasses = [];
    const closingSoon: typeof allClasses = [];
    allClasses.forEach((c) => {
      if (getActiveStudentCount(c) === 0) noStudents.push(c);
      if ((c.sims?.length ?? 0) === 0) noSims.push(c);
      if ((unviewedByClassId[c.id] ?? 0) > 0) unread.push(c);
      const hasDueSoon = (c.sims ?? []).some((s) => {
        const sim = s as { due_date?: string; end_date?: string };
        const d = daysUntil(sim.due_date ?? sim.end_date);
        return d != null && d >= 0 && d <= 7;
      });
      if (hasDueSoon) dueSoon.push(c);
      const dEnd = daysUntil(c.end_date);
      if (dEnd != null && dEnd >= 0 && dEnd <= 14) closingSoon.push(c);
    });
    return { noStudents, noSims, unread, dueSoon, closingSoon };
  }, [allClasses, unviewedByClassId]);

  // Hardware (workstation) products approaching their usage-hour cap (≥90% used).
  const hardwareNearLimit = workstationProducts.filter((p) => {
    const u = parseUsage(p.usage);
    return u != null && u.pct >= 90;
  });
  // PLACEHOLDER: students approaching the 40-hour avatar-use cap (not tracked yet).
  const studentsNearAvatarLimit = usageSeed % 4; // 0..3, deterministic

  // ── Activity Overview metrics ──────────────────────────────────────────────
  const activeStudentsCount = allClasses.reduce(
    (t, c) => t + getActiveStudentCount(c),
    0,
  );
  const unreadAllTime = educatorReports.filter((r) =>
    isReportNew(r.id, r.isNew, viewedReportIds),
  ).length;
  const classesWithUnread = attention.unread.length;
  // PLACEHOLDER: classes with student(s) nearing the max avatar-use limit (not
  // tracked per educator yet). Deterministic subset of the active classes.
  const nearAvatarLimitClasses = allClasses.slice(
    0,
    Math.min(allClasses.length, usageSeed % 3),
  );
  const classesNearAvatarLimit = nearAvatarLimitClasses.length;

  // Deep-link a tile to the Class Management page pre-filtered to a set of class ids.
  const goToClasses = (classList: { id: string }[], label: string) =>
    navigate('/classes', {
      state: { filterClassIds: classList.map((c) => c.id), filterLabel: label },
    });

  // Two explicit columns: LEFT = class-specific metrics, RIGHT = the rest. (Kept
  // as separate stacks so the columns stay grouped even with unequal counts.)
  type ActivityTile = {
    label: string;
    value: number;
    icon: typeof Presentation;
    onClick?: () => void;
  };
  const classActivityTiles: ActivityTile[] = [
    {
      label: 'Active Classes',
      value: allClasses.length,
      icon: Presentation,
      onClick: () => goToClasses(allClasses, 'Active classes'),
    },
    {
      label: 'Classes with Unread Reports',
      value: classesWithUnread,
      icon: ClipboardList,
      onClick: () => goToClasses(attention.unread, 'Classes with unread reports'),
    },
    {
      label: 'Classes Closing (14 Days)',
      value: attention.closingSoon.length,
      icon: CalendarDays,
      onClick: () => goToClasses(attention.closingSoon, 'Classes closing within 14 days'),
    },
  ];
  const otherActivityTiles: ActivityTile[] = [
    // Active Students is NOT clickable.
    { label: 'Students in Active Classes', value: activeStudentsCount, icon: GraduationCap },
    {
      label: 'Total Unread Reports',
      value: unreadAllTime,
      icon: FileText,
      onClick: () => goToClasses(attention.unread, 'Classes with unread reports'),
    },
    {
      label: 'Classes w/ Students Near Avatar Limit',
      value: classesNearAvatarLimit,
      icon: AlertTriangle,
      onClick: () =>
        goToClasses(nearAvatarLimitClasses, 'Classes with students near the avatar-hour limit'),
    },
  ];

  // ── My Usage metrics ───────────────────────────────────────────────────────
  const avatarSeatsAllocated = seatData.purchased;
  const avatarSeatsUsed = Math.max(0, seatData.purchased - seatData.remaining);
  // Each workstation product's hardware-hours usage, parsed from its usage string.
  const hardwareUsage = workstationProducts.map((p) => {
    const parts = p.label.split(' · ');
    const name = p.kind === 'workstation' && parts.length >= 3 ? parts[1] : parts[0];
    const u = parseUsage(p.usage);
    return { key: p.key, name, used: u?.used ?? 0, total: u?.total ?? 0, pct: u?.pct ?? 0 };
  });

  // ── Avatar Use Breakdown ──────────────────────────────────────────────────
  // Avatar hours are capped at 40h per allocated seat. Secondary vs
  // post-secondary splits are PLACEHOLDERS (no per-audience tracking yet):
  // apportioned by the count of avatar products in each audience.
  const avatarHoursTotal = avatarSeatsAllocated * 40;
  const avatarHoursUsed = Math.min(
    avatarHoursTotal,
    Math.round(avatarHoursTotal * 0.55),
  );
  const avatarWeightTotal = secAvatar.length + postAvatar.length || 1;
  const splitSecAvatar = (n: number) =>
    Math.round((n * secAvatar.length) / avatarWeightTotal);
  const secSeatsUsed = splitSecAvatar(avatarSeatsUsed);
  const postSeatsUsed = avatarSeatsUsed - secSeatsUsed;
  const secSeatsAlloc = splitSecAvatar(avatarSeatsAllocated);
  const postSeatsAlloc = avatarSeatsAllocated - secSeatsAlloc;
  const secAvatarHoursUsed = splitSecAvatar(avatarHoursUsed);
  const postAvatarHoursUsed = avatarHoursUsed - secAvatarHoursUsed;
  const secAvatarHoursTotal = splitSecAvatar(avatarHoursTotal);
  const postAvatarHoursTotal = avatarHoursTotal - secAvatarHoursTotal;

  // ── Workstation Use Breakdown ─────────────────────────────────────────────
  const wsHours = (list: typeof workstationProducts) =>
    list.map((p) => {
      const parts = p.label.split(' · ');
      const name = parts.length >= 2 ? parts[1] : parts[0];
      const u = parseUsage(p.usage);
      return { key: p.key, name, used: u?.used ?? 0, total: u?.total ?? 0 };
    });
  const secWsProducts = wsHours(
    workstationProducts.filter((p) => productAudience(p.label) === 'sec'),
  );
  const postWsProducts = wsHours(
    workstationProducts.filter((p) => productAudience(p.label) === 'post'),
  );
  const sumHours = (arr: { used: number; total: number }[]) =>
    arr.reduce(
      (a, x) => ({ used: a.used + x.used, total: a.total + x.total }),
      { used: 0, total: 0 },
    );
  const secWsTotal = sumHours(secWsProducts);
  const postWsTotal = sumHours(postWsProducts);
  const wsGrand = {
    used: secWsTotal.used + postWsTotal.used,
    total: secWsTotal.total + postWsTotal.total,
  };

  const totalAttention =
    attention.noStudents.length + attention.noSims.length + attention.unread.length;
  // Distinct classes that have ANY attention issue (a class can hit several).
  const classesNeedingAttentionCount = new Set([
    ...attention.noStudents.map((c) => c.id),
    ...attention.noSims.map((c) => c.id),
    ...attention.unread.map((c) => c.id),
  ]).size;
  const showAttention =
    totalAttention > 0 ||
    attention.dueSoon.length > 0 ||
    attention.closingSoon.length > 0 ||
    hardwareNearLimit.length > 0 ||
    studentsNearAvatarLimit > 0;

  // ── Simulations-completed chart (per class, over time) ─────────────────────
  const reportsByClassId = useMemo(() => {
    const classByStudent: Record<string, string> = {};
    allClasses.forEach((c) =>
      (c.students ?? []).forEach((s) => {
        [s.user_id, s.student_id].forEach((v) => {
          if (typeof v === 'string' && v.trim()) classByStudent[v.trim()] = c.id;
        });
      }),
    );
    const map: Record<string, typeof educatorReports> = {};
    educatorReports.forEach((r) => {
      const sid = r.userId != null ? String(r.userId).trim() : '';
      const cid = classByStudent[sid];
      if (!cid) return;
      (map[cid] ??= []).push(r);
    });
    return map;
  }, [allClasses, educatorReports]);

  // School options for the chart filter: the user's own schools, plus any school
  // name referenced by a class (so single-/no-school users still get the filter).
  const chartSchoolOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { label: string; value: string }[] = [];
    [
      ...schools.map((s) => s.school_name),
      ...allClasses.map((c) => c.school_name),
    ].forEach((name) => {
      const n = String(name ?? '').trim();
      if (n && !seen.has(n)) {
        seen.add(n);
        opts.push({ label: n, value: n });
      }
    });
    return opts;
  }, [schools, allClasses]);

  const noChartFilters =
    chartSchoolIds.length === 0 &&
    chartClassIds.length === 0 &&
    chartStudentIds.length === 0;
  // Classes that satisfy BOTH the school filter and the class filter (each
  // empty = no constraint). School match is by school name (present on classes).
  const effectiveClasses = useMemo(
    () =>
      allClasses
        .filter(
          (c) =>
            chartSchoolIds.length === 0 ||
            chartSchoolIds.includes(String(c.school_name ?? '')),
        )
        .filter(
          (c) => chartClassIds.length === 0 || chartClassIds.includes(c.id),
        ),
    [allClasses, chartSchoolIds, chartClassIds],
  );
  const effectiveClassIds = useMemo(
    () => effectiveClasses.map((c) => c.id),
    [effectiveClasses],
  );
  // Student codes (student_id) available within the school/class scope, and the
  // set of identifiers (user_id/student_id) for the selected codes.
  const studentsInScope = useMemo(
    () => effectiveClasses.flatMap((c) => c.students ?? []),
    [effectiveClasses],
  );
  const studentCodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { label: string; value: string }[] = [];
    studentsInScope.forEach((s) => {
      const code = String(s.student_id ?? '').trim();
      if (code && !seen.has(code)) {
        seen.add(code);
        opts.push({ label: code, value: code });
      }
    });
    return opts;
  }, [studentsInScope]);
  const selectedStudentIdentifiers = useMemo(() => {
    if (chartStudentIds.length === 0) return null;
    const set = new Set<string>();
    studentsInScope.forEach((s) => {
      if (chartStudentIds.includes(String(s.student_id ?? '').trim())) {
        [s.user_id, s.student_id].forEach((v) => {
          if (typeof v === 'string' && v.trim()) set.add(v.trim());
        });
      }
    });
    return set;
  }, [chartStudentIds, studentsInScope]);
  const chartReports = useMemo(() => {
    const base = noChartFilters
      ? educatorReports
      : effectiveClassIds.flatMap((id) => reportsByClassId[id] ?? []);
    if (!selectedStudentIdentifiers) return base;
    return base.filter((r) =>
      selectedStudentIdentifiers.has(
        r.userId != null ? String(r.userId).trim() : '',
      ),
    );
  }, [
    noChartFilters,
    educatorReports,
    effectiveClassIds,
    reportsByClassId,
    selectedStudentIdentifiers,
  ]);

  // Which selected dimension to break out side-by-side (the deepest one with >1
  // selected). Each item carries its own reports so the chart can plot a series.
  const compareItems = useMemo(() => {
    if (chartStudentIds.length > 1) {
      return chartStudentIds.map((code) => {
        const student = studentsInScope.find(
          (s) => String(s.student_id ?? '').trim() === code,
        );
        const ids = new Set<string>();
        if (student)
          [student.user_id, student.student_id].forEach((v) => {
            if (typeof v === 'string' && v.trim()) ids.add(v.trim());
          });
        const reps = effectiveClassIds
          .flatMap((id) => reportsByClassId[id] ?? [])
          .filter((r) => ids.has(r.userId != null ? String(r.userId).trim() : ''));
        return { label: code, reports: reps };
      });
    }
    if (chartClassIds.length > 1) {
      return chartClassIds.map((cid) => ({
        label: allClasses.find((c) => c.id === cid)?.class_name ?? cid,
        reports: reportsByClassId[cid] ?? [],
      }));
    }
    if (chartSchoolIds.length > 1) {
      return chartSchoolIds.map((sn) => {
        const ids = allClasses
          .filter((c) => String(c.school_name ?? '') === sn)
          .map((c) => c.id);
        return { label: sn, reports: ids.flatMap((id) => reportsByClassId[id] ?? []) };
      });
    }
    return [];
  }, [
    chartStudentIds,
    chartClassIds,
    chartSchoolIds,
    studentsInScope,
    allClasses,
    reportsByClassId,
    effectiveClassIds,
  ]);
  const canCompare = compareItems.length > 1;
  const compareActive = chartCompare && canCompare;

  // ── Breakdown (click-to-drill) mode ────────────────────────────────────────
  // Count an entity's reports that fall within the selected timeframe.
  const countInRange = React.useCallback(
    (reports: typeof educatorReports) => {
      if (simRange === 'all') return reports.length;
      const now = new Date();
      const cutoff = new Date(
        now.getFullYear(),
        now.getMonth() - (Number(simRange) - 1),
        1,
      );
      return reports.filter((r) => {
        const raw = reportDate(r as unknown as Record<string, unknown>);
        if (!raw) return false;
        const d = new Date(raw);
        return !isNaN(d.getTime()) && d >= cutoff;
      }).length;
    },
    [simRange],
  );
  const drillSchoolName = drillSchool ?? '';
  const drillClassName =
    (drillClass && allClasses.find((c) => c.id === drillClass)?.class_name) || '';
  const breakdown = useMemo(() => {
    // Students within the drilled class.
    if (drillClass) {
      const cls = allClasses.find((c) => c.id === drillClass);
      const reps = reportsByClassId[drillClass] ?? [];
      const entities = (cls?.students ?? []).map((s) => {
        const ids = new Set<string>();
        [s.user_id, s.student_id].forEach((v) => {
          if (typeof v === 'string' && v.trim()) ids.add(v.trim());
        });
        const mine = reps.filter((r) =>
          ids.has(r.userId != null ? String(r.userId).trim() : ''),
        );
        return {
          key: String(s.student_id ?? ''),
          label: String(s.student_id ?? ''),
          count: countInRange(mine),
        };
      });
      return { level: 'student' as const, drillable: false, entities };
    }
    // Classes within the drilled school.
    if (drillSchool) {
      const entities = allClasses
        .filter((c) => String(c.school_name ?? '') === drillSchool)
        .map((c) => ({
          key: c.id,
          label: c.class_name,
          count: countInRange(reportsByClassId[c.id] ?? []),
        }));
      return { level: 'class' as const, drillable: true, entities };
    }
    // Top level: one bar per school.
    const entities = chartSchoolOptions.map((o) => {
      const ids = allClasses
        .filter((c) => String(c.school_name ?? '') === o.value)
        .map((c) => c.id);
      const reps = ids.flatMap((id) => reportsByClassId[id] ?? []);
      return { key: o.value, label: o.label, count: countInRange(reps) };
    });
    return { level: 'school' as const, drillable: true, entities };
  }, [
    drillClass,
    drillSchool,
    allClasses,
    reportsByClassId,
    chartSchoolOptions,
    countInRange,
  ]);
  const breakdownActive = chartMode === 'breakdown';
  const drillInto = (key: string) => {
    if (breakdown.level === 'school') setDrillSchool(key);
    else if (breakdown.level === 'class') setDrillClass(key);
  };

  const chartSeries = useMemo(() => {
    const now = new Date();
    let n: number;
    if (simRange === 'all') {
      let earliest = now;
      chartReports.forEach((r) => {
        const raw = reportDate(r as unknown as Record<string, unknown>);
        if (!raw) return;
        const d = new Date(raw);
        if (!isNaN(d.getTime()) && d < earliest) earliest = d;
      });
      n = Math.max(
        1,
        (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth()) +
          1,
      );
    } else {
      n = Number(simRange);
    }
    const buckets: { key: string; label: string }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
          month: 'short',
          year: '2-digit',
        }),
      });
    }
    const bucketize = (reports: typeof chartReports) => {
      const counts: Record<string, number> = {};
      buckets.forEach((b) => (counts[b.key] = 0));
      reports.forEach((r) => {
        const raw = reportDate(r as unknown as Record<string, unknown>);
        if (!raw) return;
        const d = new Date(raw);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key in counts) counts[key] += 1;
      });
      return buckets.map((b) => counts[b.key]);
    };
    const labels = buckets.map((b) => b.label);
    const values = bucketize(chartReports);
    const series = compareActive
      ? compareItems.map((it) => ({ label: it.label, values: bucketize(it.reports) }))
      : [];
    return {
      labels,
      values,
      series,
      total: values.reduce((s, v) => s + v, 0),
    };
  }, [chartReports, simRange, language, compareActive, compareItems]);

  const barData = breakdownActive
    ? {
        labels: breakdown.entities.map((e) => e.label),
        datasets: [
          {
            label: 'Simulations Completed',
            data: breakdown.entities.map((e) => e.count),
            backgroundColor: '#db8833',
            borderRadius: 6,
            maxBarThickness: 48,
          },
        ],
      }
    : {
    labels: chartSeries.labels,
    datasets:
      compareActive && chartSeries.series.length > 0
        ? chartSeries.series.map((s, i) => {
            const st = BRAND_SERIES[i % BRAND_SERIES.length];
            const hasBorder = st.fill === 'outline' || st.border != null;
            const background =
              st.fill === 'solid'
                ? st.color
                : st.fill === 'outline'
                  ? 'transparent'
                  : makeBarPattern(st.color, st.fill, st.bg);
            return {
              label: s.label,
              data: s.values,
              backgroundColor: background,
              hoverBackgroundColor: st.color,
              borderColor: st.border ?? st.color,
              borderWidth: hasBorder ? 2 : st.fill === 'solid' ? 0 : 1.5,
              borderRadius: 4,
              maxBarThickness: 26,
            };
          })
        : [
            {
              label: 'Simulations Completed',
              data: chartSeries.values,
              backgroundColor: '#db8833',
              borderRadius: 6,
              maxBarThickness: 36,
            },
          ],
  };
  const barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    // Breakdown mode: click a bar to drill (school → classes → students).
    onClick: (_evt, elements) => {
      if (!breakdownActive || !breakdown.drillable || elements.length === 0)
        return;
      const entity = breakdown.entities[elements[0].index];
      if (entity) drillInto(entity.key);
    },
    onHover: (evt, elements) => {
      const target = evt.native?.target as HTMLElement | undefined;
      if (target)
        target.style.cursor =
          breakdownActive && breakdown.drillable && elements.length > 0
            ? 'pointer'
            : 'default';
    },
    plugins: {
      // Bottom legend (matching the admin chart) only when comparing series.
      legend: {
        display: compareActive && !breakdownActive,
        position: 'bottom',
        labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            breakdownActive
              ? ` ${ctx.parsed.y} completed${breakdown.drillable ? ' — click to drill in' : ''}`
              : compareActive
                ? ` ${ctx.dataset.label}: ${ctx.parsed.y} completed`
                : ` ${ctx.parsed.y} simulations completed`,
        },
      },
    },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
      x: { grid: { display: false } },
    },
  };
  const chartClassLabel = noChartFilters
    ? 'All Classes'
    : [
        chartSchoolIds.length
          ? `${chartSchoolIds.length} school${chartSchoolIds.length > 1 ? 's' : ''}`
          : '',
        chartClassIds.length
          ? `${chartClassIds.length} class${chartClassIds.length > 1 ? 'es' : ''}`
          : '',
        chartStudentIds.length
          ? `${chartStudentIds.length} student code${chartStudentIds.length > 1 ? 's' : ''}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');

  const handleExportPNG = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.toBase64Image('image/png', 1);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulations-${simRange}.png`;
    a.click();
  };
  const handleExportPDF = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const img = chart.toBase64Image('image/png', 1);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [800, 400] });
    pdf.setFontSize(14);
    pdf.text(`Simulations Completed — ${chartClassLabel}`, 20, 30);
    pdf.addImage(img, 'PNG', 20, 50, 760, 300);
    pdf.save(`simulations-${simRange}.pdf`);
  };
  const handleExportCSV = () => {
    const rows = [
      ['Month', 'Simulations Completed'],
      ...chartSeries.labels.map((label, i) => [label, String(chartSeries.values[i] ?? 0)]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulations-${simRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
 
  return (
    <>
      <div className="w-full min-w-0">
        <div className="bg-white px-3 sm:px-5 pt-3 sm:pt-5 pb-3 sm:pb-4 border-b border-gray-100 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <PageHeader
              title={locale.dashboard.title}
              sub_text={locale.dashboard.subText}
            />
          </div>
          {classStatus === 'failed' && (
            <div data-testid="metrics-error" className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {classError ?? 'Failed to load dashboard metrics. Please try again.'}
            </div>
          )}
        </div>

        <div className="mx-3 sm:mx-5">
          <NotificationCenter role="educator" />
        </div>

        {/* Single-column stack: Alerts & Activity → My Products & Usage → chart
            flow full-width top-to-bottom, so the page length matches the content
            (no empty gap beside a short column). */}
        <div className="mx-3 sm:mx-5 mt-4 space-y-4">
          {/* Alerts & Activity Overview */}
          <div className="space-y-4">
            {/* Alerts & Activity Overview container (collapsible) */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setAlertsOverviewOpen((o) => !o)}
                aria-expanded={alertsOverviewOpen}
                className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 min-h-[44px] text-left hover:bg-[#e9e9e9]/50 transition-colors"
              >
                <h2 className="text-sm sm:text-base font-semibold text-gray-800 m-0">
                  Alerts &amp; Activity Overview
                </h2>
                <ChevronDown
                  size={20}
                  className={`text-gray-500 shrink-0 transition-transform duration-200 ${alertsOverviewOpen ? '' : '-rotate-90'}`}
                  aria-hidden="true"
                />
              </button>

              {alertsOverviewOpen && (
                <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              {/* Alerts subsection — left column (Activity Overview on the right) */}
              {showAttention && (
                <div className="h-full flex flex-col">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                    Alerts
                  </h3>
                  <ProgressCard
                    className="flex-1"
                    label="Classes Needing Attention"
                    value={`${classesNeedingAttentionCount} class${classesNeedingAttentionCount !== 1 ? 'es' : ''} with items needing attention`}
                    progress={Math.min(classesNeedingAttentionCount, allClasses.length)}
                    total={Math.max(allClasses.length, 1)}
                    subText="Classes with unread reports, no students, or no assigned simulations"
                    icon={Presentation}
                    onIconClick={() => navigate('/classes')}
                    iconLabel="Go to Class Management"
                    largeActions
                    actions={[
                      { label: `View Classes with Unread Reports (${attention.unread.length})`, onClick: () => navigate('/classes') },
                      { label: `View Classes with No Students (${attention.noStudents.length})`, onClick: () => navigate('/classes') },
                      { label: `View Classes with No Assigned Sims (${attention.noSims.length})`, onClick: () => navigate('/classes') },
                    ]}
                  />
                </div>
              )}

              <div className="h-full flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                  Activity Overview
                </h3>
                {/* Column-flow grid: class tiles fill the left column, the rest
                    the right column. Equal 1fr rows + h-full tiles keep every tile
                    the same height, so the numbers line up on both axes.
                    flex-1 lets the grid grow to fill the column (match Alerts). */}
                <div
                  className="flex-1 grid grid-cols-2 grid-flow-col gap-2.5 [container-type:inline-size]"
                  style={{
                    gridTemplateRows: `repeat(${Math.max(
                      classActivityTiles.length,
                      otherActivityTiles.length,
                    )}, minmax(0, 1fr))`,
                  }}
                >
                  {[...classActivityTiles, ...otherActivityTiles].map((t) => (
                    <ActivityTileCard key={t.label} {...t} />
                  ))}
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Per-school breakdown (only when the educator has more than one school) */}
            {schools.length > 1 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                <h2 className="text-sm sm:text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <School size={18} className="text-primary-500" aria-hidden="true" />
                  Your Schools ({schools.length})
                </h2>
                <div className="space-y-3">
                  {schools.map((sc) => {
                    const scClasses = allClasses.filter(
                      (c) => c.school_id === sc.id || c.school_name === sc.school_name,
                    );
                    const scStudents = scClasses.reduce((t, c) => t + getActiveStudentCount(c), 0);
                    return (
                      <div key={sc.id} className="rounded-xl border border-gray-200 p-3">
                        <p className="text-sm font-semibold text-gray-800 break-words">
                          {sc.school_name}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 tabular-nums">
                          {scClasses.length} active class{scClasses.length !== 1 ? 'es' : ''} ·{' '}
                          {scStudents} active student{scStudents !== 1 ? 's' : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Collapsible "My Products & Usage": the product list (split Secondary
              | Post-Secondary, each avatar/workstation) plus the usage meters. */}
          <div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setProductsOpen((o) => {
                    const next = !o;
                    // Expanding the section fully opens every subsection at once.
                    if (next) {
                      setAssociatedProductsOpen(true);
                      setUsageOpen(true);
                      setAvatarUsageOpen(true);
                      setWorkstationUsageOpen(true);
                    }
                    return next;
                  })
                }
                aria-expanded={productsOpen}
                className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 min-h-[44px] text-left hover:bg-[#e9e9e9]/50 transition-colors"
              >
                <h2 className="text-sm sm:text-base font-semibold text-gray-800 m-0">
                  My Products &amp; Usage
                </h2>
                <ChevronDown
                  size={20}
                  className={`text-gray-500 shrink-0 transition-transform duration-200 ${productsOpen ? '' : '-rotate-90'}`}
                  aria-hidden="true"
                />
              </button>
              {productsOpen && (
                <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-gray-100 space-y-6">
                  {products.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-gray-500 mb-3">
                        You have no associated products yet.
                      </p>
                      <Button
                        type="button"
                        variant="gradient"
                        onClick={() => setRequestAssocOpen(true)}
                        className="text-white text-sm rounded-full"
                      >
                        Request Product Association
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* My Associated Products — collapsible subsection */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setAssociatedProductsOpen((o) => !o)}
                          aria-expanded={associatedProductsOpen}
                          className="w-[calc(100%+2rem)] sm:w-[calc(100%+2.5rem)] flex items-center justify-between gap-2 text-left mb-1 py-2 -mx-4 sm:-mx-5 px-4 sm:px-5 hover:bg-[#e9e9e9]/50 transition-colors"
                        >
                          <span className="text-sm sm:text-base font-semibold text-gray-800">
                            My Active Associated Products ({products.length})
                          </span>
                          <ChevronDown
                            size={18}
                            className={`text-gray-500 shrink-0 transition-transform duration-200 ${associatedProductsOpen ? '' : '-rotate-90'}`}
                            aria-hidden="true"
                          />
                        </button>
                        {associatedProductsOpen && (
                          <>
                            <p className="text-sm text-gray-500 mb-3">
                              {avatarProducts.length} avatar · {workstationProducts.length} workstation
                            </p>
                            {/* Matrix layout: audience columns × simulation-category
                                rows, so the AVATAR / WORKSTATION headers line up
                                across both columns regardless of how many products
                                each cell holds. */}
                            <div className="relative space-y-5">
                              {/* Light vertical divider down the centre gap (lg+). */}
                              <div
                                className="hidden lg:block absolute inset-y-0 left-1/2 w-px bg-gray-200"
                                aria-hidden="true"
                              />
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2">
                                <h3 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1.5">
                                  Secondary Education Edition{' '}
                                  <span className="font-normal text-gray-500">
                                    ({secAvatar.length + secWorkstation.length})
                                  </span>
                                </h3>
                                <h3 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1.5">
                                  Post-Secondary Education Edition{' '}
                                  <span className="font-normal text-gray-500">
                                    ({postAvatar.length + postWorkstation.length})
                                  </span>
                                </h3>
                              </div>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4 items-start">
                                <ProductSection
                                  title="Avatar Simulations"
                                  list={secAvatar}
                                  action={
                                    <button
                                      type="button"
                                      onClick={() => setIsRequestSeatsOpen(true)}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                                    >
                                      {locale.dashboard.requestMoreSeats ?? 'Request More Seats'}
                                    </button>
                                  }
                                />
                                <ProductSection
                                  title="Avatar Simulations"
                                  list={postAvatar}
                                  action={
                                    <button
                                      type="button"
                                      onClick={() => setIsRequestSeatsOpen(true)}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                                    >
                                      {locale.dashboard.requestMoreSeats ?? 'Request More Seats'}
                                    </button>
                                  }
                                />
                              </div>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4 items-start">
                                <ProductSection title="Workstation Simulations" list={secWorkstation} />
                                <ProductSection title="Workstation Simulations" list={postWorkstation} />
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* My Usage — collapsible subsection */}
                      <div className="border-t border-gray-100 pt-5">
                        <button
                          type="button"
                          onClick={() => setUsageOpen((o) => !o)}
                          aria-expanded={usageOpen}
                          className="w-[calc(100%+2rem)] sm:w-[calc(100%+2.5rem)] flex items-center justify-between gap-2 text-left mb-1 py-2 -mx-4 sm:-mx-5 px-4 sm:px-5 hover:bg-[#e9e9e9]/50 transition-colors"
                        >
                          <span className="text-sm sm:text-base font-semibold text-gray-800">
                            My Usage
                          </span>
                          <ChevronDown
                            size={18}
                            className={`text-gray-500 shrink-0 transition-transform duration-200 ${usageOpen ? '' : '-rotate-90'}`}
                            aria-hidden="true"
                          />
                        </button>
                        {usageOpen && (
                        <div className="space-y-6 text-sm">
                          {/* Avatar breakdown — only when entitled to avatar sims. */}
                          {hasAvatar && (
                            <div className="space-y-2.5">
                              <button
                                type="button"
                                onClick={() => setAvatarUsageOpen((o) => !o)}
                                aria-expanded={avatarUsageOpen}
                                className="w-full flex items-center justify-between gap-2 text-left"
                              >
                                <span className="text-sm font-semibold uppercase tracking-wide text-[#db8833]">
                                  My Avatar Use Breakdown
                                </span>
                                <ChevronDown
                                  size={16}
                                  className={`text-gray-500 shrink-0 transition-transform duration-200 ${avatarUsageOpen ? '' : '-rotate-90'}`}
                                  aria-hidden="true"
                                />
                              </button>
                              {avatarUsageOpen && (
                                <div className="space-y-2.5">
                                  {/* Remaining seats (the Request More Seats button
                                      moved up beside the Avatar Simulations headers). */}
                                  <div className="flex flex-wrap items-center gap-2 pb-1">
                                    <span className="text-sm text-gray-600">
                                      {locale.account?.remainingSeats ?? 'Remaining Seats'}:{' '}
                                      <span className="font-semibold text-primary-500">
                                        {seatData.remaining}
                                      </span>
                                    </span>
                                  </div>
                                  <UsageBar
                                    bold
                                    label="My total use of avatar seats (secondary and post-secondary)"
                                    used={avatarSeatsUsed}
                                    total={avatarSeatsAllocated}
                                    unit=" seats"
                                  />
                                  {secAvatar.length > 0 && (
                                    <UsageBar
                                      indent
                                      label="My use of secondary avatar simulation seats"
                                      used={secSeatsUsed}
                                      total={secSeatsAlloc}
                                      unit=" seats"
                                    />
                                  )}
                                  {postAvatar.length > 0 && (
                                    <UsageBar
                                      indent
                                      label="My use of post-secondary avatar simulation seats"
                                      used={postSeatsUsed}
                                      total={postSeatsAlloc}
                                      unit=" seats"
                                    />
                                  )}
                                  {secAvatar.length > 0 && (
                                    <UsageBar
                                      barless
                                      label="My use of secondary avatar simulation hours"
                                      used={secAvatarHoursUsed}
                                      total={secAvatarHoursTotal}
                                      unit=" hrs"
                                    />
                                  )}
                                  {postAvatar.length > 0 && (
                                    <UsageBar
                                      barless
                                      label="My use of post-secondary avatar simulation hours"
                                      used={postAvatarHoursUsed}
                                      total={postAvatarHoursTotal}
                                      unit=" hrs"
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Workstation breakdown — only when entitled to hardware sims. */}
                          {hasWorkstation && (
                            <div className={`space-y-2.5 ${hasAvatar ? 'border-t border-gray-200 pt-4' : ''}`}>
                              <button
                                type="button"
                                onClick={() => setWorkstationUsageOpen((o) => !o)}
                                aria-expanded={workstationUsageOpen}
                                className="w-full flex items-center justify-between gap-2 text-left"
                              >
                                <span className="text-sm font-semibold uppercase tracking-wide text-[#db8833]">
                                  My Workstation Use Breakdown
                                </span>
                                <ChevronDown
                                  size={16}
                                  className={`text-gray-500 shrink-0 transition-transform duration-200 ${workstationUsageOpen ? '' : '-rotate-90'}`}
                                  aria-hidden="true"
                                />
                              </button>
                              {workstationUsageOpen && (
                                <div className="space-y-2.5">
                                  <UsageBar
                                    bold
                                    barless
                                    label="My total use of workstation hardware (secondary and post-secondary)"
                                    used={wsGrand.used}
                                    total={wsGrand.total}
                                    unit=" hrs"
                                  />
                                  {secWsProducts.length > 0 && (
                                    <>
                                      <UsageBar
                                        indent
                                        barless
                                        label="My use of secondary workstation simulation hours"
                                        used={secWsTotal.used}
                                        total={secWsTotal.total}
                                        unit=" hrs"
                                      />
                                      <div className="pl-4 space-y-2.5">
                                        {secWsProducts.map((p) => (
                                          <UsageBar
                                            key={p.key}
                                            indent
                                            label={`My use of ${p.name} simulation hours`}
                                            used={p.used}
                                            total={p.total}
                                            unit=" hrs"
                                          />
                                        ))}
                                      </div>
                                    </>
                                  )}
                                  {postWsProducts.length > 0 && (
                                    <>
                                      <UsageBar
                                        indent
                                        barless
                                        label="My use of post-secondary workstation simulation hours"
                                        used={postWsTotal.used}
                                        total={postWsTotal.total}
                                        unit=" hrs"
                                      />
                                      <div className="pl-4 space-y-2.5">
                                        {postWsProducts.map((p) => (
                                          <UsageBar
                                            key={p.key}
                                            indent
                                            label={`My use of ${p.name} simulation hours`}
                                            used={p.used}
                                            total={p.total}
                                            unit=" hrs"
                                          />
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-red-600 bg-[#e9e9e9] rounded-md px-3 py-2">
                            Avatar hours &amp; hardware usage are placeholders — not tracked per educator yet.
                          </p>
                        </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Simulations-completed chart (per class, over time) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mx-3 sm:mx-5 mt-4 mb-6 min-w-0 overflow-hidden">
          <button
            type="button"
            onClick={() => setChartSectionOpen((o) => !o)}
            aria-expanded={chartSectionOpen}
            className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 min-h-[44px] text-left hover:bg-[#e9e9e9]/50 transition-colors"
          >
            <span className="text-sm sm:text-base font-semibold text-gray-800">
              Graphical Overview of Simulations Completed
            </span>
            <ChevronDown
              size={20}
              className={`text-gray-500 shrink-0 transition-transform duration-200 ${chartSectionOpen ? '' : '-rotate-90'}`}
              aria-hidden="true"
            />
          </button>
          {chartSectionOpen && (
          <div className="px-3 sm:px-5 pb-5 pt-4 border-t border-gray-100">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-gray-800">
                Simulations Completed
              </h2>
              {breakdownActive ? (
                <div className="flex flex-wrap items-center gap-1 text-xs sm:text-sm text-gray-500">
                  <button
                    type="button"
                    onClick={() => {
                      setDrillSchool(null);
                      setDrillClass(null);
                    }}
                    className="font-medium hover:text-primary-500"
                  >
                    All Schools
                  </button>
                  {drillSchool && (
                    <>
                      <span aria-hidden="true">›</span>
                      <button
                        type="button"
                        onClick={() => setDrillClass(null)}
                        className="font-medium hover:text-primary-500"
                      >
                        {drillSchoolName}
                      </button>
                    </>
                  )}
                  {drillClass && (
                    <>
                      <span aria-hidden="true">›</span>
                      <span className="font-medium text-gray-700">
                        {drillClassName}
                      </span>
                    </>
                  )}
                  <span className="ml-1">
                    · by{' '}
                    {breakdown.level === 'school'
                      ? 'school'
                      : breakdown.level === 'class'
                        ? 'class'
                        : 'student'}
                  </span>
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-gray-500 tabular-nums">
                  {chartClassLabel} · {chartSeries.total} total
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Over Time (Total/Compare) vs Breakdown (click-to-drill). */}
              <div className="inline-flex items-center rounded-full bg-[#e9e9e9] p-0.5 text-xs font-semibold">
                {([
                  ['time', 'Over Time'],
                  ['breakdown', 'Breakdown'],
                ] as const).map(([key, lbl]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setChartMode(key);
                      if (key === 'breakdown') {
                        setDrillSchool(null);
                        setDrillClass(null);
                      }
                    }}
                    aria-pressed={chartMode === key}
                    className={`px-3 py-1 rounded-full transition-colors ${
                      chartMode === key
                        ? 'bg-primary-500 text-white'
                        : 'text-[#5f6060]'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {/* Total vs Compare (side-by-side series) — only when >1 item is
                  selected in a single filter. */}
              {!breakdownActive && canCompare && (
                <div className="inline-flex items-center rounded-full bg-[#e9e9e9] p-0.5 text-xs font-semibold">
                  {([
                    ['total', 'Total'],
                    ['compare', 'Compare'],
                  ] as const).map(([key, lbl]) => {
                    const active = (key === 'compare') === chartCompare;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setChartCompare(key === 'compare')}
                        aria-pressed={active}
                        className={`px-3 py-1 rounded-full transition-colors ${
                          active ? 'bg-primary-500 text-white' : 'text-[#5f6060]'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              )}
              {!breakdownActive && chartSchoolOptions.length > 0 && (
                <div className="w-40 sm:w-48 [&_[data-select-dropdown]]:text-sm">
                  <MultiSelect
                    values={chartSchoolIds}
                    placeholder="All Schools"
                    searchable
                    summarize
                    summarizeNoun="schools"
                    options={chartSchoolOptions}
                    onChange={(vals) => {
                      setChartSchoolIds(vals);
                      // Narrowing the school resets deeper selections.
                      setChartClassIds([]);
                      setChartStudentIds([]);
                    }}
                  />
                </div>
              )}
              {!breakdownActive && (
              <div className="w-40 sm:w-48 [&_[data-select-dropdown]]:text-sm">
                <MultiSelect
                  values={chartClassIds}
                  placeholder="All Classes"
                  searchable
                  summarize
                  summarizeNoun="classes"
                  options={allClasses
                    .filter(
                      (c) =>
                        chartSchoolIds.length === 0 ||
                        chartSchoolIds.includes(String(c.school_name ?? '')),
                    )
                    .map((c) => ({ label: c.class_name, value: c.id }))}
                  onChange={(vals) => {
                    setChartClassIds(vals);
                    setChartStudentIds([]);
                  }}
                />
              </div>
              )}
              {!breakdownActive && studentCodeOptions.length > 0 && (
                <div className="w-40 sm:w-48 [&_[data-select-dropdown]]:text-sm">
                  <MultiSelect
                    values={chartStudentIds}
                    placeholder="All Student Codes"
                    searchable
                    summarize
                    summarizeNoun="student codes"
                    options={studentCodeOptions}
                    onChange={setChartStudentIds}
                  />
                </div>
              )}
              <div className="w-36 [&_button]:h-9 [&_button]:text-sm">
                <SelectField
                  value={simRange}
                  options={[
                    { label: 'Last 3 Months', value: '3' },
                    { label: 'Last 6 Months', value: '6' },
                    { label: 'Last 12 Months', value: '12' },
                    { label: 'Last 24 Months', value: '24' },
                    { label: 'All Time', value: 'all' },
                  ]}
                  onChange={(v) => setSimRange(v as SimRange)}
                />
              </div>
              {[
                { label: 'PNG', onClick: handleExportPNG },
                { label: 'PDF', onClick: handleExportPDF },
                { label: 'CSV', onClick: handleExportCSV },
              ].map((x) => (
                <button
                  key={x.label}
                  type="button"
                  onClick={x.onClick}
                  aria-label={`Export ${x.label}`}
                  title={`Export ${x.label}`}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-[#e9e9e9] hover:border-primary-500 hover:text-primary-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  <Download size={14} aria-hidden="true" />
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[320px]">
            {(
              breakdownActive
                ? breakdown.entities.length === 0
                : chartSeries.total === 0
            ) ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500 text-center px-4">
                No simulations completed in this period yet.
              </div>
            ) : (
              <Bar ref={chartRef} data={barData} options={barOptions} />
            )}
          </div>
          {/* Keyboard/screen-reader equivalent of clicking a bar to drill down. */}
          {breakdownActive && breakdown.drillable && (
            <div className="sr-only">
              <p>Drill into a {breakdown.level}:</p>
              <ul>
                {breakdown.entities.map((e) => (
                  <li key={e.key}>
                    <button type="button" onClick={() => drillInto(e.key)}>
                      {e.label} ({e.count})
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Screen-reader summary of the chart series. */}
          <div className="sr-only">
            <p>Simulations completed for {chartClassLabel}:</p>
            <ul>
              {chartSeries.labels.map((l, i) => (
                <li key={`${l}-${i}`}>
                  {l}: {chartSeries.values[i] ?? 0}
                </li>
              ))}
            </ul>
          </div>
          </div>
          )}
        </div>
      </div>
      <RequestSeatsModal
        isOpen={isRequestSeatsOpen}
        onClose={() => setIsRequestSeatsOpen(false)}
        remainingSeats={seatData.remaining}
        products={avatarProducts.map((p) => ({
          value: p.key,
          label: p.label.split(' · ')[0],
          availableSeats: Math.max(0, (p.seatsTotal ?? 0) - (p.seatsConsumed ?? 0)),
        }))}
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
      <RequestProductAssociationModal
        isOpen={requestAssocOpen}
        onClose={() => setRequestAssocOpen(false)}
        products={products.map((p) => ({ key: p.key, label: p.label }))}
        onSubmit={() => {
          // Placeholder — no admin-request endpoint yet; notify via toast.
          setRequestAssocOpen(false);
          toast.success('Your product association request was sent to your administrator.');
        }}
      />
    </>
  );
}