import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('../../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
    patch: vi.fn(),
    get: vi.fn(),
  },
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../src/components/common/Toast', () => ({ toast }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => mockNavigate,
}));

import { renderWithProviders } from '../../../../src/test/testUtils';
import { store } from '../../../../src/store';
import { logout } from '../../../../src/redux/auth/LoginRedux';
import { resetClassState } from '../../../../src/redux/class/GetClassRedux';
import ClassActionReportsModal from '../../../../src/components/class/ClassActionReportsModal';
import type { SimulationReportItem } from '../../../../src/redux/simulation/GetSimulationReportsRedux';

const report = (id: string, userId: string, title: string) =>
  ({
    id,
    key: id,
    userId,
    studentName: '',
    studentClass: 'class-1',
    scenarioId: `sc-${id}`,
    scenarioTitle: title,
    transcriptId: `t-${id}`,
    scenarioStartTime: '2026-07-09T10:00:00',
    scenarioEndTime: '2026-07-09T10:05:00',
    totalTimeSeconds: 60,
    score: 80,
    performanceLabel: 'Meets Expectation',
    scoreJson: { overallScore: 80, overallLabel: 'Meets Expectation' },
    summary: '',
    summaryEntries: [],
    isNew: true,
  }) as unknown as SimulationReportItem;

const REPORTS = [
  report('r1', 'u1', 'Cardiac Care'),
  report('r2', 'u2', 'Wound Care'),
  report('r3', 'u1', 'Triage'),
];

const STUDENTS = [
  {
    student_id: 'STU-1',
    user_id: 'u1',
    student_name: 'Ava',
    email: null,
    score: null,
  },
  {
    student_id: 'STU-2',
    user_id: 'u2',
    student_name: 'Ben',
    email: null,
    score: null,
  },
];

const bulkReply = (updatedIds: string[], notAccessibleIds: string[] = []) =>
  Promise.resolve({
    data: {
      message: 'Bulk review completed',
      data: { updatedIds, notAccessibleIds },
    },
  });

const bulkCalls = () =>
  apiRequest.mock.calls
    .map(([args]) => args as { url: string; method: string; data: unknown })
    .filter((a) => a.url === '/api/simulation-reports/bulk-review');

const renderModal = () =>
  renderWithProviders(
    <ClassActionReportsModal
      classId="class-1"
      className="Biology"
      reports={REPORTS}
      students={STUDENTS}
      onClose={vi.fn()}
    />
  );

const rowFor = (title: string) =>
  screen.getByRole('button', { name: title }).closest('tr') as HTMLElement;
const isNewRow = (title: string) =>
  within(rowFor(title)).queryByText('New') !== null;

describe('Bulk report review (class Reports modal)', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    Object.values(toast).forEach((fn) => fn.mockClear());
    localStorage.clear();
    store.dispatch(logout());
    store.dispatch(resetClassState());
  });

  it('selects rows with a partial select-all state', () => {
    renderModal();
    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all reports',
    });

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select report Ava.*Cardiac Care/ })
    );
    expect((selectAll as HTMLInputElement).indeterminate).toBe(true);
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(selectAll).toBeChecked();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('marks the selection reviewed in one request, then unreviewed again', async () => {
    renderModal();
    expect(isNewRow('Cardiac Care')).toBe(true);

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select report Ava.*Cardiac Care/ })
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select report Ben.*Wound Care/ })
    );
    apiRequest.mockImplementationOnce(() => bulkReply(['r1', 'r2']));
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));

    await waitFor(() => expect(isNewRow('Cardiac Care')).toBe(false));
    expect(isNewRow('Wound Care')).toBe(false);
    expect(isNewRow('Triage')).toBe(true);
    expect(bulkCalls()).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        data: { type: 'report', ids: ['r1', 'r2'], reviewed: true },
      }),
    ]);
    expect(toast.success).toHaveBeenCalledWith('2 reports marked reviewed');
    // Selection clears after the action.
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    // Persisted for the next page load.
    expect(
      JSON.parse(localStorage.getItem('rwai_viewed_report_ids') ?? '[]')
    ).toEqual(['r1', 'r2']);

    apiRequest.mockImplementationOnce(() => bulkReply(['r1', 'r2', 'r3']));
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark all unreviewed' })
    );

    await waitFor(() => expect(isNewRow('Cardiac Care')).toBe(true));
    expect(bulkCalls()[1]).toEqual(
      expect.objectContaining({
        data: { type: 'report', ids: ['r1', 'r2', 'r3'], reviewed: false },
      })
    );
    expect(toast.success).toHaveBeenLastCalledWith(
      '3 reports marked unreviewed'
    );
  });

  it('reports ids the educator cannot access in one combined toast', async () => {
    renderModal();
    apiRequest.mockImplementationOnce(() => bulkReply(['r1', 'r2'], ['r3']));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "2 reports marked reviewed. 1 report couldn't be updated."
      )
    );
    expect(isNewRow('Triage')).toBe(true);
  });

  it('shows a friendly error and leaves the badges unchanged when the request fails', async () => {
    renderModal();
    apiRequest.mockImplementationOnce(() =>
      Promise.reject({ response: { status: 500, data: {} } })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "We couldn't update these reports. Please try again."
      )
    );
    expect(isNewRow('Cardiac Care')).toBe(true);
  });

  it('shows the BE message when the role is refused', async () => {
    renderModal();
    apiRequest.mockImplementationOnce(() =>
      Promise.reject({
        response: { status: 403, data: { message: 'Insufficient role' } },
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Insufficient role')
    );
  });
});
