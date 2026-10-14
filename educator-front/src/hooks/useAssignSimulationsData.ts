import {
  selectSimulationError,
  selectSimulationLoading,
} from '../redux/dashboard/simulationlibrary/GetSimulationRedux';
import { useAppSelector } from '../store/hooks';
import { useFullLibrary } from './useFullLibrary';

/**
 * The educator's simulation library for the assign modal, loaded when the
 * modal opens only if the store doesn't have it yet.
 */
export function useAssignSimulationsData(isOpen: boolean) {
  const { simulations } = useFullLibrary({ enabled: isOpen });
  const isSimulationsLoading = useAppSelector(selectSimulationLoading);
  const simulationsError = useAppSelector(selectSimulationError);

  return {
    simulations,
    isSimulationsLoading: isSimulationsLoading && simulations.length === 0,
    hasSimulationsError: !!simulationsError && simulations.length === 0,
  };
}
