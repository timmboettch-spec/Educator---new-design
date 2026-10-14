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
import { useAssignSimulationsData } from '../../../src/hooks/useAssignSimulationsData';

type Status = 'idle' | 'loading' | 'succeeded' | 'failed';

const buildStore = (status: Status) => {
  const base = configureStore({
    reducer: { SimulationLibrary: simulationLibraryReducer },
  }).getState();
  return configureStore({
    reducer: { SimulationLibrary: simulationLibraryReducer },
    preloadedState: {
      SimulationLibrary: { ...base.SimulationLibrary, status },
    },
  });
};

const renderData = (status: Status, isOpen = true, strict = false) => {
  const store = buildStore(status);
  return renderHook(() => useAssignSimulationsData(isOpen), {
    wrapper: ({ children }: { children: ReactNode }) => {
      const tree = <Provider store={store}>{children}</Provider>;
      return strict ? <StrictMode>{tree}</StrictMode> : tree;
    },
  });
};

describe('useAssignSimulationsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the library, without images, when it is not loaded', () => {
    renderData('idle');
    expect(fetchLibrary).toHaveBeenCalledWith({ skipImages: true });
  });

  it('retries a load that failed', () => {
    renderData('failed');
    expect(fetchLibrary).toHaveBeenCalledTimes(1);
  });

  it('does not reload a library that is loaded or loading', () => {
    renderData('succeeded');
    renderData('loading');
    expect(fetchLibrary).not.toHaveBeenCalled();
  });

  it('loads nothing while the modal is closed', () => {
    renderData('idle', false);
    expect(fetchLibrary).not.toHaveBeenCalled();
  });

  it("loads once under StrictMode's double effect run", () => {
    // The real thunk flips the status to loading as soon as it's dispatched.
    fetchLibrary.mockImplementation(() => ({
      type: 'dashboard/fetchMyLibrarySimulations/pending',
      meta: { requestId: 'load-1', arg: { skipImages: true } },
    }));
    renderData('idle', true, true);
    expect(fetchLibrary).toHaveBeenCalledTimes(1);
  });
});
