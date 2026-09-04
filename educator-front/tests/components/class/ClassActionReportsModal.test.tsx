import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithProviders } from '../../../src/test/testUtils';
import ClassActionReportsModal from '../../../src/components/class/ClassActionReportsModal';
import type { SimulationReportItem } from '../../../src/redux/simulation/GetSimulationReportsRedux';
import type { Student } from '../../../src/types/Class_types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../src/store/hooks', async () => {
  const actual = await vi.importActual<typeof import('../../../src/store/hooks')>(
    '../../../src/store/hooks',
  );
  return {
    ...actual,
    useAppDispatch: () => vi.fn(),
    useAppSelector: (selector: (s: unknown) => unknown) => {
      return selector({ GetClass: { viewedReportIds: [] } } as unknown as Parameters<typeof selector>[0]);
    },
  };
});

const mockStudents: Student[] = [
  { student_id: 'STU001', user_id: 'uuid-user-1', student_name: 'Alice', email: 'alice@test.com', score: null },
  { student_id: 'STU002', user_id: 'uuid-user-2', student_name: 'Bob', email: 'bob@test.com', score: null },
];

const makeReport = (overrides: Partial<SimulationReportItem> = {}): SimulationReportItem => ({
  id: 'report-1',
  key: 'key-1',
  userId: 'uuid-user-1',
  studentName: 'Alice',
  studentClass: 'class-1',
  scenarioId: 'scenario-1',
  scenarioTitle: 'UAT-Cleanliness at Homes',
  transcriptId: 'transcript-1',
  scenarioStartTime: '2026-07-09T10:00:00',
  scenarioEndTime: '2026-07-09T10:05:00',
  totalTimeSeconds: 43,
  score: 25,
  performanceLabel: 'Below Average',
  scoreJson: { overallScore: 25, overallLabel: 'Below Average' },
  summary: 'Test summary',
  summaryEntries: [],
  ...overrides,
});

const defaultProps = {
  classId: 'class-1',
  className: 'Report Testing',
  reports: [makeReport()],
  students: mockStudents,
  onClose: vi.fn(),
};

const renderModal = (overrides: Partial<typeof defaultProps> = {}) =>
  renderWithProviders(<ClassActionReportsModal {...defaultProps} {...overrides} />);

describe('ClassActionReportsModal', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('Modal header', () => {
    it('displays the class name in the title', () => {
      renderModal();
      expect(screen.getByText('Reports — Report Testing')).toBeInTheDocument();
    });

    it('renders all column headers', () => {
      renderModal();
      expect(screen.getByText('Student Code')).toBeInTheDocument();
      expect(screen.getByText('Mode')).toBeInTheDocument();
      expect(screen.getByText('Simulation Name')).toBeInTheDocument();
      expect(screen.getByText('Score')).toBeInTheDocument();
      expect(screen.getByText('Time Spent')).toBeInTheDocument();
      expect(screen.getByText('Completed At')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no reports', () => {
      renderModal({ reports: [] });
      expect(screen.getByText('No reports found')).toBeInTheDocument();
      expect(
        screen.getByText('Completed simulation reports for this class will appear here.'),
      ).toBeInTheDocument();
    });

    it('does not render the footer when there are no reports', () => {
      renderModal({ reports: [] });
      expect(screen.queryByText(/Total Time/)).not.toBeInTheDocument();
    });
  });

  describe('Report rows', () => {
    it('renders the simulation name', () => {
      renderModal();
      expect(screen.getByText('UAT-Cleanliness at Homes')).toBeInTheDocument();
    });

    it('resolves student code from the roster map via user_id', () => {
      renderModal();
      expect(screen.getByText('STU001')).toBeInTheDocument();
    });

    it('resolves student code when userId IS the student_id', () => {
      const report = makeReport({ userId: 'STU002' });
      renderModal({ reports: [report] });
      expect(screen.getByText('STU002')).toBeInTheDocument();
    });

    it('shows — when student code cannot be resolved', () => {
      const report = makeReport({ userId: undefined });
      renderModal({ reports: [report], students: [] });
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThan(0);
    });

    it('does not show raw UUIDs as student code', () => {
      const uuid = '66b0de03-9256-4c2c-9673-490f3d9e5c37';
      const report = makeReport({ userId: uuid });
      renderModal({ reports: [report], students: [] });
      expect(screen.queryByText(uuid)).not.toBeInTheDocument();
    });

    it('renders score as percentage', () => {
      renderModal();
      expect(screen.getAllByText('25%').length).toBeGreaterThan(0);
    });

    it('renders time spent in seconds', () => {
      renderModal();
      expect(screen.getAllByText('43s').length).toBeGreaterThan(0);
    });

    it('renders completed at date', () => {
      renderModal();
      expect(screen.getByText('07/09/2026 10:05')).toBeInTheDocument();
    });

    it('renders New badge for isNew reports', () => {
      const report = makeReport({ isNew: true });
      renderModal({ reports: [report] });
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('does not render New badge for seen reports', () => {
      const report = makeReport({ isNew: false });
      renderModal({ reports: [report] });
      expect(screen.queryByText('New')).not.toBeInTheDocument();
    });
  });

  describe('Mode badge', () => {
    it('renders Assessment badge', () => {
      const report = makeReport({ mode: 'assessment' } as SimulationReportItem & { mode: string });
      renderModal({ reports: [report] });
      expect(screen.getByText('Assessment')).toBeInTheDocument();
    });

    it('renders Practice badge', () => {
      const report = makeReport({ mode: 'practice' } as SimulationReportItem & { mode: string });
      renderModal({ reports: [report] });
      expect(screen.getByText('Practice')).toBeInTheDocument();
    });

    it('renders — when mode is absent', () => {
      renderModal();
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe('Footer', () => {
    it('shows total time', () => {
      renderModal();
      expect(screen.getByText('Total Time:')).toBeInTheDocument();
      expect(screen.getAllByText('43s').length).toBeGreaterThan(0);
    });

    it('shows avg score', () => {
      renderModal();
      expect(screen.getByText('Avg Score:')).toBeInTheDocument();
      expect(screen.getAllByText('25%').length).toBeGreaterThan(0);
    });

    it('shows report count', () => {
      renderModal();
      expect(screen.getByText(/1 report/)).toBeInTheDocument();
    });

    it('shows plural reports count', () => {
      renderModal({ reports: [makeReport(), makeReport({ id: 'report-2' })] });
      expect(screen.getByText(/2 reports/)).toBeInTheDocument();
    });
  });

  describe('Row click navigation', () => {
    it('navigates to /report-detail when a row is clicked', () => {
      renderModal();
      fireEvent.click(screen.getByText('UAT-Cleanliness at Homes'));
      expect(mockNavigate).toHaveBeenCalledWith(
        '/report-detail',
        expect.objectContaining({
          state: expect.objectContaining({ backPath: '/classes' }),
        }),
      );
    });

    it('calls onClose before navigating', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      fireEvent.click(screen.getByText('UAT-Cleanliness at Homes'));
      expect(onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalled();
    });

    it('does not navigate when class is inactive', () => {
      renderModal({ isClassInactive: true });
      fireEvent.click(screen.getByText('UAT-Cleanliness at Homes'));
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Close button', () => {
    it('calls onClose when the × button is clicked', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      fireEvent.click(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
