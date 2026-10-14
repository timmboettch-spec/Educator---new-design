import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import i18n from '../../../src/i18n';
import simulationLibraryReducer, {
  type Simulation,
  type SimulationLibraryState,
} from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import type { MyLibraryInfiniteArg } from '../../../src/redux/api/myLibrary/myLibraryApi';
import { toLearnerLevel, toModality } from '../../../src/utils/libraryFilters';

// ── Mocks ────────────────────────────────────────────────────────────────────

// The page must never load the whole (slow, unpaged) library itself.
const fetchLibrary = vi.fn();

// A stand-in for the paged list API: it filters the fixture the way the BE
// documents (any-of within a filter, all-of across filters, case-insensitive),
// so the page can be driven like the real thing. `listParams` records what the
// page asked for.
interface FakeServer {
  library: Simulation[];
  status: 'loading' | 'ready' | 'error';
  /** Overrides `meta.total` (defaults to the number of matching rows). */
  total?: number;
  hasNextPage: boolean;
  isFetchNextPageError: boolean;
}
let server: FakeServer;
const serverListeners = new Set<() => void>();
const setServer = (next: Partial<FakeServer>) => {
  server = { ...server, ...next };
  serverListeners.forEach((listener) => listener());
};
const subscribeServer = (listener: () => void) => {
  serverListeners.add(listener);
  return () => serverListeners.delete(listener);
};
const listParams = vi.fn();
const fetchNextPage = vi.fn();
const refetch = vi.fn();

const sameText = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
const anyOf = (selected: string[] | undefined, value: string) =>
  !selected?.length || selected.some((v) => sameText(v, value));
const serverFilter = (sims: Simulation[], p: MyLibraryInfiniteArg) =>
  sims.filter(
    (sim) =>
      (!p.search || sim.title.toLowerCase().includes(p.search.toLowerCase())) &&
      anyOf(p.learnerLevel, toLearnerLevel(sim.learnerLevel)) &&
      anyOf(p.modality, toModality(sim.avatarEnabled)) &&
      anyOf(p.difficulty, sim.difficulty) &&
      anyOf(p.targetAudience, sim.targetAudience ?? '') &&
      anyOf(p.productName, sim.productName ?? '') &&
      anyOf(p.unitId, sim.unit)
  );

const listOptions = vi.fn();

vi.mock('../../../src/hooks/useInfiniteMyLibrary', () => ({
  useInfiniteMyLibrary: (
    params: MyLibraryInfiniteArg,
    options: { skip?: boolean } = {}
  ) => {
    // A held (skipped) request sends nothing and reads as loading.
    if (!options.skip) listParams(params);
    listOptions(options);
    const current = useSyncExternalStore(subscribeServer, () => server);
    const isReady = current.status === 'ready' && !options.skip;
    const rows = isReady ? serverFilter(current.library, params) : [];
    return {
      rows,
      total: isReady ? (current.total ?? rows.length) : undefined,
      hasLoaded: isReady,
      isInitialLoading: current.status === 'loading' || !!options.skip,
      isLoadError: current.status === 'error',
      isFetching: current.status === 'loading',
      hasNextPage: current.hasNextPage,
      isFetchingNextPage: false,
      isFetchNextPageError: current.isFetchNextPageError,
      isRefreshError: false,
      fetchNextPage,
      refetch,
    };
  },
}));
// A stand-in for the BE's dropdown routes, built from the same library the
// list serves. `unitsStatus: 'loading'` holds the units back, as before the
// first page of units answers.
interface FakeOptions {
  library: Simulation[];
  unitsStatus: 'loading' | 'ready';
  /** Overrides the target audiences taken from the library. */
  targetAudiences?: string[];
}
let options: FakeOptions;
const optionListeners = new Set<() => void>();
const setOptions = (next: Partial<FakeOptions>) => {
  options = { ...options, ...next };
  optionListeners.forEach((listener) => listener());
};
const subscribeOptions = (listener: () => void) => {
  optionListeners.add(listener);
  return () => optionListeners.delete(listener);
};
const toTextOptions = (values: (string | undefined)[]) =>
  [...new Set(values.filter((value): value is string => !!value))].map(
    (value) => ({ value, label: value })
  );
// One result per state, so the hook returns stable objects like the real one.
const optionResults = new WeakMap<FakeOptions, object>();
const buildOptionResult = (current: FakeOptions) => {
  const isReady = current.unitsStatus === 'ready';
  const unitNames: Record<string, string> = isReady
    ? Object.fromEntries(
        current.library
          .filter((sim) => sim.unit)
          .map((sim) => [sim.unit, sim.unit_name])
      )
    : {};
  return {
    unitField: {
      options: Object.entries(unitNames).map(([value, label]) => ({
        value,
        label,
      })),
      selectedLabels: unitNames,
    },
    targetAudienceField: {
      options: toTextOptions(
        current.targetAudiences ??
          current.library.map((sim) => sim.targetAudience)
      ),
    },
    productNameField: {
      options: toTextOptions(current.library.map((sim) => sim.productName)),
    },
    unitNames,
    isUnitNamesSettled: isReady,
  };
};

vi.mock('../../../src/hooks/useLibraryFilterOptions', () => ({
  useLibraryFilterOptions: () => {
    const current = useSyncExternalStore(subscribeOptions, () => options);
    if (!optionResults.has(current)) {
      optionResults.set(current, buildOptionResult(current));
    }
    return optionResults.get(current);
  },
}));

const removeFromLibrary = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock(
  '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux',
  async () => {
    const actual = await vi.importActual<
      typeof import('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux')
    >('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux');
    return {
      ...actual,
      fetchMyLibrarySimulations: () => () => {
        fetchLibrary();
        return { unwrap: () => Promise.resolve() };
      },
    };
  }
);

vi.mock('../../../src/redux/simulation/RemoveFromLibraryRedux', () => ({
  RemoveFromLibraryRequest: (arg: { scenario_id: string }) => () => {
    removeFromLibrary(arg);
    return { unwrap: () => Promise.resolve({}) };
  },
}));

vi.mock('../../../src/redux/simulation/MyLibraryRedux', () => ({
  fetchMyLibrary: () => () => ({ unwrap: () => Promise.resolve() }),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

// The modal has its own suite; here we only check what the page hands it.
const assignModalProps = vi.fn();
vi.mock('../../../src/components/modal/AddSimulationModal', () => ({
  AddSimulationModal: (props: {
    isOpen: boolean;
    simulationIds?: string[];
    onClose: () => void;
    onAssigned?: () => void;
  }) => {
    assignModalProps(props);
    if (!props.isOpen) return null;
    return (
      <div role="dialog" aria-label="Create Simulation Assignment">
        <output data-testid="assign-ids">
          {props.simulationIds?.join(',')}
        </output>
        <button type="button" onClick={() => props.onAssigned?.()}>
          Finish assigning
        </button>
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>
    );
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return { ...actual, useNavigate: () => mockNavigate };
});

import MyLibraryPage from '../../../src/pages/Simulation/simulationlibrary';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const makeSim = (overrides: Partial<Simulation>): Simulation => ({
  id: 'id',
  simulation_id: 'id',
  name: 'Sim',
  title: 'Sim',
  unit: 'unit-1',
  unit_name: 'Unit One',
  duration: '20 min',
  image: '',
  description: '',
  assigned: false,
  rating: 0,
  difficulty: 'Easy',
  learnerLevel: 'Post-Secondary',
  targetAudience: 'Nursing',
  avatarEnabled: true,
  ...overrides,
});

const LIBRARY: Simulation[] = [
  makeSim({ id: 'a', simulation_id: 'a', title: 'Airway Basics' }),
  makeSim({
    id: 'b',
    simulation_id: 'b',
    title: 'Burn Care',
    difficulty: 'Hard',
    learnerLevel: 'High School',
    avatarEnabled: false,
    duration: '45 min',
  }),
  makeSim({
    id: 'c',
    simulation_id: 'c',
    title: 'Cardiac Arrest',
    difficulty: 'Medium',
  }),
];

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
};

const renderPage = ({
  data = LIBRARY,
  listStatus = 'ready',
  total,
  hasNextPage = false,
  isFetchNextPageError = false,
  unitsStatus = 'ready',
  targetAudiences,
  url = '/simulationlibrary',
  navState,
}: {
  /** The library the list API serves (and the dropdown options come from). */
  data?: Simulation[];
  listStatus?: FakeServer['status'];
  total?: number;
  hasNextPage?: boolean;
  isFetchNextPageError?: boolean;
  /** Whether the Unit dropdown's units have answered. */
  unitsStatus?: FakeOptions['unitsStatus'];
  targetAudiences?: string[];
  url?: string;
  navState?: unknown;
} = {}) => {
  options = { library: data, unitsStatus, targetAudiences };
  server = {
    library: data,
    status: listStatus,
    total,
    hasNextPage,
    isFetchNextPageError,
  };
  const store = configureStore({
    reducer: { SimulationLibrary: simulationLibraryReducer },
    preloadedState: {
      // The assign modal's full copy, loaded earlier by another screen.
      SimulationLibrary: {
        responseSimulationLibrary: { data, message: '', status: 'success' },
        hasImages: false,
        status: 'succeeded' as SimulationLibraryState['status'],
        error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: url.split('?')[0],
            search: url.includes('?') ? `?${url.split('?')[1]}` : '',
            state: navState,
          },
        ]}
      >
        <Routes>
          <Route
            path="/simulationlibrary"
            element={
              // Mirrors DashboardLayout's focusable content landmark.
              <main tabIndex={-1} aria-label="Page content">
                <MyLibraryPage />
                <LocationProbe />
              </main>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return store;
};

const cardTitles = () =>
  screen
    .queryAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);

const pill = (name: string) =>
  within(screen.getByRole('group', { name: 'Quick filters' })).getByRole(
    'button',
    { name }
  );

// ── Tests ────────────────────────────────────────────────────────────────────

const RETURN_KEY = 'simulationLibrary:return';

const lastListParams = (): MyLibraryInfiniteArg =>
  listParams.mock.calls.at(-1)?.[0] as MyLibraryInfiniteArg;

describe('MyLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('populated state', () => {
    it('renders the title, caption, count and a card per simulation in API order', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 1, name: 'My Simulation Library' })
      ).toBeInTheDocument();
      expect(
        screen.getByText('Simplify your search with filters')
      ).toBeInTheDocument();
      expect(screen.getByText('3 simulations')).toBeInTheDocument();
      expect(cardTitles()).toEqual([
        'Airway Basics',
        'Burn Care',
        'Cardiac Arrest',
      ]);
    });

    it('counts every matching simulation, not just the loaded pages', () => {
      renderPage({ total: 120, hasNextPage: true });
      expect(screen.getByText('120 simulations')).toBeInTheDocument();
      expect(cardTitles()).toHaveLength(3);
    });

    it('never loads the whole library: the dropdowns have their own routes', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
      expect(fetchLibrary).not.toHaveBeenCalled();
    });

    it('names the simulation in each More Info button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: 'More info about Burn Care' })
      ).toBeInTheDocument();
    });

    it('navigates to details from More Info with a way back to this view', () => {
      renderPage({ url: '/simulationlibrary?difficulty=Easy' });
      fireEvent.click(
        screen.getByRole('button', { name: 'More info about Airway Basics' })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/simulationdetails/a', {
        state: {
          fromLibrary: true,
          simulationId: 'a',
          returnTo: '/simulationlibrary?difficulty=Easy',
        },
      });
    });
  });

  describe('paged list request', () => {
    it('asks for the first page with no filters and no language param', () => {
      renderPage();
      expect(lastListParams()).toEqual({});
    });

    it('sends the applied filters and search as list params', async () => {
      renderPage({
        url: '/simulationlibrary?difficulty=Hard&modality=workstation&learnerLevel=Secondary',
      });
      expect(lastListParams()).toEqual({
        difficulty: ['Hard'],
        modality: ['Workstation'],
        learnerLevel: ['Secondary'],
      });

      fireEvent.change(screen.getByPlaceholderText('Search Simulations...'), {
        target: { value: '  burn   care ' },
      });
      await waitFor(() =>
        expect(lastListParams()).toEqual(
          expect.objectContaining({ search: 'burn care' })
        )
      );
    });

    it('filters Unit by id and labels its chip with the unit name', () => {
      renderPage({ url: '/simulationlibrary?unit=unit-1' });
      expect(lastListParams()).toEqual({ unitId: ['unit-1'] });
      expect(
        screen.getByRole('button', { name: 'Remove Unit filter: Unit One' })
      ).toBeInTheDocument();
    });

    it('reads an older link that names the unit as that unit id', () => {
      renderPage({ url: '/simulationlibrary?unit=unit%20one' });
      expect(lastListParams()).toEqual({ unitId: ['unit-1'] });
    });

    it('holds an older unit-name link until the units are known, never sending the name', () => {
      renderPage({
        url: '/simulationlibrary?unit=unit%20one',
        unitsStatus: 'loading',
      });
      expect(listParams).not.toHaveBeenCalled();
      expect(screen.getByText('Loading simulations')).toBeInTheDocument();
      expect(
        screen.queryByText('No simulations match your filters')
      ).not.toBeInTheDocument();

      act(() => setOptions({ unitsStatus: 'ready' }));

      // Every request the page made used the unit id, never the name.
      expect(listParams).toHaveBeenCalled();
      listParams.mock.calls.forEach(([params]) =>
        expect(params).toEqual({ unitId: ['unit-1'] })
      );
      expect(cardTitles()).toHaveLength(3);
    });

    it('sends a unit the library no longer has once the units are known', () => {
      renderPage({ url: '/simulationlibrary?unit=retired-unit' });
      expect(lastListParams()).toEqual({ unitId: ['retired-unit'] });
      expect(
        screen.getByText('No simulations match your filters')
      ).toBeInTheDocument();
    });

    it('drops a difficulty the API does not accept rather than fail with a 400', () => {
      renderPage({
        url: '/simulationlibrary?difficulty=Expert&difficulty=easy',
      });
      expect(lastListParams()).toEqual({ difficulty: ['Easy'] });
      // No chip for a value that filters nothing.
      expect(
        screen.queryByRole('button', {
          name: /Remove Difficulty filter: Expert/,
        })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Remove Difficulty filter: Easy/ })
      ).toBeInTheDocument();
    });

    it('shows only the free-text values the API filters by: no blanks, repeats or values past 20', () => {
      const audiences = Array.from({ length: 22 }, (_, i) => `Audience ${i}`);
      const query = ['', 'Audience 0', ...audiences]
        .map((value) => `targetAudience=${encodeURIComponent(value)}`)
        .join('&');
      renderPage({ url: `/simulationlibrary?${query}` });

      expect(lastListParams()).toEqual({
        targetAudience: audiences.slice(0, 20),
      });
      expect(
        screen.getAllByRole('button', {
          name: /^Remove Target Audience filter/,
        })
      ).toHaveLength(20);
      expect(
        screen.getByRole('button', { name: 'Filters, 20 applied' })
      ).toBeInTheDocument();
    });

    it('ignores a Duration filter in the URL: the API cannot filter by it yet', () => {
      renderPage({ url: '/simulationlibrary?duration=%3C15%20min' });
      expect(lastListParams()).toEqual({});
      expect(
        screen.queryByRole('region', { name: 'Active filters' })
      ).not.toBeInTheDocument();
      expect(cardTitles()).toHaveLength(3);
    });
  });

  describe('infinite scroll', () => {
    it('says when every simulation is shown', () => {
      renderPage();
      expect(
        screen.getByText('All simulations in your library are shown.')
      ).toBeInTheDocument();
    });

    it('offers a retry when the next page fails', () => {
      renderPage({ hasNextPage: true, isFetchNextPageError: true });
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });
  });

  describe("returning from a simulation's details", () => {
    beforeEach(() => sessionStorage.clear());

    it('saves search, selection and the opener before leaving', () => {
      renderPage();
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Cardiac Arrest' })
      );
      const moreInfo = screen.getByRole('button', {
        name: 'More info about Burn Care',
      });
      moreInfo.focus();
      fireEvent.click(moreInfo);
      expect(JSON.parse(sessionStorage.getItem(RETURN_KEY)!)).toEqual({
        search: '',
        selectedIds: ['c'],
        scrollTop: 0,
        focusId: 'b',
      });
    });

    it('restores search, selection and focus after Back, then forgets them', () => {
      sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({
          search: 'Burn',
          selectedIds: ['b'],
          scrollTop: 0,
          focusId: 'b',
        })
      );
      renderPage({ navState: { restoreLibrary: true, preserveScroll: true } });

      expect(screen.getByPlaceholderText('Search Simulations...')).toHaveValue(
        'Burn'
      );
      expect(lastListParams()).toEqual({ search: 'Burn' });
      expect(cardTitles()).toEqual(['Burn Care']);
      expect(
        screen.getByRole('checkbox', { name: 'Select Burn Care' })
      ).toBeChecked();
      expect(
        screen.getByRole('button', { name: 'More info about Burn Care' })
      ).toHaveFocus();
      expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
      // The one-shot restore flags are dropped from the history entry.
      expect(mockNavigate).toHaveBeenCalledWith('/simulationlibrary', {
        replace: true,
        state: null,
      });
    });

    it('focuses the page content when the opener is no longer shown', () => {
      sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({
          search: 'no such simulation',
          selectedIds: [],
          scrollTop: 0,
          focusId: 'b',
        })
      );
      renderPage({ navState: { restoreLibrary: true, preserveScroll: true } });

      expect(cardTitles()).toEqual([]);
      expect(screen.getByRole('main', { name: 'Page content' })).toHaveFocus();
    });

    it('keeps a restored selection while the library is still loading', () => {
      sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({
          search: '',
          selectedIds: ['b'],
          scrollTop: 0,
          focusId: 'b',
        })
      );
      renderPage({
        listStatus: 'loading',
        navState: { restoreLibrary: true, preserveScroll: true },
      });

      expect(screen.getByText('Loading simulations')).toBeInTheDocument();

      act(() => setServer({ status: 'ready' }));

      expect(
        screen.getByRole('checkbox', { name: 'Select Burn Care' })
      ).toBeChecked();
      expect(
        screen.getByRole('button', { name: 'More info about Burn Care' })
      ).toHaveFocus();
    });

    it('restores after a failed load once Retry succeeds', () => {
      sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({
          search: '',
          selectedIds: ['b'],
          scrollTop: 0,
          focusId: 'b',
        })
      );
      renderPage({
        listStatus: 'error',
        navState: { restoreLibrary: true, preserveScroll: true },
      });

      // The failure gets a focus home without using up the restore.
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('main', { name: 'Page content' })).toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
      expect(refetch).toHaveBeenCalled();
      act(() => setServer({ status: 'ready' }));

      expect(
        screen.getByRole('checkbox', { name: 'Select Burn Care' })
      ).toBeChecked();
      expect(
        screen.getByRole('button', { name: 'More info about Burn Care' })
      ).toHaveFocus();
    });

    it('starts fresh when the library is opened any other way', () => {
      sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({
          search: 'Burn',
          selectedIds: ['b'],
          scrollTop: 0,
          focusId: 'b',
        })
      );
      renderPage();

      expect(screen.getByPlaceholderText('Search Simulations...')).toHaveValue(
        ''
      );
      expect(cardTitles()).toHaveLength(3);
      expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
    });
  });

  describe('loading, empty and unavailable states', () => {
    it('shows no result count until the first page arrives, rather than 0', () => {
      renderPage({ listStatus: 'loading' });
      expect(screen.queryByText(/\d+ simulations?$/)).not.toBeInTheDocument();
      act(() => setServer({ status: 'ready' }));
      expect(screen.getByText('3 simulations')).toBeInTheDocument();
    });

    it('shows the loading state until the first page arrives', () => {
      renderPage({ listStatus: 'loading' });
      expect(screen.getByText('Loading simulations')).toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Selected simulations' })
      ).not.toBeInTheDocument();
    });

    it('shows a list-shaped skeleton in list view', () => {
      renderPage({
        listStatus: 'loading',
        url: '/simulationlibrary?view=list',
      });
      expect(screen.getByText('Loading simulations')).toBeInTheDocument();
      expect(document.querySelector('tbody')).not.toBeNull();
    });

    it('shows a friendly error with a retry, never the raw error', () => {
      renderPage({ listStatus: 'error' });
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Failed to load simulations');
      expect(alert).not.toHaveTextContent('status code');
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('shows the empty-library state with a way to the catalog', () => {
      renderPage({ data: [] });
      expect(screen.getByText('Your library is empty')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Browse the Simulation Catalog' })
      ).toHaveAttribute('href', '/simulation-catalog');
    });

    it('shows a distinct no-matches state that clears filters', async () => {
      renderPage({ url: '/simulationlibrary?unit=retired-unit' });
      expect(
        screen.getByText('No simulations match your filters')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      await waitFor(() => expect(cardTitles()).toHaveLength(3));
    });
  });

  describe('grid and list views', () => {
    it('switches to list view and keeps it in the URL', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'List view' }));
      expect(
        screen.getByRole('table', { name: 'Simulations in your library' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        'view=list'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('has no column sorting: the API decides the order', () => {
      renderPage({ url: '/simulationlibrary?view=list' });
      expect(
        screen.getByRole('columnheader', { name: 'Simulation Name' })
      ).not.toHaveAttribute('aria-sort');
      expect(
        screen.queryByRole('button', { name: 'Simulation Name' })
      ).not.toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('applies a quick filter, shows a chip and updates the count', () => {
      renderPage();
      fireEvent.click(pill('Hard'));
      expect(pill('Hard')).toHaveAttribute('aria-pressed', 'true');
      expect(cardTitles()).toEqual(['Burn Care']);
      expect(screen.getByText('1 simulation')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Remove Difficulty filter: Hard' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        'difficulty=Hard'
      );
      expect(
        screen.getByRole('button', { name: 'Filters, 1 applied' })
      ).toBeInTheDocument();
    });

    it('sends learner level and modality as the API buckets', () => {
      renderPage();
      fireEvent.click(pill('Secondary'));
      expect(lastListParams()).toEqual({ learnerLevel: ['Secondary'] });
      expect(cardTitles()).toEqual(['Burn Care']);
      fireEvent.click(pill('Secondary'));
      fireEvent.click(pill('Avatar'));
      expect(lastListParams()).toEqual({ modality: ['Avatar'] });
      expect(cardTitles()).toEqual(['Airway Basics', 'Cardiac Arrest']);
    });

    it('treats URL filter values case-insensitively', () => {
      renderPage({ url: '/simulationlibrary?difficulty=hard' });
      expect(cardTitles()).toEqual(['Burn Care']);
      expect(pill('Hard')).toHaveAttribute('aria-pressed', 'true');
      // Toggling the pill removes the lowercase value too.
      fireEvent.click(pill('Hard'));
      expect(cardTitles()).toHaveLength(3);
    });

    it('reads applied filters from the URL', () => {
      renderPage({
        url: '/simulationlibrary?difficulty=Medium&difficulty=Hard',
      });
      expect(cardTitles()).toEqual(['Burn Care', 'Cardiac Arrest']);
      expect(pill('Medium')).toHaveAttribute('aria-pressed', 'true');
      expect(pill('Hard')).toHaveAttribute('aria-pressed', 'true');
    });

    it('announces the chips in the active language', async () => {
      await act(() => i18n.changeLanguage('es'));
      try {
        renderPage({ url: '/simulationlibrary?difficulty=Hard' });
        expect(
          screen.getByRole('region', { name: 'Filtros activos' })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', {
            name: 'Quitar filtro Dificultad: Difícil',
          })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Borrar todos los filtros' })
        ).toBeInTheDocument();
      } finally {
        await act(() => i18n.changeLanguage('en'));
      }
    });

    it('removing a chip un-presses the matching quick filter', () => {
      renderPage({ url: '/simulationlibrary?difficulty=Hard' });
      fireEvent.click(
        screen.getByRole('button', { name: 'Remove Difficulty filter: Hard' })
      );
      expect(pill('Hard')).toHaveAttribute('aria-pressed', 'false');
      expect(cardTitles()).toHaveLength(3);
    });

    it('Clear All resets every filter', () => {
      renderPage({
        url: '/simulationlibrary?difficulty=Hard&modality=Workstation',
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Clear all filters' })
      );
      expect(cardTitles()).toHaveLength(3);
      expect(screen.getByTestId('location-search')).toHaveTextContent('');
    });

    it('opens the full panel with every API-backed field and resets from there too', () => {
      renderPage();
      fireEvent.click(pill('Easy'));
      fireEvent.click(
        screen.getByRole('button', { name: 'Filters, 1 applied' })
      );
      expect(screen.getByText('Filter Simulations')).toBeInTheDocument();
      for (const label of [
        'Learner Level',
        'Target Audience',
        'Modality',
        'Required Product Name',
        'Difficulty',
        'Unit',
      ]) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
      expect(screen.queryByText('Duration')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Reset Filter' }));
      expect(pill('Easy')).toHaveAttribute('aria-pressed', 'false');
      expect(cardTitles()).toHaveLength(3);
    });

    it('offers only the difficulties the API accepts, whatever the library holds', () => {
      renderPage({
        data: [
          makeSim({ id: 'x', simulation_id: 'x', difficulty: 'Beginner' }),
        ],
      });
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
      fireEvent.click(screen.getByRole('button', { name: 'Difficulty' }));
      expect(
        screen.getAllByRole('option').map((option) => option.textContent)
      ).toEqual(['Easy', 'Medium', 'Hard']);
    });

    it('blocks Apply while a filter has more values than the API accepts', () => {
      const audiences = Array.from({ length: 21 }, (_, i) => `Audience ${i}`);
      renderPage({ targetAudiences: audiences });
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
      fireEvent.click(screen.getByRole('button', { name: 'Target Audience' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select all' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Select up to 20');
      // A count, not 21 chips stretching the panel.
      expect(screen.getByText('21 selected')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Remove Audience 0' })
      ).not.toBeInTheDocument();
      const apply = screen.getByRole('button', { name: 'Apply Filter' });
      expect(apply).toBeDisabled();
      fireEvent.click(apply);
      expect(lastListParams()).toEqual({});

      // Back within the limit, Apply works again.
      fireEvent.click(screen.getByRole('option', { name: 'Audience 0' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(apply).toBeEnabled();
      fireEvent.click(apply);
      expect(lastListParams()?.targetAudience).toHaveLength(20);
    });

    it('filters by title search together with the filters', async () => {
      renderPage();
      fireEvent.change(screen.getByPlaceholderText('Search Simulations...'), {
        target: { value: 'card' },
      });
      await waitFor(() => expect(cardTitles()).toEqual(['Cardiac Arrest']));
      expect(screen.getByText('1 simulation')).toBeInTheDocument();
    });
  });

  describe('selection and assignment', () => {
    const toolbar = () =>
      screen.getByRole('region', { name: 'Selected simulations' });

    it('selects cards and carries the selection into the assign modal', () => {
      renderPage();
      const assign = within(toolbar()).getByRole('button', {
        name: 'Assign 0 simulations to Class(es)',
      });
      expect(assign).toBeDisabled();

      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Airway Basics' })
      );
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Cardiac Arrest' })
      );
      expect(within(toolbar()).getByText('2 selected')).toBeInTheDocument();

      fireEvent.click(
        within(toolbar()).getByRole('button', {
          name: 'Assign 2 simulations to Class(es)',
        })
      );
      expect(screen.getByTestId('assign-ids')).toHaveTextContent('a,c');
    });

    it('select all covers only what is shown, then clears', () => {
      renderPage({ url: '/simulationlibrary?modality=Avatar' });
      fireEvent.click(
        within(toolbar()).getByRole('button', { name: 'Select all (2)' })
      );
      expect(within(toolbar()).getByText('2 selected')).toBeInTheDocument();
      fireEvent.click(
        within(toolbar()).getByRole('button', { name: 'Clear all' })
      );
      expect(within(toolbar()).getByText('0 selected')).toBeInTheDocument();
    });

    it('select all covers the loaded rows, not pages still to come', () => {
      renderPage({ total: 120, hasNextPage: true });
      fireEvent.click(
        within(toolbar()).getByRole('button', { name: 'Select all (3)' })
      );
      expect(within(toolbar()).getByText('3 selected')).toBeInTheDocument();
    });

    it('works in list view with the header checkbox', () => {
      renderPage({ url: '/simulationlibrary?view=list' });
      const header = screen.getByRole('checkbox', {
        name: 'Select all shown simulations',
      });
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Burn Care' })
      );
      expect((header as HTMLInputElement).indeterminate).toBe(true);
      fireEvent.click(header);
      expect(within(toolbar()).getByText('3 selected')).toBeInTheDocument();
      expect(header).toBeChecked();
    });

    it('drops selected simulations that a filter hides', () => {
      renderPage();
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Burn Care' })
      );
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Airway Basics' })
      );
      fireEvent.click(pill('Hard'));
      expect(within(toolbar()).getByText('1 selected')).toBeInTheDocument();
    });

    it('clears the selection once the assignment is done', () => {
      renderPage();
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Burn Care' })
      );
      fireEvent.click(
        within(toolbar()).getByRole('button', {
          name: 'Assign 1 simulation to Class(es)',
        })
      );
      fireEvent.click(screen.getByRole('button', { name: 'Finish assigning' }));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(within(toolbar()).getByText('0 selected')).toBeInTheDocument();
      // Closing doesn't refetch: assigning doesn't change library contents.
      expect(refetch).not.toHaveBeenCalled();
      expect(fetchLibrary).not.toHaveBeenCalled();
    });

    it('a single card Assign leaves the bulk selection alone', () => {
      renderPage();
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Airway Basics' })
      );
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Assign to Class' })[1]!
      );
      fireEvent.click(screen.getByRole('button', { name: 'Finish assigning' }));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(within(toolbar()).getByText('1 selected')).toBeInTheDocument();
    });

    it('a single card Assign opens the modal with just that simulation', () => {
      renderPage();
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Assign to Class' })[1]!
      );
      expect(screen.getByTestId('assign-ids')).toHaveTextContent('b');
    });

    it('passes no class assignments to check against', () => {
      renderPage();
      expect(assignModalProps).toHaveBeenLastCalledWith(
        expect.objectContaining({ simulations: [] })
      );
    });
  });

  describe('remove from library', () => {
    it('confirms before removing and reports success, without loading the whole library', async () => {
      renderPage();
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Remove from My Library' })[0]!
      );
      expect(screen.getByText('Remove from My Library?')).toBeInTheDocument();
      expect(removeFromLibrary).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() =>
        expect(toastSuccess).toHaveBeenCalledWith(
          'Removed from library successfully'
        )
      );
      expect(removeFromLibrary).toHaveBeenCalledWith({ scenario_id: 'a' });
      // The remove request itself drops the assign modal's full copy
      // (libraryChangesRefreshMyLibrary.test); nothing reloads it here.
      expect(fetchLibrary).not.toHaveBeenCalled();
    });

    it('cancelling keeps the simulation', () => {
      renderPage();
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Remove from My Library' })[0]!
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(removeFromLibrary).not.toHaveBeenCalled();
      expect(
        screen.queryByText('Remove from My Library?')
      ).not.toBeInTheDocument();
    });
  });
});
