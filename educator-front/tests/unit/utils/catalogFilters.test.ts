import { describe, expect, it } from 'vitest';
import type {
  CatalogFilters,
  SectionItem,
} from '../../../src/redux/simulation/FetchSimulationCatalogRedux';
import {
  createUnitNameResolver,
  getCatalogItemLevel,
  getCatalogItemModality,
  matchesCatalogFilters,
  matchesCatalogSearch,
} from '../../../src/utils/catalogFilters';
import { EMPTY_LIBRARY_FILTERS } from '../../../src/utils/libraryFilters';

const item = (overrides: Partial<SectionItem>): SectionItem => ({
  id: 1,
  title: 'Sim',
  image: '',
  cta: 'View',
  ...overrides,
});

const filters = (overrides: Partial<CatalogFilters>): CatalogFilters => ({
  ...EMPTY_LIBRARY_FILTERS,
  ...overrides,
});

describe('getCatalogItemLevel', () => {
  it('reads secondary from the target audience', () => {
    expect(getCatalogItemLevel(item({ targetAudience: ['High School'] }))).toBe(
      'Secondary'
    );
  });

  it('treats any other audience or level as post-secondary', () => {
    expect(getCatalogItemLevel(item({ targetAudience: ['BSN'] }))).toBe(
      'Post-Secondary'
    );
    expect(getCatalogItemLevel(item({ learnerLevel: 'Novice' }))).toBe(
      'Post-Secondary'
    );
  });

  it('has no level without any audience or level text', () => {
    expect(getCatalogItemLevel(item({}))).toBe('');
  });
});

describe('getCatalogItemModality', () => {
  it('is Avatar only when the avatar is enabled', () => {
    expect(getCatalogItemModality(item({ avatarEnabled: true }))).toBe(
      'Avatar'
    );
    expect(getCatalogItemModality(item({ avatarEnabled: false }))).toBe(
      'Workstation'
    );
    expect(getCatalogItemModality(item({}))).toBe('Workstation');
  });
});

describe('createUnitNameResolver', () => {
  const resolve = createUnitNameResolver([
    {
      id: 1,
      title: 'Cardiology',
      description: '',
      duration: '',
      image: '',
      cta: '',
      unit: 'U-1',
    },
  ]);

  it('uses the browse-by title for a unit code, ignoring case', () => {
    expect(resolve(item({ unit: 'u-1', unit_name: 'Old name' }))).toBe(
      'Cardiology'
    );
  });

  it('falls back to the unit name, then the raw code', () => {
    expect(resolve(item({ unit: 'u-9', unit_name: 'Burns Unit' }))).toBe(
      'Burns Unit'
    );
    expect(resolve(item({ unit: 'u-9' }))).toBe('u-9');
    expect(resolve(item({}))).toBe('');
  });
});

describe('matchesCatalogFilters', () => {
  const sim = item({
    unit: 'u-1',
    unit_name: 'Unit One',
    targetAudience: ['High School', 'CNA'],
    difficulty: 'Easy',
    duration: '20 minutes',
    avatarEnabled: true,
  });

  it('matches everything when no filter is applied', () => {
    expect(matchesCatalogFilters(sim, EMPTY_LIBRARY_FILTERS, '')).toBe(true);
  });

  it('matches any selected value within a field, ignoring case', () => {
    expect(
      matchesCatalogFilters(sim, filters({ difficulty: ['hard', 'easy'] }), '')
    ).toBe(true);
    expect(
      matchesCatalogFilters(sim, filters({ difficulty: ['Hard'] }), '')
    ).toBe(false);
  });

  it('requires every applied field to match', () => {
    expect(
      matchesCatalogFilters(
        sim,
        filters({ learnerLevel: ['Secondary'], modality: ['Avatar'] }),
        ''
      )
    ).toBe(true);
    expect(
      matchesCatalogFilters(
        sim,
        filters({ learnerLevel: ['Secondary'], modality: ['Workstation'] }),
        ''
      )
    ).toBe(false);
  });

  it('matches a target audience against any of the item audiences', () => {
    expect(
      matchesCatalogFilters(sim, filters({ targetAudience: ['CNA'] }), '')
    ).toBe(true);
  });

  it('matches a unit by code, name or browse-by display name', () => {
    expect(matchesCatalogFilters(sim, filters({ unit: ['u-1'] }), '')).toBe(
      true
    );
    expect(
      matchesCatalogFilters(sim, filters({ unit: ['Unit One'] }), '')
    ).toBe(true);
    expect(
      matchesCatalogFilters(
        sim,
        filters({ unit: ['Cardiology'] }),
        'Cardiology'
      )
    ).toBe(true);
    expect(matchesCatalogFilters(sim, filters({ unit: ['u-2'] }), '')).toBe(
      false
    );
  });

  it('matches a duration against any selected range', () => {
    expect(
      matchesCatalogFilters(
        sim,
        filters({ duration: ['<15 min', '15–30 min'] }),
        ''
      )
    ).toBe(true);
    expect(
      matchesCatalogFilters(sim, filters({ duration: ['60+ min'] }), '')
    ).toBe(false);
  });

  it('keeps an item with no duration when a duration range is applied', () => {
    expect(
      matchesCatalogFilters(
        item({ duration: undefined }),
        filters({ duration: ['60+ min'] }),
        ''
      )
    ).toBe(true);
  });
});

describe('matchesCatalogSearch', () => {
  it('matches every item when the search is empty', () => {
    expect(matchesCatalogSearch(item({}), '  ')).toBe(true);
  });

  it('matches the purpose and unit name, ignoring case', () => {
    expect(
      matchesCatalogSearch(item({ purpose: 'Airway management' }), 'AIRWAY')
    ).toBe(true);
    expect(
      matchesCatalogSearch(item({ unit_name: 'Cardiology' }), 'cardio')
    ).toBe(true);
  });

  it('rejects an item with no matching text', () => {
    expect(matchesCatalogSearch(item({ title: 'Burns' }), 'airway')).toBe(
      false
    );
  });
});
