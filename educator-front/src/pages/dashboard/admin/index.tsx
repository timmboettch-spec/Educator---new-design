import type { ChartOptions } from 'chart.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { useSelector } from 'react-redux';
import { jsPDF } from 'jspdf';
import type { Chart } from 'chart.js';
import { useAppDispatch } from '../../../store/hooks';
import { PageHeader } from '../../../components/common/PageHeader';
import ParticipationProgressCard from '../../../components/ui/ParticipationProgressCard';
import SelectField from '../../../components/ui/Select';
import {
  getDashboardOverview,
  selectDashboardOverview,
  selectDashboardOverviewStatus,
  selectDashboardOverviewError,
} from '../../../redux/dashboard/admin/DashboardOverviewRedux';
import { fetchCurrentUser } from '../../../redux/auth/MeRedux';
import { getAiSeats } from '../../../utils/normalizeAuthUser';
import { getParsedUser } from '../../../utils/storage';
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
type SimRange = '3' | '6';
type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

const formatLocaleText = (
  template: string,
  vars: Record<string, string | number>
) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    String(vars[key] ?? '')
  );
};

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const chartRef = useRef<Chart<'bar'> | null>(null);
  const [simRange, setSimRange] = useState<SimRange>('6');
  const language = getStoredLanguage();
  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );
  const simReports = useSelector(selectAdminSimReports);
  const simCountStatus = useSelector(selectAdminSimReportsStatus);
  const simCountError = useSelector(selectAdminSimReportsError);
  const overview = useSelector(selectDashboardOverview);
  const overviewStatus = useSelector(selectDashboardOverviewStatus);
  const overviewError = useSelector(selectDashboardOverviewError);
  const cachedUser = getParsedUser() ?? {};
  const storedSubs =
    (cachedUser?.subscriptions as {
      ai_seats?: number;
      seats_available?: number;
    }[]) || [];
  const [purchased, setPurchased] = useState<number>(
    storedSubs.reduce(
      (sum: number, s: { ai_seats?: number }) => sum + (s.ai_seats || 0),
      0
    )
  );
  const [remaining, setRemaining] = useState<number>(
    storedSubs.reduce(
      (sum: number, s: { seats_available?: number }) =>
        sum + (s.seats_available || 0),
      0
    )
  );
  const activeSchools = overview?.activeSchools ?? 0;
  const totalSchools = overview?.totalSchools ?? 0;
  const totalClasses = overview?.totalClasses ?? 0;
  const studentsEngaged = overview?.studentsActiveLast30Days ?? 0;
  const totalStudents = overview?.totalStudents ?? 0;
  const activeEducators = overview?.activeEducators ?? 0;
  const totalEducators = overview?.totalEducators ?? 0;

  const calcPercentage = (active: number, total: number) =>
    total > 0 ? Math.round(Math.min((active / total) * 100, 100)) : 0;
  const consumed = purchased - remaining;
  const aiSeatsPercentage =
    purchased > 0 ? Math.min((consumed / purchased) * 100, 100) : 0;

  useEffect(() => {
    const shown = sessionStorage.getItem('firstSubscribeToastShown');
    if (shown) {
      toast.success(locale.toast.subscriptionSuccess);
      sessionStorage.removeItem('firstSubscribeToastShown');
    }
  }, [locale.toast.subscriptionSuccess]);

  useEffect(() => {
    getOverview();
    dispatch(AdminSimulationsReportRequest());
  }, []);

  const getOverview = async () => {
    try {
      await dispatch(getDashboardOverview()).unwrap();
      const user = await dispatch(fetchCurrentUser()).unwrap();
      const seats = getAiSeats(user);
      setPurchased(seats.total);
      setRemaining(seats.available);
    } catch {
      sonnerToast.error(locale.toast.failedToLoadDashboard, {
        id: 'admin-dashboard-error',
      });
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
    },
    {
      label: locale.dashboard.classesRunning,
      value: formatLocaleText(locale.dashboard.activeClasses, {
        count: overview?.activeClasses ?? 0,
      }),
      progress: overview?.activeClasses ?? 0,
      total: totalClasses,
      badge: locale.dashboard.thisWeek,
      subText: formatLocaleText(locale.dashboard.activeParticipation, {
        percent: calcPercentage(overview?.activeClasses ?? 0, totalClasses),
      }),
    },
    {
      label: locale.dashboard.studentsActive,
      value: formatLocaleText(locale.dashboard.studentsActiveValue, {
        count: studentsEngaged.toLocaleString(),
      }),
      progress: studentsEngaged,
      total: totalStudents,
      badge: locale.dashboard.last30Days,
      subText: formatLocaleText(locale.dashboard.studentsLast30, {
        count: studentsEngaged,
      }),
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
    },
  ];

  const reportChartData = useMemo(() => {
    const n = Number(simRange);
    const now = new Date();

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
      const rawDate =
        r.completed_at ?? r.scenarioEndTime ?? r.createdAt ?? r.created_at;
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

  const simulationOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { bottom: 4 },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? '',
          label: (item) =>
            ` ${formatLocaleText(locale.dashboard.completedTooltip, {
              count: Number(item.parsed.y ?? 0),
              suffix: Number(item.parsed.y ?? 0) !== 1 ? 's' : '',
            })}`,
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
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [800, 400],
    });
    pdf.setFontSize(14);
    pdf.text(`Simulation Completed — Last ${simRange} Months`, 20, 30);
    pdf.addImage(imgData, 'PNG', 20, 50, 760, 300);
    pdf.save(`simulations-${simRange}m.pdf`);
  };

  const handleExportCSV = () => {
    const rows = [
      ['Month', 'Students Completed'],
      ...reportChartData.labels.map((label, i) => [
        label,
        String(reportChartData.values[i]),
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
        <PageHeader
          title={locale.dashboard.title}
          sub_text={locale.dashboard.subText}
        />

        {overviewStatus === 'loading' && (
          <div
            data-testid="overview-loading"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8 sm:mb-10"
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-2xl bg-gray-100 animate-pulse"
              />
            ))}
          </div>
        )}
        {overviewStatus === 'failed' && (
          <div
            data-testid="overview-error"
            className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"
          >
            {overviewError ??
              'Failed to load dashboard data. Please try again.'}
          </div>
        )}
        {overviewStatus === 'succeeded' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8 sm:mb-10 items-stretch">
            {progressMetrics.map((item, i) => (
              <ParticipationProgressCard key={i} {...item} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm min-w-0 overflow-hidden">
            <h3 className="text-base font-semibold mb-4">
              {locale.dashboard.aiSeats}
            </h3>

            <div className="flex justify-between text-base text-gray-700 mb-2">
              <span>{locale.dashboard.seatsUsed}</span>
              <span>{Math.round(aiSeatsPercentage)}%</span>
            </div>

            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-orange-500 transition-all"
                style={{ width: `${aiSeatsPercentage}%` }}
              />
            </div>

            <div className="text-sm text-gray-600 space-y-2">
              <div className="flex justify-between gap-4">
                <span className="flex items-center gap-2 min-w-0 truncate">
                  <img
                    src="/assets/dashboard/purchase.svg"
                    alt="purchased"
                    className="w-4 h-4 flex-shrink-0"
                  />
                  {locale.dashboard.purchased}
                </span>
                <span className="flex-shrink-0">{purchased}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="flex items-center gap-2 min-w-0 truncate">
                  <img
                    src="/assets/dashboard/bundled.svg"
                    alt="bundled"
                    className="w-4 h-4 flex-shrink-0"
                  />
                  {locale.dashboard.consumed}
                </span>
                <span className="flex-shrink-0">{consumed}</span>
              </div>
              <div className="flex justify-between gap-4 text-gray-900">
                <span className="min-w-0 truncate">
                  {locale.dashboard.remainingAiSeats}
                </span>
                <span className="flex-shrink-0">{remaining}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm min-w-0 overflow-hidden">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
              <h3 className="text-sm font-medium">
                {locale.dashboard.simulationCompleted}
              </h3>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  aria-label="Export PNG"
                  onClick={handleExportPNG}
                  className="w-7 h-7 cursor-pointer hover:opacity-80 flex-shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <img
                    src="/assets/sidebar/png.svg"
                    alt=""
                    className="w-full h-full"
                  />
                </button>
                <button
                  type="button"
                  aria-label="Export PDF"
                  onClick={handleExportPDF}
                  className="w-7 h-7 cursor-pointer hover:opacity-80 flex-shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <img
                    src="/assets/sidebar/pdf.svg"
                    alt=""
                    className="w-full h-full"
                  />
                </button>
                <button
                  type="button"
                  aria-label="Export CSV"
                  onClick={handleExportCSV}
                  className="w-7 h-7 cursor-pointer hover:opacity-80 flex-shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <img
                    src="/assets/sidebar/csv.svg"
                    alt=""
                    className="w-full h-full"
                  />
                </button>

                <div className="w-36 [&_button]:h-9 [&_button]:text-sm">
                  <SelectField
                    value={simRange}
                    options={[
                      { label: locale.dashboard.last3Months, value: '3' },
                      { label: locale.dashboard.last6Months, value: '6' },
                    ]}
                    onChange={(val) => setSimRange(val as SimRange)}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl sm:text-2xl font-bold text-gray-800 tabular-nums">
                {simCountStatus === 'loading' ? '—' : reportChartData.total}
              </span>
              <span className="text-sm text-gray-500">
                {locale.dashboard.totalCompletedSimulations}
              </span>
            </div>

            <div className="relative h-52 sm:h-60 w-full">
              {simCountStatus === 'failed' ? (
                <div
                  data-testid="sim-chart-error"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"
                >
                  {simCountError ??
                    'Failed to load simulation data. Please try again.'}
                </div>
              ) : simCountStatus !== 'loading' &&
                reportChartData.total === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <img
                    src="/assets/dashboard/empty-chart.svg"
                    alt=""
                    className="w-10 h-10 opacity-40"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                  <span className="text-sm">
                    {locale.dashboard.noSimulationData ??
                      'No simulation data available'}
                  </span>
                </div>
              ) : (
                <Bar
                  ref={chartRef}
                  data={{
                    labels: reportChartData.labels,
                    datasets: [
                      {
                        data: reportChartData.values,
                        backgroundColor: '#F97316',
                        hoverBackgroundColor: '#EA6C0A',
                        borderRadius: 6,
                        maxBarThickness: 48,
                      },
                    ],
                  }}
                  options={simulationOptions}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
