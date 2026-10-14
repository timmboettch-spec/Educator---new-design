import { describe, it, expect } from 'vitest';
import type { Simulation } from '../../../src/types/simulation.types';
import {
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_SERVER_FILTER_FIELDS,
  countActiveFilters,
  getSimulationLevel,
  getSimulationModality,
  matchesAny,
  uniqueSorted,
  type LibraryFilters,
} from '../../../src/utils/libraryFilters';

const sim = (overrides: Partial<Simulation>): Simulation => ({
  id: 'id',
  title: '',
  unit: 'u-1',
  unit_name: 'Unit One',
  duration: '',
  image: '',
  description: '',
  assigned: false,
  rating: 0,
  difficulty: '',
  learnerLevel: '',
  ...overrides,
});

const filters = (overrides: Partial<LibraryFilters>): LibraryFilters => ({
  ...EMPTY_LIBRARY_FILTERS,
  ...overrides,
});

describe('getSimulationLevel', () => {
  it.each([
    ['Post-Secondary', '', 'Post-Secondary'],
    ['post secondary', '', 'Post-Secondary'],
    ['Secondary', '', 'Secondary'],
    ['High School', '', 'Secondary'],
    ['', 'high school students', 'Secondary'],
    ['BSN', '', 'Post-Secondary'],
    ['', '', ''],
  ])('%s / %s → %s', (learnerLevel, targetAudience, expected) => {
    expect(getSimulationLevel(sim({ learnerLevel, targetAudience }))).toBe(
      expected
    );
  });
});

describe('getSimulationModality', () => {
  it('maps the avatar flag to Avatar / Workstation', () => {
    expect(getSimulationModality(sim({ avatarEnabled: true }))).toBe('Avatar');
    expect(getSimulationModality(sim({ avatarEnabled: false }))).toBe(
      'Workstation'
    );
    expect(getSimulationModality(sim({}))).toBe('Workstation');
  });
});

describe('helpers', () => {
  it('uniqueSorted drops blanks and duplicates, including case-only ones', () => {
    expect(uniqueSorted(['b', ' a ', '', undefined, 'b'])).toEqual(['a', 'b']);
    expect(uniqueSorted(['Easy', 'easy', 'Hard'])).toEqual(['Easy', 'Hard']);
  });

  it('countActiveFilters counts every applied value', () => {
    expect(countActiveFilters(EMPTY_LIBRARY_FILTERS)).toBe(0);
    expect(
      countActiveFilters(
        filters({ difficulty: ['Easy', 'Hard'], modality: ['Avatar'] })
      )
    ).toBe(3);
  });

  it('matchesAny ignores case and stray whitespace, and passes when nothing is selected', () => {
    expect(matchesAny([], 'Easy')).toBe(true);
    expect(matchesAny([' easy '], 'Easy')).toBe(true);
    expect(matchesAny(['Hard'], 'Easy', undefined)).toBe(false);
  });

  it('LIBRARY_SERVER_FILTER_FIELDS lists the API-backed fields in panel order, without Duration', () => {
    expect(LIBRARY_SERVER_FILTER_FIELDS).toEqual([
      'learnerLevel',
      'targetAudience',
      'modality',
      'productName',
      'difficulty',
      'unit',
    ]);
  });
});
