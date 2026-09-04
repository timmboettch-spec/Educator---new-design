  import type { ChartOptions } from 'chart.js';
  import { useEffect, useMemo, useRef, useState } from 'react';
  import { Bar } from 'react-chartjs-2';
  import { useSelector } from 'react-redux';
  import { useLocation, useNavigate } from 'react-router-dom';
  import {
    CheckCircle2,
    ClipboardList,
    Download,
    GraduationCap,
    Package,
    Presentation,
    School,
    Users,
  } from 'lucide-react';
  import { jsPDF } from 'jspdf';
  import type { Chart } from 'chart.js';
  import { useAppDispatch } from '../../../store/hooks';
  import { PageHeader } from '../../../components/common/PageHeader';
  import { superscriptTrademarks } from '../../../components/common/Trademark';
  import ProgressCard from '../../../components/ui/ProgressCard';
  import SelectField from '../../../components/ui/Select';
  import {
    getDashboardOverview,
    selectDashboardOverview,
    selectDashboardOverviewStatus,
    selectDashboardOverviewError,
  } from '../../../redux/dashboard/admin/DashboardOverviewRedux';
  import { getCurrentUserRequest } from '../../../redux/users/GetUserRedux';
  import { getParsedUser, updateStoredUser } from '../../../utils/storage';
  import { getEntitlementFlags } from '../../../utils/entitlements';
  import { getAllProductNotes } from '../../../utils/productNotes';
  import NotificationCenter from '../../../components/account/NotificationCenter';
  import type { Subscription } from '../../../types';
  import loginEn from '../../../locales/auth/login/en.json';
  import loginEs from '../../../locales/auth/login/es.json';
  import {
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Legend,
    LinearScale,
    Tooltip,
  } from 'chart.js';
  import {
    AdminSimulationsReportRequest,
    selectAdminSimReports,
    selectAdminSimReportsStatus,
    selectAdminSimReportsError,
  } from '../../../redux/dashboard/admin/AdminSimulationsReportRedux';
  import { toast, sonnerToast } from '@/components/common/Toast';
  
  ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
  type SimRange = '3' | '6' | '9' | '12' | '18' | '24' | '36' | 'all';
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

  function SectionChevron({ open }: { open: boolean }) {
    return (
      <svg
        width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        className="flex-shrink-0 text-gray-500"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease' }}
      >
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // PLACEHOLDER: used only when the account has no classifiable keys, so the
  // Usage Monitoring UI can be reviewed. Remove once real subscriptions carry
  // edition-named products.
  const USAGE_PLACEHOLDER_SUBS: Subscription[] = [
    // Online / avatar — seat-based, with a licensed-through end date.
    { product_name: ['Online Avatar – Secondary'], ai_seats: 50, seats_available: 32, end: '2028-06-30', redeem_code: 'AVT-SEC-1042' },
    { product_name: ['Online Avatar – Post-Secondary'], ai_seats: 200, seats_available: 145, end: '2028-12-31', redeem_code: 'AVT-PS-0198' },
    { product_name: ['Online Avatar – Post-Secondary'], ai_seats: 30, seats_available: 2, end: '2028-06-30', redeem_code: 'AVT-PS-0233' },
    // Workstation — hardware products; each key is a licensed unit (a product may have multiples).
    { product_name: ['Workstation – Secondary'], hardware: 'Adult Nursing Manikin', hw_support_until: '2028-06-30', used_hours: 412, hour_cap: 1500, redeem_code: 'WS-SEC-0071' },
    { product_name: ['Workstation – Secondary'], hardware: 'Adult Nursing Manikin', hw_support_until: '2028-06-30', used_hours: 1430, hour_cap: 1500, redeem_code: 'WS-SEC-0072' },
    { product_name: ['Workstation – Secondary'], hardware: 'Bariatric Nursing Manikin', hw_support_until: '2028-12-31', used_hours: 88, hour_cap: 1500, redeem_code: 'WS-SEC-0090' },
    { product_name: ['Workstation – Post-Secondary'], hardware: 'Knee & Ankle Injury Simulator', hw_support_until: '2029-12-31', used_hours: 168, hour_cap: 1500, redeem_code: 'WS-PS-0044' },
    { product_name: ['Workstation – Post-Secondary'], hardware: 'PAT Manikin™', hw_support_until: '2029-06-30', used_hours: 51, hour_cap: 1500, redeem_code: 'WS-PS-0051' },
  ];

  // PLACEHOLDER completion data by school/educator — the report API carries no
  // school/educator attribution yet. Used for the by-school / by-educator chart views.
  const CHART_PLACEHOLDER_SCHOOLS: {
    name: string;
    educators: { name: string; completed: number; classes: { name: string; completed: number }[] }[];
  }[] = [
    {
      name: 'Willowbrook Summit',
      educators: [
        { name: 'A. Rivera', completed: 41, classes: [{ name: 'Nursing 101', completed: 18 }, { name: 'Nursing 102', completed: 14 }, { name: 'Clinical Lab', completed: 9 }] },
        { name: 'J. Chen', completed: 33, classes: [{ name: 'Anatomy A', completed: 20 }, { name: 'Anatomy B', completed: 13 }] },
        { name: 'M. Okafor', completed: 22, classes: [{ name: 'Pharmacology', completed: 22 }] },
      ],
    },
    {
      name: 'Saltmarsh Union',
      educators: [
        { name: 'K. Patel', completed: 38, classes: [{ name: 'Emergency Care', completed: 21 }, { name: 'Trauma Response', completed: 17 }] },
        { name: 'L. Nguyen', completed: 27, classes: [{ name: 'Med-Surg', completed: 15 }, { name: 'Geriatrics', completed: 12 }] },
      ],
    },
    {
      name: 'Prairie Vale',
      educators: [
        { name: 'S. Kim', completed: 29, classes: [{ name: 'Pediatrics', completed: 16 }, { name: 'Maternity', completed: 13 }] },
        { name: 'D. Flores', completed: 24, classes: [{ name: 'Critical Care', completed: 24 }] },
        { name: 'R. Ahmed', completed: 18, classes: [{ name: 'Fundamentals', completed: 10 }, { name: 'Skills Lab', completed: 8 }] },
      ],
    },
    {
      name: 'Cedar Ridge',
      educators: [
        { name: 'T. Brooks', completed: 31, classes: [{ name: 'Nursing I', completed: 17 }, { name: 'Nursing II', completed: 14 }] },
      ],
    },
  ];

  // Series styling for side-by-side charts — brand orange (#db8833) & grey
  // (#5f6060) ONLY, never a non-brand hue. To get enough distinct styles for
  // many schools/educators, we layer the two colours through, in order of
  // legibility: (1) solids, (2) stripe/dot fills on white, (3) blank fill with
  // a solid border, (4) contrasting fill+border (grey fill/orange border and
  // the reverse), (5) stripe/dot fills with a contrasting border, and (6)
  // two-tone patterns (one brand colour inked over the other as the fill).
  const O = '#db8833';
  const G = '#5f6060';
  type Series = {
    color: string; // solid fill, or the "ink" colour of a pattern
    fill: 'solid' | 'stripes' | 'dots' | 'outline';
    border?: string; // contrasting border colour (defaults to `color`)
    bg?: string; // pattern background (defaults to white)
  };
  const BRAND_SERIES: Series[] = [
    { color: O, fill: 'solid' },
    { color: G, fill: 'solid' },
    { color: O, fill: 'stripes' },
    { color: G, fill: 'stripes' },
    { color: O, fill: 'dots' },
    { color: G, fill: 'dots' },
    // blank fill + solid brand border
    { color: O, fill: 'outline' },
    { color: G, fill: 'outline' },
    // contrasting solid fill + brand border (mix & match)
    { color: G, fill: 'solid', border: O },
    { color: O, fill: 'solid', border: G },
    // patterns on white + contrasting border
    { color: O, fill: 'stripes', border: G },
    { color: G, fill: 'stripes', border: O },
    { color: O, fill: 'dots', border: G },
    { color: G, fill: 'dots', border: O },
    // two-tone patterns: one brand colour inked over the other as the fill
    { color: O, fill: 'stripes', bg: G },
    { color: G, fill: 'stripes', bg: O },
    { color: O, fill: 'dots', bg: G },
    { color: G, fill: 'dots', bg: O },
  ];

  function makeBarPattern(color: string, type: 'stripes' | 'dots', bg = '#ffffff'): CanvasPattern | string {
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

  export default function Dashboard() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    // Deep-link from the notification panel footer: scroll the Notification
    // Center into view.
    useEffect(() => {
      if (
        (location.state as { scrollTo?: string } | null)?.scrollTo ===
        'notification-center'
      ) {
        const t = setTimeout(() => {
          document
            .getElementById('notification-center')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
        return () => clearTimeout(t);
      }
    }, [location.state]);
    const chartRef = useRef<Chart<'bar'> | null>(null);
    const [simRange, setSimRange] = useState<SimRange>('6');
    const [activityCollapsed, setActivityCollapsed] = useState(false);
    const [usageCollapsed, setUsageCollapsed] = useState(false);
    const [collapsedEditions, setCollapsedEditions] = useState<Set<string>>(new Set());
    const [chartView, setChartView] = useState<'month' | 'school' | 'educator'>('month');
    const [drillSchool, setDrillSchool] = useState<string | null>(null);
    const [drillEducator, setDrillEducator] = useState<string | null>(null);
    const [timeMode, setTimeMode] = useState<'total' | 'monthly'>('total');
    const toggleEdition = (key: string) =>
      setCollapsedEditions((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    const language = getStoredLanguage();
    const locale = useMemo(() => (language === 'es' ? loginEs : loginEn), [language]);
    const simReports = useSelector(selectAdminSimReports);
    const simCountStatus = useSelector(selectAdminSimReportsStatus);
    const simCountError = useSelector(selectAdminSimReportsError);
    const overview = useSelector(selectDashboardOverview);
    const overviewStatus = useSelector(selectDashboardOverviewStatus);
    const overviewError = useSelector(selectDashboardOverviewError);
    const cachedUser = getParsedUser() ?? {};
    const [subscriptions, setSubscriptions] = useState<Subscription[]>(
      (cachedUser?.subscriptions as Subscription[]) ?? [],
    );
    const activeSchools = overview?.activeSchools ?? 0;
    const totalSchools = overview?.totalSchools ?? 0;
    const totalClasses = overview?.totalClasses ?? 0;
    const studentsEngaged = overview?.studentsActiveLast30Days ?? 0;
    const totalStudents = overview?.totalStudents ?? 0;
    const activeEducators = overview?.activeEducators ?? 0;
    const totalEducators = overview?.totalEducators ?? 0;
    const inactiveSchools = overview?.inactiveSchools ?? Math.max(totalSchools - activeSchools, 0);
    const pendingEducators = overview?.pendingEducators ?? 0;
    const inactiveEducators =
      overview?.inactiveEducators ??
      Math.max(totalEducators - activeEducators - pendingEducators, 0);
    const schoolsWithEducators = overview?.schoolsWithEducators ?? 0;

    const calcPercentage = (active: number, total: number) =>
      total > 0 ? Math.round(Math.min((active / total) * 100, 100)) : 0;

    useEffect(() => {
      const shown = sessionStorage.getItem('firstSubscribeToastShown');
      if (shown) {
        toast.success('Subscription successful! Welcome to the dashboard.');
        sessionStorage.removeItem('firstSubscribeToastShown');
      }
    }, []);

    useEffect(() => {
      getOverview();
      dispatch(AdminSimulationsReportRequest());
    }, []);

    const getOverview = async () => {
      try {
        await dispatch(getDashboardOverview()).unwrap();
        const userRes = await dispatch(getCurrentUserRequest()).unwrap();
        if (userRes?.data) {
          const subs =
            (userRes.data as { subscriptions?: { ai_seats?: number; seats_available?: number }[] })
              .subscriptions || [];
          setSubscriptions(subs as Subscription[]);
          updateStoredUser({ subscriptions: subs });
        }
      } catch {
        sonnerToast.error('Failed to load dashboard data, please try again', { id: 'admin-dashboard-error' });
      }
    };

    const progressMetrics = [
      {
        label: locale.dashboard.schoolsActive,
        value: formatLocaleText(locale.dashboard.schoolsActiveValue, {
          active: activeSchools,
          total: totalSchools,
        }),
        progress: activeSchools,
        total: totalSchools,
        subText: formatLocaleText(locale.dashboard.activeParticipation, {
          percent: calcPercentage(activeSchools, totalSchools),
        }),
        icon: School,
        onIconClick: () => navigate('/schools'),
        iconLabel: 'Go to Schools',
        actions: [
          {
            label: `View Active Schools (${activeSchools})`,
            onClick: () => navigate('/schools', { state: { status: 'ACTIVE' } }),
          },
          {
            label: `View Inactive Schools (${inactiveSchools})`,
            onClick: () => navigate('/schools', { state: { status: 'INACTIVE' } }),
          },
        ],
      },
      {
        label: 'Schools with Educators',
        value: `${schoolsWithEducators} / ${activeSchools} schools with associated educators`,
        progress: schoolsWithEducators,
        total: activeSchools,
        subText: `${calcPercentage(schoolsWithEducators, activeSchools)}% of active schools have associated educators`,
        icon: School,
        onIconClick: () => navigate('/schools'),
        iconLabel: 'Go to Schools',
        icon2: Users,
        onIcon2Click: () => navigate('/educators'),
        icon2Label: 'Go to Educators',
        actions: [
          {
            label: `View Active Schools with Educators (${schoolsWithEducators})`,
            onClick: () =>
              navigate('/schools', { state: { status: 'ACTIVE', educatorAssoc: 'with' } }),
          },
          {
            label: `View Active Schools Without Educators (${Math.max(activeSchools - schoolsWithEducators, 0)})`,
            onClick: () =>
              navigate('/schools', { state: { status: 'ACTIVE', educatorAssoc: 'without' } }),
          },
        ],
      },
      {
        label: locale.dashboard.educatorsRegisteredActive,
        value: formatLocaleText(locale.dashboard.educatorsActiveValue, {
          active: activeEducators,
          total: totalEducators,
        }),
        progress: activeEducators,
        total: totalEducators,
        subText: formatLocaleText(locale.dashboard.educatorActivityRate, {
          percent: calcPercentage(activeEducators, totalEducators),
        }),
        icon: Users,
        onIconClick: () => navigate('/educators'),
        iconLabel: 'Go to Educators',
        actions: [
          {
            label: `View Active Educators (${activeEducators})`,
            onClick: () => navigate('/educators', { state: { status: 'ACTIVE' } }),
          },
          {
            label: `View Pending Educators (${pendingEducators})`,
            onClick: () => navigate('/educators', { state: { status: 'PENDING' } }),
          },
          {
            label: `View Inactive Educators (${inactiveEducators})`,
            onClick: () => navigate('/educators', { state: { status: 'INACTIVE' } }),
          },
        ],
      },
    ];

    // Simulation attempts (reports) recorded so far this week.
    const attemptsThisWeek = useMemo(() => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      return simReports.filter((r) => {
        const raw = r.completed_at ?? r.scenarioEndTime ?? r.createdAt ?? r.created_at;
        if (!raw) return false;
        const d = new Date(raw as string);
        return !isNaN(d.getTime()) && d >= weekStart;
      }).length;
    }, [simReports]);

    // "Activity this week" — compact number tiles with a recognizable icon.
    const weekTiles = [
      { label: 'Active Classes', value: overview?.activeClasses ?? 0, icon: Presentation },
      { label: 'Active Students', value: overview?.studentsActive ?? 0, icon: GraduationCap },
      { label: 'Active Simulation Assignments', value: overview?.activeSimulationAssignments ?? 0, icon: ClipboardList },
      { label: 'Attempted Simulations This Week', value: attemptsThisWeek, icon: CheckCircle2 },
    ];
  
    // Entitlement gating for Usage Monitoring (prototype mode shows both).
    const entitlements = useMemo(() => getEntitlementFlags(), []);

    // Group each redeemed key/subscription into one of the four product editions
    // (modality × audience), with per-key remaining usage. A subsection renders
    // only when the user actually holds a matching key.
    const usageEditions = useMemo(() => {
      type Entry = {
        label: string;
        sub: string;
        value: string;
        group?: string;
        low?: boolean;
        // Set when the license is within EXPIRING_SOON_DAYS of its end date.
        expiringSoon?: boolean;
        // Set when the license end date is already past.
        expired?: boolean;
        // The entitlement/redeem code, used to deep-link to that product row.
        code?: string;
      };
      const EXPIRING_SOON_DAYS = 60;
      const daysUntil = (s?: string): number | null => {
        if (!s) return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
        const d = m
          ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
          : new Date(s);
        if (isNaN(d.getTime())) return null;
        return Math.floor((d.getTime() - Date.now()) / 86400000);
      };
      const isExpiringSoon = (s?: string): boolean => {
        const du = daysUntil(s);
        return du != null && du >= 0 && du <= EXPIRING_SOON_DAYS;
      };

      const fmtDate = (s?: string) => {
        if (!s) return '';
        // Parse date-only strings as local (avoids the UTC off-by-one that shows the previous day).
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
        const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
        return isNaN(d.getTime())
          ? ''
          : d.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      };
      const audienceOf = (name: string): 'sec' | 'post' | undefined => {
        const v = name.toLowerCase();
        if (/high\s?school/.test(v)) return 'sec';
        if (/post[-\s]?secondary/.test(v) || v.includes('bsn') || v.includes('college') || v.includes('university') || v.includes('pa/pt') || v.includes('nursing')) return 'post';
        if (v.includes('secondary')) return 'sec';
        return undefined;
      };
      const modalityOf = (name: string, aiFlag?: boolean): 'online' | 'ws' => {
        if (aiFlag === true) return 'online';
        if (aiFlag === false) return 'ws';
        const v = name.toLowerCase();
        if (v.includes('workstation') || v.includes('manikin') || v.includes('trainer')) return 'ws';
        return 'online';
      };

      const classify = (subs: Subscription[]) => {
        const editions = [
          { key: 'online-sec',  title: 'RealPatient™ Online Avatar Simulation - Secondary Education Edition',      modality: 'online', audience: 'sec',  entries: [] as Entry[] },
          { key: 'online-post', title: 'RealPatient™ Online Avatar Simulation - Post-Secondary Education Edition', modality: 'online', audience: 'post', entries: [] as Entry[] },
          { key: 'ws-sec',      title: 'RealPatient™ Workstation - Secondary Education Edition',                    modality: 'ws',     audience: 'sec',  entries: [] as Entry[] },
          { key: 'ws-post',     title: 'RealPatient™ Workstation - Post-Secondary Education Edition',               modality: 'ws',     audience: 'post', entries: [] as Entry[] },
        ];
        subs.forEach((sub) => {
          const names =
            sub.product_name && sub.product_name.length
              ? sub.product_name
              : [String(sub.platform?.[0] ?? 'RealPatient™ Product')];
          names.forEach((rawName, i) => {
            const name = String(rawName ?? '').trim() || 'RealPatient™ Product';
            const aiFlag = Array.isArray(sub.ai) ? sub.ai[i] : undefined;
            const modality = modalityOf(name, aiFlag);
            const audience = audienceOf(name);
            if (!audience) return; // can't place a key we can't classify
            const bucket = editions.find((e) => e.modality === modality && e.audience === audience);
            if (!bucket) return;
            // Units aren't tied to a class/program.
            let label = '';
            let subline = '';
            let value = '';
            let group: string | undefined;
            // Flag units in their final 10% of available seats / hours.
            let low = false;
            // Flag units within EXPIRING_SOON_DAYS of their license end date.
            let expiringSoon = false;
            // Flag units whose license end date is already past.
            let expired = false;
            if (modality === 'online') {
              // Green: seats + the date the unit is licensed through.
              label = `Licensed Unit ${bucket.entries.length + 1}`;
              value =
                sub.ai_seats != null
                  ? `${sub.seats_available ?? 0} / ${sub.ai_seats} seats`
                  : `${sub.seats_available ?? 0} seats`;
              if (typeof sub.ai_seats === 'number' && sub.ai_seats > 0) {
                low = (sub.seats_available ?? 0) / sub.ai_seats <= 0.1;
              }
              const endRaw = sub.end || sub.hw_support_until;
              const through = fmtDate(endRaw);
              expiringSoon = isExpiringSoon(endRaw);
              expired = (daysUntil(endRaw) ?? 0) < 0;
              subline = [sub.redeem_code, through ? `Licensed through ${through}` : '']
                .filter(Boolean)
                .join(' · ');
            } else {
              // Blue: workstation — units grouped under their hardware product (a product
              // may have several units); cumulative usage in hours.
              group =
                typeof sub.hardware === 'string' && sub.hardware.trim() ? sub.hardware.trim() : 'Workstation';
              const unitNo = bucket.entries.filter((e) => e.group === group).length + 1;
              label = `Licensed Unit ${unitNo}`;
              const used = typeof sub.used_hours === 'number' ? sub.used_hours : undefined;
              const cap = typeof sub.hour_cap === 'number' ? sub.hour_cap : undefined;
              value =
                used != null
                  ? cap != null
                    ? `${used.toLocaleString()} / ${cap.toLocaleString()} hrs`
                    : `${used.toLocaleString()} hrs used`
                  : fmtDate(sub.hw_support_until || sub.end)
                    ? `Licensed through ${fmtDate(sub.hw_support_until || sub.end)}`
                    : 'Active';
              if (used != null && cap != null && cap > 0) {
                low = (cap - used) / cap <= 0.1;
              }
              const wsEndRaw = sub.hw_support_until || sub.end;
              const through = fmtDate(wsEndRaw);
              expiringSoon = isExpiringSoon(wsEndRaw);
              expired = (daysUntil(wsEndRaw) ?? 0) < 0;
              subline = [sub.redeem_code, through ? `Licensed through ${through}` : '']
                .filter(Boolean)
                .join(' · ');
            }
            bucket.entries.push({
              label,
              sub: subline,
              value,
              group,
              low,
              expiringSoon,
              expired,
              code: sub.redeem_code,
            });
          });
        });
        return editions;
      };

      let editions = classify(subscriptions);
      const isPlaceholder = editions.every((e) => e.entries.length === 0);
      if (isPlaceholder) editions = classify(USAGE_PLACEHOLDER_SUBS);
      return { editions, isPlaceholder };
    }, [subscriptions, language]);

    // Product health stats for the tile: total purchased units, active (not
    // expired), plus the "needs attention" breakdown (final 10% of seats/hours
    // OR within 60 days of expiring). Counted across the editions actually shown.
    const productStats = useMemo(() => {
      const entries = usageEditions.editions
        .filter((e) => e.entries.length > 0)
        .filter((e) =>
          e.modality === 'online' ? entitlements.hasAvatar : entitlements.hasWorkstation,
        )
        .flatMap((e) => e.entries);
      // The health bar + Approaching/Expiring counts are over ACTIVE (non-expired)
      // products only; `expired` stays a full-set count for its own button.
      const activeEntries = entries.filter((it) => !it.expired);
      const total = entries.length;
      const active = activeEntries.length;
      const expiring = activeEntries.filter((it) => it.expiringSoon).length;
      const low = activeEntries.filter((it) => it.low).length;
      const expired = entries.filter((it) => it.expired).length;
      const attention = activeEntries.filter((it) => it.low || it.expiringSoon).length;
      return { total, active, expiring, low, expired, attention };
    }, [usageEditions, entitlements]);

    // Associated-educator counts (admin-local product notes) keyed by entitlement
    // code, for the Usage Monitoring rows.
    const productNotesMap = useMemo(() => getAllProductNotes(), []);

    // Educator-coverage: how many products have ≥1 associated educator. The
    // health measure is over ACTIVE products; the button counts (which match the
    // products-page association filter) are over ALL shown products.
    const coverageStats = useMemo(() => {
      const entries = usageEditions.editions
        .filter((e) => e.entries.length > 0)
        .filter((e) =>
          e.modality === 'online' ? entitlements.hasAvatar : entitlements.hasWorkstation,
        )
        .flatMap((e) => e.entries);
      const hasEd = (it: (typeof entries)[number]) =>
        (productNotesMap[it.code ?? '']?.educatorIds?.length ?? 0) > 0;
      // Coverage is measured over ACTIVE (non-expired) products only, including
      // the Manage buttons.
      const active = entries.filter((it) => !it.expired);
      const allWith = active.filter(hasEd).length;
      return {
        activeWithEd: allWith,
        activeTotal: active.length,
        allWith,
        allWithout: active.length - allWith,
      };
    }, [usageEditions, entitlements, productNotesMap]);

    const reportChartData = useMemo(() => {
      const now = new Date();
      let n: number;
      if (simRange === 'all') {
        // Span from the earliest report month to now (inclusive), min 1.
        let earliest = now;
        simReports.forEach((r) => {
          const raw = r.completed_at ?? r.scenarioEndTime ?? r.createdAt ?? r.created_at;
          if (!raw) return;
          const d = new Date(raw as string);
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

      const buckets: { label: string; key: string }[] = [];
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

      const counts: Record<string, number> = {};
      buckets.forEach((b) => (counts[b.key] = 0));

      simReports.forEach((r) => {
        const rawDate = r.completed_at ?? r.scenarioEndTime ?? r.createdAt ?? r.created_at;
        if (!rawDate) return;
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!(key in counts)) return;
        counts[key] += 1;
      });

      const labels = buckets.map((b) => b.label);
      const values = buckets.map((b) => counts[b.key]);
      return { labels, values, total: values.reduce((s, v) => s + v, 0) };
    }, [simReports, simRange, language]);

    // The chart can group completions by month (real), or by school / educator
    // (placeholder), with click-to-drill from a school into its educators.
    const chartData = useMemo(() => {
      const monthLabels = reportChartData.labels;
      // Deterministically spread a total across n months (placeholder only — no RNG).
      const spread = (total: number, n: number, seed: number): number[] => {
        if (n <= 0) return [];
        const weights = Array.from({ length: n }, (_, i) => 1 + ((i * 7 + seed * 3) % 5));
        const wsum = weights.reduce((a, w) => a + w, 0);
        const arr = weights.map((w) => Math.round((total * w) / wsum));
        arr[arr.length - 1] += total - arr.reduce((a, v) => a + v, 0);
        return arr;
      };

      if (chartView === 'month') {
        return {
          labels: monthLabels,
          datasets: [{ label: 'Simulations', data: reportChartData.values, color: '#db8833', fill: 'solid' as const }],
          total: reportChartData.total,
          isPlaceholder: false,
          drillable: false,
          grouped: false,
        };
      }

      const entities: { name: string; completed: number }[] =
        drillSchool && drillEducator
          ? (CHART_PLACEHOLDER_SCHOOLS.find((s) => s.name === drillSchool)
              ?.educators.find((e) => e.name === drillEducator)?.classes ?? [])
          : drillSchool
            ? (CHART_PLACEHOLDER_SCHOOLS.find((s) => s.name === drillSchool)?.educators ?? [])
            : chartView === 'educator' && drillEducator
              ? (CHART_PLACEHOLDER_SCHOOLS.flatMap((s) => s.educators).find((e) => e.name === drillEducator)?.classes ?? [])
              : chartView === 'educator'
                ? CHART_PLACEHOLDER_SCHOOLS.flatMap((s) => s.educators)
                : CHART_PLACEHOLDER_SCHOOLS.map((s) => ({
                    name: s.name,
                    completed: s.educators.reduce((a, e) => a + e.completed, 0),
                  }));
      const total = entities.reduce((a, e) => a + e.completed, 0);
      // School view drills schools → educators → classes; Educator view drills
      // educators → classes.
      const drillable =
        (chartView === 'school' && !(drillSchool && drillEducator)) ||
        (chartView === 'educator' && !drillEducator);

      if (timeMode === 'monthly') {
        // Side-by-side: months on the X-axis, one series per school/educator.
        return {
          labels: monthLabels,
          datasets: entities.map((e, i) => {
            const s = BRAND_SERIES[i % BRAND_SERIES.length];
            return {
              label: e.name,
              data: spread(e.completed, monthLabels.length, i + 1),
              color: s.color,
              fill: s.fill,
              border: s.border,
              bg: s.bg,
            };
          }),
          total,
          isPlaceholder: true,
          drillable: false,
          grouped: true,
        };
      }
      // Total: one bar per school/educator over the whole timeframe.
      return {
        labels: entities.map((e) => e.name),
        datasets: [{ label: 'Simulations', data: entities.map((e) => e.completed), color: '#db8833', fill: 'solid' as const }],
        total,
        isPlaceholder: true,
        drillable,
        grouped: false,
      };
    }, [chartView, drillSchool, drillEducator, timeMode, reportChartData]);

    // Shared drill action used by both the canvas click handler and the
    // keyboard-accessible (sr-only) drill buttons below the chart.
    const drillTo = (label: string | null) => {
      if (!chartData.drillable || label == null) return;
      if (chartView === 'school') {
        if (!drillSchool) setDrillSchool(label);
        else if (!drillEducator) setDrillEducator(label);
      } else if (chartView === 'educator' && !drillEducator) {
        setDrillEducator(label);
      }
    };

    const simulationOptions: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_evt, elements) => {
        if (!chartData.drillable) return;
        const idx = elements?.[0]?.index;
        if (idx == null) return;
        drillTo(chartData.labels[idx] ?? null);
      },
      onHover: (evt, elements) => {
        const target = (evt?.native?.target ?? null) as HTMLElement | null;
        if (target) target.style.cursor = chartData.drillable && elements.length ? 'pointer' : 'default';
      },
      layout: {
        padding: { bottom: 4 },
      },
      plugins: {
        legend: { display: chartData.grouped, position: 'bottom' },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label ?? '',
            label: (item) => {
              const v = Number(item.parsed.y ?? 0);
              const prefix = chartData.grouped && item.dataset?.label ? `${item.dataset.label}: ` : '';
              return ` ${prefix}${v.toLocaleString()} Simulations Completed`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 13, family: 'inherit' },
            color: '#374151',
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            autoSkipPadding: 8,
            padding: 6,
          },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#F3F4F6' },
          title: {
            display: true,
            text: locale.dashboard.studentsCompletedAxis,
            font: { size: 13, family: 'inherit' },
            color: '#374151',
          },
          ticks: {
            stepSize: 1,
            padding: 6,
            color: '#374151',
            font: { size: 13, family: 'inherit' },
            callback: (value) => (Number.isInteger(Number(value)) ? value : null),
          },
        },
      },
    };

    const handleExportPNG = () => {
      const chart = chartRef.current;
      if (!chart) return;
      const url = chart.toBase64Image('image/png', 1);
      const a = document.createElement('a');
      a.href = url;
      a.download = `simulations-${simRange}m.png`;
      a.click();
    };

    const handleExportPDF = () => {
      const chart = chartRef.current;
      if (!chart) return;
      const imgData = chart.toBase64Image('image/png', 1);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [800, 400] });
      pdf.setFontSize(14);
      pdf.text(`Simulation Completed — Last ${simRange} Months`, 20, 30);
      pdf.addImage(imgData, 'PNG', 20, 50, 760, 300);
      pdf.save(`simulations-${simRange}m.pdf`);
    };

    const handleExportCSV = () => {
      const rows = [
        ['Label', ...chartData.datasets.map((d) => d.label)],
        ...chartData.labels.map((label, i) => [
          label,
          ...chartData.datasets.map((d) => String(d.data[i] ?? 0)),
        ]),
      ];
      const csv = rows.map((r) => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `simulations-${simRange}m.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <>
        <div className="p-4 sm:p-6 w-full min-w-0 overflow-hidden">
          <PageHeader title={locale.dashboard.title} sub_text={locale.dashboard.subText} />

          {/* Notification management — above Activity At-A-Glance & Usage Monitoring */}
          <div className="mb-4 sm:mb-6">
            <NotificationCenter role="admin" />
          </div>

          {/* 1/3 tiles column | 2/3 graphs column; single column on small screens */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 sm:gap-6 items-start">
            {/* Left column (~1/3 width): Activity At-A-Glance */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm min-w-0 overflow-hidden">
              <button
                type="button"
                onClick={() => setActivityCollapsed((c) => !c)}
                aria-expanded={!activityCollapsed}
                className="flex w-full items-center justify-between gap-2 text-gray-800"
              >
                <h3 className="text-base font-semibold">Activity Overview</h3>
                <SectionChevron open={!activityCollapsed} />
              </button>
              {!activityCollapsed && (
                <div className="flex flex-col gap-4 sm:gap-5 min-w-0 mt-4">
                  {overviewStatus === 'loading' && (
                    <div data-testid="overview-loading" className="flex flex-col gap-4 sm:gap-5">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  )}
                  {overviewStatus === 'failed' && (
                    <div data-testid="overview-error" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                      {overviewError ?? 'Failed to load dashboard data. Please try again.'}
                    </div>
                  )}
                  {overviewStatus === 'succeeded' && (
                    <>
                      {/* Activity this week — its own tile at the top, matching
                          the Schools/Educators card container + header style. */}
                      <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap mb-3">
                          <p className="text-sm font-semibold text-gray-700 leading-snug">
                            Activity This Week
                          </p>
                          <span className="text-xs text-gray-500">Managed by Educators</span>
                        </div>
                        {/* container-query context: the tiles measure THIS grid's
                            width, so icons drop only when the tiles are actually
                            narrow enough for the label to wrap — regardless of the
                            viewport width (the 2-col dashboard can make this narrow
                            even on a wide screen). See `.week-tile*` in index.css. */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 [container-type:inline-size]">
                          {weekTiles.map((t) => {
                            const Ic = t.icon;
                            return (
                              <div
                                key={t.label}
                                className="week-tile rounded-xl border border-gray-100 bg-white p-3 flex items-center gap-2.5 min-w-0 overflow-hidden"
                              >
                                <Ic
                                  className="week-tile-icon w-6 h-6 flex-shrink-0 text-primary-500"
                                  aria-hidden="true"
                                />
                                <div className="min-w-0">
                                  <p className="text-xl sm:text-2xl font-bold text-[#5f6060] tabular-nums leading-none">
                                    {t.value.toLocaleString()}
                                  </p>
                                  <p className="text-[11px] text-gray-500 mt-1 leading-tight">
                                    {t.label}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {progressMetrics.map((item, i) => (
                        <ProgressCard key={i} {...item} />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right column (~2/3 width): AI Seats usage + Simulations Completed stacked */}
            <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm min-w-0 overflow-hidden">
              <button
                type="button"
                onClick={() => setUsageCollapsed((c) => !c)}
                aria-expanded={!usageCollapsed}
                className="flex w-full items-center justify-between gap-2 text-gray-800"
              >
                <h3 className="text-base font-semibold">Product &amp; Usage Monitoring</h3>
                <SectionChevron open={!usageCollapsed} />
              </button>

              {!usageCollapsed && (
              <div className="mt-4">
              {usageEditions.isPlaceholder && (
                <p className="text-xs text-red-600 bg-[#e9e9e9] rounded-md px-3 py-2 mb-4">
                  Sample data — placeholder for UI review. Real usage appears once activation codes are redeemed.
                </p>
              )}

              {usageEditions.editions.every((e) => e.entries.length === 0) ? (
                <p className="text-sm text-gray-500">
                  No products or keys redeemed yet. Redeem an activation code to see usage here.
                </p>
              ) : (
                <div className="space-y-5">
                  {/* Product health + educator coverage tiles — same card style
                      as the Activity Overview tiles. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ProgressCard
                      label="Product Health"
                      value={`${productStats.active - productStats.attention} / ${productStats.active} active products do not need attention`}
                      progress={productStats.active - productStats.attention}
                      total={productStats.active}
                      subText={`${
                        productStats.active > 0
                          ? Math.round(((productStats.active - productStats.attention) / productStats.active) * 100)
                          : 0
                      }% of active products are not nearing expiration or in the final 10% of available seats/hours`}
                      icon={Package}
                      onIconClick={() => navigate('/products')}
                      iconLabel="Go to Products"
                      tallValue
                      actions={[
                        {
                          label: `View Active Products (${productStats.active})`,
                          onClick: () => navigate('/products', { state: { attention: 'active' } }),
                        },
                        {
                          label: `View Active Products Approaching Limit (${productStats.low})`,
                          onClick: () => navigate('/products', { state: { attention: 'low' } }),
                        },
                        {
                          label: `View Active Products Expiring Soon (${productStats.expiring})`,
                          onClick: () => navigate('/products', { state: { attention: 'expiring' } }),
                        },
                        {
                          label: `View Expired Products (${productStats.expired})`,
                          onClick: () => navigate('/products', { state: { attention: 'expired' } }),
                        },
                      ]}
                    />

                    <ProgressCard
                      label="Product Associations"
                      value={`${coverageStats.activeWithEd} / ${coverageStats.activeTotal} active products associated with educators`}
                      progress={coverageStats.activeWithEd}
                      total={coverageStats.activeTotal}
                      subText={`${
                        coverageStats.allWith + coverageStats.allWithout > 0
                          ? Math.round(
                              (coverageStats.allWithout /
                                (coverageStats.allWith + coverageStats.allWithout)) *
                                100,
                            )
                          : 0
                      }% of active products have no associated educators`}
                      icon={Package}
                      onIconClick={() => navigate('/products')}
                      iconLabel="Go to Products"
                      tallValue
                      actions={[
                        {
                          label: `Manage All Active Products (${coverageStats.allWith + coverageStats.allWithout})`,
                          onClick: () => navigate('/products'),
                        },
                        {
                          label: `Manage Associated Active Products (${coverageStats.allWith})`,
                          onClick: () => navigate('/products', { state: { assoc: 'some' } }),
                        },
                        {
                          label: `Manage Unassociated Active Products (${coverageStats.allWithout})`,
                          onClick: () => navigate('/products', { state: { assoc: 'none' } }),
                        },
                      ]}
                    />
                  </div>

                  <div className="flex items-center gap-4 bg-primary-500 text-white text-[11px] uppercase tracking-wide font-semibold px-3 py-2.5 rounded-lg">
                    <span className="flex-1 min-w-0">Active Product</span>
                    <span className="w-36 text-center flex-shrink-0">Associated Educators</span>
                    <span className="w-44 text-right flex-shrink-0">Amount Used</span>
                  </div>
                  {usageEditions.editions
                    // Only active (non-expired) units are shown in this table.
                    .filter((e) => e.entries.some((en) => !en.expired))
                    // Entitlement gating: online editions need avatar, workstation
                    // editions need hardware. (Prototype mode shows both.)
                    .filter((e) => (e.modality === 'online' ? entitlements.hasAvatar : entitlements.hasWorkstation))
                    .map((e) => {
                      const row = (it: (typeof e.entries)[number], idx: number) => (
                        <button
                          type="button"
                          key={idx}
                          onClick={() =>
                            navigate(
                              '/products',
                              it.code ? { state: { productKey: it.code } } : undefined,
                            )
                          }
                          aria-label={`View ${it.label}${it.sub ? ` (${it.sub})` : ''} on the Products page`}
                          className="w-full flex items-start gap-4 text-sm rounded-md px-2 -mx-2 py-1 text-left cursor-pointer transition-colors hover:bg-[#e9e9e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        >
                          <span className="flex-1 min-w-0 break-words text-gray-600">
                            {it.label}
                            {it.sub ? <span className="text-gray-500"> · {it.sub}</span> : null}
                          </span>
                          <span className="w-36 flex justify-center flex-shrink-0">
                            {(() => {
                              const edCount =
                                productNotesMap[it.code ?? '']?.educatorIds?.length ?? 0;
                              return (
                                <span
                                  className={`text-xs tabular-nums whitespace-nowrap ${
                                    edCount === 0
                                      ? 'font-semibold text-primary-700 border border-primary-500 rounded-full px-2 py-0.5'
                                      : 'text-gray-600'
                                  }`}
                                  title={
                                    edCount === 0
                                      ? 'No educators associated with this product'
                                      : `${edCount} educator${edCount === 1 ? '' : 's'} associated`
                                  }
                                >
                                  {edCount} educator{edCount === 1 ? '' : 's'}
                                </span>
                              );
                            })()}
                          </span>
                          <span className="w-44 flex justify-end items-center flex-shrink-0 tabular-nums">
                            {it.low || it.expiringSoon ? (
                              <span
                                className="text-xs whitespace-nowrap font-semibold text-primary-700 border border-primary-500 rounded-full px-2 py-0.5"
                                title={
                                  it.low
                                    ? 'Approaching the final 10% of available seats/hours'
                                    : 'License is expiring soon'
                                }
                              >
                                {it.value}
                              </span>
                            ) : (
                              <span className="text-xs whitespace-nowrap text-gray-900">{it.value}</span>
                            )}
                          </span>
                        </button>
                      );
                      // Expired units are hidden — only active licenses show here.
                      const activeEntries = e.entries.filter((en) => !en.expired);
                      // Workstation editions group their units under a hardware-product sub-heading.
                      const groups: { name: string; items: typeof e.entries }[] = [];
                      if (e.modality === 'ws') {
                        activeEntries.forEach((en) => {
                          const g = en.group ?? 'Workstation';
                          let grp = groups.find((x) => x.name === g);
                          if (!grp) {
                            grp = { name: g, items: [] };
                            groups.push(grp);
                          }
                          grp.items.push(en);
                        });
                      }
                      const editionOpen = !collapsedEditions.has(e.key);
                      return (
                        <div key={e.key}>
                          <button
                            type="button"
                            onClick={() => toggleEdition(e.key)}
                            aria-expanded={editionOpen}
                            className="flex w-full items-center justify-between gap-2 mb-2 text-left text-gray-800"
                          >
                            <h4 className="text-sm font-semibold text-gray-800 leading-snug">{superscriptTrademarks(e.title)}</h4>
                            <SectionChevron open={editionOpen} />
                          </button>
                          {editionOpen &&
                            (e.modality === 'ws' ? (
                              <div className="space-y-3">
                                {groups.map((g) => (
                                  <div key={g.name}>
                                    <p className="text-[13px] font-semibold text-gray-700 mb-1">{superscriptTrademarks(g.name)}</p>
                                    <div className="space-y-2 pl-3 border-l-2 border-gray-100">
                                      {g.items.map((it, idx) => row(it, idx))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-2">{activeEntries.map((it, idx) => row(it, idx))}</div>
                            ))}
                        </div>
                      );
                    })}
                </div>
              )}
              </div>
              )}
            </div>
            </div>
          </div>

          {/* Full-width: Simulations Completed chart, below the tiles + usage */}
          <div className="mt-4 sm:mt-6">
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm min-w-0 overflow-hidden">
              <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                <h3 className="text-base font-semibold">{locale.dashboard.simulationCompleted}</h3>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Timeframe dropdown first (left) so the toggles/exports to its
                      right keep a stable position whether or not it's shown. */}
                  {(chartView === 'month' || timeMode === 'monthly') && (
                    <div className="w-36 [&_button]:h-9 [&_button]:text-sm">
                      <SelectField
                        value={simRange}
                        options={[
                          ...[3, 6, 9, 12, 18, 24, 36].map((n) => ({
                            label:
                              n === 3
                                ? locale.dashboard.last3Months
                                : n === 6
                                  ? locale.dashboard.last6Months
                                  : language === 'es'
                                    ? `Últimos ${n} meses`
                                    : `Last ${n} Months`,
                            value: String(n),
                          })),
                          { label: language === 'es' ? 'Todo el tiempo' : 'All Time', value: 'all' },
                        ]}
                        onChange={(val) => setSimRange(val as SimRange)}
                      />
                    </div>
                  )}
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                    {([
                      { v: 'month', label: 'Overall' },
                      { v: 'school', label: 'School' },
                      { v: 'educator', label: 'Educator' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => {
                          setChartView(opt.v);
                          setDrillSchool(null);
                          setDrillEducator(null);
                        }}
                        className={`px-3 py-1.5 font-medium transition-colors ${
                          chartView === opt.v ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-[#e9e9e9]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {chartView !== 'month' && (
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                      {(['total', 'monthly'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setTimeMode(m)}
                          className={`px-3 py-1.5 font-medium transition-colors ${
                            timeMode === m ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-[#e9e9e9]'
                          }`}
                        >
                          {m === 'total' ? 'Total' : 'Monthly'}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Readable export buttons — icon + label. */}
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

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xl sm:text-2xl font-bold text-gray-800 tabular-nums">
                  {chartView === 'month' && simCountStatus === 'loading' ? '—' : chartData.total}
                </span>
                <span className="text-sm text-gray-500">
                  {locale.dashboard.totalCompletedSimulations}
                  {chartView === 'school' && !drillSchool && ' · by school'}
                  {chartView === 'school' && drillSchool && !drillEducator && ` · educators of ${drillSchool}`}
                  {chartView === 'school' && drillSchool && drillEducator && ` · classes of ${drillEducator} — ${drillSchool}`}
                  {chartView === 'educator' && !drillEducator && ' · by educator'}
                  {chartView === 'educator' && drillEducator && ` · classes of ${drillEducator}`}
                  {chartView !== 'month' && timeMode === 'monthly' && ' · monthly'}
                </span>
                {drillSchool && (
                  <button
                    type="button"
                    onClick={() => {
                      setDrillSchool(null);
                      setDrillEducator(null);
                    }}
                    className="ml-1 text-xs font-medium text-primary-600 hover:underline"
                  >
                    ← All schools
                  </button>
                )}
                {drillEducator && (
                  <button
                    type="button"
                    onClick={() => setDrillEducator(null)}
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    ← {drillSchool ? `${drillSchool} educators` : 'All educators'}
                  </button>
                )}
                {chartData.drillable && chartView === 'school' && !drillSchool && (
                  <span className="text-xs text-gray-500">Click a bar to drill into educators</span>
                )}
                {chartData.drillable && chartView === 'school' && drillSchool && !drillEducator && (
                  <span className="text-xs text-gray-500">Click a bar to drill into classes</span>
                )}
                {chartData.drillable && chartView === 'educator' && !drillEducator && (
                  <span className="text-xs text-gray-500">Click a bar to drill into classes</span>
                )}
              </div>
              {chartData.isPlaceholder && (
                <p className="text-xs text-red-600 bg-[#e9e9e9] rounded-md px-3 py-1.5 mb-3 inline-block">
                  Sample data — placeholder for UI review.
                </p>
              )}

              <div className="relative h-80 sm:h-[460px] w-full overflow-hidden">
                {chartView === 'month' && simCountStatus === 'failed' ? (
                  <div data-testid="sim-chart-error" className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {simCountError ?? 'Failed to load simulation data. Please try again.'}
                  </div>
                ) : chartView === 'month' && simCountStatus !== 'loading' && chartData.total === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-2">
                    <img src="/assets/dashboard/empty-chart.svg" alt="" className="w-10 h-10 opacity-40" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    <span className="text-sm">{locale.dashboard.noSimulationData ?? 'No simulation data available'}</span>
                  </div>
                ) : (
                  <Bar
                    ref={chartRef}
                    data={{
                      labels: chartData.labels,
                      datasets: chartData.datasets.map((d) => {
                        const dd = d as {
                          label: string;
                          data: number[];
                          color: string;
                          fill: 'solid' | 'stripes' | 'dots' | 'outline';
                          border?: string;
                          bg?: string;
                        };
                        const hasBorder = dd.fill === 'outline' || dd.border != null;
                        const background =
                          dd.fill === 'solid'
                            ? dd.color
                            : dd.fill === 'outline'
                              ? 'transparent'
                              : makeBarPattern(dd.color, dd.fill, dd.bg);
                        return {
                          label: dd.label,
                          data: dd.data,
                          backgroundColor: background,
                          hoverBackgroundColor: dd.color,
                          borderColor: dd.border ?? dd.color,
                          borderWidth: hasBorder ? 2 : dd.fill === 'solid' ? 0 : 1.5,
                          borderRadius: 6,
                          maxBarThickness: 48,
                        };
                      }),
                    }}
                    options={simulationOptions}
                  />
                )}
              </div>

              {/* Keyboard/screen-reader equivalent of clicking a bar to drill
                  down. sr-only keeps these focusable (clip, not display:none)
                  without changing the visual layout. */}
              {chartData.drillable && chartData.labels.length > 0 && (
                <div className="sr-only">
                  <p id="chart-drill-help">
                    Drill into simulation data by activating a bar:
                  </p>
                  <ul aria-describedby="chart-drill-help">
                    {chartData.labels.map((label, i) => (
                      <li key={`${label}-${i}`}>
                        <button type="button" onClick={() => drillTo(label)}>
                          {chartView === 'school' && !drillSchool
                            ? `Drill into educators of ${label}`
                            : `Drill into classes of ${label}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

        </div>
      </>
    );
  }
