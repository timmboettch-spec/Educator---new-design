import { forwardRef, useImperativeHandle } from 'react';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Who's signed in, for the per-person collapsed state (none by default).
const mockCardUser = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));
vi.mock('@/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/storage')>()),
  getParsedUser: () => mockCardUser.current,
}));

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

const chartStub = { toBase64Image: vi.fn(() => 'data:image/png;base64,AAA') };

// The latest chart options, so tests can click a bar through Chart.js' onClick.
const chartOptions = vi.hoisted(() => ({
  current: null as null | {
    onClick?: (event: unknown, elements: { index: number }[]) => void;
    plugins?: {
      legend?: { display?: boolean };
      tooltip?: {
        callbacks?: {
          label?: (item: {
            parsed: { y: number };
            dataIndex: number;
            dataset: { label: string };
          }) => string;
        };
      };
    };
    scales?: { y?: { ticks?: { stepSize?: number } } };
  },
}));

vi.mock('react-chartjs-2', () => ({
  Bar: forwardRef(function BarMock(
    props: {
      data: {
        labels: string[];
        datasets: { label: string; data: number[] }[];
      };
      options: (typeof chartOptions)['current'];
    },
    ref
  ) {
    useImperativeHandle(ref, () => chartStub);
    chartOptions.current = props.options;
    return (
      <div
        data-testid="bar-chart"
        data-labels={props.data.labels.join('|')}
        data-values={props.data.datasets[0]?.data.join('|')}
        data-datasets={JSON.stringify(
          props.data.datasets.map((d) => ({ label: d.label, data: d.data }))
        )}
        data-legend={String(props.options?.plugins?.legend?.display ?? false)}
      />
    );
  }),
}));

const exportMocks = vi.hoisted(() => ({
  exportChartPng: vi.fn(),
  exportChartPdf: vi.fn(),
  exportCsv: vi.fn(),
}));

vi.mock('../../../src/components/common/BrandedLoaderVisual', () => ({
  default: () => <div data-testid="branded-loader" />,
}));

vi.mock('../../../src/utils/chartExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/utils/chartExport')>()),
  ...exportMocks,
}));

import { store } from '../../../src/store';
import { classesApi } from '../../../src/redux/api/classes/classesApi';
import { studentsApi } from '../../../src/redux/api/students/studentsApi';
import { SimulationsCompletedChart } from '../../../src/components/dashboard/SimulationsCompletedChart';
import { renderWithProviders } from '../../../src/test/testUtils';

const meta = (total: number) => ({
  total,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
});

const now = new Date();
const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };

const GRAPH = '/api/classes/user/simulations-completed-graph';
type Params = Record<string, unknown>;
const callsTo = (url: string) =>
  apiRequest.mock.calls
    .map(([args]) => args as { url: string; params: Params })
    .filter((args) => args.url === url);
const lastParams = (url: string) => callsTo(url).at(-1)?.params;

const firstCall = <T,>(calls: T[]): T => {
  const [call] = calls;
  if (!call) throw new Error('expected the mock to have been called');
  return call;
};

let graphResponse: (params?: Params) => Promise<unknown>;

beforeEach(() => {
  localStorage.clear();
  mockCardUser.current = null;
  apiRequest.mockReset();
  Object.values(exportMocks).forEach((fn) => fn.mockClear());
  store.dispatch(classesApi.util.resetApiState());
  store.dispatch(studentsApi.util.resetApiState());
  graphResponse = () =>
    Promise.resolve({
      data: {
        message: 'ok',
        data: {
          byMonth: [{ ...thisMonth, count: 298 }],
          bySchool: [
            { schoolId: 'sch-1', count: 200 },
            { schoolId: null, count: 98 },
          ],
        },
      },
    });
  apiRequest.mockImplementation((args: { url: string }) => {
    if (args.url === GRAPH)
      return graphResponse((args as { params?: Params }).params ?? {});
    if (args.url === '/api/classes/schools') {
      return Promise.resolve({
        data: {
          message: 'ok',
          data: [
            { schoolId: 'sch-1', schoolName: 'Cedar Hollow', classCount: 3 },
            {
              schoolId: null,
              schoolName: 'Classes without a school',
              classCount: 1,
            },
          ],
          meta: meta(2),
        },
      });
    }
    if (args.url === '/api/classes') {
      return Promise.resolve({
        data: {
          message: 'ok',
          data: [
            { classId: 'c1', className: 'Biology 101' },
            { classId: 'c2', className: 'Chemistry 202' },
          ],
          meta: meta(2),
        },
      });
    }
    if (args.url === '/api/students') {
      return Promise.resolve({
        data: {
          message: 'ok',
          data: [{ id: 's1', studentId: 'STU-1', name: 'Ava Thompson' }],
          meta: meta(1),
        },
      });
    }
    return Promise.reject(new Error(`unexpected ${args.url}`));
  });
});

const exportButton = (format: string) =>
  screen.getByRole('button', { name: `Export chart as ${format}` });

// Options can be refetching (e.g. students after a class change), so wait for the one wanted.
const pickOption = async (filter: RegExp, option: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: filter }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
  fireEvent.mouseDown(document.body);
};

const renderChart = async () => {
  renderWithProviders(<SimulationsCompletedChart />);
  return screen.findByTestId('bar-chart');
};

describe('SimulationsCompletedChart – layout and states', () => {
  it('opens collapsed when this person last collapsed it', () => {
    mockCardUser.current = { id: 'educator-1' };
    localStorage.setItem(
      'rwai_dashboard_cards:educator-1',
      JSON.stringify({ chart: false })
    );
    renderWithProviders(<SimulationsCompletedChart />);

    expect(
      screen.getByRole('button', {
        name: 'Graphical Overview of Simulations Completed',
      })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('bar-chart')).toBeNull();
  });

  it('renders the collapsible overview, open by default, with the summary subtitle', async () => {
    await renderChart();

    expect(
      screen.getByRole('button', {
        name: 'Graphical Overview of Simulations Completed',
      })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('heading', { name: 'Simulations Completed' })
    ).toBeInTheDocument();
    expect(screen.getByText('All Classes · 298 total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Over Time' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /^Schools/ })).toHaveTextContent(
      'All Schools'
    );
    expect(
      screen.getByRole('button', { name: /^Student codes/ })
    ).toHaveTextContent('All Student Codes');
  });

  it('defaults to the last 12 months', async () => {
    const chart = await renderChart();
    expect(chart.dataset.labels?.split('|')).toHaveLength(12);
    expect(chart.dataset.values?.split('|').at(-1)).toBe('298');
    expect(lastParams(GRAPH)).toEqual({ months: 12 });
    ['PNG', 'PDF', 'CSV'].forEach((f) => expect(exportButton(f)).toBeEnabled());
  });

  it('announces loading, shows a dash for the total, and disables exports', () => {
    graphResponse = () => new Promise(() => {});
    renderWithProviders(<SimulationsCompletedChart />);

    expect(screen.getByRole('status').textContent).toContain(
      'Loading simulations completed…'
    );
    expect(screen.getByText('All Classes · — total')).toBeInTheDocument();
    ['PNG', 'PDF', 'CSV'].forEach((f) =>
      expect(exportButton(f)).toBeDisabled()
    );
  });

  it('shows the empty message when nothing was completed', async () => {
    graphResponse = () =>
      Promise.resolve({
        data: { message: 'ok', data: { byMonth: [], bySchool: [] } },
      });
    renderWithProviders(<SimulationsCompletedChart />);

    expect(
      await screen.findByText('No simulations completed in this period yet.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    ['PNG', 'PDF', 'CSV'].forEach((f) =>
      expect(exportButton(f)).toBeDisabled()
    );
  });

  it('shows a friendly error when the graph request fails', async () => {
    graphResponse = () =>
      Promise.reject({ response: { status: 500, data: 'boom' } });
    renderWithProviders(<SimulationsCompletedChart />);

    expect(
      await screen.findByText(
        "We couldn't load simulations completed right now. Please try again."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('collapses without new requests and keeps the selection when reopened', async () => {
    await renderChart();
    await pickOption(/^Classes/, /Biology 101/);
    await waitFor(() =>
      expect(lastParams(GRAPH)).toEqual({ classIds: ['c1'], months: 12 })
    );
    await screen.findByText('1 class · 298 total');

    const toggle = screen.getByRole('button', {
      name: 'Graphical Overview of Simulations Completed',
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('heading', { name: 'Simulations Completed' })
    ).not.toBeInTheDocument();
    const requestsWhileClosed = apiRequest.mock.calls.length;

    fireEvent.click(toggle);
    expect(await screen.findByText('1 class · 298 total')).toBeInTheDocument();
    // Reopening reuses the cached queries for the same selection.
    expect(apiRequest.mock.calls.length).toBe(requestsWhileClosed);
  });
});

describe('SimulationsCompletedChart – filters', () => {
  it('loads options from the school groups and lite endpoints', async () => {
    await renderChart();

    expect(callsTo('/api/classes/schools')[0]?.params).toMatchObject({
      page: 1,
      pageSize: 50,
    });
    expect(callsTo('/api/classes')[0]?.params).toMatchObject({
      lite: true,
      pageSize: 50,
      sortBy: 'class_name',
    });
    expect(callsTo('/api/students')[0]?.params).toMatchObject({
      lite: true,
      pageSize: 50,
    });
  });

  it('leaves the unassigned school group out of the school filter', async () => {
    await renderChart();
    fireEvent.click(screen.getByRole('button', { name: /^Schools/ }));
    expect(
      screen.getByRole('option', { name: /Cedar Hollow/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Classes without a school/ })
    ).not.toBeInTheDocument();
  });

  it('searches schools on the server', async () => {
    await renderChart();
    fireEvent.click(screen.getByRole('button', { name: /^Schools/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search…' }), {
      target: { value: 'Cedar' },
    });

    await waitFor(() =>
      expect(lastParams('/api/classes/schools')).toEqual({
        page: 1,
        pageSize: 50,
        schoolName: 'Cedar',
      })
    );
  });

  it('tells the user to search when a dropdown has more pages', async () => {
    const baseImpl = apiRequest.getMockImplementation();
    apiRequest.mockImplementation((args: { url: string }) =>
      args.url === '/api/classes'
        ? Promise.resolve({
            data: {
              message: 'ok',
              data: [{ classId: 'c1', className: 'Biology 101' }],
              meta: { ...meta(120), totalPages: 3, hasNextPage: true },
            },
          })
        : baseImpl?.(args)
    );

    await renderChart();
    fireEvent.click(screen.getByRole('button', { name: /^Classes/ }));
    expect(
      await screen.findByText(
        'Showing the first results. Type to search for more.'
      )
    ).toBeInTheDocument();
  });

  it('shows a load error in a dropdown whose options failed to load', async () => {
    const defaultImpl = apiRequest.getMockImplementation();
    apiRequest.mockImplementation((args: { url: string }) =>
      args.url === '/api/classes'
        ? Promise.reject({ response: { status: 403, data: 'nope' } })
        : defaultImpl?.(args)
    );
    await renderChart();

    fireEvent.click(screen.getByRole('button', { name: /^Classes/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load these options. Please try again."
    );
  });

  it('labels student options by code with the name underneath', async () => {
    await renderChart();
    fireEvent.click(screen.getByRole('button', { name: /^Student codes/ }));
    expect(
      screen.getByRole('option', { name: /STU-1\s*Ava Thompson/ })
    ).toBeInTheDocument();
  });

  it('schools narrow classes and students and clear them; classes clear students', async () => {
    await renderChart();

    await pickOption(/^Classes/, /Biology 101/);
    await pickOption(/^Student codes/, /STU-1/);
    await waitFor(() =>
      expect(lastParams(GRAPH)).toEqual({
        classIds: ['c1'],
        studentIds: ['s1'],
        months: 12,
      })
    );

    await pickOption(/^Schools/, /Cedar Hollow/);
    await waitFor(() =>
      expect(lastParams(GRAPH)).toEqual({ schoolIds: ['sch-1'], months: 12 })
    );
    expect(lastParams('/api/classes')).toMatchObject({ schoolIds: ['sch-1'] });
    expect(lastParams('/api/students')).toMatchObject({
      schoolIds: ['sch-1'],
    });
    expect(await screen.findByText('1 school · 298 total')).toBeInTheDocument();

    await pickOption(/^Classes/, /Chemistry 202/);
    await waitFor(() =>
      expect(lastParams('/api/students')).toMatchObject({
        schoolIds: ['sch-1'],
        classIds: ['c2'],
      })
    );
  });

  it('clears a filter from its box with Clear', async () => {
    await renderChart();
    await pickOption(/^Classes/, /Biology 101/);
    expect(await screen.findByText(/^1 class ·/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Classes' }));
    // Back to the unfiltered chart (served from the cache, no new request needed).
    expect(
      await screen.findByText('All Classes · 298 total')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Classes/ })).toHaveTextContent(
      'All Classes'
    );
  });

  it('sends months or allTime for the chosen timeframe', async () => {
    await renderChart();

    fireEvent.click(screen.getByRole('button', { name: /Last 12 Months/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Last 3 Months' }));
    await waitFor(() => expect(lastParams(GRAPH)).toEqual({ months: 3 }));

    fireEvent.click(screen.getByRole('button', { name: /Last 3 Months/ }));
    fireEvent.click(screen.getByRole('option', { name: 'All Time' }));
    await waitFor(() => expect(lastParams(GRAPH)).toEqual({ allTime: true }));
  });
});

describe('SimulationsCompletedChart – breakdown', () => {
  it('shows one bar per school, naming the unassigned bucket', async () => {
    await renderChart();
    fireEvent.click(screen.getByRole('button', { name: 'Breakdown' }));

    const chart = await screen.findByTestId('bar-chart');
    expect(chart.dataset.labels).toBe('Cedar Hollow|Classes without a school');
    expect(chart.dataset.values).toBe('200|98');
    expect(screen.getByRole('button', { name: 'Breakdown' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('hides the school, class and student filters and shows the breakdown subtitle', async () => {
    await renderChart();
    fireEvent.click(screen.getByRole('button', { name: 'Breakdown' }));
    await screen.findByTestId('bar-chart');

    expect(screen.getByText('All Schools')).toBeInTheDocument();
    expect(screen.getByText('· by school')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Schools/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Classes/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Student codes/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Last 12 Months/ })
    ).toBeInTheDocument();
    expect(exportButton('CSV')).toBeEnabled();
  });

  it('charts every school, then restores the selection back in Over Time', async () => {
    const unfiltered = graphResponse;
    const biologyOnly = () =>
      Promise.resolve({
        data: {
          message: 'ok',
          data: {
            byMonth: [{ ...thisMonth, count: 12 }],
            bySchool: [{ schoolId: 'sch-1', count: 12 }],
          },
        },
      });
    graphResponse = () =>
      lastParams(GRAPH)?.classIds ? biologyOnly() : unfiltered();

    await renderChart();
    await pickOption(/^Classes/, /Biology 101/);
    expect(await screen.findByText('1 class · 12 total')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Breakdown' }));
    await waitFor(() =>
      expect(screen.getByTestId('bar-chart').dataset.values).toBe('200|98')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Over Time' }));
    expect(await screen.findByText('1 class · 12 total')).toBeInTheDocument();
  });

  it('exports a school table in breakdown', async () => {
    await renderChart();
    fireEvent.click(screen.getByRole('button', { name: 'Breakdown' }));
    await screen.findByTestId('bar-chart');
    fireEvent.click(exportButton('CSV'));

    const [rows, fileName] = firstCall(exportMocks.exportCsv.mock.calls);
    expect(rows[0]).toEqual(['View', 'Simulations Completed by School']);
    expect(rows[1]).toEqual(['Selection', 'All schools']);
    expect(rows[5]).toEqual(['School', 'Simulations Completed']);
    expect(rows.slice(6)).toEqual([
      ['Cedar Hollow', 200],
      ['Classes without a school', 98],
      ['Total', 298],
    ]);
    expect(fileName).toMatch(/^simulations-completed_by-school_/);
  });
});

describe('SimulationsCompletedChart – breakdown drill-down', () => {
  beforeEach(() => {
    graphResponse = () => {
      const params = lastParams(GRAPH) ?? {};
      if (params.forClass === 'c1') {
        return Promise.resolve({
          data: {
            message: 'ok',
            data: {
              byMonth: [{ ...thisMonth, count: 15 }],
              byStudent: [
                { studentId: 's1', studentCode: 'MED-2F3H', count: 15 },
                { studentId: 's2', studentCode: null, count: 0 },
              ],
            },
          },
        });
      }
      if (params.forSchool === 'sch-1') {
        return Promise.resolve({
          data: {
            message: 'ok',
            data: {
              byMonth: [{ ...thisMonth, count: 18 }],
              byClass: [
                { classId: 'c1', className: 'Biology 101', count: 15 },
                { classId: 'c2', className: 'Chemistry 202', count: 3 },
              ],
            },
          },
        });
      }
      return Promise.resolve({
        data: {
          message: 'ok',
          data: {
            byMonth: [{ ...thisMonth, count: 298 }],
            bySchool: [
              { schoolId: 'sch-1', count: 200 },
              { schoolId: null, count: 98 },
            ],
          },
        },
      });
    };
  });

  const clickBar = (index: number) =>
    act(() => chartOptions.current?.onClick?.({}, [{ index }]));

  const openBreakdown = async () => {
    await renderChart();
    fireEvent.click(screen.getByRole('button', { name: 'Breakdown' }));
    await waitFor(() =>
      expect(screen.getByTestId('bar-chart').dataset.values).toBe('200|98')
    );
  };

  const breadcrumb = () =>
    screen.getByRole('navigation', { name: 'Breakdown level' });

  it('clicking a school bar shows its classes, then a class bar its students', async () => {
    await openBreakdown();

    clickBar(0);
    await waitFor(() =>
      expect(screen.getByTestId('bar-chart').dataset.labels).toBe(
        'Biology 101|Chemistry 202'
      )
    );
    expect(lastParams(GRAPH)).toEqual({ forSchool: 'sch-1', months: 12 });
    expect(within(breadcrumb()).getByText('Cedar Hollow')).toBeInTheDocument();
    expect(within(breadcrumb()).getByText('· by class')).toBeInTheDocument();

    clickBar(0);
    await waitFor(() =>
      expect(screen.getByTestId('bar-chart').dataset.labels).toBe(
        'MED-2F3H|No student code'
      )
    );
    expect(lastParams(GRAPH)).toEqual({ forClass: 'c1', months: 12 });
    expect(within(breadcrumb()).getByText('Biology 101')).toBeInTheDocument();
    expect(within(breadcrumb()).getByText('· by student')).toBeInTheDocument();

    // Students are the last level.
    const callsBefore = callsTo(GRAPH).length;
    clickBar(0);
    expect(callsTo(GRAPH)).toHaveLength(callsBefore);
  });

  it('keeps the timeframe while drilling', async () => {
    await openBreakdown();
    fireEvent.click(screen.getByRole('button', { name: /Last 12 Months/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'All Time' }));
    await waitFor(() => expect(lastParams(GRAPH)).toEqual({ allTime: true }));
    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    );

    clickBar(0);
    await waitFor(() =>
      expect(lastParams(GRAPH)).toEqual({ forSchool: 'sch-1', allTime: true })
    );
  });

  it('keeps the previous chart, faded, while the next level loads', async () => {
    await openBreakdown();
    let finishClasses: (value: unknown) => void = () => {};
    const schools = graphResponse;
    graphResponse = () =>
      lastParams(GRAPH)?.forSchool
        ? new Promise((resolve) => {
            finishClasses = resolve;
          })
        : schools();

    clickBar(0);
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'Loading simulations completed'
    );
    // The app's branded loader, inside the chart area only.
    expect(
      within(screen.getByRole('status')).getByTestId('branded-loader')
    ).toBeInTheDocument();
    // Still the school bars, not a blank block; clicks are ignored meanwhile.
    expect(screen.getByTestId('bar-chart').dataset.values).toBe('200|98');
    const callsBefore = callsTo(GRAPH).length;
    clickBar(0);
    expect(callsTo(GRAPH)).toHaveLength(callsBefore);

    finishClasses({
      data: {
        message: 'ok',
        data: {
          byMonth: [],
          byClass: [{ classId: 'c1', className: 'Biology 101', count: 15 }],
        },
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('bar-chart').dataset.labels).toBe('Biology 101')
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows placeholder bars on a first load', async () => {
    graphResponse = () => new Promise(() => {});
    renderWithProviders(<SimulationsCompletedChart />);
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'Loading simulations completed'
    );
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('does not drill into the classes-without-a-school bar', async () => {
    await openBreakdown();
    const callsBefore = callsTo(GRAPH).length;
    clickBar(1);
    expect(callsTo(GRAPH)).toHaveLength(callsBefore);
    expect(within(breadcrumb()).getByText('All Schools')).not.toHaveAttribute(
      'type'
    );
  });

  it('drills in from the keyboard through the chart summary list', async () => {
    await openBreakdown();
    expect(
      screen.queryByRole('button', { name: /Classes without a school/ })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Cedar Hollow: 200 — show details' })
    );
    expect(
      await screen.findByRole('button', {
        name: 'Biology 101: 15 — show details',
      })
    ).toBeInTheDocument();
  });

  it('goes back up through the breadcrumb', async () => {
    await openBreakdown();
    clickBar(0);
    await waitFor(() =>
      expect(screen.getByTestId('bar-chart').dataset.labels).toBe(
        'Biology 101|Chemistry 202'
      )
    );
    clickBar(0);
    await screen.findByText('· by student');

    fireEvent.click(
      within(breadcrumb()).getByRole('button', { name: 'Cedar Hollow' })
    );
    await waitFor(() =>
      expect(screen.getByTestId('bar-chart').dataset.labels).toBe(
        'Biology 101|Chemistry 202'
      )
    );

    fireEvent.click(
      within(breadcrumb()).getByRole('button', { name: 'All Schools' })
    );
    await waitFor(() =>
      expect(screen.getByTestId('bar-chart').dataset.values).toBe('200|98')
    );
  });

  it('starts again from every school when Breakdown is reopened', async () => {
    await openBreakdown();
    clickBar(0);
    await screen.findByText('· by class');

    fireEvent.click(screen.getByRole('button', { name: 'Over Time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Breakdown' }));
    expect(await screen.findByText('· by school')).toBeInTheDocument();
  });

  it('exports the drilled level with its path', async () => {
    await openBreakdown();
    clickBar(0);
    await screen.findByText('· by class');
    await waitFor(() => expect(exportButton('CSV')).toBeEnabled());
    fireEvent.click(exportButton('CSV'));

    const [rows, fileName] = firstCall(exportMocks.exportCsv.mock.calls);
    expect(rows[0]).toEqual(['View', 'Simulations Completed by Class']);
    expect(rows[1]).toEqual(['Selection', 'All schools › Cedar Hollow']);
    expect(rows[5]).toEqual(['Class', 'Simulations Completed']);
    expect(rows.slice(6)).toEqual([
      ['Biology 101', 15],
      ['Chemistry 202', 3],
      ['Total', 18],
    ]);
    expect(fileName).toMatch(/^simulations-completed_by-class_/);
  });
});

describe('SimulationsCompletedChart – exports reflect the selection', () => {
  const selectBiologyForThreeMonths = async () => {
    await renderChart();
    await pickOption(/^Classes/, /Biology 101/);
    fireEvent.click(screen.getByRole('button', { name: /Last 12 Months/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Last 3 Months' }));
    await waitFor(() =>
      expect(lastParams(GRAPH)).toEqual({ classIds: ['c1'], months: 3 })
    );
    await screen.findByTestId('bar-chart');
  };

  const filters = 'All schools · Classes: Biology 101 · All student codes';

  it('CSV names the selection and has one row per month', async () => {
    await selectBiologyForThreeMonths();
    fireEvent.click(exportButton('CSV'));

    const [rows, fileName] = firstCall(exportMocks.exportCsv.mock.calls);
    expect(rows[0]).toEqual(['View', 'Simulations Completed']);
    expect(rows[1]).toEqual(['Selection', filters]);
    expect(rows[2]).toEqual(['Timeframe', 'Last 3 Months']);
    expect(rows[5]).toEqual(['Month', 'Simulations Completed']);
    expect(rows.slice(6, -1)).toHaveLength(3);
    expect(rows.at(-1)).toEqual(['Total', 298]);
    expect(fileName).toMatch(
      /^simulations-completed_by-month_all-schools-classes-biology-101-all-student-codes_last-3-months_\d{4}-\d{2}-\d{2}\.csv$/
    );
  });

  it('PNG and PDF use the chart and name the selection', async () => {
    await selectBiologyForThreeMonths();

    fireEvent.click(exportButton('PNG'));
    expect(exportMocks.exportChartPng).toHaveBeenCalledWith(
      chartStub,
      expect.stringMatching(/classes-biology-101.*last-3-months.*\.png$/)
    );

    fireEvent.click(exportButton('PDF'));
    const [pdfChart, pdfOptions] = firstCall(
      exportMocks.exportChartPdf.mock.calls
    );
    expect(pdfChart).toBe(chartStub);
    expect(pdfOptions.title).toBe('Simulations Completed');
    expect(pdfOptions.lines[0]).toBe(`${filters} · Last 3 Months`);
  });
});

describe('SimulationsCompletedChart – Total / Compare', () => {
  const modeButton = (name: 'Total' | 'Compare') =>
    within(screen.getByRole('group', { name: 'Chart mode' })).getByRole(
      'button',
      { name }
    );
  const datasets = () =>
    JSON.parse(
      screen.getByTestId('bar-chart').getAttribute('data-datasets') ?? '[]'
    ) as { label: string; data: number[] }[];

  beforeEach(() => {
    // Compare responses carry one series per compared class; Total ones don't.
    graphResponse = (params) =>
      Promise.resolve({
        data: {
          message: 'ok',
          data: {
            byMonth: [{ ...thisMonth, count: 5 }],
            ...(params?.['compareBy']
              ? {
                  byMonthSeries: [
                    {
                      ...thisMonth,
                      total: 5,
                      series: [
                        { seriesId: 'c1', seriesName: 'Biology 101', count: 5 },
                      ],
                    },
                  ],
                }
              : {}),
            bySchool: [],
          },
        },
      });
  });

  const selectBothClasses = async () => {
    await renderChart();
    await pickOption(/^Classes/, /Biology 101/);
    await pickOption(/^Classes/, /Chemistry 202/);
  };

  it('offers Compare only once a filter has two or more items', async () => {
    await renderChart();
    expect(
      screen.queryByRole('group', { name: 'Chart mode' })
    ).not.toBeInTheDocument();

    await pickOption(/^Classes/, /Biology 101/);
    expect(
      screen.queryByRole('group', { name: 'Chart mode' })
    ).not.toBeInTheDocument();

    await pickOption(/^Classes/, /Chemistry 202/);
    expect(modeButton('Total')).toHaveAttribute('aria-pressed', 'true');
    expect(modeButton('Compare')).toHaveAttribute('aria-pressed', 'false');
  });

  it('compares the selected classes side by side, one series each', async () => {
    await selectBothClasses();
    fireEvent.click(modeButton('Compare'));

    await waitFor(() =>
      expect(lastParams(GRAPH)).toEqual({
        classIds: ['c1', 'c2'],
        months: 12,
        compareBy: 'class',
      })
    );
    await waitFor(() => expect(datasets()).toHaveLength(2));
    const [biology, chemistry] = datasets();
    // In selection order; a class with no completions still gets its (zero) bars.
    expect(biology?.label).toBe('Biology 101');
    expect(biology?.data.at(-1)).toBe(5);
    expect(chemistry?.label).toBe('Chemistry 202');
    expect(chemistry?.data.every((count) => count === 0)).toBe(true);
    expect(screen.getByTestId('bar-chart')).toHaveAttribute(
      'data-legend',
      'true'
    );
    expect(modeButton('Compare')).toHaveAttribute('aria-pressed', 'true');
  });

  it('labels every y step and names the item in the Compare tooltip', async () => {
    await selectBothClasses();
    const tooltipLabel = (label: string, y: number) =>
      chartOptions.current?.plugins?.tooltip?.callbacks?.label?.({
        parsed: { y },
        dataIndex: 0,
        dataset: { label },
      });

    expect(chartOptions.current?.scales?.y?.ticks?.stepSize).toBe(1);
    expect(tooltipLabel('Simulations Completed', 15)).toBe(
      ' 15 simulations completed'
    );

    fireEvent.click(modeButton('Compare'));
    await waitFor(() => expect(datasets()).toHaveLength(2));

    expect(tooltipLabel('Biology 101', 15)).toBe(' Biology 101: 15 completed');
    expect(chartOptions.current?.scales?.y?.ticks?.stepSize).toBe(1);
  });

  it('goes back to one Total bar per month, the Total request without compareBy', async () => {
    await selectBothClasses();
    fireEvent.click(modeButton('Compare'));
    await waitFor(() => expect(datasets()).toHaveLength(2));

    const requestsBefore = callsTo(GRAPH).length;
    fireEvent.click(modeButton('Total'));

    // The Total chart for this selection is served from the cache, without compareBy.
    await waitFor(() => expect(datasets()).toHaveLength(1));
    expect(callsTo(GRAPH)).toHaveLength(requestsBefore);
    expect(
      callsTo(GRAPH).some(
        ({ params }) =>
          !('compareBy' in params) &&
          JSON.stringify(params['classIds']) === '["c1","c2"]'
      )
    ).toBe(true);
    expect(screen.getByTestId('bar-chart')).toHaveAttribute(
      'data-legend',
      'false'
    );
  });

  it('hides the toggle in Breakdown', async () => {
    await selectBothClasses();
    expect(
      screen.getByRole('group', { name: 'Chart mode' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Breakdown' }));

    expect(
      screen.queryByRole('group', { name: 'Chart mode' })
    ).not.toBeInTheDocument();
  });

  it('blocks Compare past five items and says why', async () => {
    const classes = Array.from({ length: 6 }, (_, i) => ({
      classId: `c${i + 1}`,
      className: `Class ${i + 1}`,
    }));
    const defaultImpl = apiRequest.getMockImplementation();
    apiRequest.mockImplementation((args: { url: string }) =>
      args.url === '/api/classes'
        ? Promise.resolve({
            data: { message: 'ok', data: classes, meta: meta(6) },
          })
        : defaultImpl?.(args)
    );
    await renderChart();
    for (const { className } of classes) {
      await pickOption(/^Classes/, new RegExp(`^${className}$`));
    }

    expect(modeButton('Compare')).toBeDisabled();
    expect(
      screen.getByText('Select up to 5 classes to compare')
    ).toBeInTheDocument();
    expect(lastParams(GRAPH)).not.toHaveProperty('compareBy');
  });

  it('exports a CSV column per compared class plus the total', async () => {
    await selectBothClasses();
    fireEvent.click(modeButton('Compare'));
    await waitFor(() => expect(datasets()).toHaveLength(2));

    fireEvent.click(exportButton('CSV'));

    const [rows] = firstCall(exportMocks.exportCsv.mock.calls);
    expect(rows[5]).toEqual(['Month', 'Biology 101', 'Chemistry 202', 'Total']);
    expect(rows.at(-2)?.slice(1)).toEqual([5, 0, 5]);
    expect(rows.at(-1)).toEqual(['Total', 5, 0, 5]);
  });
});
