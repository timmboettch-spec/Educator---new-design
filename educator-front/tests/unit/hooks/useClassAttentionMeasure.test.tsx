import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import classesUiReducer, {
  setClassListPanelFilters,
  setClassListSearch,
} from '../../../src/redux/api/classes/classesSlice';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';
import { useClassAttentionMeasure } from '../../../src/hooks/useClassAttentionMeasure';

const renderMeasure = (url = '/classes') => {
  const store = configureStore({ reducer: { classesUi: classesUiReducer } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </Provider>
  );
  const hook = renderHook(
    () => ({ ...useClassAttentionMeasure(), location: useLocation() }),
    { wrapper }
  );
  return { store, ...hook };
};

const query = (store: ReturnType<typeof renderMeasure>['store']) =>
  store.getState().classesUi.classListQuery;

describe('useClassAttentionMeasure', () => {
  it('takes the quick filter from ?measure= (e.g. a dashboard link)', () => {
    const { result, store } = renderMeasure('/classes?measure=noStudents');
    expect(result.current.measure).toBe('noStudents');
    expect(result.current.isMeasureSynced).toBe(true);
    expect(query(store).attentionFilter).toBe('noStudents');
  });

  it('strips an invalid ?measure= without selecting anything', () => {
    const { result } = renderMeasure('/classes?measure=toString');
    expect(result.current.measure).toBeUndefined();
    expect(result.current.location.search).toBe('');
  });

  it('selects a quick filter in the store and the URL, leaving search and panel filters', () => {
    const { result, store } = renderMeasure();
    act(() => {
      store.dispatch(setClassListSearch('bio'));
      store.dispatch(setClassListPanelFilters({ statuses: ['ACTIVE'] }));
    });

    act(() => result.current.toggleMeasure(ClassAttentionMeasure.NO_STUDENTS));

    expect(result.current.measure).toBe('noStudents');
    expect(result.current.location.search).toBe('?measure=noStudents');
    expect(query(store)).toMatchObject({
      search: 'bio',
      panelFilters: { statuses: ['ACTIVE'] },
    });
  });

  it('replaces the active quick filter with another', () => {
    const { result } = renderMeasure('/classes?measure=noStudents');
    act(() =>
      result.current.toggleMeasure(ClassAttentionMeasure.UNREAD_REPORTS)
    );
    expect(result.current.measure).toBe('unreadReports');
    expect(result.current.location.search).toBe('?measure=unreadReports');
  });

  it('turns the active quick filter off when it is clicked again', () => {
    const { result, store } = renderMeasure('/classes?measure=noStudents');
    act(() => result.current.toggleMeasure(ClassAttentionMeasure.NO_STUDENTS));
    expect(result.current.measure).toBeUndefined();
    expect(result.current.location.search).toBe('');
    expect(query(store).attentionFilter).toBeNull();
  });

  it('clears the quick filter with null (the chip ×)', () => {
    const { result } = renderMeasure('/classes?measure=unreadReports');
    act(() => result.current.setMeasure(null));
    expect(result.current.measure).toBeUndefined();
    expect(result.current.location.search).toBe('');
  });

  it('reports not-synced for the render before the store catches up with the URL', () => {
    const syncedPerRender: boolean[] = [];
    const store = configureStore({ reducer: { classesUi: classesUiReducer } });
    renderHook(
      () => {
        const { isMeasureSynced } = useClassAttentionMeasure();
        syncedPerRender.push(isMeasureSynced);
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>
            <MemoryRouter initialEntries={['/classes?measure=noStudents']}>
              {children}
            </MemoryRouter>
          </Provider>
        ),
      }
    );
    expect(syncedPerRender[0]).toBe(false);
    expect(syncedPerRender.at(-1)).toBe(true);
  });
});
