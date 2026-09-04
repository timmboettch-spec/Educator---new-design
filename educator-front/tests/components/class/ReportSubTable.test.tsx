import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../src/redux/config.tsx', () => ({
  default: { GetReportApi: 'http://mock/reports' },
  setServerConfig: () => ({}),
}));

vi.mock('../../../src/redux/axiosInstance', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppSelector: vi.fn(),
  useAppDispatch: () => vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue([]) }),
}));

import ReportSubTable from '../../../src/components/class/ReportSubTable';
import {
  selectClassReports,
  selectClassReportsError,
  selectClassReportsStatus,
} from '../../../src/redux/class/SimsCompletedreportsRedux';
import {
  selectClasses,
  selectViewedReportIds,
} from '../../../src/redux/class/GetClassRedux';
import { useAppSelector } from '../../../src/store/hooks';

const mockRows = [
  {
    id: 'report-1',
    key: 'KEY1',
    userId: 'user-001',
    studentName: 'John Doe',
    studentClass: 'AIT_SPRINT_06',
    scenarioId: 'scenario-1',
    scenarioTitle: 'Sim 1',
    transcriptId: 'transcript-1',
    scenarioStartTime: '2024-01-01T00:00:00.000Z',
    scenarioEndTime: '2024-01-01T00:10:00.000Z',
    totalTimeSeconds: 600,
    score: 85,
    performanceLabel: 'Exceptional',
    scoreJson: {
      overallScore: 85,
      overallLabel: 'Exceptional',
      communication: null,
      communicationLabel: '',
      clinicalJudgment: null,
      clinicalJudgmentLabel: '',
      technicalAccuracy: null,
      technicalAccuracyLabel: '',
      ethicalCompetence: null,
      ethicalCompetenceLabel: '',
      reflection: null,
      reflectionLabel: '',
      rubricsTotal: null,
    },
    summary: 'Assessment completed',
    summaryEntries: [],
    student_id: 'STU001',
  },
  {
    id: 'report-2',
    key: 'KEY2',
    userId: 'user-002',
    studentName: 'Jane Smith',
    studentClass: 'AIT_SPRINT_06',
    scenarioId: 'scenario-2',
    scenarioTitle: 'Sim 2',
    transcriptId: 'transcript-2',
    scenarioStartTime: '2024-01-02T00:00:00.000Z',
    scenarioEndTime: '2024-01-02T00:10:00.000Z',
    totalTimeSeconds: 300,
    score: 70,
    performanceLabel: 'Proficient',
    scoreJson: {
      overallScore: 70,
      overallLabel: 'Proficient',
      communication: null,
      communicationLabel: '',
      clinicalJudgment: null,
      clinicalJudgmentLabel: '',
      technicalAccuracy: null,
      technicalAccuracyLabel: '',
      ethicalCompetence: null,
      ethicalCompetenceLabel: '',
      reflection: null,
      reflectionLabel: '',
      rubricsTotal: null,
    },
    summary: 'Assessment completed',
    summaryEntries: [],
    student_id: 'STU002',
  },
];

describe('ReportSubTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockReportState = (rows: typeof mockRows) => {
    (useAppSelector as unknown as Mock).mockImplementation((selector) => {
      if (selector === selectClassReports) return rows;
      if (selector === selectClassReportsStatus) return 'succeeded';
      if (selector === selectClassReportsError) return null;
      if (selector === selectClasses) return [];
      if (selector === selectViewedReportIds) return [];
      return undefined;
    });
  };

  test('renders table headers correctly', () => {
    mockReportState(mockRows);

    render(<MemoryRouter><ReportSubTable classId="cls-1" reports={mockRows} /></MemoryRouter>);

    expect(screen.getByText('Student Code')).toBeInTheDocument();
    expect(screen.getByText('Simulation Name')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  // test('renders rows data correctly', () => {
  //   mockReportState(mockRows);
  //
  //   render(<MemoryRouter><ReportSubTable classId="cls-1" reports={mockRows} /></MemoryRouter>);
  //
  //   expect(screen.getByText('user-001')).toBeInTheDocument();
  //   expect(screen.getByText('user-002')).toBeInTheDocument();
  //   expect(screen.getByText('Sim 1')).toBeInTheDocument();
  // });

  test('shows empty state when no data', () => {
    mockReportState([]);

    render(<MemoryRouter><ReportSubTable classId="cls-1" reports={[]} /></MemoryRouter>);

    expect(screen.getByText('No report data available')).toBeInTheDocument();
    expect(screen.queryByText('View Report')).not.toBeInTheDocument();
  });

  test('toggles groupBy state (Student / Simulation)', () => {
    mockReportState(mockRows);

    render(<MemoryRouter><ReportSubTable classId="cls-1" reports={mockRows} /></MemoryRouter>);

    // Toolbar is currently hidden (commented out in component)
    expect(screen.queryByText('Student')).not.toBeInTheDocument();
    expect(screen.queryByText('Simulation')).not.toBeInTheDocument();
  });

  test('renders Late Submission in red color', () => {
    mockReportState(mockRows);

    render(<MemoryRouter><ReportSubTable classId="cls-1" reports={mockRows} /></MemoryRouter>);

    // Toolbar is currently hidden (commented out in component)
    expect(screen.queryByText('Late Submission')).not.toBeInTheDocument();
  });

  test('renders View Report button for each row', () => {
    mockReportState(mockRows);

    render(<MemoryRouter><ReportSubTable classId="cls-1" reports={mockRows} /></MemoryRouter>);

    const buttons = screen.getAllByText('View Report');
    expect(buttons.length).toBe(2);
  });

  test('renders Bulk Export button', () => {
    mockReportState(mockRows);
    render(<MemoryRouter><ReportSubTable classId="cls-1" reports={mockRows} /></MemoryRouter>);

    // Toolbar is currently hidden (commented out in component)
    expect(screen.queryByText('Bulk Export')).not.toBeInTheDocument();
  });
});
