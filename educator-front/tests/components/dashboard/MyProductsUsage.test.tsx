import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { MyProductsUsage } from '@/components/dashboard/productsUsage/MyProductsUsage';

// Who's signed in, for the per-person collapsed state (none by default).
const mockCardUser = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));
vi.mock('@/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/storage')>()),
  getParsedUser: () => mockCardUser.current,
}));
import {
  buildAvatarUsage,
  getDashboardProducts,
  groupProducts,
} from '@/utils/dashboardProducts';

const SEATS = { total: 200, consumed: 120, available: 80 };
const PRODUCTS = getDashboardProducts(new Date(2026, 9, 13));

const renderSection = (onRequestSeats = vi.fn()) => {
  const user = userEvent.setup();
  render(
    <I18nextProvider i18n={i18n}>
      <MyProductsUsage
        products={PRODUCTS}
        seats={SEATS}
        onRequestSeats={onRequestSeats}
      />
    </I18nextProvider>
  );
  return { user, onRequestSeats };
};

const expand = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'My Products & Usage' }));

describe('MyProductsUsage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    mockCardUser.current = null;
  });

  it('stays expanded for the same person after a remount', async () => {
    mockCardUser.current = { id: 'educator-1' };
    const { user } = renderSection();
    await expand(user);
    cleanup();

    renderSection();
    expect(
      screen.getByRole('button', { name: 'My Products & Usage' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('is collapsed by default', () => {
    renderSection();
    expect(
      screen.getByRole('button', { name: 'My Products & Usage' })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/My Active Associated Products/)).toBeNull();
  });

  it('lists the active products by edition and group', async () => {
    const { user } = renderSection();
    await expand(user);

    expect(
      screen.getByRole('button', { name: 'My Active Associated Products (7)' })
    ).toBeInTheDocument();
    expect(screen.getByText('3 avatar · 4 workstation')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Secondary Education Edition (4)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Post-Secondary Education Edition (3)',
      })
    ).toBeInTheDocument();
    // The expired PAT Manikin unit is left out.
    expect(screen.queryByText('PAT Manikin™')).toBeNull();
  });

  it('asks for more seats from each avatar group', async () => {
    const { user, onRequestSeats } = renderSection();
    await expand(user);

    const buttons = screen.getAllByRole('button', {
      name: 'Request More Seats',
    });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]!);
    expect(onRequestSeats).toHaveBeenCalledTimes(1);
  });

  it('shows the real seat totals and the placeholder note', async () => {
    const { user } = renderSection();
    await expand(user);

    const seatsBar = screen.getByRole('progressbar', {
      name: 'My total use of avatar seats (secondary and post-secondary)',
    });
    expect(seatsBar).toHaveAttribute('aria-valuenow', '120');
    expect(seatsBar).toHaveAttribute('aria-valuemax', '200');
    expect(screen.getByText(/placeholders/i)).toBeInTheDocument();
  });

  it('keeps each edition together, header then avatar then workstation', async () => {
    const { user } = renderSection();
    await expand(user);

    const order = screen
      .getAllByRole('heading', { level: 3 })
      .concat(screen.getAllByRole('heading', { level: 4 }))
      .sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      .map((h) => h.textContent)
      .filter((text) => /Edition|SIMULATIONS|Simulations/.test(text ?? ''));

    expect(order).toEqual([
      'Secondary Education Edition (4)',
      expect.stringMatching(/Avatar Simulations \(1\)/i),
      expect.stringMatching(/Workstation Simulations \(3\)/i),
      'Post-Secondary Education Edition (3)',
      expect.stringMatching(/Avatar Simulations \(2\)/i),
      expect.stringMatching(/Workstation Simulations \(1\)/i),
    ]);
  });

  it('collapses a sub-section on its own', async () => {
    const { user } = renderSection();
    await expand(user);

    const usage = screen.getByRole('button', { name: 'My Usage' });
    await user.click(usage);
    expect(usage).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(
      screen.getByRole('button', { name: /My Active Associated Products/ })
    ).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('dashboardProducts', () => {
  it('drops products past their expiry day', () => {
    const keys = getDashboardProducts(new Date(2026, 6, 1)).map((p) => p.key);
    expect(keys).not.toContain('WS-PS-0051');
    expect(
      getDashboardProducts(new Date(2026, 5, 30, 12)).map((p) => p.key)
    ).toContain('WS-PS-0051');
  });

  it('splits avatar seats by edition and keeps the real totals', () => {
    const groups = groupProducts(getDashboardProducts(new Date(2026, 9, 13)));
    const usage = buildAvatarUsage(SEATS, groups);

    expect(usage.seats).toEqual({ used: 120, total: 200 });
    expect(usage.remainingSeats).toBe(80);
    expect(usage.secondarySeats.total + usage.postSecondarySeats.total).toBe(
      200
    );
    expect(usage.secondarySeats.used + usage.postSecondarySeats.used).toBe(120);
  });
});

describe('MyProductsUsage within the card', () => {
  it('renders each product card with its expiry', async () => {
    const { user } = renderSection();
    await expand(user);
    const lists = screen.getAllByRole('list');
    const firstCard = within(lists[0]!).getAllByRole('listitem')[0]!;
    expect(firstCard).toHaveTextContent(/Expires/);
  });
});
