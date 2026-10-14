import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchLibrary = vi.hoisted(() =>
  vi.fn((_options?: unknown) => ({ type: 'test/fetchLibrary' }))
);

vi.mock(
  '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    fetchMyLibrarySimulations: fetchLibrary,
  })
);

import simulationLibraryReducer from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import {
  useFullLibrary,
  type UseFullLibraryOptions,
} from '../../../src/hooks/useFullLibrary';

type Status = 'idle' | 'loading' | 'succeeded' | 'failed';

const renderFullLibrary = (
  status: Status,
  options: UseFullLibraryOptions = {},
  strict = false
) => {
  const base = configureStore({
    reducer: { SimulationLibrary: simulationLibraryReducer },
  }).getState();
  const store = configureStore({
    reducer: { SimulationLibrary: simulationLibraryReducer },
    preloadedState: {
      SimulationLibrary: { ...base.SimulationLibrary, status },
    },
  });
  return renderHook(() => useFullLibrary(options), {
    wrapper: ({ children }: { children: ReactNode }) => {
      const tree = <Provider store={store}>{children}</Provider>;
      return strict ? <StrictMode>{tree}</StrictMode> : tree;
    },
  });
};

describe('useFullLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a library that is not in the store yet, without images', () => {
    renderFullLibrary('idle');
    expect(fetchLibrary).toHaveBeenCalledWith({ skipImages: true });
  });

  it('keeps a library the store already has', () => {
    renderFullLibrary('succeeded');
    expect(fetchLibrary).not.toHaveBeenCalled();
  });

  it('loads it again after a failure', () => {
    renderFullLibrary('failed');
    expect(fetchLibrary).toHaveBeenCalledTimes(1);
  });

  it('never starts a load while one is in flight', () => {
    renderFullLibrary('loading');
    expect(fetchLibrary).not.toHaveBeenCalled();
  });

  it('loads nothing while disabled', () => {
    renderFullLibrary('idle', { enabled: false });
    expect(fetchLibrary).not.toHaveBeenCalled();
  });

  it("loads once under StrictMode's double effect run", () => {
    // The real thunk flips the status to loading as soon as it's dispatched.
    fetchLibrary.mockImplementation(() => ({
      type: 'dashboard/fetchMyLibrarySimulations/pending',
      meta: { requestId: 'load-1', arg: { skipImages: true } },
    }));
    renderFullLibrary('idle', {}, true);
    expect(fetchLibrary).toHaveBeenCalledTimes(1);
  });
});
