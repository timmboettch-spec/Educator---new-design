import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Initializes the real i18next singleton (side effect on import) so
// useTranslation() inside useClassColumns resolves real strings even
// without wrapping in an I18nextProvider.
import '../../../src/i18n';
import { useClassColumns } from '../../../src/components/class/Useclasscolumns';
import type { ClassWithStudents } from '../../../src/types/Class_types';

// Mock SortableHeader
vi.mock('../../../src/components/common/SortableHeader', () => ({
  default: ({
    label,
    field,
    onSort,
    focusable,
    ariaLabel,
  }: {
    label: string;
    field: string;
    onSort: (field: string) => void;
    focusable?: boolean;
    ariaLabel?: string;
  }) => (
    <button
      tabIndex={focusable ? undefined : -1}
      aria-label={ariaLabel}
      onClick={() => onSort(field)}
    >
      {label}
    </button>
  ),
}));

// Mock redux hooks
vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: () => [],
  Provider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: () => [],
}));

// Mock redux actions
vi.mock('../../../src/redux/class/GetSimsRedux', () => ({
  FetchSimulationsByClass: vi.fn(),
  selectSimulationsByClassId: () => () => [],
}));

// Mock status label
vi.mock('../../../src/types/Class_types', async () => {
  const actual = await vi.importActual('../../../src/types/Class_types');

  return {
    ...actual,
    getStatusLabel: (status: string) => status,
  };
});

function TestComponent() {
  const mockOnSort = vi.fn();

  const columns = useClassColumns({
    sortField: null,
    sortDirection: null,
    onSort: mockOnSort,
    expandedId: null,
    expandedType: null,
    onToggleExpand: vi.fn(),
  });

  return (
    <div>
      {columns.map((col, index) => (
        <div key={index}>{col.header}</div>
      ))}
    </div>
  );
}

describe('useClassColumns', () => {
  it('renders all class table headers', () => {
    render(<TestComponent />);

    expect(screen.getByText('Class Name')).toBeInTheDocument();
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('Sims')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Class Status')).toBeInTheDocument();
    // Rows are grouped by school, so there is no separate School column.
    expect(screen.queryByText('School Name')).not.toBeInTheDocument();
  });

  it('triggers sort callback when sortable header clicked', () => {
    const mockOnSort = vi.fn();

    function SortTestComponent() {
      const columns = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: mockOnSort,
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });

      // Students column is at index 1 (0: Class Name, 1: Students)
      return <div>{columns[1]?.header}</div>;
    }

    render(<SortTestComponent />);

    fireEvent.click(screen.getByText('Students'));

    expect(mockOnSort).toHaveBeenCalledWith('students');
  });

  it('makes sortable headers keyboard-reachable and names them with their sort state', () => {
    function SortStateHeaders() {
      const columns = useClassColumns({
        sortField: 'students',
        sortDirection: 'desc',
        onSort: vi.fn(),
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });
      return (
        <div>
          {columns.map((col, index) => (
            <div key={index}>{col.header}</div>
          ))}
        </div>
      );
    }

    render(<SortStateHeaders />);

    const students = screen.getByRole('button', {
      name: 'Students, sorted descending',
    });
    expect(students).not.toHaveAttribute('tabindex');
    expect(
      screen.getByRole('button', { name: 'Class Name, not sorted' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Class Status, not sorted' })
    ).toBeInTheDocument();
  });

  it('renders sortable headers as buttons', () => {
    render(<TestComponent />);

    const buttons = screen.getAllByRole('button');

    expect(buttons.length).toBeGreaterThan(0);
  });

  it('does not crash with mocked class data', () => {
    const mockData: ClassWithStudents = {
      id: '1',
      class_name: 'Class A',
      year: '2025',
      term: 'I',
      status: 'ACTIVE',
      students: [],
      sims: [],
      reports: [],
      start_date: '',
      end_date: '',
    };

    function RenderCellComponent() {
      const columns = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: vi.fn(),
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });

      return (
        <div>
          {columns.map((col, index) => (
            <div key={index}>{col.render ? col.render(mockData) : null}</div>
          ))}
        </div>
      );
    }

    render(<RenderCellComponent />);

    expect(screen.getByText('Class A')).toBeInTheDocument();
  });

  it('shows the class date range as dd/mm/yyyy', () => {
    const row: ClassWithStudents = {
      id: '1',
      class_name: 'Class A',
      status: 'ACTIVE',
      students: [],
      sims: [],
      start_date: '2024-02-01',
      end_date: '2024-02-29',
    };

    function RenderNameCell() {
      const [nameColumn] = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: vi.fn(),
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });
      return <div>{nameColumn?.render?.(row)}</div>;
    }

    render(<RenderNameCell />);

    expect(screen.getByText('02-01-2024 – 02-29-2024')).toBeInTheDocument();
  });

  it('shows long class names without truncation while keeping adjacent controls visible', () => {
    const mockData: ClassWithStudents = {
      id: '1',
      class_name:
        'This is an extremely long class name intended to verify truncation behavior in the class table layout',
      year: '2025',
      term: 'I',
      status: 'ACTIVE',
      students: [
        { id: 's1' } as unknown as NonNullable<
          ClassWithStudents['students']
        >[number],
      ],
      sims: [],
      reports: [],
      start_date: '',
      end_date: '',
    };

    function RenderLongNameRow() {
      const columns = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: vi.fn(),
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });

      // 0: Class Name, 1: Students
      return (
        <div>
          <div>{columns[0]?.render?.(mockData)}</div>
          <div>{columns[1]?.render?.(mockData)}</div>
        </div>
      );
    }

    render(<RenderLongNameRow />);

    const longName = screen.getByText(mockData.class_name);
    expect(longName).toHaveClass('whitespace-normal');
    expect(longName).toHaveClass('break-words');
    expect(longName).not.toHaveClass('truncate');
    expect(longName).toHaveAttribute('title', mockData.class_name);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows the class-list API counts for students and reports when present', () => {
    const row: ClassWithStudents = {
      id: '1',
      class_name: 'Class A',
      status: 'ACTIVE',
      students: [],
      sims: [],
      start_date: '',
      end_date: '',
      studentsCount: 7,
      reportsCount: 5,
    };

    function RenderCountCells() {
      const columns = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: vi.fn(),
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });
      // 0: Class Name, 1: Students, 2: Sims, 3: Reports
      return (
        <div>
          <div data-testid="students">{columns[1]?.render?.(row)}</div>
          <div data-testid="reports">{columns[3]?.render?.(row)}</div>
        </div>
      );
    }

    render(<RenderCountCells />);
    expect(screen.getByTestId('students')).toHaveTextContent('7');
    expect(screen.getByTestId('reports')).toHaveTextContent('5');
  });

  it('names the Reports button after the class and says whether it is open', () => {
    const row: ClassWithStudents = {
      id: '1',
      class_name: 'Class A',
      status: 'ACTIVE',
      students: [],
      sims: [],
      start_date: '',
      end_date: '',
      reportsCount: 0,
    };

    function ReportsCell({ open }: { open: boolean }) {
      const columns = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: vi.fn(),
        expandedId: open ? '1' : null,
        expandedType: open ? 'reports' : null,
        onToggleExpand: vi.fn(),
      });
      return (
        <div>
          {columns.map((col, i) => (
            <div key={i}>{col.render?.(row)}</div>
          ))}
        </div>
      );
    }

    const { rerender } = render(<ReportsCell open={false} />);
    expect(
      screen.getByRole('button', {
        name: /^Reports for Class A \(0 reports\)$/,
      })
    ).toHaveAttribute('aria-expanded', 'false');

    rerender(<ReportsCell open />);
    expect(
      screen.getByRole('button', { name: /^Reports for Class A/ })
    ).toHaveAttribute('aria-expanded', 'true');
  });
  it('shows an LMS pill on a linked class and names the course on hover', () => {
    const row: ClassWithStudents = {
      id: '1',
      class_name: 'OOP',
      status: 'ACTIVE',
      students: [],
      sims: [],
      start_date: '2024-02-01',
      end_date: '2024-02-29',
      lms_linkage: {
        provider: 'canvas',
        courseId: '39486fb4a1130131f1c65849a5ab017a1f3b006b',
        courseName: null,
      },
    };

    function RenderNameCell() {
      const [nameColumn] = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: vi.fn(),
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });
      return <div>{nameColumn?.render?.(row)}</div>;
    }

    render(<RenderNameCell />);

    const pill = screen.getByText('Canvas');
    expect(pill).toHaveClass('bg-gray-50');
    expect(pill).toHaveAttribute('aria-label', 'Linked to Canvas course “OOP”');

    fireEvent.mouseEnter(pill);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Linked to Canvas course “OOP”'
    );

    fireEvent.mouseLeave(pill);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the Google course name in the pill tooltip', () => {
    const row: ClassWithStudents = {
      id: '1',
      class_name: 'Nursing 101',
      status: 'ACTIVE',
      students: [],
      sims: [],
      start_date: '2024-02-01',
      end_date: '2024-02-29',
      lms_linkage: {
        provider: 'google_classroom',
        courseId: '98765',
        courseName: 'Realityworks Test Course',
      },
    };

    function RenderNameCell() {
      const [nameColumn] = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: vi.fn(),
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });
      return <div>{nameColumn?.render?.(row)}</div>;
    }

    render(<RenderNameCell />);

    const pill = screen.getByText('Google');
    expect(pill).toHaveClass('bg-gray-50');

    fireEvent.focus(pill);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Linked to Google course “Realityworks Test Course”'
    );
  });

  it('shows no LMS pill on a manual class', () => {
    const row: ClassWithStudents = {
      id: '1',
      class_name: 'Manual Class',
      status: 'ACTIVE',
      students: [],
      sims: [],
      start_date: '2024-02-01',
      end_date: '2024-02-29',
    };

    function RenderNameCell() {
      const [nameColumn] = useClassColumns({
        sortField: null,
        sortDirection: null,
        onSort: vi.fn(),
        expandedId: null,
        expandedType: null,
        onToggleExpand: vi.fn(),
      });
      return <div>{nameColumn?.render?.(row)}</div>;
    }

    render(<RenderNameCell />);

    expect(screen.queryByText('Canvas')).not.toBeInTheDocument();
    expect(screen.queryByText('Google')).not.toBeInTheDocument();
  });
});
