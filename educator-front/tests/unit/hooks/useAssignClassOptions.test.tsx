import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: { request: (...args: unknown[]) => apiRequest(...args) },
}));

import { classesApi } from '../../../src/redux/api/classes/classesApi';
import { useAssignClassOptions } from '../../../src/hooks/useAssignClassOptions';

const meta = (hasNextPage: boolean, page = 1) => ({
  total: 30,
  page,
  pageSize: 20,
  totalPages: 2,
  hasNextPage,
  hasPrevPage: page > 1,
});

const schoolsPage = {
  data: {
    message: 'ok',
    data: [
      { schoolId: 'school-1', schoolName: 'North High', classCount: 2 },
      { schoolId: null, schoolName: 'No School', classCount: 1 },
    ],
    meta: meta(false),
  },
};

const classRow = (id: string, name: string) => ({
  classId: id,
  className: name,
  startDate: '2026-09-01',
  endDate: '2026-12-15',
  studentsCount: 12,
  simsCount: 0,
  reportsCount: 0,
  status: 'ACTIVE',
});

const classesPage = (rows: ReturnType<typeof classRow>[], hasNext = false) => ({
  data: { message: 'ok', data: rows, meta: meta(hasNext) },
});

const buildStore = () =>
  configureStore({
    reducer: { [classesApi.reducerPath]: classesApi.reducer },
    middleware: (getDefault) => getDefault().concat(classesApi.middleware),
  });

const renderOptions = (schoolId: string, preloadSchools = false) => {
  const store = buildStore();
  return renderHook(({ id }) => useAssignClassOptions(id, { preloadSchools }), {
    initialProps: { id: schoolId },
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });
};

const lastParams = () =>
  (apiRequest.mock.lastCall?.[0] as { url: string; params: unknown }) ?? null;

describe('useAssignClassOptions', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('requests nothing until a dropdown is opened', () => {
    renderOptions('school-1');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('loads schools on open, with the no-school group as "unassigned"', async () => {
    apiRequest.mockResolvedValue(schoolsPage);
    const { result } = renderOptions('');
    act(() => result.current.schoolField.onOpen());

    await waitFor(() =>
      expect(result.current.schoolField.options).toEqual([
        { value: 'school-1', label: 'North High' },
        { value: 'unassigned', label: 'No School' },
      ])
    );
    expect(lastParams()).toMatchObject({
      url: '/api/classes/schools',
      params: { page: 1, pageSize: 20 },
    });
  });

  it('loads the schools right away when asked to, without opening the list', async () => {
    apiRequest.mockResolvedValue(schoolsPage);
    const { result } = renderOptions('', true);
    await waitFor(() =>
      expect(result.current.schoolField.options).toHaveLength(2)
    );
    expect(lastParams()).toMatchObject({ url: '/api/classes/schools' });
  });

  it('reports the only school when the list has exactly one', async () => {
    apiRequest.mockResolvedValue({
      data: {
        ...schoolsPage.data,
        data: [
          { schoolId: 'school-1', schoolName: 'North High', classCount: 2 },
        ],
      },
    });
    const { result } = renderOptions('', true);
    await waitFor(() =>
      expect(result.current.onlySchool).toEqual({
        value: 'school-1',
        label: 'North High',
      })
    );
  });

  it('reports no only school when there are several (No School counts)', async () => {
    apiRequest.mockResolvedValue(schoolsPage);
    const { result } = renderOptions('', true);
    await waitFor(() =>
      expect(result.current.schoolField.options).toHaveLength(2)
    );
    expect(result.current.onlySchool).toBeNull();
  });

  it("loads the school's non-archived classes on open, with their dates", async () => {
    apiRequest.mockResolvedValue(classesPage([classRow('c-1', 'Biology')]));
    const { result } = renderOptions('school-1');
    act(() => result.current.classField.onOpen());

    await waitFor(() =>
      expect(result.current.classField.options).toEqual([
        {
          value: 'c-1',
          label: 'Biology',
          description: '09-01-2026 – 12-15-2026',
        },
      ])
    );
    expect(lastParams()).toMatchObject({
      url: '/api/classes',
      params: {
        page: 1,
        pageSize: 20,
        schoolIds: ['school-1'],
        status: ['ACTIVE', 'INACTIVE', 'DRAFT', 'ATTENTION'],
      },
    });
    expect(result.current.classesById['c-1']).toEqual({
      id: 'c-1',
      name: 'Biology',
      startDate: '2026-09-01',
      endDate: '2026-12-15',
      studentsCount: 12,
    });
  });

  it('searches classes on the server', async () => {
    apiRequest.mockResolvedValue(classesPage([]));
    const { result } = renderOptions('school-1');
    act(() => {
      result.current.classField.onOpen();
      result.current.classField.onSearchChange('bio');
    });

    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        params: { search: 'bio', schoolIds: ['school-1'] },
      })
    );
  });

  it('reports a search as pending until its results arrive', async () => {
    let resolve: (value: unknown) => void = () => {};
    apiRequest.mockResolvedValueOnce(classesPage([classRow('c-1', 'Biology')]));
    const { result } = renderOptions('school-1');
    act(() => result.current.classField.onOpen());
    await waitFor(() =>
      expect(result.current.classField.isSearchPending).toBe(false)
    );

    apiRequest.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    act(() => result.current.classField.onSearchChange('chem'));
    // Still debouncing: the options are the previous search's.
    expect(result.current.classField.isSearchPending).toBe(true);
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ params: { search: 'chem' } })
    );
    // Debounced, but the request is still in flight.
    expect(result.current.classField.isSearchPending).toBe(true);

    await act(async () => resolve(classesPage([classRow('c-2', 'Chemistry')])));
    await waitFor(() =>
      expect(result.current.classField.isSearchPending).toBe(false)
    );
    expect(result.current.classField.options.map((o) => o.label)).toEqual([
      'Chemistry',
    ]);
  });

  it('loads the next page of classes on demand', async () => {
    apiRequest.mockResolvedValueOnce(
      classesPage([classRow('c-1', 'Biology')], true)
    );
    const { result } = renderOptions('school-1');
    act(() => result.current.classField.onOpen());
    await waitFor(() => expect(result.current.classField.hasMore).toBe(true));

    apiRequest.mockResolvedValueOnce(
      classesPage([classRow('c-2', 'Chemistry')])
    );
    act(() => result.current.classField.onLoadMore());

    await waitFor(() =>
      expect(result.current.classField.options.map((o) => o.value)).toEqual([
        'c-1',
        'c-2',
      ])
    );
    expect(lastParams()).toMatchObject({ params: { page: 2 } });
  });

  it('waits for the list to be reopened after the school changes', async () => {
    apiRequest.mockResolvedValue(classesPage([classRow('c-1', 'Biology')]));
    const { result, rerender } = renderOptions('school-1');
    act(() => result.current.classField.onOpen());
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    rerender({ id: 'school-2' });
    expect(result.current.classField.options).toEqual([]);
    expect(apiRequest).toHaveBeenCalledTimes(1);

    act(() => result.current.classField.onOpen());
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        params: { schoolIds: ['school-2'] },
      })
    );
  });
});
