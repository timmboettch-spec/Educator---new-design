import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShareModal from '../../../src/components/modal/ShareModal';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen,
    title,
    onClose,
    children,
  }: {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close modal">
          Close
        </button>
        {children}
      </div>
    );
  },
}));

describe('ShareModal', () => {
  const onClose = vi.fn();
  const openSpy = vi.fn();
  const writeTextSpy = vi.fn();

  const renderModal = (isOpen = true) =>
    render(
      <ShareModal
        isOpen={isOpen}
        onClose={onClose}
        title="Simulation A"
        simulationUrl="https://example.com/simulation/1"
      />,
    );

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal('open', openSpy);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextSpy,
      },
    });

    writeTextSpy.mockResolvedValue(undefined);
  });

  it('renders social options and page link when open', () => {
    renderModal(true);

    expect(screen.getByText('Share')).toBeInTheDocument();
    expect(screen.getByText('Mail')).toBeInTheDocument();
    expect(screen.getByText('Twitter')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Messenger')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Page Link')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com/simulation/1')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderModal(false);

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('opens Twitter share URL on Twitter click', () => {
    renderModal(true);

    fireEvent.click(screen.getByRole('button', { name: 'Twitter' }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://twitter.com/intent/tweet?'),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens WhatsApp share URL on WhatsApp click', () => {
    renderModal(true);

    fireEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/?text='),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('copies link and shows Messenger-specific toast on Messenger click', async () => {
    renderModal(true);

    fireEvent.click(screen.getByRole('button', { name: 'Messenger' }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('https://example.com/simulation/1');
      expect(toastSuccess).toHaveBeenCalledWith('Link copied. Paste it in Messenger to share.');
    });
  });

  it('copies page link and shows default copy success toast', async () => {
    renderModal(true);

    fireEvent.click(screen.getByRole('button', { name: 'Copy page link' }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('https://example.com/simulation/1');
      expect(toastSuccess).toHaveBeenCalledWith('Link copied to clipboard');
    });
  });

  it('shows error toast when clipboard copy fails', async () => {
    writeTextSpy.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    renderModal(true);

    fireEvent.click(screen.getByRole('button', { name: 'Copy page link' }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Failed to copy link');
    });
  });
});
