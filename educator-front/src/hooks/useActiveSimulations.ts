import { useEffect, useState } from 'react';
import { getActiveSimulationCount } from '../utils/getActiveSimulations';

interface Simulation {
  id: number;
  title: string;
  status: string;
  [key: string]: unknown;
}

interface UseActiveSimulationsResult {
  activeCount: number;
  totalCount: number;
  activeSimulations: Simulation[];
  loading: boolean;
  error: string | null;
}

export const useActiveSimulations = (): UseActiveSimulationsResult => {
  const [activeCount, setActiveCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activeSimulations, setActiveSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await getActiveSimulationCount();
        setActiveCount(result.activeCount);
        setTotalCount(result.totalCount);
        setActiveSimulations(result.activeSimulations);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch simulations');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { activeCount, totalCount, activeSimulations, loading, error };
};
