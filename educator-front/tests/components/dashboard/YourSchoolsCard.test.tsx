import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import type { Class } from '@/types/Class_types';
import { YourSchoolsCard } from '@/components/dashboard/YourSchoolsCard';
import { summarizeSchools, getEducatorSchools } from '@/utils/dashboardSchools';

let mockState: {
  GetClass: {
    status: string;
    responseClass: { data: { classes: Class[] } } | null;
  };
};

vi.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockState),
}));

vi.mock('@/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/storage')>()),
  getParsedUser: () => ({ id: 'educator-1' }),
}));

const SCHOOLS = [
  { id: 's1', name: 'North High' },
  { id: 's2', name: 'South College' },
];

// A term running across today, so the classes count as active.
const TERM = { start_date: '2000-01-01', end_date: '2999-12-31' };

const CLASSES: Class[] = [
  {
    id: 'c1',
    class_name: 'Bio',
    school_id: 's1',
    status: 'ACTIVE',
    ...TERM,
    total_no_of_students: 12,
  },
  {
    id: 'c2',
    class_name: 'Chem',
    school_name: 'North High',
    status: 'ACTIVE',
    ...TERM,
    total_no_of_students: 1,
  },
  {
    id: 'c3',
    class_name: 'Old',
    school_id: 's2',
    status: 'INACTIVE',
    ...TERM,
    total_no_of_students: 30,
  },
];

const renderCard = (schools = SCHOOLS) =>
  render(
    <I18nextProvider i18n={i18n}>
      <YourSchoolsCard schools={schools} />
    </I18nextProvider>
  );

describe('YourSchoolsCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    mockState = {
      GetClass: {
        status: 'succeeded',
        responseClass: { data: { classes: CLASSES } },
      },
    };
  });

  it('renders nothing for an educator at a single school', () => {
    const { container } = renderCard([SCHOOLS[0]!]);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each school's active classes and students", () => {
    renderCard();

    expect(
      screen.getByRole('heading', { name: 'Your Schools (2)' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 active classes · 13 active students')
    ).toBeInTheDocument();
    expect(
      screen.getByText('0 active classes · 0 active students')
    ).toBeInTheDocument();
  });

  it('shows a loading state while classes load', () => {
    mockState.GetClass = { status: 'loading', responseClass: null };
    renderCard();

    expect(screen.getAllByText('Loading your schools…')).toHaveLength(2);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
  });

  it('says the totals are unavailable when classes fail to load', () => {
    mockState.GetClass = { status: 'failed', responseClass: null };
    renderCard();

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load your classes"
    );
    expect(screen.getByText('North High')).toBeInTheDocument();
    expect(screen.getAllByText('Totals unavailable')).toHaveLength(2);
  });

  it('remembers being collapsed', async () => {
    const user = userEvent.setup();
    const { unmount } = renderCard();

    await user.click(screen.getByRole('button', { name: /your schools/i }));
    expect(screen.queryByRole('list')).toBeNull();
    unmount();

    renderCard();
    expect(
      screen.getByRole('button', { name: /your schools/i })
    ).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('dashboardSchools', () => {
  it("reads the normalized user's schools, skipping ones without an id", () => {
    expect(
      getEducatorSchools({
        schools: [{ id: 's1', school_name: 'North' }, { school_name: 'X' }],
      })
    ).toEqual([{ id: 's1', name: 'North' }]);
    expect(getEducatorSchools(null)).toEqual([]);
  });

  it('counts a class with a school id only under that school, even if its name matches another', () => {
    const moved: Class = {
      id: 'c4',
      class_name: 'Physics',
      school_id: 's2',
      school_name: 'North High',
      status: 'ACTIVE',
      start_date: '2000-01-01',
      end_date: '2999-12-31',
      total_no_of_students: 5,
    };
    expect(summarizeSchools(SCHOOLS, [...CLASSES, moved])).toEqual([
      { id: 's1', name: 'North High', activeClasses: 2, activeStudents: 13 },
      { id: 's2', name: 'South College', activeClasses: 1, activeStudents: 5 },
    ]);
  });

  it('counts only active classes, matched by id or name', () => {
    expect(summarizeSchools(SCHOOLS, CLASSES)).toEqual([
      { id: 's1', name: 'North High', activeClasses: 2, activeStudents: 13 },
      { id: 's2', name: 'South College', activeClasses: 0, activeStudents: 0 },
    ]);
  });
});
