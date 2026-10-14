import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/testUtils';
import EducatorDashboard from '@/pages/dashboard/educator/index';

vi.mock('@/redux/auth/MeRedux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/redux/auth/MeRedux')>()),
  fetchCurrentUser: () => () => {
    const promise = Promise.reject(new Error('offline'));
    promise.catch(() => {});
    return Object.assign(promise, {
      unwrap: () => promise,
      abort: () => {},
    });
  },
}));

vi.mock('@/components/dashboard/NotificationCenter', () => ({
  NotificationCenter: () => <section aria-label="Notification Center" />,
}));
vi.mock('@/components/dashboard/YourSchoolsCard', () => ({
  YourSchoolsCard: ({ schools }: { schools: unknown[] }) => (
    <section aria-label={`Your Schools (${schools.length})`} />
  ),
}));
vi.mock('@/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/storage')>()),
  getParsedUser: () => mockUser,
}));
vi.mock('@/components/dashboard/productsUsage/MyProductsUsage', () => ({
  MyProductsUsage: ({ onRequestSeats }: { onRequestSeats: () => void }) => (
    <section aria-label="My Products & Usage">
      <button type="button" onClick={onRequestSeats}>
        Request More Seats
      </button>
    </section>
  ),
}));
vi.mock('@/components/dashboard/SimulationsCompletedChart', () => ({
  SimulationsCompletedChart: () => (
    <section aria-label="Graphical Overview of Simulations Completed" />
  ),
}));
vi.mock('@/components/dashboard/ActivityOverview', () => ({
  ActivityOverview: () => null,
}));
vi.mock('@/components/class/ClassesNeedingAttentionCard', () => ({
  default: () => null,
}));
vi.mock('@/components/modal/RequestSeatsModal', () => ({
  default: ({
    isOpen,
    products = [],
  }: {
    isOpen: boolean;
    products?: { value: string }[];
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Request more AI seats">
        {products.length} products
      </div>
    ) : null,
}));

// A multi-school educator, so the Your Schools card is shown.
const mockUser = vi.hoisted(() => ({
  role: 'Educator',
  schools: [
    { id: 's1', school_name: 'North High' },
    { id: 's2', school_name: 'South College' },
  ],
}));

describe('Educator dashboard sections', () => {
  it('renders the sections in the design order, without class cards', () => {
    renderWithProviders(<EducatorDashboard />);

    const sections = [
      screen.getByRole('region', { name: 'Notification Center' }),
      screen.getByRole('heading', { name: 'Alerts & Activity Overview' }),
      screen.getByRole('region', { name: 'Your Schools (2)' }),
      screen.getByRole('region', { name: 'My Products & Usage' }),
      screen.getByRole('region', {
        name: 'Graphical Overview of Simulations Completed',
      }),
    ];
    sections.slice(1).forEach((section, i) => {
      expect(
        sections[i]!.compareDocumentPosition(section) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    expect(screen.queryByText(/My Active Classes/i)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Manage Classes/i })
    ).toBeNull();
    expect(screen.queryByText(/Total Seats/i)).toBeNull();
  });

  it('opens the seat request from My Products & Usage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EducatorDashboard />);

    await user.click(
      screen.getByRole('button', { name: 'Request More Seats' })
    );
    // Seats are requested on the avatar products.
    expect(
      screen.getByRole('dialog', { name: 'Request more AI seats' })
    ).toHaveTextContent('3 products');
  });
});
