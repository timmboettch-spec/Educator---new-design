import { useMemo, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartOptions,
  type Plugin,
} from 'chart.js';
import { ChevronDown, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BrandedLoaderVisual from '../common/BrandedLoaderVisual';
import SelectField from '../ui/Select';
import { MultiSelect, type MultiSelectOption } from '../ui/MultiSelect';
import {
  useCompletionTrend,
  type ChartBar,
  type CompletionView,
} from '@/hooks/useCompletionTrend';
import {
  COMPLETION_TIMEFRAMES,
  type CompletionTimeframe,
} from '@/utils/completionTrend';
import {
  exportChartPdf,
  exportChartPng,
  exportCsv,
  toFileSlug,
} from '@/utils/chartExport';
import {
  CHART_ORANGE,
  COMPARE_SERIES_STYLES,
  getSeriesFill,
} from '@/utils/chartSeriesStyles';
import { cn } from '@/lib/utils';
import { useDashboardCardState } from '@/hooks/useDashboardCardState';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const MAX_NAMES_IN_SELECTION = 3;
// BE limit on schoolIds/classIds/studentIds array length.
const MAX_FILTER_ITEMS = 100;
const VIEWS: CompletionView[] = ['time', 'school'];
const MODES = ['total', 'compare'] as const;
const PILL_GROUP_CLASSES =
  'inline-flex shrink-0 items-center rounded-full bg-[#e9e9e9] p-0.5 text-xs font-semibold';
const PILL_BUTTON_CLASSES =
  'px-3 py-1 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 disabled:cursor-not-allowed';

// Paints a white canvas background so PNG/PDF exports aren't transparent.
const whiteBackground: Plugin<'bar'> = {
  id: 'whiteBackground',
  beforeDraw: (chart) => {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

// Relative heights (%) of the placeholder bars shown on a first load.
const SKELETON_BAR_HEIGHTS = [45, 70, 30, 85, 55, 40, 65, 25];

/** Faint bars rising from a baseline, so a first load already looks like a chart. */
function ChartSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="absolute inset-0 flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="flex flex-1 items-end justify-around gap-4 border-b border-gray-200 px-6">
        {SKELETON_BAR_HEIGHTS.map((height, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="w-full max-w-[48px] rounded-t-md bg-gray-200 animate-pulse"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}

const parseTimeframe = (value: string): CompletionTimeframe =>
  value === 'all' ? 'all' : (Number(value) as CompletionTimeframe);

const BREADCRUMB_BUTTON_CLASSES =
  'font-medium rounded hover:text-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';

const EXPORT_BUTTON_CLASSES =
  'inline-flex shrink-0 items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 transition-colors hover:bg-[#e9e9e9] hover:border-primary-500 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-300 disabled:hover:text-gray-700';

/**
 * Educator dashboard "Graphical Overview of Simulations Completed": completions per month
 * for the selected schools/classes/student codes, as one Total bar per month or, with
 * Compare, one bar per selected item side by side; or a Breakdown that drills from
 * schools to a school's classes to a class's students. Exportable as PNG/PDF/CSV.
 */
export function SimulationsCompletedChart() {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';
  const [open, setOpen] = useDashboardCardState('chart', true);
  const chartRef = useRef<ChartJS<'bar'> | null>(null);
  const trend = useCompletionTrend({
    locale,
    unassignedSchoolLabel: t('simulationsCompleted.unassignedSchool'),
    unknownStudentLabel: t('simulationsCompleted.unknownStudent'),
    enabled: open,
  });
  const { breakdown, compare } = trend;
  // Compare fills, made once (patterns are drawn on small canvases).
  const seriesFills = useMemo(
    () => COMPARE_SERIES_STYLES.map((style) => getSeriesFill(style)),
    []
  );

  const timeframeLabel = (tf: CompletionTimeframe) =>
    tf === 'all'
      ? t('simulationsCompleted.timeframes.all')
      : t('simulationsCompleted.timeframes.months', { count: tf });
  const currentTimeframeLabel = timeframeLabel(trend.timeframe);
  // Breakdown charts every school, so its filters are hidden and left out of exports.
  const isBreakdown = trend.view === 'school';
  // Which chart is shown: 'time', or the Breakdown level ('school' | 'class' | 'student').
  const chartKind = isBreakdown ? breakdown.level : 'time';

  // Short on-screen summary, e.g. "2 schools · 3 classes" or "All Classes".
  const summaryParts: string[] = [];
  if (trend.schools.selected.length > 0) {
    summaryParts.push(
      t('simulationsCompleted.summary.schools', {
        count: trend.schools.selected.length,
      })
    );
  }
  if (trend.classes.selected.length > 0) {
    summaryParts.push(
      t('simulationsCompleted.summary.classes', {
        count: trend.classes.selected.length,
      })
    );
  }
  if (trend.students.selected.length > 0) {
    summaryParts.push(
      t('simulationsCompleted.summary.students', {
        count: trend.students.selected.length,
      })
    );
  }
  const summary =
    summaryParts.length > 0
      ? summaryParts.join(' · ')
      : t('simulationsCompleted.summary.all');
  // With filters the subtitle gets long, so the controls move to their own row.
  const hasActiveFilters = !isBreakdown && summaryParts.length > 0;
  const subtitleText = t('simulationsCompleted.subtitle', {
    summary,
    total:
      trend.status === 'loading' ? '—' : trend.total.toLocaleString(locale),
  });

  // Full, named selection for exports and assistive tech.
  const describeNames = (items: MultiSelectOption[]) => {
    const names = items
      .slice(0, MAX_NAMES_IN_SELECTION)
      .map((o) => o.label)
      .join(', ');
    const extra = items.length - MAX_NAMES_IN_SELECTION;
    return extra > 0
      ? t('simulationsCompleted.selection.more', { names, count: extra })
      : names;
  };
  // Breakdown path, e.g. "All schools › Cedar Hollow › Biology 101".
  const breakdownPath = [
    t('simulationsCompleted.selection.allSchools'),
    breakdown.school?.name,
    breakdown.class?.name,
  ]
    .filter(Boolean)
    .join(' › ');
  const filtersText = isBreakdown
    ? breakdownPath
    : [
        trend.schools.selected.length > 0
          ? t('simulationsCompleted.selection.schools', {
              names: describeNames(trend.schools.selected),
            })
          : t('simulationsCompleted.selection.allSchools'),
        trend.classes.selected.length > 0
          ? t('simulationsCompleted.selection.classes', {
              names: describeNames(trend.classes.selected),
            })
          : t('simulationsCompleted.selection.allClasses'),
        trend.students.selected.length > 0
          ? t('simulationsCompleted.selection.students', {
              names: describeNames(trend.students.selected),
            })
          : t('simulationsCompleted.selection.allStudents'),
      ].join(' · ');
  const selectionText = `${filtersText} · ${currentTimeframeLabel}`;

  const exportTitle = t(`simulationsCompleted.exportTitles.${chartKind}`);
  const now = new Date();
  const fileName = (ext: 'png' | 'pdf' | 'csv') =>
    [
      t('simulationsCompleted.export.fileBase'),
      t(`simulationsCompleted.fileViews.${chartKind}`),
      toFileSlug(filtersText),
      toFileSlug(currentTimeframeLabel),
      now.toISOString().slice(0, 10),
    ].join('_') + `.${ext}`;

  const handleExportPng = () => {
    if (chartRef.current) exportChartPng(chartRef.current, fileName('png'));
  };
  const handleExportPdf = () => {
    if (!chartRef.current) return;
    exportChartPdf(chartRef.current, {
      title: exportTitle,
      lines: [
        selectionText,
        t('simulationsCompleted.export.generated', {
          date: now.toLocaleDateString(locale),
        }),
      ],
      fileName: fileName('pdf'),
    });
  };
  const handleExportCsv = () => {
    const csvTotal = t('simulationsCompleted.export.csvTotal');
    // Compare: a column per compared item, then the month's total.
    const tableRows =
      trend.series.length > 0
        ? [
            [
              t(`simulationsCompleted.csvColumns.${chartKind}`),
              ...trend.series.map((s) => s.label),
              csvTotal,
            ],
            ...trend.bars.map((b, i) => [
              b.label,
              ...trend.series.map((s) => s.counts[i] ?? 0),
              b.count,
            ]),
            [
              csvTotal,
              ...trend.series.map((s) =>
                s.counts.reduce((sum, count) => sum + count, 0)
              ),
              trend.total,
            ],
          ]
        : [
            [
              t(`simulationsCompleted.csvColumns.${chartKind}`),
              t('simulationsCompleted.export.csvCount'),
            ],
            ...trend.bars.map((b) => [b.label, b.count]),
            [csvTotal, trend.total],
          ];
    exportCsv(
      [
        [t('simulationsCompleted.csvView'), exportTitle],
        [t('simulationsCompleted.export.csvSelection'), filtersText],
        [t('simulationsCompleted.export.csvTimeframe'), currentTimeframeLabel],
        [
          t('simulationsCompleted.export.csvGenerated'),
          now.toLocaleDateString(locale),
        ],
        [],
        ...tableRows,
      ],
      fileName('csv')
    );
  };

  const exportsDisabled = trend.status !== 'ready';
  const exportButtons = [
    {
      format: 'png',
      label: t('simulationsCompleted.export.png'),
      onClick: handleExportPng,
    },
    {
      format: 'pdf',
      label: t('simulationsCompleted.export.pdf'),
      onClick: handleExportPdf,
    },
    {
      format: 'csv',
      label: t('simulationsCompleted.export.csv'),
      onClick: handleExportCsv,
    },
  ];

  // The chart on screen is a Compare chart (also while it reloads, faded).
  const isComparisonShown =
    (trend.status === 'loading' ? trend.previousSeries : trend.series).length >
    0;

  const barAt = (index: number | undefined): ChartBar | undefined =>
    index === undefined ? undefined : trend.bars[index];

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    // Breakdown: clicking a school or class bar drills into it.
    onClick: (_event, elements) => {
      const bar = barAt(elements[0]?.index);
      if (bar) breakdown.drillInto(bar);
    },
    onHover: (event, elements) => {
      const target = event.native?.target;
      if (!(target instanceof HTMLElement)) return;
      const bar = barAt(elements[0]?.index);
      target.style.cursor =
        bar && breakdown.canDrillInto(bar) ? 'pointer' : 'default';
    },
    plugins: {
      // Compare: the legend names each item's bars (bottom, as in the design).
      legend: {
        display: isComparisonShown,
        position: 'bottom',
        labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? '',
          label: (item) => {
            const count = Number(item.parsed.y ?? 0);
            if (isComparisonShown) {
              return ` ${t('simulationsCompleted.compareTooltip', {
                name: item.dataset.label,
                count,
              })}`;
            }
            if (!isBreakdown) {
              return ` ${t('simulationsCompleted.tooltip', { count })}`;
            }
            const bar = barAt(item.dataIndex);
            return ` ${
              bar && breakdown.canDrillInto(bar)
                ? t('simulationsCompleted.breakdownTooltip.drill', { count })
                : t('simulationsCompleted.breakdownTooltip.count', { count })
            }`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      // Whole steps, every one labelled (as in the design).
      y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
    },
  };

  // While the next chart loads, the previous one stays on screen (faded).
  const isRefreshing =
    trend.status === 'loading' && trend.previousBars !== null;
  const chartBars = isRefreshing ? (trend.previousBars ?? []) : trend.bars;
  const chartSeries = isRefreshing ? trend.previousSeries : trend.series;
  const data = {
    labels: chartBars.map((b) => b.label),
    datasets:
      chartSeries.length > 0
        ? chartSeries.map((s, i) => {
            const style =
              COMPARE_SERIES_STYLES[i % COMPARE_SERIES_STYLES.length];
            return {
              label: s.label,
              data: s.counts,
              backgroundColor: seriesFills[i % seriesFills.length],
              hoverBackgroundColor: style?.color,
              borderColor: style?.color,
              borderWidth: style?.fill === 'solid' ? 0 : 1.5,
              borderRadius: 4,
              maxBarThickness: 26,
            };
          })
        : [
            {
              label: t('simulationsCompleted.axisLabel'),
              data: chartBars.map((b) => b.count),
              backgroundColor: CHART_ORANGE,
              borderRadius: 6,
              maxBarThickness: trend.view === 'time' ? 36 : 48,
            },
          ],
  };

  const filterFields = [
    { kind: 'school', filter: trend.schools },
    { kind: 'class', filter: trend.classes },
    { kind: 'student', filter: trend.students },
  ] as const;

  const viewToggle = (
    <div
      role="group"
      aria-label={t('simulationsCompleted.views.label')}
      className={PILL_GROUP_CLASSES}
    >
      {VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={trend.view === view}
          onClick={() => trend.setView(view)}
          className={cn(
            PILL_BUTTON_CLASSES,
            trend.view === view ? 'bg-primary-500 text-white' : 'text-[#5f6060]'
          )}
        >
          {t(`simulationsCompleted.views.${view}`)}
        </button>
      ))}
    </div>
  );

  // Past the limit Compare can't be turned on; the hint says why.
  const compareLimitId = 'simulations-completed-compare-limit';
  const compareLimitText =
    compare.level &&
    t('simulationsCompleted.compareLimit', {
      count: compare.maxItems,
      noun: t(`simulationsCompleted.filters.${compare.level}Noun`, {
        count: compare.maxItems,
      }),
    });
  const modeToggle = compare.canShow && (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label={t('simulationsCompleted.modes.label')}
        className={PILL_GROUP_CLASSES}
      >
        {MODES.map((mode) => {
          const isCompareMode = mode === 'compare';
          const isActive = isCompareMode ? compare.isOn : !compare.isOn;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={isActive}
              disabled={isCompareMode && compare.isBlocked}
              aria-describedby={
                isCompareMode && compare.isBlocked ? compareLimitId : undefined
              }
              onClick={() => compare.setOn(isCompareMode)}
              className={cn(
                PILL_BUTTON_CLASSES,
                isActive ? 'bg-primary-500 text-white' : 'text-[#5f6060]'
              )}
            >
              {t(`simulationsCompleted.modes.${mode}`)}
            </button>
          );
        })}
      </div>
      {compare.isBlocked && (
        <span id={compareLimitId} className="text-xs text-gray-500">
          {compareLimitText}
        </span>
      )}
    </div>
  );

  const timeframeSelect = (
    <div
      role="group"
      aria-label={t('simulationsCompleted.filters.timeframeLabel')}
      className="w-36 shrink-0 [&_button]:h-9 [&_button]:text-sm"
    >
      <SelectField
        value={String(trend.timeframe)}
        options={COMPLETION_TIMEFRAMES.map((tf) => ({
          label: timeframeLabel(tf),
          value: String(tf),
        }))}
        onChange={(value) => trend.setTimeframe(parseTimeframe(value))}
      />
    </div>
  );

  const exportControls = (
    <>
      {exportButtons.map((b) => (
        <button
          key={b.format}
          type="button"
          onClick={b.onClick}
          disabled={exportsDisabled}
          aria-label={t('simulationsCompleted.export.aria', {
            format: b.label,
          })}
          className={EXPORT_BUTTON_CLASSES}
        >
          <Download size={14} aria-hidden="true" />
          {b.label}
        </button>
      ))}
    </>
  );

  return (
    <section className="mx-3 sm:mx-5 mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-w-0">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 min-h-[44px] text-left hover:bg-[#e9e9e9]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
      >
        <h2 className="text-sm sm:text-base font-semibold text-gray-800 m-0">
          {t('simulationsCompleted.overviewTitle')}
        </h2>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className={cn(
            'text-gray-500 shrink-0 transition-transform duration-200',
            !open && '-rotate-90'
          )}
        />
      </button>

      {open && (
        <div className="px-3 sm:px-5 pb-5 pt-4 border-t border-gray-100">
          <div
            className={cn(
              'mb-4 flex flex-wrap items-center justify-between gap-3',
              !hasActiveFilters && 'xl:flex-nowrap'
            )}
          >
            <div className="min-w-0 xl:flex-1 xl:min-w-[10rem]">
              <h3 className="text-sm sm:text-base font-semibold text-gray-800 truncate">
                {t('simulationsCompleted.title')}
              </h3>
              {isBreakdown ? (
                <nav
                  aria-label={t('simulationsCompleted.breakdownSubtitle.label')}
                  className="flex flex-wrap items-center gap-1 text-xs sm:text-sm text-gray-500"
                >
                  {breakdown.school ? (
                    <button
                      type="button"
                      onClick={() => breakdown.drillToLevel('school')}
                      className={BREADCRUMB_BUTTON_CLASSES}
                    >
                      {t('simulationsCompleted.breakdownSubtitle.allSchools')}
                    </button>
                  ) : (
                    <span className="font-medium" aria-current="page">
                      {t('simulationsCompleted.breakdownSubtitle.allSchools')}
                    </span>
                  )}
                  {breakdown.school && (
                    <>
                      <span aria-hidden="true">›</span>
                      {breakdown.class ? (
                        <button
                          type="button"
                          onClick={() => breakdown.drillToLevel('class')}
                          className={BREADCRUMB_BUTTON_CLASSES}
                        >
                          {breakdown.school.name}
                        </button>
                      ) : (
                        <span
                          className="font-medium text-gray-700"
                          aria-current="page"
                        >
                          {breakdown.school.name}
                        </span>
                      )}
                    </>
                  )}
                  {breakdown.class && (
                    <>
                      <span aria-hidden="true">›</span>
                      <span
                        className="font-medium text-gray-700"
                        aria-current="page"
                      >
                        {breakdown.class.name}
                      </span>
                    </>
                  )}
                  <span className="ml-1">
                    {t(
                      `simulationsCompleted.breakdownSubtitle.${breakdown.level}`
                    )}
                  </span>
                </nav>
              ) : (
                <p
                  title={subtitleText}
                  className="text-xs sm:text-sm text-gray-500 tabular-nums truncate"
                >
                  {subtitleText}
                </p>
              )}
            </div>
            <div
              className={cn(
                'flex flex-wrap items-center gap-2',
                hasActiveFilters
                  ? 'w-full'
                  : 'sm:justify-end xl:flex-nowrap xl:min-w-0'
              )}
            >
              {viewToggle}
              {modeToggle}
              {!isBreakdown &&
                filterFields.map(({ kind, filter }) => (
                  <MultiSelect
                    key={kind}
                    className="w-40 sm:w-48 xl:min-w-[7.5rem] [&>button]:h-[38px]"
                    label={t(`simulationsCompleted.filters.${kind}Label`)}
                    placeholder={t(
                      `simulationsCompleted.filters.${kind}Placeholder`
                    )}
                    summaryNoun={(count) =>
                      t(`simulationsCompleted.filters.${kind}Noun`, { count })
                    }
                    options={filter.options}
                    selected={filter.selected}
                    onChange={filter.onChange}
                    searchValue={filter.search}
                    onSearchChange={filter.onSearchChange}
                    loading={filter.loading}
                    error={
                      filter.error
                        ? t('simulationsCompleted.filters.loadError')
                        : undefined
                    }
                    // While comparing, the compared filter is capped at what Compare draws.
                    maxSelected={
                      compare.isOn && compare.level === kind
                        ? compare.maxItems
                        : MAX_FILTER_ITEMS
                    }
                    hasMore={filter.hasMore}
                  />
                ))}
              {timeframeSelect}
              {exportControls}
            </div>
          </div>

          <div className="relative h-[320px] w-full">
            {trend.status === 'loading' && !isRefreshing && (
              <ChartSkeleton label={t('simulationsCompleted.loading')} />
            )}
            {isRefreshing && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-40 pointer-events-none transition-opacity"
                >
                  <Bar
                    data={data}
                    options={{ ...options, animation: false, events: [] }}
                  />
                </div>
                <div
                  role="status"
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="sr-only">
                    {t('simulationsCompleted.loading')}
                  </span>
                  <BrandedLoaderVisual />
                </div>
              </>
            )}
            {trend.status === 'failed' && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 text-center">
                {t('simulationsCompleted.error')}
              </div>
            )}
            {trend.status === 'empty' && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 text-center px-4">
                {t('simulationsCompleted.empty')}
              </div>
            )}
            {trend.status === 'ready' && (
              <>
                <Bar
                  ref={chartRef}
                  data={data}
                  options={options}
                  plugins={[whiteBackground]}
                  aria-label={t('simulationsCompleted.chartAria', {
                    selection: `${exportTitle} · ${selectionText}`,
                  })}
                  role="img"
                />
                {/* Text version of the chart. In Breakdown its school/class rows are
                    buttons, so keyboard users can drill in too; the list shows while
                    one of them has focus. */}
                <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:inset-x-0 focus-within:bottom-0 focus-within:z-10 focus-within:max-h-full focus-within:overflow-y-auto focus-within:rounded-xl focus-within:border focus-within:border-gray-200 focus-within:bg-white focus-within:p-3 focus-within:text-sm focus-within:shadow-md">
                  <p>
                    {t('simulationsCompleted.summaryHeading', {
                      selection: selectionText,
                    })}
                  </p>
                  <ul>
                    {trend.series.length > 0
                      ? trend.bars.map((b, i) => (
                          <li key={b.key}>
                            {t('simulationsCompleted.compareSummaryRow', {
                              month: b.label,
                              values: trend.series
                                .map((s) => `${s.label} ${s.counts[i] ?? 0}`)
                                .join(', '),
                              total: b.count,
                            })}
                          </li>
                        ))
                      : trend.bars.map((b) =>
                          breakdown.canDrillInto(b) ? (
                            <li key={b.key}>
                              <button
                                type="button"
                                onClick={() => breakdown.drillInto(b)}
                                className="rounded text-left hover:text-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                              >
                                {t('simulationsCompleted.drillButton', {
                                  name: b.label,
                                  count: b.count,
                                })}
                              </button>
                            </li>
                          ) : (
                            <li key={b.key}>
                              {b.label}: {b.count}
                            </li>
                          )
                        )}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
