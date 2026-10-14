import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import '../../../src/i18n';
import { PrintClassStudentCodesModal } from '../../../src/components/class/PrintClassStudentCodesModal';

const renderModal = (
  overrides: Partial<Parameters<typeof PrintClassStudentCodesModal>[0]> = {}
) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    className: 'Oncology Nursing — Sec D',
    isPrinting: false,
    onPrint: vi.fn(),
    ...overrides,
  };
  render(<PrintClassStudentCodesModal {...props} />);
  return props;
};

describe('PrintClassStudentCodesModal', () => {
  it('shows the class and what will be printed', () => {
    renderModal();
    expect(
      screen.getByRole('heading', { name: 'Print Student Code' })
    ).toBeInTheDocument();
    expect(screen.getByText('Oncology Nursing — Sec D')).toBeInTheDocument();
    expect(screen.getByText('Student Code')).toBeInTheDocument();
    expect(screen.getByText('All Students Code')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText('Print Student Code')).not.toBeInTheDocument();
  });

  it('closes on Back', () => {
    const { onClose, onPrint } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('prints on Print', () => {
    const { onPrint } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('shows the preparing state and blocks a second print', () => {
    const { onPrint } = renderModal({ isPrinting: true });
    const print = screen.getByRole('button', { name: /Preparing/ });
    expect(print).toBeDisabled();
    fireEvent.click(print);
    expect(onPrint).not.toHaveBeenCalled();
  });
});
