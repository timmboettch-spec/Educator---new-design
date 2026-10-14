// ConfirmModal.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfirmModal from '../../../src/components/modal/ConfirmationModal';

// Mock Modal component
vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen,
    children,
    footer,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    footer: React.ReactNode;
  }) =>
    isOpen ? (
      <div data-testid="modal">
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
}));

describe('ConfirmModal', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();

  const defaultProps = {
    isOpen: true,
    onConfirm: mockOnConfirm,
    onCancel: mockOnCancel,
    cancelText: 'Cancel',
    confirmText: 'Delete',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with title and message', () => {
    render(
      <ConfirmModal
        {...defaultProps}
        title="Delete Item"
        message="Are you sure you want to delete this item?"
      />
    );

    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete this item?')
    ).toBeInTheDocument();
  });

  it('renders default title and message', () => {
    render(<ConfirmModal {...defaultProps} />);

    expect(screen.getByText('Confirmation')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to proceed?')
    ).toBeInTheDocument();
  });

  it('renders confirm and cancel buttons', () => {
    render(<ConfirmModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(<ConfirmModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when confirm button is clicked', () => {
    render(<ConfirmModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows loading text when isLoading is true', () => {
    render(<ConfirmModal {...defaultProps} isLoading />);

    expect(screen.getByText('Delete...')).toBeInTheDocument();
  });

  it('disables buttons when loading', () => {
    render(<ConfirmModal {...defaultProps} isLoading />);

    const cancelButton = screen.getByRole('button', {
      name: 'Cancel',
    });

    const confirmButton = screen.getByRole('button', {
      name: 'Delete...',
    });

    expect(cancelButton).toBeDisabled();
    expect(confirmButton).toBeDisabled();
  });

  it('does not render modal when isOpen is false', () => {
    render(<ConfirmModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders logout icon image', () => {
    render(<ConfirmModal {...defaultProps} />);

    const image = screen.getByAltText('Logout');

    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src');
  });
});
