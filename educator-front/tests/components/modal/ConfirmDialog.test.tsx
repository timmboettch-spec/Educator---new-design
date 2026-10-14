import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { ConfirmDialog } from '../../../src/components/modal/ConfirmDialog';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: 'Delete Class',
  message: 'Are you sure you want to delete this class?',
  confirmText: 'Delete',
  cancelText: 'Back',
  isLoading: false,
  loadingText: 'Deleting...',
};

const renderDialog = (overrides: Partial<typeof defaultProps> = {}) => {
  const props = {
    ...defaultProps,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  render(<ConfirmDialog {...props} />);
  return props;
};

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title, message and item name', () => {
    render(<ConfirmDialog {...defaultProps} itemName="Biology 101" />);
    expect(screen.getByText('Delete Class')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete this class?')
    ).toBeInTheDocument();
    expect(screen.getByText('Biology 101')).toBeInTheDocument();
  });

  it('names the dialog by its title', () => {
    renderDialog();
    expect(
      screen.getByRole('dialog', { name: 'Delete Class' })
    ).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the cancel button is clicked', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the loading text and disables confirm while loading', () => {
    renderDialog({ isLoading: true });
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
  });
});
