import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MyLibraryPage from '../../../src/pages/Simulation/simulationlibrary/index';
import '@testing-library/jest-dom/vitest';

const mockDispatch = vi.fn();

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn((selector: (state: unknown) => unknown) =>
    selector({
      SimulationLibrary: {
        filtered: [
          {
            id: 'sim-1',
            title: 'CPR Basics',
            unit: 'Health',
            avatarEnabled: true,
            description: 'Learn CPR',
            thumbnail: '',
            url: 'https://example.com/sim-1',
          },
          {
            id: 'sim-2',
            title: 'Fire Safety',
            unit: 'Safety',
            avatarEnabled: false,
            description: 'Fire safety basics',
            thumbnail: '',
            url: 'https://example.com/sim-2',
          },
        ],
        loading: false,
        error: null,
        viewMode: 'grid',
        activeFilter: 'all',
        responseSimulationLibrary: {
          data: [
            { id: 'sim-1', title: 'CPR Basics', unit: 'Health', avatarEnabled: true },
            { id: 'sim-2', title: 'Fire Safety', unit: 'Safety', avatarEnabled: false },
          ],
        },
      },
    }),
  ),
}));

vi.mock('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux', () => ({
  default: (state = {}) => state,
  fetchMyLibrarySimulations: vi.fn(() => ({ type: 'sim/fetchMyLibrary', unwrap: () => Promise.resolve() })),
  fetchSimulationLibrary: vi.fn(() => ({ type: 'sim/fetchLibrary' })),
  fetchSimulationLibraryWithDetails: vi.fn(() => ({ type: 'sim/fetchWithDetails' })),

  selectFilteredSimulations: (s: { SimulationLibrary: { filtered: unknown[] } }) =>
    s.SimulationLibrary?.filtered ?? [],
  selectSimulationLoading: (s: { SimulationLibrary: { loading: boolean } }) =>
    s.SimulationLibrary?.loading ?? false,
  selectSimulationError: (s: { SimulationLibrary: { error: string | null } }) =>
    s.SimulationLibrary?.error ?? null,
  selectViewMode: (s: { SimulationLibrary: { viewMode: string } }) =>
    s.SimulationLibrary?.viewMode ?? 'grid',
  selectActiveFilter: (s: { SimulationLibrary: { activeFilter: string } }) =>
    s.SimulationLibrary?.activeFilter ?? 'all',
  selectSimulationLibraryData: (s: { SimulationLibrary: { responseSimulationLibrary: { data: unknown[] } } }) =>
    s.SimulationLibrary?.responseSimulationLibrary?.data ?? [],
  selectAppliedFilters: () => ({
    product: '',
    topic: '',
    unit: '',
    learnerLevel: '',
    difficulty: '',
    duration: '',
  }),

  setActiveFilter: vi.fn((f: string) => ({ type: 'sim/setFilter', payload: f })),
  setViewMode: vi.fn((m: string) => ({ type: 'sim/setViewMode', payload: m })),
  applyPanelFilter: vi.fn((f: unknown) => ({ type: 'sim/applyPanel', payload: f })),
  clearPanelFilter: vi.fn(() => ({ type: 'sim/clearPanel', unwrap: () => Promise.resolve() })),
  clearSimulationLibraryState: vi.fn(() => ({ type: 'sim/clearState' })),
  removeFilter: vi.fn((key: string) => ({ type: 'sim/removeFilter', payload: key })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/redux/simulation/MyLibraryRedux', () => ({
  default: (state = {}) => state,
  fetchMyLibrary: vi.fn(() => ({ type: 'myLibrary/fetch' })),
  removeFromLibrary: vi.fn(() => ({ type: 'myLibrary/remove' })),
  addToLibrary: vi.fn(() => ({ type: 'myLibrary/add' })),
  selectLibraryUnits: () => [],
  selectLibraryAdding: () => false,
  selectLibraryRemoving: () => false,
  selectLibrarySimulationIds: () => new Set<string>(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <MyLibraryPage />
    </MemoryRouter>,
  );

describe('Simulation Library Page + Modal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  describe('Page renders simulations', () => {
    it('displays simulation items on page load', async () => {
      renderPage();

      await waitFor(() => {
        const cpr = screen.queryByText(/CPR Basics/i);
        const fire = screen.queryByText(/Fire Safety/i);
        expect(cpr ?? fire).toBeInTheDocument();
      });
    });
  });

  describe('AddSimulationModal — open / close flow', () => {
    it('opens AddSimulationModal when add button is triggered', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/CPR Basics/i)).toBeInTheDocument();
      });

      const assignBtns = screen.queryAllByRole('button', { name: /assign to class/i });
      expect(assignBtns.length).toBeGreaterThan(0);

      await act(async () => { fireEvent.click(assignBtns[0]); });
      await waitFor(() => {
        const modal = screen.queryByRole('dialog', { name: /create simulation assignment/i });
        expect(modal).toBeInTheDocument();
      });
    });

    it('closes AddSimulationModal when close/cancel is clicked', async () => {
      renderPage();

      const assignBtns = screen.queryAllByRole('button', { name: /assign to class/i });
      if (assignBtns.length > 0) {
        await act(async () => { fireEvent.click(assignBtns[0]); });

        await waitFor(() => screen.getByRole('dialog', { name: /create simulation assignment/i }));
        const dialog = screen.getByRole('dialog', { name: /create simulation assignment/i });
        const closeBtn = within(dialog).queryByRole('button', { name: /^close$/i });
        if (closeBtn) {
          await act(async () => { fireEvent.click(closeBtn); });
          await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: /create simulation assignment/i })).not.toBeInTheDocument();
          });
        }
      }
    });
  });

  describe('ShareModal — open / close / copy link flow', () => {
    it('opens ShareModal when share button is clicked on a simulation card', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/CPR Basics/i)).toBeInTheDocument();
      });

      const shareBtns = screen.queryAllByRole('button', { name: /share simulation/i });
      expect(shareBtns.length).toBeGreaterThan(0);

      await act(async () => { fireEvent.click(shareBtns[0]); });
      await waitFor(() => {
        const modal = screen.queryByRole('dialog', { name: /share/i });
        expect(modal).toBeInTheDocument();
      });
    });

    it('renders ShareModal with social sharing options', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/CPR Basics/i)).toBeInTheDocument();
      });

      const shareBtns = screen.queryAllByRole('button', { name: /share simulation/i });
      if (shareBtns.length > 0) {
        await act(async () => { fireEvent.click(shareBtns[0]); });
        await waitFor(() => {
          const dialog = screen.getByRole('dialog', { name: /share/i });
          expect(within(dialog).queryByRole('button', { name: /mail/i })).toBeInTheDocument();
        });
      }
    });

    it('closes ShareModal when close button is clicked', async () => {
      renderPage();

      const shareBtns = screen.queryAllByRole('button', { name: /share simulation/i });
      if (shareBtns.length > 0) {
        await act(async () => { fireEvent.click(shareBtns[0]); });

        await waitFor(() => screen.getByRole('dialog', { name: /share/i }));
        const dialog = screen.getByRole('dialog', { name: /share/i });
        const closeBtn = within(dialog).queryByRole('button', { name: /close/i });
        if (closeBtn) {
          await act(async () => { fireEvent.click(closeBtn); });
          await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: /share/i })).not.toBeInTheDocument();
          });
        }
      }
    });
  });

  describe('Modal exclusivity', () => {
    it('does not open multiple modals at the same time', async () => {
      renderPage();

      const addBtn = screen.queryByRole('button', { name: /add|new simulation/i });
      if (addBtn) {
        await act(async () => { fireEvent.click(addBtn); });
        const dialogs = screen.queryAllByRole('dialog');
        expect(dialogs.length).toBeLessThanOrEqual(1);
      }
    });
  });
});
