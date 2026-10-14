import type { ReactNode } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { useLibraryFilterOptions } from '../../../src/hooks/useLibraryFilterOptions';
import { myLibraryApi } from '../../../src/redux/api/myLibrary/myLibraryApi';

const UNITS_URL = '/api/units/my-library/dropdown';
const AUDIENCES_URL = '/api/simulations/target-audiences/my-library/dropdown';

const page = (data: unknown[]) => ({
  data: {
    message: 'ok',
    data,
    meta: {
      total: data.length,
      page: 1,
      pageSize: 100,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  },
});

const renderOptions = () => {
  const store = configureStore({
    reducer: { [myLibraryApi.reducerPath]: myLibraryApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(myLibraryApi.middleware),
  });
  return renderHook(() => useLibraryFilterOptions(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });
};

const requestedUrls = () =>
  apiRequest.mock.calls.map(([config]) => (config as { url: string }).url);

describe('useLibraryFilterOptions', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve(
        url === UNITS_URL
          ? page([
              { id: 'adult-health', name: 'Adult Health' },
              { id: 'peds', name: 'Pediatrics' },
            ])
          : page(['Registered Nurse'])
      )
    );
  });

  it('loads the units straight away, for chips and older unit-name links', async () => {
    const { result } = renderOptions();
    expect(result.current.isUnitNamesSettled).toBe(false);

    await waitFor(() => expect(result.current.isUnitNamesSettled).toBe(true));
    expect(result.current.unitNames).toEqual({
      'adult-health': 'Adult Health',
      peds: 'Pediatrics',
    });
    expect(result.current.unitField.options).toEqual([
      { value: 'adult-health', label: 'Adult Health' },
      { value: 'peds', label: 'Pediatrics' },
    ]);
    expect(requestedUrls()).toEqual([UNITS_URL]);
  });

  it('settles even when the units fail, so the list is not held forever', async () => {
    apiRequest.mockRejectedValue({ response: { status: 500, data: {} } });
    const { result } = renderOptions();
    await waitFor(() => expect(result.current.isUnitNamesSettled).toBe(true));
    expect(result.current.unitNames).toEqual({});
  });

  it('loads Target Audience only when its dropdown is first opened', async () => {
    const { result } = renderOptions();
    await waitFor(() => expect(result.current.isUnitNamesSettled).toBe(true));
    expect(requestedUrls()).not.toContain(AUDIENCES_URL);

    act(() => result.current.targetAudienceField.onOpen?.());

    await waitFor(() =>
      expect(result.current.targetAudienceField.options).toEqual([
        { value: 'Registered Nurse', label: 'Registered Nurse' },
      ])
    );
    expect(requestedUrls()).toContain(AUDIENCES_URL);
  });

  it('searches units on the server and keeps the names already seen', async () => {
    const { result } = renderOptions();
    await waitFor(() => expect(result.current.isUnitNamesSettled).toBe(true));
    apiRequest.mockResolvedValue(page([{ id: 'peds', name: 'Pediatrics' }]));

    act(() => result.current.unitField.server?.onSearchChange('ped'));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: UNITS_URL,
          // Units come 500 a page, so an older unit-name link finds its unit.
          params: { pageSize: 500, search: 'ped', page: 1 },
        })
      )
    );
    await waitFor(() =>
      expect(result.current.unitField.options).toEqual([
        { value: 'peds', label: 'Pediatrics' },
      ])
    );
    expect(result.current.unitNames['adult-health']).toBe('Adult Health');
    expect(result.current.isUnitNamesSettled).toBe(true);
  });
});
