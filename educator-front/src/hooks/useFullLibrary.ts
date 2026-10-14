import { useEffect } from 'react';
import {
  fetchMyLibrarySimulations,
  selectSimulationLibraryData,
  selectSimulationLibraryStatus,
} from '../redux/dashboard/simulationlibrary/GetSimulationRedux';
import type { AppDispatch, RootState } from '../store';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { FAILED, IDLE } from '../utils/constants';

export interface UseFullLibraryOptions {
  /** Loads nothing while false (e.g. a closed modal). */
  enabled?: boolean;
}

/**
 * The educator's whole library (GET /my-library, unpaged), shared in the store
 * by the screens that need every saved simulation at once, such as the assign
 * modal. Loaded only when the store doesn't have it (or the last load
 * failed), without the catalogue image lookup, as none of them shows its
 * images. A load already in flight is left to finish rather than started
 * again.
 */
export function useFullLibrary({ enabled = true }: UseFullLibraryOptions = {}) {
  const dispatch = useAppDispatch();
  const simulations = useAppSelector(selectSimulationLibraryData);
  const status = useAppSelector(selectSimulationLibraryStatus);

  useEffect(() => {
    if (!enabled) return;
    // Read the status from the store, not this render: a load started a
    // moment ago (e.g. StrictMode's second effect run) must not start again.
    void dispatch((innerDispatch: AppDispatch, getState: () => RootState) => {
      const current = selectSimulationLibraryStatus(getState());
      if (current === IDLE || current === FAILED) {
        void innerDispatch(fetchMyLibrarySimulations({ skipImages: true }));
      }
    });
  }, [enabled, dispatch]);

  return { simulations, status };
}
