import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PrintAccessCodeModal from '../../../src/components/class/PrintAccessCode';

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid="modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

const singleStudent = { studentName: 'Alice Smith', accessCode: 'CODE123' };

describe('PrintAccessCodeModal – visibility', () => {
  it('renders modal when isOpen is true', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={vi.fn()}
        className="Biology 101"
        student={singleStudent}
      />
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('does not render modal when isOpen is false', () => {
    render(
      <PrintAccessCodeModal
        isOpen={false}
        onClose={vi.fn()}
        className="Biology 101"
        student={singleStudent}
      />
    );
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders Print Student Code title', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={vi.fn()}
        className="Biology 101"
        student={singleStudent}
      />
    );
    expect(screen.getByText('Print Student Code')).toBeInTheDocument();
  });
});

describe('PrintAccessCodeModal – student code', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders student name', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={vi.fn()}
        className="Biology 101"
        student={singleStudent}
      />
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('renders student code', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={vi.fn()}
        className="Biology 101"
        student={singleStudent}
      />
    );
    expect(screen.getByText('CODE123')).toBeInTheDocument();
  });

  it('renders class name', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={vi.fn()}
        className="Biology 101"
        student={singleStudent}
      />
    );
    expect(screen.getByText('Biology 101')).toBeInTheDocument();
  });

  it('renders Back and Print buttons', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={vi.fn()}
        className="Biology 101"
        student={singleStudent}
      />
    );
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('calls onClose when Back is clicked', () => {
    const onClose = vi.fn();
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={onClose}
        className="Biology 101"
        student={singleStudent}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PrintAccessCodeModal – print action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockPrintWindow = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(
      mockPrintWindow as unknown as Window
    );
  });

  it('calls window.open when Print is clicked', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={vi.fn()}
        className="Biology 101"
        student={singleStudent}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(window.open).toHaveBeenCalledWith('', '_blank');
  });
});
