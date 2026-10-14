import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import loaderReducer from '../../../src/redux/loader/loaderSlice';
import { loaderMiddleware } from '../../../src/redux/loaderMiddleware';

const buildStore = () =>
  configureStore({
    reducer: { loader: loaderReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(loaderMiddleware),
  });

const queryAction = (
  reducerPath: string,
  phase: 'pending' | 'fulfilled' | 'rejected',
  endpointName: string
) => ({
  type: `${reducerPath}/executeQuery/${phase}`,
  meta: { arg: { type: 'query', endpointName } },
});

describe('loaderMiddleware', () => {
  it.each([
    ['classesApi', 'getSimulationsCompletedGraph'],
    ['classesApi', 'getClassOptions'],
    ['classesApi', 'getSchoolGroups'],
    ['studentsApi', 'getStudentOptions'],
    ['studentsApi', 'getClassRosterInfinite'],
    ['classesApi', 'getSchoolOptionsInfinite'],
    ['classesApi', 'getClassOptionsInfinite'],
    ['classesApi', 'getAssignClassOptionsInfinite'],
    ['reportsApi', 'getReports'],
    ['reportsApi', 'getReportsInfinite'],
    ['reportsApi', 'bulkReviewReports'],
    ['reportsApi', 'markReportViewed'],
  ])(
    'skips the global loader for %s/%s (shows its own loading state)',
    (reducerPath, endpoint) => {
      const store = buildStore();
      store.dispatch(queryAction(reducerPath, 'pending', endpoint));

      expect(store.getState().loader.apiRequestCount).toBe(0);
      expect(store.getState().loader.isLoading).toBe(false);
    }
  );

  it('still counts other RTK Query endpoints', () => {
    const store = buildStore();
    store.dispatch(queryAction('classesApi', 'pending', 'getClasses'));

    expect(store.getState().loader.apiRequestCount).toBe(1);
    expect(store.getState().loader.isLoading).toBe(true);

    store.dispatch(queryAction('classesApi', 'fulfilled', 'getClasses'));

    expect(store.getState().loader.apiRequestCount).toBe(0);
    expect(store.getState().loader.isLoading).toBe(false);
  });

  it('skips background refetches after a tag invalidation (data already shown)', () => {
    const store = buildStore();
    store.dispatch({
      type: 'classesApi/executeQuery/pending',
      meta: {
        arg: {
          type: 'query',
          endpointName: 'getClassesInfinite',
          subscribe: false,
          forceRefetch: true,
        },
      },
    });

    expect(store.getState().loader.apiRequestCount).toBe(0);
  });

  it('still counts the first load of the same endpoint', () => {
    const store = buildStore();
    store.dispatch(queryAction('classesApi', 'pending', 'getClassesInfinite'));

    expect(store.getState().loader.apiRequestCount).toBe(1);
  });

  it('skips thunks invoked with silent: true', () => {
    const store = buildStore();
    store.dispatch({
      type: 'class/get/pending',
      meta: { arg: { silent: true } },
    });

    expect(store.getState().loader.apiRequestCount).toBe(0);
  });

  it('skips silent action prefixes', () => {
    const store = buildStore();
    store.dispatch({ type: 'notifications/fetch/pending' });

    expect(store.getState().loader.apiRequestCount).toBe(0);
  });
});
