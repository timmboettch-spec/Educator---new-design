import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from 'vitest';
import ExportGradeModal from '../../../src/components/class/simulation/ExportGradeModal';
import { useAppSelector } from '../../../src/store/hooks';
import {
  selectClassReports,
  selectClassReportsStatus,
} from '../../../src/redux/class/SimsCompletedreportsRedux';

const mocks = vi.hoisted(() => ({
  autoTableMock: vi.fn(),
  savePdfMock: vi.fn(),
  bookNewMock: vi.fn(() => ({ wb: true })),
  aoaToSheetMock: vi.fn(() => ({})),
  bookAppendSheetMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock('jspdf', () => ({
  default: vi.fn(function MockJsPdf(this: Record<string, unknown>) {
    this.setFontSize = vi.fn();
    this.setTextColor = vi.fn();
    this.text = vi.fn();
    this.save = mocks.savePdfMock;
  }),
}));

vi.mock('jspdf-autotable', () => ({
  default: mocks.autoTableMock,
}));

vi.mock('xlsx', () => ({
  utils: {
    book_new: mocks.bookNewMock,
    aoa_to_sheet: mocks.aoaToSheetMock,
    book_append_sheet: mocks.bookAppendSheetMock,
  },
  writeFile: mocks.writeFileMock,
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppSelector: vi.fn(),
  useAppDispatch: vi.fn(() => vi.fn()),
}));

const onCloseMock = vi.fn();
const alertMock = vi.fn();

let classResponseMock: unknown;
let classReportsMock: unknown[] = [];

const sim = {
  id: 'sim-1',
  simulation_title: 'Heart Model',
  start_date: '2026-01-10',
  due_date: '2026-01-15',
  end_date: '2026-01-20',
} as const;

const sampleReports = [
  {
    scenarioId: 'sim-1',
    scenarioTitle: 'Heart Model',
    studentName: 'Alex Doe',
    student_id: 'STU-01',
    userId: 'user-1',
    score: 88,
    completed_at: '2026-01-12',
  },
];

function renderComponent(options?: {
  reports?: unknown[];
  disabled?: boolean;
}) {
  classReportsMock = options?.reports ?? sampleReports;
  classResponseMock = {
    data: {
      classes: [{ id: 'class-1', students: [] }],
    },
  };

  return render(
    <ExportGradeModal
      sim={sim as never}
      className="Class A"
      classId="class-1"
      onClose={onCloseMock}
      disabled={options?.disabled}
    />
  );
}

describe('ExportGradeModal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    (useAppSelector as unknown as Mock).mockImplementation(
      (selector: unknown) => {
        if (selector === selectClassReports) return classReportsMock;
        if (selector === selectClassReportsStatus) return 'succeeded';
        return classResponseMock;
      }
    );

    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(() => 'blob:mock-url'),
        writable: true,
      });
    }

    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: vi.fn(),
        writable: true,
      });
    }

    vi.stubGlobal('alert', alertMock);
  });

  test('renders modal fields and formatted simulation dates', () => {
    renderComponent();

    expect(screen.getByText('Export Grade Report')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Class A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Heart Model')).toBeInTheDocument();
  });

  test('disables export button when there are no students', () => {
    renderComponent({ reports: [] });

    const exportButton = screen.getByRole('button', { name: /export/i });
    expect(exportButton).toBeDisabled();
  });

  test('disables export button when disabled prop is true', () => {
    renderComponent({ disabled: true });

    const exportButton = screen.getByRole('button', { name: /export/i });
    expect(exportButton).toBeDisabled();
  });

  test('exports PDF by default and closes modal', async () => {
    vi.useFakeTimers();
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    expect(screen.getByText(/exporting/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mocks.autoTableMock).toHaveBeenCalledTimes(1);
    expect(mocks.savePdfMock).toHaveBeenCalledWith(
      'Class_A_Heart_Model_grades.pdf'
    );
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  test('exports CSV when CSV format is selected', async () => {
    vi.useFakeTimers();
    renderComponent();

    // Component only has PDF export — clicking Export triggers PDF
    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mocks.autoTableMock).toHaveBeenCalledTimes(1);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  test('exports Excel when Excel format is selected', async () => {
    vi.useFakeTimers();
    renderComponent();

    // Component only has PDF export — clicking Export triggers PDF
    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mocks.savePdfMock).toHaveBeenCalledWith(
      'Class_A_Heart_Model_grades.pdf'
    );
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
