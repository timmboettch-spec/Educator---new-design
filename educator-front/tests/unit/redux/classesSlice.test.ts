import { describe, expect, it } from 'vitest';
import classesUiReducer, {
  EMPTY_PANEL_FILTERS,
  resetClassListPanelFilters,
  resetClassListQuery,
  setClassListAttentionFilter,
  setClassListPanelFilters,
  setClassListSearch,
} from '../../../src/redux/api/classes/classesSlice';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';

const filled = () =>
  [
    setClassListSearch('bio'),
    setClassListPanelFilters({ ...EMPTY_PANEL_FILTERS, schools: ['s-1'] }),
    setClassListAttentionFilter(ClassAttentionMeasure.UNREAD_REPORTS),
  ].reduce(classesUiReducer, classesUiReducer(undefined, { type: 'init' }));

describe('classesSlice class list query', () => {
  it('starts empty', () => {
    expect(
      classesUiReducer(undefined, { type: 'init' }).classListQuery
    ).toEqual({
      search: '',
      panelFilters: EMPTY_PANEL_FILTERS,
      attentionFilter: null,
    });
  });

  it.each([
    ['search', setClassListSearch('chem'), { search: 'chem' }],
    [
      'panel filters',
      setClassListPanelFilters({ statuses: ['ACTIVE'] }),
      { panelFilters: { statuses: ['ACTIVE'] } },
    ],
    [
      'the quick filter',
      setClassListAttentionFilter(ClassAttentionMeasure.NO_STUDENTS),
      { attentionFilter: 'noStudents' },
    ],
    [
      'panel filters (reset)',
      resetClassListPanelFilters(),
      { panelFilters: EMPTY_PANEL_FILTERS },
    ],
  ])('changes only %s', (_field, action, changed) => {
    const before = filled();
    const after = classesUiReducer(before, action);
    expect(after.classListQuery).toEqual({
      ...before.classListQuery,
      ...changed,
    });
  });

  it('clears the quick filter with null', () => {
    const state = classesUiReducer(filled(), setClassListAttentionFilter(null));
    expect(state.classListQuery.attentionFilter).toBeNull();
  });

  it('resets the whole query', () => {
    expect(
      classesUiReducer(filled(), resetClassListQuery()).classListQuery
    ).toEqual({
      search: '',
      panelFilters: EMPTY_PANEL_FILTERS,
      attentionFilter: null,
    });
  });
});
