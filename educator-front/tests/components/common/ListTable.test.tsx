import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import ListTable, {
  ListTableHeader,
  type Column,
} from '../../../src/components/common/ListTable';

type School = { id: string; school_name: string; status: string };

const COLUMNS: Column<School>[] = [
  { header: 'School Name', accessor: 'school_name' },
  {
    header: 'Status',
    render: (row) => (
      <span>{row.status === 'ACTIVE' ? 'Active' : 'InActive'}</span>
    ),
  },
];

const generate = (count: number): School[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    school_name: `School ${i + 1}`,
    status: 'ACTIVE',
  }));

const renderTable = (data: School[], overrides: Record<string, unknown> = {}) =>
  render(<ListTable columns={COLUMNS} data={data} {...overrides} />);

describe('ListTable — column headers', () => {
  it('renders School Name and Status column headers', () => {
    renderTable(generate(1));
    expect(screen.getByText('School Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders Actions column header', () => {
    renderTable(generate(1));
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});

describe('ListTable — status badge formatting', () => {
  it('formats ACTIVE status as Active', () => {
    renderTable([{ id: '1', school_name: 'ABC School', status: 'ACTIVE' }]);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('formats INACTIVE status as InActive', () => {
    renderTable([{ id: '1', school_name: 'XYZ School', status: 'INACTIVE' }]);
    expect(screen.getByText('InActive')).toBeInTheDocument();
  });
});

describe('ListTable — row actions', () => {
  it('calls onView when Eye icon is clicked', () => {
    const onView = vi.fn();
    renderTable(generate(1), { onView });
    const eye = document.querySelector('svg.lucide-eye') as SVGElement;
    fireEvent.click(eye);
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('calls onEdit when SquarePen icon is clicked', () => {
    const onEdit = vi.fn();
    renderTable(generate(1), { onEdit });
    const pen = document.querySelector('svg.lucide-square-pen') as SVGElement;
    fireEvent.click(pen);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('calls onDelete when Trash2 icon is clicked', () => {
    const onDelete = vi.fn();
    renderTable(generate(1), { onDelete });
    const trash = document.querySelector('svg.lucide-trash-2') as SVGElement;
    fireEvent.click(trash);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });
});

describe('ListTable — pagination', () => {
  it('does not show pagination when data is 10 rows or fewer', () => {
    renderTable(generate(10));
    expect(
      screen.queryByRole('button', { name: /prev/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /next/i })
    ).not.toBeInTheDocument();
  });

  it('shows Prev and Next buttons when data exceeds 10 rows', () => {
    renderTable(generate(11));
    expect(screen.getByRole('button', { name: /prev/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('shows only first 10 rows on page 1', () => {
    renderTable(generate(11));
    expect(screen.getByText('School 1')).toBeInTheDocument();
    expect(screen.getByText('School 10')).toBeInTheDocument();
    expect(screen.queryByText('School 11')).not.toBeInTheDocument();
  });

  it('navigates to next page and shows remaining rows', async () => {
    renderTable(generate(11));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByText('School 11')).toBeInTheDocument()
    );
    expect(screen.queryByText('School 1')).not.toBeInTheDocument();
  });

  it('navigates back to previous page', async () => {
    renderTable(generate(11));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByText('School 11')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /prev/i }));
    await waitFor(() =>
      expect(screen.getByText('School 1')).toBeInTheDocument()
    );
    expect(screen.queryByText('School 11')).not.toBeInTheDocument();
  });

  it('renders page number buttons', () => {
    renderTable(generate(11));
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
  });

  it('navigates to a specific page via page number button', async () => {
    renderTable(generate(11));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() =>
      expect(screen.getByText('School 11')).toBeInTheDocument()
    );
  });

  it('resets to first page when data prop changes', async () => {
    const { rerender } = renderTable(generate(11));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByText('School 11')).toBeInTheDocument()
    );
    rerender(<ListTable columns={COLUMNS} data={generate(12)} />);
    await waitFor(() =>
      expect(screen.getByText('School 1')).toBeInTheDocument()
    );
    expect(screen.getByText('School 10')).toBeInTheDocument();
    expect(screen.queryByText('School 11')).not.toBeInTheDocument();
  });
});

describe('ListTable — hideHeader / paginated', () => {
  it('omits the header row when hideHeader is set', () => {
    renderTable(generate(1), { hideHeader: true });
    expect(screen.queryByText('School Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.getByText('School 1')).toBeInTheDocument();
  });

  it('renders every row without pagination controls when paginated is false', () => {
    renderTable(generate(12), { paginated: false });
    expect(screen.getByText('School 12')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /next/i })
    ).not.toBeInTheDocument();
  });
});

describe('ListTableHeader', () => {
  it('renders the column headers and the actions header on their own', () => {
    render(<ListTableHeader columns={COLUMNS} actionHeader="Acciones" />);
    expect(screen.getByText('School Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Acciones')).toBeInTheDocument();
  });
});
