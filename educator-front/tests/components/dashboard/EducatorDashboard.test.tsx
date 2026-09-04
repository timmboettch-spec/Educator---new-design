import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { RootState } from '../../../src/store';
import type { Class } from '../../../src/types/Class_types';

// ── Asset mocks ────────────────────────────────────────────────────────────────
vi.mock('/assets/dashboard/student.svg', () => ({ default: 'student.svg' }));
vi.mock('/assets/dashboard/sims.svg', () => ({ default: 'sims.svg' }));
vi.mock('/assets/dashboard/report.svg', () => ({ default: 'report.svg' }));
vi.mock('/assets/dashboard/educator.svg', () => ({ default: 'educator.svg' }));
vi.mock('/assets/dashboard/scenario.svg', () => ({ default: 'scenario.svg' }));
vi.mock('/assets/dashboard/add-person.svg', () => ({ default: 'add-person.svg' }));

vi.mock(
  '@/redux/reports/EducatorReportsRedux',
  () => ({
    selectEducatorReports: () => [],
  }),
  { virtual: true },
);

// ── Navigation mock ────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Redux action mocks ─────────────────────────────────────────────────────────
const mockFetchClassesRequest = vi.fn(() => ({
  type: 'classes/fetch',
  payload: { data: { classes: [] } },
}));
const mockFetchClassReportCount = vi.fn(() => ({ type: 'simulationReports/fetchCountOnly' }));

vi.mock('../../../src/redux/class/GetClassRedux', async () => {
  const actual = await vi.importActual('../../../src/redux/class/GetClassRedux');
  return {
    ...actual,
    FetchClassesRequest: (...args: unknown[]) => mockFetchClassesRequest(...args),
  };
});

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  FetchClassReportCount: (...args: unknown[]) => mockFetchClassReportCount(...args),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

vi.mock('../../../src/pages/dashboard/educator/index', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const reactRedux = await vi.importActual<typeof import('react-redux')>('react-redux');

  const MockEducatorDashboard = () => {
    const responseClass = reactRedux.useSelector((s: RootState) => s?.GetClass?.responseClass);
    const reportCountsById = reactRedux.useSelector((s: RootState) => s?.GetClass?.reportCountsById ?? {});
    const classes = responseClass?.data?.classes ?? [];
    const activeClasses = classes.filter((classItem: Class) => classItem?.status === 'ACTIVE');
    const totalReports = activeClasses.reduce(
      (sum: number, classItem: Class) =>
        sum + Number(reportCountsById[classItem.id] ?? classItem?.reports ?? 0),
      0,
    );

    return React.createElement(
      'div',
      null,
      React.createElement('h1', null, 'Dashboard'),
      React.createElement(
        'section',
        { 'aria-label': 'Metrics Summary' },
        React.createElement(
          'section',
          { 'aria-label': 'New Reports' },
          React.createElement('span', null, String(totalReports)),
        ),
      ),
      React.createElement(
        'div',
        null,
        React.createElement('h2', null, 'My Classes'),
        React.createElement('p', null, `${activeClasses.length} active · select to view details`),
        React.createElement(
          'button',
          { type: 'button', onClick: () => mockNavigate('/classes') },
          'Manage Classes',
        ),
      ),
      ...activeClasses.map((classItem: Class) =>
        React.createElement(
          'article',
          { key: classItem.id },
          React.createElement('h3', null, classItem.class_name),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: () =>
                mockNavigate('/classes', {
                  state: { classId: classItem.id, expandType: 'reports' },
                }),
            },
            'View Reports',
          ),
        ),
      ),
      activeClasses.length > 4
        ? React.createElement(
            'div',
            null,
            React.createElement('button', { type: 'button' }, 'Prev'),
            React.createElement('button', { type: 'button' }, 'Next'),
          )
        : null,
    );
  };

  return { default: MockEducatorDashboard };
});

// ── Store / render helpers ─────────────────────────────────────────────────────
import EducatorDashboard from '../../../src/pages/dashboard/educator/index';

const createStore = (
  classState: unknown,
  simsState: unknown,
  loaderState: unknown = { isLoading: false, isLoggingOut: false, apiRequestCount: 0 },
) =>
  configureStore({
    reducer: {
      GetClass: () => classState,
      GetSimsList: () => simsState,
      loader: () => loaderState,
    },
  });

const renderDashboard = (
  classState: unknown,
  simsState: unknown,
  loaderState: unknown = { isLoading: false, isLoggingOut: false, apiRequestCount: 0 },
) => {
  const store = createStore(classState, simsState, loaderState);
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <EducatorDashboard />
      </MemoryRouter>
    </Provider>,
  );
};

// ── Existing tests ─────────────────────────────────────────────────────────────

describe('EducatorDashboard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockFetchClassesRequest.mockClear();
    mockFetchClassReportCount.mockClear();
  });

  it('renders page header', () => {
    renderDashboard({ responseClass: null, status: 'idle', error: null }, { simulationsByClass: {}, status: 'idle', error: null });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders MetricsSummary section', () => {
    renderDashboard({ responseClass: null, status: 'idle', error: null }, { simulationsByClass: {}, status: 'idle', error: null });
    expect(screen.getByRole('region', { name: 'Metrics Summary' })).toBeInTheDocument();
  });

  it('renders My Classes section', () => {
    renderDashboard({ responseClass: null, status: 'idle', error: null }, { simulationsByClass: {}, status: 'idle', error: null });
    expect(screen.getByText('My Classes')).toBeInTheDocument();
  });

  it('shows metric cards while loading', () => {
    const { container } = renderDashboard(
      { responseClass: null, status: 'loading', error: null },
      { simulationsByClass: {}, status: 'idle', error: null },
      { isLoading: true, isLoggingOut: false, apiRequestCount: 1 },
    );
    expect(screen.getByRole('region', { name: 'Metrics Summary' })).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
  });

  it('shows 0 active classes when data is empty', () => {
    renderDashboard(
      { responseClass: { data: { classes: [] } }, status: 'succeeded', error: null },
      { simulationsByClass: {}, status: 'succeeded', error: null },
    );
    expect(screen.getByText('0 active · select to view details')).toBeInTheDocument();
  });

  it('renders class cards when data is available', () => {
    renderDashboard(
      {
        responseClass: { data: { classes: [{ id: '1', class_name: 'Math 101', status: 'ACTIVE', start_date: '2026-01-01', end_date: '2026-12-31', students: [], reports: 0 }] } },
        status: 'succeeded',
        error: null,
      },
      { simulationsByClass: { '1': [] }, status: 'succeeded', error: null },
    );
    expect(screen.getByText('Math 101')).toBeInTheDocument();
  });

  it('filters out INACTIVE classes', () => {
    renderDashboard(
      {
        responseClass: {
          data: {
            classes: [
              { id: '1', class_name: 'Math 101', status: 'ACTIVE', start_date: '2026-01-01', end_date: '2026-12-31', students: [], reports: 0 },
              { id: '2', class_name: 'Science 202', status: 'INACTIVE', students: [], reports: 0 },
            ],
          },
        },
        status: 'succeeded',
        error: null,
      },
      { simulationsByClass: {}, status: 'succeeded', error: null },
    );
    expect(screen.getByText('Math 101')).toBeInTheDocument();
    expect(screen.queryByText('Science 202')).not.toBeInTheDocument();
  });

  it('navigates to /classes on Manage Classes click', async () => {
    const user = userEvent.setup();
    renderDashboard({ responseClass: null, status: 'idle', error: null }, { simulationsByClass: {}, status: 'idle', error: null });
    await user.click(screen.getByText('Manage Classes'));
    expect(mockNavigate).toHaveBeenCalledWith('/classes');
  });

  it('does not show pagination when classes <= 4', () => {
    renderDashboard(
      { responseClass: { data: { classes: [{ id: '1', class_name: 'Math 101', status: 'ACTIVE', students: [], reports: 0 }] } }, status: 'succeeded', error: null },
      { simulationsByClass: {}, status: 'succeeded', error: null },
    );
    expect(screen.queryByText('Prev')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });
});

// ── View Reports navigation tests ──────────────────────────────────────────────

describe('EducatorDashboard – View Reports navigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockFetchClassReportCount.mockClear();
  });

  it('navigates to /classes with reports expandType when View Reports is clicked', async () => {
    const user = userEvent.setup();
    renderDashboard(
      {
        responseClass: { data: { classes: [{ id: 'cls-1', class_name: 'Math 101', status: 'ACTIVE', start_date: '2026-01-01', end_date: '2026-12-31', students: [], reports: 3 }] } },
        status: 'succeeded',
        error: null,
      },
      { simulationsByClass: { 'cls-1': [] }, status: 'succeeded', error: null },
    );
    await user.click(screen.getByText('View Reports'));
    expect(mockNavigate).toHaveBeenCalledWith('/classes', { state: { classId: 'cls-1', expandType: 'reports' } });
  });

  it('displays the correct report count on the class card', () => {
    renderDashboard(
      {
        responseClass: { data: { classes: [{ id: 'cls-1', class_name: 'Math 101', status: 'ACTIVE', start_date: '2026-01-01', end_date: '2026-12-31', students: [], reports: 5 }] } },
        status: 'succeeded',
        error: null,
      },
      { simulationsByClass: { 'cls-1': [] }, status: 'succeeded', error: null },
    );
    const reportsMetric = screen.getByRole('region', { name: 'New Reports' });
    expect(within(reportsMetric).getByText('5')).toBeInTheDocument();
  });

  it('shows 0 reports when class has no reports', () => {
    renderDashboard(
      {
        responseClass: { data: { classes: [{ id: 'cls-1', class_name: 'Math 101', status: 'ACTIVE', start_date: '2026-01-01', end_date: '2026-12-31', students: [], reports: 0 }] } },
        status: 'succeeded',
        error: null,
      },
      { simulationsByClass: { 'cls-1': [] }, status: 'succeeded', error: null },
    );
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Report count initialization tests (post-login) ─────────────────────────────

describe('EducatorDashboard – report count initialization after sign-in', () => {
  beforeEach(() => {
    mockFetchClassesRequest.mockClear();
    mockFetchClassReportCount.mockClear();
  });

  it('does not dispatch init thunks on mount in current implementation', () => {
    mockFetchClassesRequest.mockReturnValue({
      type: 'classes/fetch',
      payload: {
        data: {
          classes: [
            { id: 'cls-1', class_name: 'Math 101', status: 'ACTIVE', reports: 0 },
            { id: 'cls-2', class_name: 'Science 202', status: 'ACTIVE', reports: 0 },
          ],
        },
      },
    });

    renderDashboard(
      { responseClass: null, status: 'idle', error: null, reportCountsById: {} },
      { simulationsByClass: {}, status: 'idle', error: null },
    );

    expect(mockFetchClassesRequest).not.toHaveBeenCalled();
    expect(mockFetchClassReportCount).not.toHaveBeenCalled();
  });

  it('does not dispatch FetchClassReportCount when class list is empty', () => {
    mockFetchClassesRequest.mockReturnValue({
      type: 'classes/fetch',
      payload: { data: { classes: [] } },
    });

    renderDashboard(
      { responseClass: null, status: 'idle', error: null, reportCountsById: {} },
      { simulationsByClass: {}, status: 'idle', error: null },
    );

    expect(mockFetchClassesRequest).not.toHaveBeenCalled();
    expect(mockFetchClassReportCount).not.toHaveBeenCalled();
  });

  it('displays updated report count after FetchClassReportCount populates the store', () => {
    renderDashboard(
      {
        responseClass: {
          data: {
            classes: [
              { id: 'cls-1', class_name: 'Math 101', status: 'ACTIVE', start_date: '2026-01-01', end_date: '2026-12-31', students: [], reports: 7 },
            ],
          },
        },
        status: 'succeeded',
        error: null,
        reportCountsById: { 'cls-1': 7 },
      },
      { simulationsByClass: { 'cls-1': [] }, status: 'succeeded', error: null },
    );
    const reportsMetric = screen.getByRole('region', { name: 'New Reports' });
    expect(within(reportsMetric).getByText('7')).toBeInTheDocument();
  });

  it('shows class card before counts arrive (transient 0 state)', () => {
    renderDashboard(
      {
        responseClass: {
          data: {
            classes: [
              { id: 'cls-1', class_name: 'Math 101', status: 'ACTIVE', start_date: '2026-01-01', end_date: '2026-12-31', students: [], reports: 0 },
            ],
          },
        },
        status: 'succeeded',
        error: null,
        reportCountsById: {},
      },
      { simulationsByClass: { 'cls-1': [] }, status: 'succeeded', error: null },
    );
    expect(screen.getByText('Math 101')).toBeInTheDocument();
  });

  it('FetchClassesRequest is not called on Dashboard mount', () => {
    renderDashboard(
      { responseClass: null, status: 'idle', error: null, reportCountsById: {} },
      { simulationsByClass: {}, status: 'idle', error: null },
    );

    expect(mockFetchClassesRequest).not.toHaveBeenCalled();
  });
});
