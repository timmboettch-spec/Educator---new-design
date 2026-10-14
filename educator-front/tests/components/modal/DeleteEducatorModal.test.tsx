import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import DeleteEducatorModal from '../../../src/components/modal/DeleteEducatorModal';

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
  }) => (isOpen ? <div role="dialog">{children}</div> : null),
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    loading,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
  }) => (
    <button onClick={onClick} disabled={loading}>
      {loading ? 'Loading…' : children}
    </button>
  ),
}));

const mockEducator = { id: '1', full_name: 'Jane Doe', email: 'jane@test.com' };

const defaultProps = {
  isDeleteModalOpen: true,
  setIsDeleteModalOpen: vi.fn(),
  selectedEducator: mockEducator as never,
  confirmDelete: vi.fn(),
  isDeleting: false,
};

describe('DeleteEducatorModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the modal when open', () => {
    render(<DeleteEducatorModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<DeleteEducatorModal {...defaultProps} isDeleteModalOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays the educator name in the confirmation message', () => {
    render(<DeleteEducatorModal {...defaultProps} />);
    expect(screen.getByText(/"Jane Doe"/)).toBeInTheDocument();
  });

  it('shows a Back button', () => {
    render(<DeleteEducatorModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('shows a Delete Educator button', () => {
    render(<DeleteEducatorModal {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /delete educator/i })
    ).toBeInTheDocument();
  });

  it('calls setIsDeleteModalOpen(false) when Back is clicked', () => {
    render(<DeleteEducatorModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(defaultProps.setIsDeleteModalOpen).toHaveBeenCalledWith(false);
  });

  it('calls confirmDelete when Delete Educator is clicked', () => {
    render(<DeleteEducatorModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /delete educator/i }));
    expect(defaultProps.confirmDelete).toHaveBeenCalled();
  });

  it('disables the Delete button while deleting', () => {
    render(<DeleteEducatorModal {...defaultProps} isDeleting={true} />);
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
  });

  it('shows cannot-be-undone messaging', () => {
    render(<DeleteEducatorModal {...defaultProps} />);
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });
});
