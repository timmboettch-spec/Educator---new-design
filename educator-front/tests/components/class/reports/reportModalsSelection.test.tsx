import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/redux/api', () => ({
  default: {
    request: vi.fn(() => new Promise(() => {})),
    get: vi.fn(() => new Promise(() => {})),
    patch: vi.fn(),
    post: vi.fn(() => new Promise(() => {})),
  },
}));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => vi.fn(),
}));

const review = vi.hoisted(() => ({
  markSelected: vi.fn(),
  markAll: vi.fn(),
  toggle: vi.fn(),
  toggleAll: vi.fn(),
  hookArgs: [] as unknown[][],
}));
vi.mock(
  '../../../../src/components/class/reports/useReportTableReview',
  () => ({
    useReportTableReview: (...args: unknown[]) => {
      review.hookArgs.push(args);
      return {
        selection: {
          selectedIds: [],
          isSelected: () => false,
          isAllSelected: false,
          isPartial: false,
          toggle: review.toggle,
          toggleAll: review.toggleAll,
          clear: vi.fn(),
        },
        isReviewing: false,
        markSelected: review.markSelected,
        markAll: review.markAll,
      };
    },
  })
);

const listRow = (reportId: string) => ({
  reportId,
  studentCode: `STU-${reportId}`,
  mode: 'Assessment',
  simulationName: 'Cardiac Care',
  score: 80,
  performanceQuality: 'Meets Expectation',
  timeSpent: '00:01:00',
  completedAt: '2026-07-09T10:05:00.000Z',
  transcriptId: null,
  viewedAt: null,
  viewedBy: null,
});
vi.mock(
  '../../../../src/redux/api/reports/reportsApi',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useGetReportsInfiniteQuery: () => ({
      currentData: {
        pages: [
          {
            data: [listRow('r1'), listRow('r2')],
            meta: {
              total: 2,
              page: 1,
              pageSize: 10,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
        ],
        pageParams: [1],
      },
      isFetching: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    }),
  })
);
vi.mock('../../../../src/hooks/useMarkAllSimReports', () => ({
  useMarkAllSimReports: () => ({ markAll: vi.fn(), isMarking: false }),
}));

import { renderWithProviders } from '../../../../src/test/testUtils';
import SimulationReportsModal from '../../../../src/components/class/simulation/SimulationReportsModal';
import StudentReportsModal from '../../../../src/components/class/student/StudentReportsModal';

const expectReviewControls = () => {
  expect(
    screen.getByRole('toolbar', { name: 'Bulk review actions' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: 'Select all reports' })
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole('checkbox', { name: /^Select report / })
  ).toHaveLength(2);
};

describe('Reports modals – bulk review controls', () => {
  beforeEach(() => {
    review.markSelected.mockClear();
    review.markAll.mockClear();
    review.toggle.mockClear();
    review.toggleAll.mockClear();
    review.hookArgs.length = 0;
  });

  describe('SimulationReportsModal', () => {
    const renderSim = () =>
      renderWithProviders(
        <SimulationReportsModal
          simulationId="sim-1"
          simName="Cardiac Care"
          classId="class-1"
          onClose={vi.fn()}
        />
      );

    it('shows the checkbox column and bulk bar for the reports', () => {
      renderSim();
      expectReviewControls();
      expect(review.hookArgs.at(-1)?.slice(0, 2)).toEqual([
        ['r1', 'r2'],
        'class-1',
      ]);
      expect(review.hookArgs.at(-1)?.[2]).toMatchObject({ paged: true });
    });

    it('wires select-all, row selection and the bulk actions', () => {
      renderSim();
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select all reports' })
      );
      const rows = screen.getAllByRole('checkbox', { name: /^Select report / });
      fireEvent.click(rows[1] as HTMLElement);
      fireEvent.click(
        screen.getByRole('button', { name: 'Mark all reviewed' })
      );

      expect(review.toggleAll).toHaveBeenCalled();
      expect(review.toggle).toHaveBeenCalledWith('r2');
      expect(review.markAll).toHaveBeenCalledWith(true);
    });
  });

  describe('StudentReportsModal', () => {
    const renderStudent = (classId?: string) =>
      renderWithProviders(
        <StudentReportsModal
          studentId="stu-1"
          studentName="Ava"
          studentCode="STU-1"
          classId={classId}
          onClose={vi.fn()}
        />
      );

    it('shows the bulk review controls when the class is known', () => {
      renderStudent('class-1');
      expectReviewControls();
      expect(review.hookArgs.at(-1)?.slice(0, 2)).toEqual([
        ['r1', 'r2'],
        'class-1',
      ]);
      expect(review.hookArgs.at(-1)?.[2]).toMatchObject({ paged: true });
    });

    it('hides them without a class, since review needs its unread count', () => {
      renderStudent(undefined);
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });
});
