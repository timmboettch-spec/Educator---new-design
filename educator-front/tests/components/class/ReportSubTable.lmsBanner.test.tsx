import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
const apiGet = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
    get: (...args: unknown[]) => apiGet(...args),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => vi.fn(),
}));

import { renderWithProviders } from '../../../src/test/testUtils';
import { store } from '../../../src/store';
import { reportsApi } from '../../../src/redux/api/reports/reportsApi';
import ReportSubTable from '../../../src/components/class/ReportSubTable';
import { FetchSimulationsByClass } from '../../../src/redux/class/GetSimsRedux';
import { FetchClassesRequest } from '../../../src/redux/class/GetClassRedux';

const LIST = '/api/simulation-reports/list';
const BANNER =
  /Some grades couldn’t be sent because the assignment was deleted in your LMS/;

type SyncRow = {
  simulationId: string;
  studentId: string;
  status: 'sent' | 'failed';
  failureReason?: string;
};

const row = (n: number, overrides: Record<string, unknown> = {}) => ({
  reportId: `r${n}`,
  studentCode: `STU-${n}`,
  mode: 'Assessment',
  simulationName: `Sim ${n}`,
  score: 82,
  performanceQuality: 'Exceptional',
  timeSpent: '00:12:34',
  completedAt: '2026-01-14T09:00:00.000Z',
  transcriptId: `t${n}`,
  viewedAt: null,
  viewedBy: null,
  ...overrides,
});

let listRows: ReturnType<typeof row>[];
let syncRows: SyncRow[];

const seedClassData = () => {
  store.dispatch({
    type: FetchSimulationsByClass.fulfilled.type,
    payload: {
      classId: 'class-1',
      data: [1, 2].map((n) => ({
        id: `a-${n}`,
        simulation_id: `lib-${n}`,
        simulation_title: `Sim ${n}`,
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        due_date: '2026-01-31',
      })),
    },
  });
  store.dispatch({
    type: FetchClassesRequest.fulfilled.type,
    payload: {
      data: {
        classes: [
          {
            id: 'class-1',
            students: [1, 2].map((n) => ({
              id: `stu-${n}`,
              student_id: `STU-${n}`,
              student_name: `Student ${n}`,
            })),
          },
        ],
      },
    },
  });
};

beforeEach(() => {
  window.history.replaceState(null, '', '/classes');
  apiRequest.mockReset();
  apiGet.mockReset();
  store.dispatch(reportsApi.util.resetApiState());
  listRows = [row(1)];
  syncRows = [];
  seedClassData();

  apiRequest.mockImplementation((args: { url: string }) =>
    args.url === LIST
      ? Promise.resolve({
          data: {
            message: 'ok',
            data: listRows,
            meta: {
              total: listRows.length,
              page: 1,
              pageSize: 10,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
        })
      : Promise.reject(new Error(`unexpected ${args.url}`))
  );
  apiGet.mockImplementation(() =>
    Promise.resolve({ data: { data: syncRows } })
  );
});

describe('ReportSubTable deleted LMS assignment banner', () => {
  it('warns when a listed row failed because its assignment was deleted', async () => {
    syncRows = [
      {
        simulationId: 'lib-1',
        studentId: 'stu-1',
        status: 'failed',
        failureReason: 'lms_assignment_not_found',
      },
    ];

    renderWithProviders(<ReportSubTable classId="class-1" />);

    expect(await screen.findByText('Sim 1')).toBeInTheDocument();
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
  });

  it('stays quiet when the deleted assignment belongs to a row that is not listed', async () => {
    syncRows = [
      {
        simulationId: 'lib-2',
        studentId: 'stu-2',
        status: 'failed',
        failureReason: 'lms_assignment_not_found',
      },
    ];

    renderWithProviders(<ReportSubTable classId="class-1" />);

    expect(await screen.findByText('Sim 1')).toBeInTheDocument();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });

  it('stays quiet for other failure reasons on a listed row', async () => {
    syncRows = [
      {
        simulationId: 'lib-1',
        studentId: 'stu-1',
        status: 'failed',
        failureReason: 'lms_authentication',
      },
    ];

    renderWithProviders(<ReportSubTable classId="class-1" />);

    expect(await screen.findByText('Sim 1')).toBeInTheDocument();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });

  it('stays quiet for a Practice row, which shows no sync pill to explain it', async () => {
    listRows = [row(1, { mode: 'Practice' })];
    syncRows = [
      {
        simulationId: 'lib-1',
        studentId: 'stu-1',
        status: 'failed',
        failureReason: 'lms_assignment_not_found',
      },
    ];

    renderWithProviders(<ReportSubTable classId="class-1" />);

    expect(await screen.findByText('Sim 1')).toBeInTheDocument();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });
});
