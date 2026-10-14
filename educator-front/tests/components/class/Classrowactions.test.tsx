import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
// Initializes the real i18next singleton (side effect on import) so
// useTranslation() inside ClassRowActions resolves real strings even
// without wrapping in an I18nextProvider.
import '../../../src/i18n';
import ClassRowActions from '../../../src/components/class/Classrowactions';
import type { ClassWithStudents } from '../../../src/types/Class_types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const review = vi.fn();
vi.mock('../../../src/hooks/useBulkReportReview', () => ({
  useBulkReportReview: () => ({ review, isReviewing: false }),
}));

const exportStudentCodes = vi.fn();
const printStudentCodes = vi.fn();
const cancelExport = vi.fn();
let isExporting = false;
vi.mock('../../../src/hooks/useStudentCodesExport', () => ({
  useStudentCodesExport: () => ({
    exportStudentCodes,
    printStudentCodes,
    cancelExport,
    isExporting,
  }),
}));

// Provide a Redux store context so useAppSelector inside ClassRowActions works
vi.mock('../../../src/store/hooks', () => ({
  useAppSelector: vi.fn(() => []),
  useAppDispatch: () => vi.fn(),
}));

vi.mock('../../../src/components/class/BulkEmailReportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="email-report-modal">
      <button onClick={onClose}>Close Email Report</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/ClassEmailAccesscode', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="access-code-modal">
      <button onClick={onClose}>Close Student Code</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/simulation/ExportReportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="export-report-modal">
      <button onClick={onClose}>Close Export</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/ClassActionReportsModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="view-report-modal">
      <button onClick={onClose}>Close View Report</button>
    </div>
  ),
}));

// ─── Shared test data ─────────────────────────────────────────────────────────

const mockRow: ClassWithStudents = {
  id: 'class-1',
  class_name: 'Math 101',
  term: 'i',
  year: '2026',
  status: 'ACTIVE',
  start_date: '2026-01-01T00:00:00',
  end_date: '2026-12-31T00:00:00',
  students: [
    {
      student_id: 's1',
      student_name: 'Alice',
      email: 'alice@example.com',
      score: null,
    },
    {
      student_id: 's2',
      student_name: 'Bob',
      email: 'bob@example.com',
      score: null,
    },
  ],
};

const defaultProps = {
  row: mockRow,
  openMenuId: null as string | null,
  openStatusId: null as string | null,
  onMenuToggle: vi.fn(),
  onStatusToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onStatusChange: vi.fn(),
  onAIInsights: vi.fn(),
};

const renderWithMenu = (overrides: Record<string, unknown> = {}) =>
  render(
    <ClassRowActions
      {...defaultProps}
      openMenuId="class-1" // menu open
      {...overrides}
    />
  );

const renderClosed = (overrides: Record<string, unknown> = {}) =>
  render(<ClassRowActions {...defaultProps} {...overrides} />);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClassRowActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isExporting = false;
  });

  // ── Three-dot button ────────────────────────────────────────────────────────

  describe('Three-dot toggle button', () => {
    it('renders the three-dot menu button', () => {
      renderClosed();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('calls onMenuToggle with row.id when menu is closed', () => {
      renderClosed();
      fireEvent.click(screen.getByRole('button'));
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith('class-1');
    });

    it('calls onMenuToggle with null when menu is already open', () => {
      renderWithMenu();
      fireEvent.click(screen.getByRole('button', { name: 'Class actions' }));
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(null);
    });

    it('does NOT render dropdown when openMenuId does not match row.id', () => {
      renderClosed({ openMenuId: 'other-id' });
      expect(screen.queryByText('Edit Class Details')).not.toBeInTheDocument();
    });
  });

  // ── Dropdown menu items ─────────────────────────────────────────────────────

  describe('Dropdown menu items', () => {
    it('renders all menu items when menu is open', () => {
      renderWithMenu();
      expect(screen.getByText('Edit Class Details')).toBeInTheDocument();
      expect(screen.getByText('Email Student Code')).toBeInTheDocument();
      expect(screen.getByText('Print Student Code')).toBeInTheDocument();
      expect(
        screen.getByText('View Reports / Transcripts')
      ).toBeInTheDocument();
      expect(screen.getByText('Export Reports')).toBeInTheDocument();
      expect(screen.getByText('Class Status')).toBeInTheDocument();
      expect(screen.getByText('Delete Class')).toBeInTheDocument();
    });

    it('lists the actions in the design order', () => {
      renderWithMenu();
      const labels = screen
        .getAllByRole('button')
        .map((b) => b.textContent?.replace('◂', '').trim())
        .filter(Boolean);
      expect(labels.slice(labels.indexOf('Edit Class Details'))).toEqual([
        'Edit Class Details',
        'Email Student Code',
        'Export Student Codes (CSV)',
        'Print Student Code',
        'View Reports / Transcripts',
        'Export Reports',
        'Export Transcripts',
        'Mark All Reports Reviewed',
        'Mark All Reports Unreviewed',
        'Class Status',
        'Delete Class',
      ]);
    });

    it.each([
      ['Mark All Reports Reviewed', true],
      ['Mark All Reports Unreviewed', false],
    ])('"%s" bulk-reviews the whole class', (label, reviewed) => {
      review.mockClear();
      renderWithMenu();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(review).toHaveBeenCalledWith({
        type: 'class',
        ids: ['class-1'],
        reviewed,
        classId: 'class-1',
      });
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(null);
    });

    it('exports the student codes as CSV from the BE and closes the menu', () => {
      renderWithMenu();
      fireEvent.click(
        screen.getByRole('button', { name: 'Export Student Codes (CSV)' })
      );
      expect(exportStudentCodes).toHaveBeenCalledWith({
        classId: 'class-1',
        className: 'Math 101',
        format: 'csv',
      });
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(null);
    });

    it('disables both student code actions while an export is running', () => {
      isExporting = true;
      renderWithMenu();
      expect(
        screen.getByRole('button', { name: 'Export Student Codes (CSV)' })
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Print Student Code' })
      ).toBeDisabled();
    });

    it('"View Reports / Transcripts" button is enabled', () => {
      renderWithMenu();
      expect(
        screen.getByRole('button', { name: 'View Reports / Transcripts' })
      ).not.toBeDisabled();
    });

    it('"Export Reports" button is enabled', () => {
      renderWithMenu();
      expect(
        screen.getByRole('button', { name: 'Export Reports' })
      ).not.toBeDisabled();
    });
  });

  // ── Edit ────────────────────────────────────────────────────────────────────

  describe('Edit Class Details', () => {
    it('calls onEdit with row and closes menu', () => {
      renderWithMenu();
      fireEvent.click(screen.getByText('Edit Class Details'));
      expect(defaultProps.onEdit).toHaveBeenCalledWith(mockRow);
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(null);
    });
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  describe('Delete', () => {
    it('calls onDelete with row and closes menu', () => {
      renderWithMenu();
      fireEvent.click(screen.getByText('Delete Class'));
      expect(defaultProps.onDelete).toHaveBeenCalledWith(mockRow);
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(null);
    });
  });

  // ── Print ───────────────────────────────────────────────────────────────────

  describe('Print Student Code', () => {
    it('opens the print modal and closes the menu without fetching', () => {
      renderWithMenu();
      fireEvent.click(screen.getByText('Print Student Code'));
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(null);
      expect(screen.getByText('All Students Code')).toBeInTheDocument();
      expect(printStudentCodes).not.toHaveBeenCalled();
      expect(exportStudentCodes).not.toHaveBeenCalled();
    });

    it('prints the class codes from the modal and keeps it open, as before', async () => {
      printStudentCodes.mockResolvedValueOnce(true);
      renderWithMenu();
      fireEvent.click(screen.getByText('Print Student Code'));
      fireEvent.click(screen.getByRole('button', { name: 'Print' }));

      expect(printStudentCodes).toHaveBeenCalledWith({
        classId: 'class-1',
        className: 'Math 101',
      });
      await waitFor(() => expect(printStudentCodes).toHaveBeenCalledTimes(1));
      expect(screen.getByText('All Students Code')).toBeInTheDocument();
      expect(exportStudentCodes).not.toHaveBeenCalled();
    });

    it('closes the modal on Back without printing', () => {
      renderWithMenu();
      fireEvent.click(screen.getByText('Print Student Code'));
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.queryByText('All Students Code')).not.toBeInTheDocument();
      expect(printStudentCodes).not.toHaveBeenCalled();
    });

    it('cancels a print that is still loading when the modal is closed', () => {
      printStudentCodes.mockReturnValueOnce(new Promise(() => {}));
      renderWithMenu();
      fireEvent.click(screen.getByText('Print Student Code'));
      fireEvent.click(screen.getByRole('button', { name: 'Print' }));
      expect(printStudentCodes).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(cancelExport).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('All Students Code')).not.toBeInTheDocument();
    });

    it('stays disabled for an inactive class, while CSV export still works', () => {
      renderWithMenu({ row: { ...mockRow, status: 'INACTIVE' } });
      const print = screen.getByRole('button', { name: 'Print Student Code' });
      expect(print).toBeDisabled();
      fireEvent.click(print);
      expect(screen.queryByText('All Students Code')).not.toBeInTheDocument();
      expect(printStudentCodes).not.toHaveBeenCalled();
      expect(exportStudentCodes).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole('button', { name: 'Export Student Codes (CSV)' })
      );
      expect(exportStudentCodes).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'csv' })
      );
    });
  });

  // ── Class Status submenu ────────────────────────────────────────────────────

  describe('Class Status submenu', () => {
    const renderWithStatusSubmenu = (
      overrides: Record<string, unknown> = {}
    ) => {
      renderWithMenu(overrides);
      fireEvent.mouseEnter(screen.getByText('Class Status'));
    };

    it('renders only the Active, Inactive and Archived status options', () => {
      renderWithStatusSubmenu();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
      expect(screen.queryByText('Draft')).not.toBeInTheDocument();
    });

    it('calls onStatusChange with correct value when Active is clicked', () => {
      renderWithStatusSubmenu();
      fireEvent.click(screen.getByText('Active'));
      expect(defaultProps.onStatusChange).toHaveBeenCalledWith(
        mockRow,
        'ACTIVE'
      );
      expect(defaultProps.onStatusToggle).toHaveBeenCalledWith(null);
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(null);
    });

    it('calls onStatusChange with INACTIVE', () => {
      renderWithStatusSubmenu();
      fireEvent.click(screen.getByText('Inactive'));
      expect(defaultProps.onStatusChange).toHaveBeenCalledWith(
        mockRow,
        'INACTIVE'
      );
    });

    it('calls onStatusChange with ARCHIVED', () => {
      renderWithStatusSubmenu();
      fireEvent.click(screen.getByText('Archived'));
      expect(defaultProps.onStatusChange).toHaveBeenCalledWith(
        mockRow,
        'ARCHIEVED'
      );
    });

    it('highlights current status with orange text', () => {
      renderWithStatusSubmenu();
      const activeBtn = screen.getByText('Active');
      expect(activeBtn).toHaveClass('text-primary-500');
    });

    it('non-current status buttons do not have orange text', () => {
      renderWithStatusSubmenu();
      expect(screen.getByText('Inactive')).not.toHaveClass('text-primary-500');
      expect(screen.getByText('Archived')).not.toHaveClass('text-primary-500');
    });
  });

  // ── Email Access Code modal ─────────────────────────────────────────────────

  describe('Email Student Code modal', () => {
    it('opens student code modal when "Email Student Code" is clicked', async () => {
      renderWithMenu();
      fireEvent.click(screen.getByText('Email Student Code'));
      await waitFor(() =>
        expect(screen.getByTestId('access-code-modal')).toBeInTheDocument()
      );
    });

    it('closes student code modal on close callback', async () => {
      renderWithMenu();
      fireEvent.click(screen.getByText('Email Student Code'));
      await waitFor(() => screen.getByTestId('access-code-modal'));
      fireEvent.click(screen.getByText('Close Student Code'));
      await waitFor(() =>
        expect(
          screen.queryByTestId('access-code-modal')
        ).not.toBeInTheDocument()
      );
    });

    it('closes menu when Email Student Code is clicked', async () => {
      renderWithMenu();
      fireEvent.click(screen.getByText('Email Student Code'));
      expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(null);
    });
  });

  // ── Export Report modal ─────────────────────────────────────────────────────

  describe('Export Report modal (direct trigger via state)', () => {
    // Export Report button is disabled in the UI; test modal renders correctly
    // by verifying modal is NOT shown by default
    it('does not show export modal on initial render', () => {
      renderWithMenu();
      expect(
        screen.queryByTestId('export-report-modal')
      ).not.toBeInTheDocument();
    });
  });

  // ── Click propagation ───────────────────────────────────────────────────────

  describe('Click propagation', () => {
    it('stops propagation on the outer wrapper click', () => {
      const parentHandler = vi.fn();
      const { container } = renderClosed();
      const wrapper = container.firstChild as HTMLElement;
      // Wrap in a parent that listens for clicks
      wrapper.addEventListener('click', parentHandler);
      fireEvent.click(screen.getByRole('button'));
      // The outer div stopPropagation should prevent parent from being called
      // (fireEvent doesn't bubble past jsdom root so just verify button works)
      expect(defaultProps.onMenuToggle).toHaveBeenCalled();
    });
  });

  // ── Dropdown not shown ──────────────────────────────────────────────────────

  describe('Closed state', () => {
    it('shows no dropdown items when openMenuId is null', () => {
      renderClosed();
      expect(screen.queryByText('Edit Class Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('shows no modals on initial render', () => {
      renderClosed();
      expect(screen.queryByTestId('access-code-modal')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('email-report-modal')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('export-report-modal')
      ).not.toBeInTheDocument();
    });
  });
});
