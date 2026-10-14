/**
 * RE-40 end-to-end flow at component level: browse the library in grid and
 * list view, filter from both the quick filters and the full panel, select
 * several simulations and carry the selection into assignment, already
 * populated. Real store, real paged list API (RE-243) and real page
 * components; only the shared axios instance (answering like the BE), the
 * full-library thunk that feeds the dropdowns and the assignment modal
 * (covered by its own suite) are stubbed.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '../../../src/i18n';
import simulationLibraryReducer, {
  type Simulation,
} from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import { myLibraryApi } from '../../../src/redux/api/myLibrary/myLibraryApi';
import type { MyLibraryItemResDto } from '../../../src/redux/api/myLibrary/myLibrary.types';
import { toLearnerLevel, toModality } from '../../../src/utils/libraryFilters';

// The BE list and dropdown routes, answering from LIBRARY (declared below)
// with the list's documented matching: any-of within a filter, all-of across
// filters.
const apiRequest = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: { request: (...args: unknown[]) => apiRequest(...args) },
}));

vi.mock(
  '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux',
  async () => {
    const actual = await vi.importActual<
      typeof import('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux')
    >('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux');
    return {
      ...actual,
      fetchMyLibrarySimulations: () => () => ({
        unwrap: () => Promise.resolve(),
      }),
    };
  }
);

vi.mock('../../../src/components/modal/AddSimulationModal', () => ({
  AddSimulationModal: ({
    isOpen,
    simulationIds,
    onClose,
  }: {
    isOpen: boolean;
    simulationIds?: string[];
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Create Simulation Assignment">
        <ul aria-label="Pre-selected simulations">
          {simulationIds?.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

import MyLibraryPage from '../../../src/pages/Simulation/simulationlibrary';

const sim = (overrides: Partial<Simulation>): Simulation => ({
  id: 'id',
  simulation_id: 'id',
  name: '',
  title: '',
  unit: 'u-1',
  unit_name: 'Maternal Health',
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
  sim({ id: 's1', simulation_id: 's1', title: 'Postpartum Hemorrhage' }),
  sim({
    id: 's2',
    simulation_id: 's2',
    title: 'Newborn Assessment',
    unit: 'u-2',
    unit_name: 'Pediatrics',
    difficulty: 'Medium',
  }),
  sim({
    id: 's3',
    simulation_id: 's3',
    title: 'Preeclampsia',
    difficulty: 'Medium',
  }),
  sim({
    id: 's4',
    simulation_id: 's4',
    title: 'Teen Pregnancy Talk',
    learnerLevel: 'High School',
    avatarEnabled: false,
    difficulty: 'Medium',
  }),
];

const toItem = (s: Simulation): MyLibraryItemResDto => ({
  id: `entry-${s.id}`,
  unitId: s.unit,
  unit: { id: s.unit, name: s.unit_name, imageUrl: null },
  scenario: {
    id: s.id,
    title: s.title,
    description: s.description,
    learnerLevel: s.learnerLevel,
    difficulty: s.difficulty,
    avatarEnabled: s.avatarEnabled ?? false,
    estimatedDuration: s.duration,
    timeAllotment: null,
    scenarioImage: null,
    productName: null,
    clinicalSetting: null,
    learningObjectives: [],
  },
});

type ListParams = Partial<Record<string, string | string[] | number>>;

const anyOf = (selected: ListParams[string], value: string) =>
  !Array.isArray(selected) ||
  selected.some((v) => v.toLowerCase() === value.toLowerCase());

const page = (data: unknown[]) =>
  Promise.resolve({
    data: {
      message: 'OK',
      data,
      meta: {
        total: data.length,
        page: 1,
        pageSize: 24,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    },
  });

/** The library's units as the Unit dropdown route lists them. */
const answerUnitOptionsRequest = () =>
  page(
    [...new Map(LIBRARY.map((s) => [s.unit, s.unit_name]))].map(
      ([id, name]) => ({ id, name })
    )
  );

const answerRequest = (config: { url: string; params?: ListParams }) => {
  if (config.url === '/api/units/my-library/dropdown') {
    return answerUnitOptionsRequest();
  }
  if (config.url.endsWith('/my-library/dropdown')) return page([]);
  return answerListRequest(config);
};

const answerListRequest = ({ params = {} }: { params?: ListParams }) => {
  const data = LIBRARY.filter(
    (s) =>
      anyOf(params.difficulty, s.difficulty) &&
      anyOf(params.unitId, s.unit) &&
      anyOf(params.modality, toModality(s.avatarEnabled)) &&
      anyOf(params.learnerLevel, toLearnerLevel(s.learnerLevel))
  ).map(toItem);
  return page(data);
};

const renderLibrary = () => {
  apiRequest.mockImplementation(answerRequest);
  const store = configureStore({
    reducer: {
      SimulationLibrary: simulationLibraryReducer,
      [myLibraryApi.reducerPath]: myLibraryApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(myLibraryApi.middleware),
    preloadedState: {
      SimulationLibrary: {
        responseSimulationLibrary: {
          data: LIBRARY,
          message: '',
          status: 'success',
        },
        hasImages: true,
        status: 'succeeded' as const,
        error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/simulationlibrary']}>
        <MyLibraryPage />
      </MemoryRouter>
    </Provider>
  );
};

/** Simulation names in the list-view table, in display order. */
const visibleTitles = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent);

const toolbar = () =>
  screen.getByRole('region', { name: 'Selected simulations' });

describe('Simulation library: browse, filter, select, assign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('carries a filtered multi-selection into assignment already populated', async () => {
    renderLibrary();

    // Grid view by default, then list view.
    expect(await screen.findAllByRole('heading', { level: 3 })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(visibleTitles()).toHaveLength(4);

    // Quick filter: Medium difficulty.
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Quick filters' })).getByRole(
        'button',
        { name: 'Medium' }
      )
    );
    await waitFor(() =>
      expect(visibleTitles()).toEqual([
        'Newborn Assessment',
        'Preeclampsia',
        'Teen Pregnancy Talk',
      ])
    );

    // Full panel: add a Unit filter on top of the quick filter.
    fireEvent.click(screen.getByRole('button', { name: 'Filters, 1 applied' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unit' }));
    fireEvent.click(
      await screen.findByRole('option', { name: /Maternal Health/ })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filter' }));

    await waitFor(() =>
      expect(visibleTitles()).toEqual(['Preeclampsia', 'Teen Pregnancy Talk'])
    );
    // The filters went to the API as repeated params, the unit by its id.
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/api/educator-simulations/my-library/list',
        params: expect.objectContaining({
          page: 1,
          difficulty: ['Medium'],
          unitId: ['u-1'],
        }),
      })
    );
    // Both sources show up as chips from the same state.
    expect(
      screen.getByRole('button', { name: 'Remove Difficulty filter: Medium' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Remove Unit filter: Maternal Health',
      })
    ).toBeInTheDocument();

    // Select everything shown, then hand it to assignment.
    fireEvent.click(
      within(toolbar()).getByRole('button', { name: 'Select all (2)' })
    );
    fireEvent.click(
      within(toolbar()).getByRole('button', {
        name: 'Assign 2 simulations to Class(es)',
      })
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Create Simulation Assignment',
    });
    expect(
      within(
        within(dialog).getByRole('list', { name: 'Pre-selected simulations' })
      )
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['s3', 's4']);
    // The whole browse → filter → select → assign flow: about 2 s alone, so
    // the default 5 s is too tight when the full suite runs in parallel.
  }, 15_000);

  it('keeps the selection across a grid/list switch', async () => {
    renderLibrary();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Preeclampsia' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(
      screen.getByRole('checkbox', { name: 'Select Preeclampsia' })
    ).toBeChecked();
    expect(within(toolbar()).getByText('1 selected')).toBeInTheDocument();
  });
});
