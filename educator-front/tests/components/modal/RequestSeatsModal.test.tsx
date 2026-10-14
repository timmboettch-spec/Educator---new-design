import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/testUtils';
import RequestSeatsModal from '@/components/modal/RequestSeatsModal';

const mockRequestMoreSeats = vi.fn();

vi.mock('@/redux/educator/RequestMoreSeatsRedux', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/redux/educator/RequestMoreSeatsRedux')
  >()),
  RequestMoreSeats: (input: unknown) => () => {
    mockRequestMoreSeats(input);
    return { unwrap: () => Promise.resolve({}) };
  },
}));

vi.mock('@/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

const LABELS = {
  title: 'Request more AI seats',
  description: 'Notify your admin.',
  amountLabel: 'Seats needed (optional)',
  amountPlaceholder: 'e.g. 25',
  noteLabel: 'Add a note (optional)',
  notePlaceholder: 'Share why you need more seats.',
  submit: 'Send Request',
  cancel: 'Cancel',
  sending: 'Sending...',
  successToast: 'Sent.',
  errorToast: 'Failed.',
  noteMax: 'Note must be 500 characters or fewer.',
  remainingTemplate: 'You currently have {{remaining}} AI seat(s) remaining.',
};

const PRODUCTS = [
  { value: 'sec', label: 'Avatar - Secondary', availableSeats: 32 },
  { value: 'post', label: 'Avatar - Post-Secondary', availableSeats: 145 },
];

const renderModal = (products?: typeof PRODUCTS) => {
  const onClose = vi.fn();
  renderWithProviders(
    <RequestSeatsModal
      isOpen
      onClose={onClose}
      remainingSeats={15}
      labels={LABELS}
      products={products}
    />
  );
  return { user: userEvent.setup(), onClose };
};

describe('RequestSeatsModal', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockRequestMoreSeats.mockClear();
  });

  it('asks which products need seats when products are given', () => {
    renderModal(PRODUCTS);
    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveTextContent(
      'You currently have 15 AI seat(s) remaining.'
    );
    expect(
      within(dialog).getByRole('group', {
        name: 'Which products do you need more seats on?',
      })
    ).toBeInTheDocument();
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2);
    expect(
      within(dialog).queryByLabelText('Seats needed (optional)')
    ).toBeNull();
  });

  it('sends the per-product total with the breakdown in the note', async () => {
    const { user, onClose } = renderModal(PRODUCTS);

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(
      screen.getAllByText('Currently available:', { exact: false })
    ).toHaveLength(2);

    await user.type(
      screen.getByRole('textbox', {
        name: 'Seats to request for Avatar - Secondary',
      }),
      '10'
    );
    await user.type(
      screen.getByRole('textbox', {
        name: 'Seats to request for Avatar - Post-Secondary',
      }),
      '1'
    );
    await user.type(
      screen.getByLabelText('Add a note (optional)'),
      'New cohort'
    );
    await user.click(screen.getByRole('button', { name: 'Send Request' }));

    expect(mockRequestMoreSeats).toHaveBeenCalledWith({
      requested_seats: 11,
      note: 'Requested seats by product:\n• Avatar - Secondary: 10 seats\n• Avatar - Post-Secondary: 1 seat\n\nNew cohort',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks a request over 500 seats', async () => {
    const { user } = renderModal(PRODUCTS);

    await user.click(
      screen.getByRole('checkbox', { name: 'Avatar - Secondary' })
    );
    await user.type(
      screen.getByRole('textbox', {
        name: 'Seats to request for Avatar - Secondary',
      }),
      '501'
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Maximum 500 seats can be requested in total.'
    );
    expect(screen.getByRole('button', { name: 'Send Request' })).toBeDisabled();
  });

  it('asks for a single amount without products', async () => {
    const { user } = renderModal();

    expect(screen.queryByRole('checkbox')).toBeNull();
    // Set the value directly: user.type into this number field drops keystrokes
    // under load (seen on CI), so the request went out without the amount.
    fireEvent.change(screen.getByLabelText('Seats needed (optional)'), {
      target: { value: '5' },
    });
    await user.click(screen.getByRole('button', { name: 'Send Request' }));

    expect(mockRequestMoreSeats).toHaveBeenCalledWith({
      requested_seats: 5,
      note: undefined,
    });
  });

  it('counts the generated product breakdown against the note limit', async () => {
    const { user } = renderModal(PRODUCTS);

    await user.click(
      screen.getByRole('checkbox', { name: 'Avatar - Secondary' })
    );
    await user.type(
      screen.getByRole('textbox', {
        name: 'Seats to request for Avatar - Secondary',
      }),
      '10'
    );
    const breakdown =
      'Requested seats by product:\n• Avatar - Secondary: 10 seats';
    const limit = 500 - breakdown.length - '\n\n'.length;
    expect(screen.getByText(`0/${limit}`)).toBeInTheDocument();

    // Fits 500 on its own, but not with the breakdown in front of it.
    fireEvent.change(screen.getByLabelText('Add a note (optional)'), {
      target: { value: 'x'.repeat(limit + 1) },
    });
    expect(
      screen.getByText(
        `With the selected products, your note can be up to ${limit} characters.`
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Request' })).toBeDisabled();
  });

  it('uses the same wide layout with or without products, matching the design', () => {
    renderModal(PRODUCTS);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-2xl');
    cleanup();

    renderModal();
    expect(screen.getByRole('dialog')).toHaveClass('max-w-2xl');
  });

  it('shows the seat limit in the active language without products', async () => {
    await i18n.changeLanguage('es');
    renderModal();

    fireEvent.change(screen.getByLabelText('Seats needed (optional)'), {
      target: { value: '501' },
    });
    expect(
      screen.getByText('Se pueden solicitar como máximo 500 puestos en total.')
    ).toBeInTheDocument();
  });

  it('counts the note and flags it when too long', async () => {
    renderModal(PRODUCTS);
    const note = screen.getByLabelText('Add a note (optional)');

    expect(screen.getByText('0/500')).toBeInTheDocument();
    fireEvent.change(note, { target: { value: 'x'.repeat(501) } });
    expect(screen.getByText('501/500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Request' })).toBeDisabled();
  });
});
