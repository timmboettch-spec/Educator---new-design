import { describe, expect, it } from 'vitest';
import {
  FILTER_DROPDOWN_PAGE_SIZE,
  MY_LIBRARY_SEARCH_MAX_LENGTH,
  UNIT_DROPDOWN_PAGE_SIZE,
  buildFilterDropdownArg,
  buildListMyLibraryParams,
  toLibrarySimulation,
} from '../../../src/redux/api/myLibrary/myLibraryService';
import type { MyLibraryItemResDto } from '../../../src/redux/api/myLibrary/myLibrary.types';
import {
  EMPTY_LIBRARY_FILTERS,
  type LibraryFilters,
} from '../../../src/utils/libraryFilters';

const filters = (overrides: Partial<LibraryFilters>): LibraryFilters => ({
  ...EMPTY_LIBRARY_FILTERS,
  ...overrides,
});

describe('buildListMyLibraryParams', () => {
  it('sends nothing when no filter or search is applied', () => {
    expect(buildListMyLibraryParams(EMPTY_LIBRARY_FILTERS, '   ')).toEqual({});
  });

  it('sends the Unit filter as unitId and leaves Duration out', () => {
    expect(
      buildListMyLibraryParams(
        filters({ unit: ['u-1', ' u-2 '], duration: ['<15 min'] }),
        ''
      )
    ).toEqual({ unitId: ['u-1', 'u-2'] });
  });

  it('maps learner level and modality onto the BE values, dropping unknown ones', () => {
    expect(
      buildListMyLibraryParams(
        filters({
          learnerLevel: ['post-secondary', 'Middle School'],
          modality: ['avatar', 'AVATAR', 'Hologram'],
        }),
        ''
      )
    ).toEqual({ learnerLevel: ['Post-Secondary'], modality: ['Avatar'] });
  });

  it('sends difficulty in the exact casing the BE accepts, dropping any other value', () => {
    expect(
      buildListMyLibraryParams(
        filters({
          difficulty: ['easy', ' HARD ', 'Easy', 'Beginner', 'Expert'],
        }),
        ''
      )
    ).toEqual({ difficulty: ['Easy', 'Hard'] });
  });

  it('caps each free-text filter at the 20 values the BE accepts', () => {
    const many = Array.from({ length: 25 }, (_, i) => `Value ${i}`);
    const params = buildListMyLibraryParams(
      filters({ targetAudience: many, productName: many, unit: many }),
      ''
    );
    expect(params.targetAudience).toEqual(many.slice(0, 20));
    expect(params.productName).toHaveLength(20);
    expect(params.unitId).toHaveLength(20);
  });

  it('trims free-text values and drops blank ones and repeats', () => {
    expect(
      buildListMyLibraryParams(
        filters({
          targetAudience: [' BSN ', '', 'BSN'],
          productName: ['Knee Set, Large'],
          difficulty: ['  '],
        }),
        ''
      )
    ).toEqual({ targetAudience: ['BSN'], productName: ['Knee Set, Large'] });
  });

  it('collapses whitespace in the search and caps it at the BE limit', () => {
    expect(
      buildListMyLibraryParams(EMPTY_LIBRARY_FILTERS, '  burn   care ')
    ).toEqual({ search: 'burn care' });
    const long = 'a'.repeat(MY_LIBRARY_SEARCH_MAX_LENGTH + 20);
    expect(
      buildListMyLibraryParams(EMPTY_LIBRARY_FILTERS, long).search
    ).toHaveLength(MY_LIBRARY_SEARCH_MAX_LENGTH);
  });
});

const ITEM: MyLibraryItemResDto = {
  id: 'entry-1',
  unitId: 'u-1',
  unit: {
    id: 'u-1',
    name: 'Maternal Health',
    imageUrl: 'https://cdn/unit.png',
  },
  scenario: {
    id: 's-1',
    title: 'Postpartum Hemorrhage',
    description: null,
    learnerLevel: ' High School Allied Health ',
    difficulty: null,
    avatarEnabled: false,
    estimatedDuration: 'Plan for about 20 minutes of work in the session.',
    timeAllotment: '45 min',
    scenarioImage: 'https://cdn/scenario.png',
    productName: ' RealCare Baby ',
    clinicalSetting: null,
    learningObjectives: [],
  },
};

describe('buildFilterDropdownArg', () => {
  it('asks for a page of options with no search when blank', () => {
    expect(buildFilterDropdownArg('  ')).toEqual({
      pageSize: FILTER_DROPDOWN_PAGE_SIZE,
    });
  });

  it('takes a larger page size when asked (the Unit dropdown)', () => {
    expect(buildFilterDropdownArg('', UNIT_DROPDOWN_PAGE_SIZE)).toEqual({
      pageSize: 500,
    });
  });

  it('collapses whitespace in the search and caps it at the BE limit', () => {
    expect(buildFilterDropdownArg('  adult   health ')).toEqual({
      pageSize: FILTER_DROPDOWN_PAGE_SIZE,
      search: 'adult health',
    });
    expect(buildFilterDropdownArg('x'.repeat(150)).search).toHaveLength(
      MY_LIBRARY_SEARCH_MAX_LENGTH
    );
  });
});

describe('toLibrarySimulation', () => {
  it("uses the simulation's id and prefers its own image", () => {
    const sim = toLibrarySimulation(ITEM);
    expect(sim).toEqual(
      expect.objectContaining({
        id: 's-1',
        simulation_id: 's-1',
        scenario_id: 's-1',
        title: 'Postpartum Hemorrhage',
        unit: 'u-1',
        unit_name: 'Maternal Health',
        image: 'https://cdn/scenario.png',
        description: '',
        difficulty: '',
        learnerLevel: 'High School Allied Health',
        targetAudience: 'High School Allied Health',
        productName: 'RealCare Baby',
        avatarEnabled: false,
        learningObjectives: [],
        clinicalSetting: undefined,
      })
    );
  });

  it('reduces sentence-like durations to the duration itself', () => {
    expect(toLibrarySimulation(ITEM).duration).toBe('20 minutes');
  });

  it('falls back to the time allotment when there is no estimate', () => {
    const noEstimate = {
      ...ITEM,
      scenario: { ...ITEM.scenario, estimatedDuration: null },
    };
    expect(toLibrarySimulation(noEstimate).duration).toBe('45 min');

    const neither = {
      ...ITEM,
      scenario: { ...noEstimate.scenario, timeAllotment: null },
    };
    expect(toLibrarySimulation(neither).duration).toBe('');
  });

  it('falls back to the time allotment when the estimate has no duration in it', () => {
    const vague = {
      ...ITEM,
      scenario: {
        ...ITEM.scenario,
        estimatedDuration: 'Varies by learner pacing',
      },
    };
    expect(toLibrarySimulation(vague).duration).toBe('45 min');
  });

  it('falls back to the unit image, and copes with a missing unit', () => {
    const noImage = {
      ...ITEM,
      scenario: { ...ITEM.scenario, scenarioImage: null },
    };
    expect(toLibrarySimulation(noImage).image).toBe('https://cdn/unit.png');

    const noUnit = { ...noImage, unit: null };
    const sim = toLibrarySimulation(noUnit);
    expect(sim.unit).toBe('u-1');
    expect(sim.unit_name).toBe('');
    expect(sim.image).toBe('');
  });
});
