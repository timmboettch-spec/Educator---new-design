import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useClassColumns } from '../../../src/components/class/Useclasscolumns';
import type { ClassWithStudents } from '../../../src/types/Class_types';

// Mock SortableHeader
vi.mock('../../../src/components/common/SortableHeader', () => ({
  default: ({
    label,
    field,
    onSort,
  }: {
    label: string;
    field: string;
    onSort: (field: string) => void;
  }) => <button onClick={() => onSort(field)}>{label}</button>,
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
    expect(screen.getByText('Status')).toBeInTheDocument();
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

      // Students column is at index 2 (0: Class Name, 1: School, 2: Students)
      return <div>{columns[2].header}</div>;
    }

    render(<SortTestComponent />);

    fireEvent.click(screen.getByText('Students'));

    expect(mockOnSort).toHaveBeenCalledWith('students');
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
      reports: 0,
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

  it('shows long class names without truncation while keeping adjacent controls visible', () => {
    const mockData: ClassWithStudents = {
      id: '1',
      class_name:
        'This is an extremely long class name intended to verify truncation behavior in the class table layout',
      year: '2025',
      term: 'I',
      status: 'ACTIVE',
      students: [{ id: 's1' } as unknown as ClassWithStudents['students'][number]],
      sims: [],
      reports: 0,
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

      // 0: Class Name, 1: School, 2: Students
      return (
        <div>
          <div>{columns[0].render?.(mockData)}</div>
          <div>{columns[2].render?.(mockData)}</div>
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
});
