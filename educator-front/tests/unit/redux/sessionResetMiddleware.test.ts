import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { classesApi } from '../../../src/redux/api/classes/classesApi';
import { studentsApi } from '../../../src/redux/api/students/studentsApi';
import { guidedPathApi } from '../../../src/redux/api/guidedPath/guidedPathApi';
import { reportsApi } from '../../../src/redux/api/reports/reportsApi';
import { classSimulationsApi } from '../../../src/redux/api/classSimulations/classSimulationsApi';
import { myLibraryApi } from '../../../src/redux/api/myLibrary/myLibraryApi';
import classesUiReducer, {
  setClassListSearch,
} from '../../../src/redux/api/classes/classesSlice';
import { LoginRequest, logout } from '../../../src/redux/auth/LoginRedux';
import { sessionResetMiddleware } from '../../../src/redux/sessionResetMiddleware';

const buildStore = () =>
  configureStore({
    reducer: {
      [classesApi.reducerPath]: classesApi.reducer,
      [studentsApi.reducerPath]: studentsApi.reducer,
      [guidedPathApi.reducerPath]: guidedPathApi.reducer,
      [reportsApi.reducerPath]: reportsApi.reducer,
      [classSimulationsApi.reducerPath]: classSimulationsApi.reducer,
      [myLibraryApi.reducerPath]: myLibraryApi.reducer,
      classesUi: classesUiReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(sessionResetMiddleware.middleware)
        .concat(
          classesApi.middleware,
          studentsApi.middleware,
          guidedPathApi.middleware,
          reportsApi.middleware,
          classSimulationsApi.middleware,
          myLibraryApi.middleware
        ),
  });

const seed = async (store: ReturnType<typeof buildStore>) => {
  apiRequest.mockResolvedValue({
    data: {
      message: 'ok',
      data: {
        totalClasses: 5,
        classesNeedingAttention: 2,
        unreadReports: 1,
        noStudents: 1,
        noAssignedSims: 0,
      },
    },
  });
  await store.dispatch(classesApi.endpoints.getAttentionSummary.initiate());
  store.dispatch(setClassListSearch('biology'));
};

const cachedQueryCount = (store: ReturnType<typeof buildStore>) =>
  Object.keys(store.getState()[classesApi.reducerPath].queries).length;

describe('sessionResetMiddleware', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('clears the classes cache and filters on logout', async () => {
    const store = buildStore();
    await seed(store);
    expect(cachedQueryCount(store)).toBe(1);

    store.dispatch(logout());

    expect(cachedQueryCount(store)).toBe(0);
    expect(store.getState().classesUi.classListQuery.search).toBe('');
  });

  it('clears the students cache on logout', async () => {
    const store = buildStore();
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [{ id: 's1', studentId: 'STU-1', name: 'Ava' }],
        meta: {
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });
    await store.dispatch(studentsApi.endpoints.getStudentOptions.initiate());
    expect(
      Object.keys(store.getState()[studentsApi.reducerPath].queries)
    ).toHaveLength(1);

    store.dispatch(logout());

    expect(
      Object.keys(store.getState()[studentsApi.reducerPath].queries)
    ).toHaveLength(0);
  });

  it('clears the guided-path cache on logout', async () => {
    const store = buildStore();
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: {
          guidedPathId: 'g1',
          userId: 'u1',
          roleType: 'educator',
          state: {},
          completed: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      },
    });
    await store.dispatch(
      guidedPathApi.endpoints.getGuidedPath.initiate('educator')
    );
    expect(
      Object.keys(store.getState()[guidedPathApi.reducerPath].queries)
    ).toHaveLength(1);

    store.dispatch(logout());

    expect(
      Object.keys(store.getState()[guidedPathApi.reducerPath].queries)
    ).toHaveLength(0);
  });

  it('clears the reports cache on logout', async () => {
    const store = buildStore();
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 10,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });
    await store.dispatch(reportsApi.endpoints.getReports.initiate());
    expect(
      Object.keys(store.getState()[reportsApi.reducerPath].queries)
    ).toHaveLength(1);

    store.dispatch(logout());

    expect(
      Object.keys(store.getState()[reportsApi.reducerPath].queries)
    ).toHaveLength(0);
  });

  it('clears the class simulations cache on logout', async () => {
    const store = buildStore();
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 10,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });
    await store.dispatch(
      classSimulationsApi.endpoints.getClassSimulationsInfinite.initiate({
        classId: 'class-1',
      })
    );
    expect(
      Object.keys(store.getState()[classSimulationsApi.reducerPath].queries)
    ).toHaveLength(1);

    store.dispatch(logout());

    expect(
      Object.keys(store.getState()[classSimulationsApi.reducerPath].queries)
    ).toHaveLength(0);
  });

  it('clears the My Library cache on logout', async () => {
    const store = buildStore();
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 24,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });
    await store.dispatch(
      myLibraryApi.endpoints.getMyLibraryInfinite.initiate({})
    );
    expect(
      Object.keys(store.getState()[myLibraryApi.reducerPath].queries)
    ).toHaveLength(1);

    store.dispatch(logout());

    expect(
      Object.keys(store.getState()[myLibraryApi.reducerPath].queries)
    ).toHaveLength(0);
  });

  it('clears the classes cache when a new user signs in', async () => {
    const store = buildStore();
    await seed(store);

    store.dispatch({ type: LoginRequest.fulfilled.type, payload: {} });

    expect(cachedQueryCount(store)).toBe(0);
  });

  it('leaves the cache alone for unrelated actions', async () => {
    const store = buildStore();
    await seed(store);

    store.dispatch({ type: 'something/else' });

    expect(cachedQueryCount(store)).toBe(1);
    expect(store.getState().classesUi.classListQuery.search).toBe('biology');
  });
});
