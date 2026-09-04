// DeleteEducatorModal.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import DeleteEducatorModal from '../../../src/components/modal/DeleteEducatorModal';

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    children,
    isOpen,
    title,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    title?: string;
  }) =>
    isOpen ? (
      <div data-testid="modal">
        {title && <h1>{title}</h1>}
        {children}
      </div>
    ) : null,
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    loading,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }) => (
    <button type={type || 'button'} onClick={onClick} disabled={loading || disabled}>
      {loading ? 'Loading...' : children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="alert-icon" />,
}));

vi.mock('../../../src/utils/messages/educator', () => ({
  EDUCATOR_MODALS: {
    DELETE: 'Delete Educator',
  },
}));

describe('DeleteEducatorModal', () => {
  const mockSetIsDeleteModalOpen = vi.fn();
  const mockConfirmDelete = vi.fn();

  const mockEducator = {
    id: '1',
    full_name: 'John Doe',
  };

  const defaultProps = {
    isDeleteModalOpen: true,
    setIsDeleteModalOpen: mockSetIsDeleteModalOpen,
    selectedEducator: mockEducator,
    confirmDelete: mockConfirmDelete,
    isDeleting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders nothing when modal is closed', () => {
    render(<DeleteEducatorModal {...defaultProps} isDeleteModalOpen={false} />);

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  test('renders modal when open', () => {
    render(<DeleteEducatorModal {...defaultProps} />);

    expect(screen.getByTestId('modal')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /Delete Educator/i })).toBeInTheDocument();
  });

  test('renders delete title and educator name', () => {
    render(<DeleteEducatorModal {...defaultProps} />);

    expect(screen.getAllByText(/Delete Educator/i)[0]).toBeInTheDocument();

    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
  });

  test('renders confirmation message', () => {
    render(<DeleteEducatorModal {...defaultProps} />);

    expect(screen.getByText(/Are you sure you want to delete educator/i)).toBeInTheDocument();
  });

  test('renders Delete Educator and Back buttons', () => {
    render(<DeleteEducatorModal {...defaultProps} />);

    expect(screen.getAllByRole('button', { name: /Delete Educator/i })[0]).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  test('calls setIsDeleteModalOpen when Back button is clicked', () => {
    render(<DeleteEducatorModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    expect(mockSetIsDeleteModalOpen).toHaveBeenCalledWith(false);
  });

  test('calls confirmDelete when Delete Educator button is clicked', () => {
    render(<DeleteEducatorModal {...defaultProps} />);

    fireEvent.click(screen.getAllByRole('button', { name: /Delete Educator/i })[0]);

    expect(mockConfirmDelete).toHaveBeenCalledTimes(1);
  });

  test('shows loading state when deleting', () => {
    render(<DeleteEducatorModal {...defaultProps} isDeleting={true} />);

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');

    const disabledButton = buttons.find((button) => button.hasAttribute('disabled'));

    expect(disabledButton).toBeDefined();
  });

  test('handles null selectedEducator gracefully', () => {
    render(<DeleteEducatorModal {...defaultProps} selectedEducator={null} />);

    expect(screen.getByText(/Are you sure you want to delete educator/i)).toBeInTheDocument();
  });
});
