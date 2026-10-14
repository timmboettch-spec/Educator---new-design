import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import dayjs from 'dayjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AddSimulationModal } from '../../../src/components/modal/AddSimulationModal';
import type { MultiSelectOption } from '../../../src/components/ui/MultiSelect';
import type { Simulation } from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import { renderWithProviders } from '../../../src/test/testUtils';
import type { SimulationItem } from '../../../src/types';
import type {
  AssignableClass,
  AssignContextClass,
} from '../../../src/types/simulationAssignment.types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDispatch = vi.fn();
const bulkAssign = vi.fn();
const createClass = vi.fn();
const mockIsAssigning = { value: false };

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast,
  sonnerToast: toast,
  SESSION_TOAST_KEY: 'app_pending_toast',
  default: () => null,
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn(),
}));

vi.mock(
  '../../../src/redux/api/classSimulations/classSimulationsApi',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useBulkAssignClassSimulationsMutation: () => [
      bulkAssign,
      { isLoading: mockIsAssigning.value },
    ],
  })
);

vi.mock(
  '../../../src/redux/api/classes/classesApi',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useCreateClassMutation: () => [createClass],
  })
);

const library = vi.hoisted(() => ({
  current: {
    simulations: [] as Simulation[],
    isSimulationsLoading: false,
    hasSimulationsError: false,
  },
}));

// Records what the modal asks the library refresh for.
const fetchMyLibrarySimulations = vi.hoisted(() =>
  vi.fn((arg?: unknown) => ({ type: 'simLib/fetchMy', meta: { arg } }))
);
vi.mock(
  '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    fetchMyLibrarySimulations,
  })
);

vi.mock('../../../src/hooks/useAssignSimulationsData', () => ({
  useAssignSimulationsData: () => library.current,
}));

/** What the lazy School / Class Name lists return, by school. */
const lists = vi.hoisted(() => ({
  schools: [] as Array<{ value: string; label: string }>,
  classesBySchool: {} as Record<string, AssignableClass[]>,
  schoolOpened: vi.fn(),
  schoolsPreloaded: vi.fn(),
  classesOpened: vi.fn(),
  isClassSearchPending: false,
}));

vi.mock('../../../src/hooks/useAssignClassOptions', async () => {
  const { useState } = await import('react');
  return {
    useAssignClassOptions: (
      schoolId: string,
      config?: { preloadSchools?: boolean }
    ) => {
      if (config?.preloadSchools) lists.schoolsPreloaded();
      const [schoolSearch, setSchoolSearch] = useState('');
      const [classSearch, setClassSearch] = useState('');
      const classes = lists.classesBySchool[schoolId] ?? [];
      const field = (
        options: MultiSelectOption[],
        searchValue: string,
        onSearchChange: (search: string) => void,
        onOpen: () => void
      ) => ({
        options,
        searchValue,
        onSearchChange,
        onOpen,
        onLoadMore: vi.fn(),
        hasMore: false,
        isFetchingMore: false,
        loading: false,
        isError: false,
        isSearchPending: false,
      });
      return {
        schoolField: field(lists.schools, schoolSearch, setSchoolSearch, () =>
          lists.schoolOpened()
        ),
        classField: {
          ...field(
            classes.map((c) => ({
              value: c.id,
              label: c.name,
              description: `${c.startDate} – ${c.endDate}`,
            })),
            classSearch,
            setClassSearch,
            () => lists.classesOpened(schoolId)
          ),
          isSearchPending: lists.isClassSearchPending,
        },
        onlySchool:
          config?.preloadSchools && lists.schools.length === 1
            ? lists.schools[0]
            : null,
        classesById: Object.fromEntries(
          Object.values(lists.classesBySchool)
            .flat()
            .map((c) => [c.id, c])
        ),
        resetSearches: () => {
          setSchoolSearch('');
          setClassSearch('');
        },
      };
    },
  };
});

const storedUser = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock('../../../src/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getParsedUser: () => storedUser.current,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const iso = (days: number) => dayjs().add(days, 'day').format('YYYY-MM-DD');
const mmddyyyy = (days: number) =>
  dayjs().add(days, 'day').format('MM-DD-YYYY');

const SCHOOL = { id: 'school-1', school_name: 'North High' };

const makeClass = (overrides: Partial<AssignableClass> = {}) => ({
  id: 'class-1',
  name: 'Biology',
  startDate: iso(1),
  endDate: iso(60),
  studentsCount: 10,
  ...overrides,
});

const CLASS_CONTEXT: AssignContextClass = {
  ...makeClass(),
  schoolId: SCHOOL.id,
  schoolName: SCHOOL.school_name,
};

const makeSim = (overrides: Partial<Simulation> = {}): Simulation => ({
  id: 'colostomy-care',
  simulation_id: 'colostomy-care',
  title: 'Colostomy Care',
  name: 'Colostomy Care',
  unit: 'unit-1',
  unit_name: 'Gastro',
  duration: '30 min',
  image: '',
  description: 'Care for a colostomy patient.',
  assigned: false,
  rating: 0,
  difficulty: 'Beginner',
  learnerLevel: 'Secondary',
  avatarEnabled: false,
  ...overrides,
});

const classProps = {
  isOpen: true,
  onClose: vi.fn(),
  onAssigned: vi.fn(),
  classContext: CLASS_CONTEXT,
  simulations: [] as SimulationItem[],
};

const libraryProps = {
  isOpen: true,
  onClose: vi.fn(),
  simulations: [] as Simulation[],
};

const assignment = (
  overrides: Partial<SimulationItem> = {}
): SimulationItem => ({
  id: 'cs-1',
  simulation_id: 'colostomy-care',
  simulation_title: 'Colostomy Care',
  simulation_lib_name: '',
  unit: 'unit-1',
  unit_name: 'Gastro',
  start_date: mmddyyyy(-30),
  due_date: mmddyyyy(-20),
  end_date: mmddyyyy(-10),
  class_id: 'class-1',
  class_name: 'Biology',
  user_id: '',
  image_url: '',
  created_at: '',
  email: '',
  ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const schoolTrigger = () => screen.getByRole('button', { name: /^School/ });
const classTrigger = () => screen.getByRole('button', { name: /^Class Name/ });
const simTrigger = () =>
  screen.getByRole('button', { name: /^Simulation Name/ });
const submitButton = () =>
  screen.getByRole('button', { name: /create assignment/i });

const pickOption = (trigger: HTMLElement, name: RegExp) => {
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name }));
  const listbox = screen.queryByRole('listbox');
  if (listbox) fireEvent.keyDown(listbox, { key: 'Escape' });
};

const pickDueDate = (days: number) =>
  fireEvent.change(screen.getByLabelText(/^Due Date/), {
    target: { value: iso(days) },
  });

const resolveAssign = (created = 1) =>
  bulkAssign.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        total: created,
        created,
        seatsCharged: 0,
        remainingSeats: 0,
        results: [],
      }),
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AddSimulationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAssigning.value = false;
    mockDispatch.mockReturnValue(Promise.resolve({}));
    storedUser.current = {};
    library.current = {
      simulations: [makeSim()],
      isSimulationsLoading: false,
      hasSimulationsError: false,
    };
    lists.schools = [{ value: 'school-1', label: 'North High' }];
    lists.isClassSearchPending = false;
    lists.classesBySchool = {
      'school-1': [makeClass()],
      'school-2': [makeClass({ id: 'class-3', name: 'Other School' })],
    };
    resolveAssign();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <AddSimulationModal {...libraryProps} isOpen={false} />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the school, class, filter, simulation and date fields', () => {
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    expect(
      screen.getByText('Create Simulation Assignment')
    ).toBeInTheDocument();
    expect(schoolTrigger()).toBeInTheDocument();
    expect(classTrigger()).toBeInTheDocument();
    expect(screen.getByText('Simulation Modality')).toBeInTheDocument();
    expect(screen.getByText('Learner Level')).toBeInTheDocument();
    expect(simTrigger()).toBeInTheDocument();
    expect(screen.getByLabelText(/^Start Date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Due Date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^End Date/)).toBeInTheDocument();
  });

  it('calls onClose when Back is clicked', () => {
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(libraryProps.onClose).toHaveBeenCalled();
  });

  it('disables Create Assignment and Back while the request is in flight', () => {
    mockIsAssigning.value = true;
    renderWithProviders(<AddSimulationModal {...classProps} />);
    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('keeps the class picker disabled until a school is chosen', () => {
    lists.schools = [
      { value: 'school-1', label: 'North High' },
      { value: 'school-2', label: 'South High' },
    ];
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    expect(classTrigger()).toBeDisabled();
    expect(classTrigger()).toHaveTextContent('Select a school first');
  });

  it('class context: pre-selects the school, class and dates, still editable', () => {
    renderWithProviders(<AddSimulationModal {...classProps} />);
    expect(schoolTrigger()).toHaveTextContent('North High');
    expect(classTrigger()).toBeEnabled();
    expect(classTrigger()).toHaveTextContent('1 selected');
    expect(screen.getByLabelText(/^Start Date/)).toHaveValue(iso(1));
    expect(screen.getByLabelText(/^End Date/)).toHaveValue(iso(60));
  });

  it('moves a class start date that has passed up to today', () => {
    renderWithProviders(
      <AddSimulationModal
        {...classProps}
        classContext={{ ...CLASS_CONTEXT, startDate: iso(-5) }}
      />
    );
    expect(screen.getByLabelText(/^Start Date/)).toHaveValue(iso(0));
  });

  it('library context: loads the schools on open and pre-selects the only one', () => {
    library.current.simulations = [
      makeSim(),
      makeSim({ id: 'stroke-eval', title: 'Stroke Evaluation' }),
    ];
    renderWithProviders(
      <AddSimulationModal
        {...libraryProps}
        simulationIds={['colostomy-care', 'stroke-eval']}
      />
    );
    expect(lists.schoolsPreloaded).toHaveBeenCalled();
    expect(schoolTrigger()).toHaveTextContent('North High');
    expect(classTrigger()).toBeEnabled();
    expect(classTrigger()).toHaveTextContent('Select a class');
    expect(simTrigger()).toHaveTextContent('2 selected');
  });

  it('library context: leaves the school empty when there are several', () => {
    lists.schools = [
      { value: 'school-1', label: 'North High' },
      { value: 'school-2', label: 'South High' },
    ];
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    expect(schoolTrigger()).toHaveTextContent('Select School');
  });

  it('class context: does not load the schools until the list is opened', () => {
    renderWithProviders(<AddSimulationModal {...classProps} />);
    expect(lists.schoolsPreloaded).not.toHaveBeenCalled();
  });

  it('loads the class list only when it is opened', () => {
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    expect(lists.classesOpened).not.toHaveBeenCalled();

    fireEvent.click(schoolTrigger());
    expect(lists.schoolOpened).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    fireEvent.click(classTrigger());
    expect(lists.classesOpened).toHaveBeenCalledWith('school-1');
    expect(screen.getByRole('option')).toHaveTextContent('Biology');
  });

  it('changing the school clears the classes and lists the new school', () => {
    lists.schools = [
      { value: 'school-1', label: 'North High' },
      { value: 'school-2', label: 'South High' },
    ];
    renderWithProviders(<AddSimulationModal {...classProps} />);
    expect(classTrigger()).toHaveTextContent('1 selected');

    pickOption(schoolTrigger(), /South High/);
    expect(schoolTrigger()).toHaveTextContent('South High');
    expect(classTrigger()).toHaveTextContent('Select a class');

    fireEvent.click(classTrigger());
    expect(lists.classesOpened).toHaveBeenLastCalledWith('school-2');
    expect(screen.getByRole('option')).toHaveTextContent('Other School');
  });

  it('fills the dates from the first class picked', () => {
    lists.classesBySchool['school-1'] = [
      makeClass({ startDate: iso(3), endDate: iso(40) }),
    ];
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    pickOption(classTrigger(), /Biology/);
    expect(classTrigger()).toHaveTextContent('1 selected');
    expect(screen.getByLabelText(/^Start Date/)).toHaveValue(iso(3));
    expect(screen.getByLabelText(/^End Date/)).toHaveValue(iso(40));
  });

  it('filters simulations by modality and learner level as the library does', () => {
    library.current.simulations = [
      makeSim({
        id: 'airway',
        title: 'Airway',
        avatarEnabled: true,
        learnerLevel: 'Nursing students',
      }),
      makeSim({
        id: 'burn',
        title: 'Burn Care',
        learnerLevel: '',
        targetAudience: 'High school students',
      }),
      makeSim({
        id: 'cardiac',
        title: 'Cardiac',
        learnerLevel: 'Post-Secondary',
      }),
    ];
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    const simOptions = () => {
      fireEvent.click(simTrigger());
      const names = screen
        .getAllByRole('option')
        .map((option) => option.textContent);
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
      return names;
    };

    pickOption(
      screen.getByRole('button', { name: 'Select Simulation Modality' }),
      /^Workstation$/
    );
    expect(simOptions()).toEqual(['Burn Care', 'Cardiac']);

    // Burn Care has no learner level; its target audience makes it Secondary.
    pickOption(
      screen.getByRole('button', { name: 'Select Learner Level' }),
      /^Secondary$/
    );
    expect(simOptions()).toEqual(['Burn Care']);
  });

  it('shows the simulation details only when exactly one simulation is selected', () => {
    renderWithProviders(
      <AddSimulationModal {...libraryProps} simulationId="colostomy-care" />
    );
    const details = screen.getByRole('region', { name: 'Simulation Details' });
    expect(
      within(details).getByText('Care for a colostomy patient.')
    ).toBeInTheDocument();
    expect(within(details).getByText('Beginner')).toBeInTheDocument();
  });

  it('shows required errors and does not submit an empty form', async () => {
    lists.schools = [
      { value: 'school-1', label: 'North High' },
      { value: 'school-2', label: 'South High' },
    ];
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    fireEvent.click(submitButton());
    expect(
      await screen.findByText('Please select a school.')
    ).toBeInTheDocument();
    expect(screen.getByText('Class is required')).toBeInTheDocument();
    expect(screen.getByText('Simulation Name is required')).toBeInTheDocument();
    expect(screen.getByText('Start date is required')).toBeInTheDocument();
    expect(screen.getByText('Due date is required')).toBeInTheDocument();
    expect(screen.getByText('End date is required')).toBeInTheDocument();
    expect(bulkAssign).not.toHaveBeenCalled();
  });

  it('sends one bulk request for every class × simulation and closes on success', async () => {
    resolveAssign(2);
    library.current.simulations = [
      makeSim(),
      makeSim({ id: 'stroke-eval', title: 'Stroke Evaluation' }),
    ];
    renderWithProviders(<AddSimulationModal {...classProps} />);
    pickOption(simTrigger(), /Colostomy Care/);
    pickOption(simTrigger(), /Stroke Evaluation/);
    pickDueDate(10);
    fireEvent.click(submitButton());

    await waitFor(() => expect(bulkAssign).toHaveBeenCalledTimes(1));
    expect(bulkAssign).toHaveBeenCalledWith({
      schoolId: 'school-1',
      classIds: ['class-1'],
      simulationIds: ['colostomy-care', 'stroke-eval'],
      startDate: iso(1),
      dueDate: iso(10),
      endDate: iso(60),
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        '2 simulation assignments created'
      )
    );
    expect(classProps.onAssigned).toHaveBeenCalled();
    expect(classProps.onClose).toHaveBeenCalled();
  });

  it('refreshes the library without the catalogue image lookup after assigning', async () => {
    renderWithProviders(<AddSimulationModal {...classProps} />);
    pickOption(simTrigger(), /Colostomy Care/);
    pickDueDate(10);
    fireEvent.click(submitButton());

    await waitFor(() => expect(classProps.onClose).toHaveBeenCalled());
    // The modal shows no simulation images, so the refresh skips them.
    expect(fetchMyLibrarySimulations).toHaveBeenCalledTimes(1);
    expect(fetchMyLibrarySimulations).toHaveBeenCalledWith({
      skipImages: true,
    });
  });

  it('shows the BE message when the bulk request fails', async () => {
    bulkAssign.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: { message: 'One or more pairs failed.' },
        }),
    });
    renderWithProviders(
      <AddSimulationModal {...classProps} simulationId="colostomy-care" />
    );
    pickDueDate(10);
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('One or more pairs failed.')
    );
    expect(classProps.onClose).not.toHaveBeenCalled();
  });

  it('blocks a simulation whose assignment to this class is still open', async () => {
    renderWithProviders(
      <AddSimulationModal
        {...classProps}
        simulationId="colostomy-care"
        simulations={[assignment({ end_date: mmddyyyy(5) })]}
      />
    );
    pickDueDate(10);
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This simulation is already assigned and has not yet reached its end date.'
      )
    );
    expect(bulkAssign).not.toHaveBeenCalled();
  });

  it('asks to confirm re-assigning a simulation this class had before', async () => {
    renderWithProviders(
      <AddSimulationModal
        {...classProps}
        simulationId="colostomy-care"
        simulations={[assignment()]}
      />
    );
    pickDueDate(10);
    fireEvent.click(submitButton());

    expect(
      await screen.findByText(
        'This simulation has previously been assigned to this class'
      )
    ).toBeInTheDocument();
    expect(bulkAssign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(bulkAssign).toHaveBeenCalledTimes(1));
  });

  it('warns and blocks submit when avatar seats cannot cover the classes', () => {
    storedUser.current = {
      ai_seats: { total: 20, consumed: 15, available: 5 },
    };
    library.current.simulations = [makeSim({ avatarEnabled: true })];
    renderWithProviders(
      <AddSimulationModal {...classProps} simulationId="colostomy-care" />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      '5 remaining, 10 needed for this assignment'
    );
    expect(submitButton()).toBeDisabled();
  });

  it('skips the seat warning when the session has no seat data', () => {
    library.current.simulations = [makeSim({ avatarEnabled: true })];
    renderWithProviders(
      <AddSimulationModal {...classProps} simulationId="colostomy-care" />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it('keeps edited dates when another class is added', () => {
    lists.classesBySchool['school-1'] = [
      makeClass({ startDate: iso(3), endDate: iso(40) }),
      makeClass({
        id: 'class-2',
        name: 'Chemistry',
        startDate: iso(5),
        endDate: iso(50),
      }),
    ];
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    pickOption(classTrigger(), /Biology/);
    expect(screen.getByLabelText(/^End Date/)).toHaveValue(iso(40));

    fireEvent.change(screen.getByLabelText(/^End Date/), {
      target: { value: iso(45) },
    });
    pickDueDate(10);
    pickOption(classTrigger(), /Chemistry/);

    // The first class is still Biology, so the educator's dates stay.
    expect(classTrigger()).toHaveTextContent('2 selected');
    expect(screen.getByLabelText(/^Start Date/)).toHaveValue(iso(3));
    expect(screen.getByLabelText(/^Due Date/)).toHaveValue(iso(10));
    expect(screen.getByLabelText(/^End Date/)).toHaveValue(iso(45));
  });

  it('closes as a success even when the follow-up refresh fails', async () => {
    resolveAssign();
    const onAssigned = vi.fn().mockRejectedValue(new Error('refresh failed'));
    renderWithProviders(
      <AddSimulationModal {...classProps} onAssigned={onAssigned} />
    );
    pickOption(simTrigger(), /Colostomy Care/);
    pickDueDate(10);
    fireEvent.click(submitButton());

    await waitFor(() => expect(classProps.onClose).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      '1 simulation assignment created'
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('creates a class inline from the class search and selects it', async () => {
    createClass.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          classId: 'class-new',
          className: 'Chemistry',
          startDate: iso(2),
          endDate: iso(90),
          createdAt: '',
          updatedAt: '',
        }),
    });
    renderWithProviders(<AddSimulationModal {...libraryProps} />);

    fireEvent.click(classTrigger());
    fireEvent.change(screen.getByRole('textbox', { name: 'Search…' }), {
      target: { value: 'Chemistry' },
    });
    fireEvent.click(
      screen.getByRole('option', { name: 'Create class "Chemistry"' })
    );

    const card = screen.getByRole('group', { name: 'Create a new class' });
    expect(within(card).getByDisplayValue('North High')).toBeInTheDocument();
    expect(within(card).getByDisplayValue('Chemistry')).toBeInTheDocument();
    // The assign button waits until the inline class is created or cancelled.
    expect(submitButton()).toBeDisabled();

    fireEvent.change(card.querySelectorAll('input[type="date"]')[0]!, {
      target: { value: iso(2) },
    });
    fireEvent.change(card.querySelectorAll('input[type="date"]')[1]!, {
      target: { value: iso(90) },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Create Class' }));

    await waitFor(() =>
      expect(createClass).toHaveBeenCalledWith(
        expect.objectContaining({
          className: 'Chemistry',
          schoolId: 'school-1',
          startDate: iso(2),
          endDate: iso(90),
        })
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Class created')
    );
    expect(
      screen.queryByRole('group', { name: 'Create a new class' })
    ).not.toBeInTheDocument();
    expect(classTrigger()).toHaveTextContent('1 selected');
    expect(screen.getByLabelText(/^Start Date/)).toHaveValue(iso(2));
    expect(screen.getByLabelText(/^End Date/)).toHaveValue(iso(90));
  });

  it('keeps the dates when a class is created inline after another is picked', async () => {
    createClass.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          classId: 'class-new',
          className: 'Chemistry',
          startDate: iso(2),
          endDate: iso(90),
          createdAt: '',
          updatedAt: '',
        }),
    });
    // Opened from Biology: dates iso(1) – iso(60).
    renderWithProviders(<AddSimulationModal {...classProps} />);

    fireEvent.click(classTrigger());
    fireEvent.change(screen.getByRole('textbox', { name: 'Search…' }), {
      target: { value: 'Chemistry' },
    });
    fireEvent.click(
      screen.getByRole('option', { name: 'Create class "Chemistry"' })
    );
    const card = screen.getByRole('group', { name: 'Create a new class' });
    fireEvent.change(card.querySelectorAll('input[type="date"]')[0]!, {
      target: { value: iso(2) },
    });
    fireEvent.change(card.querySelectorAll('input[type="date"]')[1]!, {
      target: { value: iso(90) },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Create Class' }));

    await waitFor(() => expect(classTrigger()).toHaveTextContent('2 selected'));
    expect(screen.getByLabelText(/^Start Date/)).toHaveValue(iso(1));
    expect(screen.getByLabelText(/^End Date/)).toHaveValue(iso(60));
  });

  it('offers no create option until the search results are in', () => {
    lists.isClassSearchPending = true;
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    fireEvent.click(classTrigger());
    fireEvent.change(screen.getByRole('textbox', { name: 'Search…' }), {
      target: { value: 'Chemistry' },
    });
    expect(
      screen.queryByRole('option', { name: /Create class/ })
    ).not.toBeInTheDocument();
  });

  it('offers no create option when the search matches a class', async () => {
    renderWithProviders(<AddSimulationModal {...libraryProps} />);
    fireEvent.click(classTrigger());
    fireEvent.change(screen.getByRole('textbox', { name: 'Search…' }), {
      target: { value: 'biology' },
    });
    // An exact (case-insensitive) match offers no create option.
    expect(
      screen.queryByRole('option', { name: /Create class/ })
    ).not.toBeInTheDocument();
  });
});
