import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import LmsSyncAction from '../../../src/components/class/LmsSyncAction';
import { toast } from '../../../src/components/common/Toast';
import {
  lmsSyncKey,
  hasDeletedLmsAssignment,
  type LmsGradeSync,
  type LmsGradeSyncEntry,
} from '../../../src/hooks/useLmsGradeSync';

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const makeSync = (
  entry?: LmsGradeSyncEntry,
  resync: LmsGradeSync['resync'] = vi.fn()
): LmsGradeSync => ({
  statuses: entry ? { [lmsSyncKey('sim-1', 'stu-1')]: entry } : {},
  resyncing: {},
  resync,
});

const renderAction = (sync: LmsGradeSync, mode = 'Assessment') =>
  render(
    <LmsSyncAction
      sync={sync}
      mode={mode}
      simulationId="sim-1"
      studentId="stu-1"
    />
  );

describe('LmsSyncAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows a non-clickable green Synced badge for an Assessment row that synced', () => {
    renderAction(makeSync({ status: 'sent' }));

    expect(screen.getByText('Synced to LMS')).toHaveClass('bg-green-50');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a red failure badge and Resync button for an Assessment row that failed', () => {
    renderAction(
      makeSync({ status: 'failed', failureReason: 'lms_rejected_grade' })
    );

    expect(screen.getByText('LMS sync failed')).toHaveClass('bg-red-50');
    expect(screen.getByRole('button', { name: 'Resync to LMS' })).toBeEnabled();
  });

  it('shows the failure reason in a tooltip on hover', () => {
    renderAction(
      makeSync({ status: 'failed', failureReason: 'lms_rejected_grade' })
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText('LMS sync failed'));

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'The LMS rejected the grade. The student may not be enrolled in the course.'
    );

    fireEvent.mouseLeave(screen.getByText('LMS sync failed'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('falls back to a generic reason when none is provided', () => {
    renderAction(makeSync({ status: 'failed' }));

    fireEvent.mouseEnter(screen.getByText('LMS sync failed'));

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      "The grade couldn't be sent to the LMS."
    );
  });

  it('renders nothing for Practice reports', () => {
    const { container } = renderAction(
      makeSync({ status: 'sent' }),
      'Practice'
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the row has no LMS sync status', () => {
    const { container } = renderAction(makeSync());

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a success toast when resync succeeds', async () => {
    const resync = vi.fn().mockResolvedValue(true);
    renderAction(makeSync({ status: 'failed' }, resync));

    fireEvent.click(screen.getByRole('button', { name: 'Resync to LMS' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Grade synced to LMS')
    );
    expect(resync).toHaveBeenCalledWith('sim-1', 'stu-1');
  });

  it('shows an error toast when resync fails', async () => {
    renderAction(
      makeSync({ status: 'failed' }, vi.fn().mockResolvedValue(false))
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resync to LMS' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('labels the badge as assignment-deleted and explains the fix on hover', () => {
    renderAction(
      makeSync({ status: 'failed', failureReason: 'lms_assignment_not_found' })
    );

    const badge = screen.getByText('Assignment deleted in LMS');
    expect(badge).toHaveClass('bg-red-50');
    expect(screen.queryByText('LMS sync failed')).not.toBeInTheDocument();

    fireEvent.mouseEnter(badge);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'The assignment was deleted in your LMS. Re-deep-link this simulation to start syncing grades again.'
    );
  });
});

describe('hasDeletedLmsAssignment', () => {
  it('is true only when some row failed as assignment-not-found', () => {
    expect(hasDeletedLmsAssignment({})).toBe(false);
    expect(hasDeletedLmsAssignment({ a: { status: 'sent' } })).toBe(false);
    expect(
      hasDeletedLmsAssignment({
        a: { status: 'failed', failureReason: 'lms_authentication' },
        b: { status: 'failed', failureReason: 'lms_unreachable' },
      })
    ).toBe(false);
    expect(
      hasDeletedLmsAssignment({
        a: { status: 'sent' },
        b: { status: 'failed', failureReason: 'lms_assignment_not_found' },
      })
    ).toBe(true);
  });
});
