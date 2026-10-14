/**
 * Utility to fetch and filter active simulations from the catalog
 */

import api from '../redux/api';
import config from '../redux/config';

interface Simulation {
  id: number;
  title: string;
  status: string;
  [key: string]: unknown;
}

interface CatalogResponse {
  data: Simulation[] | { data: Simulation[] };
}

export const getActiveSimulationCount = async (): Promise<{
  activeCount: number;
  totalCount: number;
  activeSimulations: Simulation[];
}> => {
  const headers = {
    'ngrok-skip-browser-warning': 'true',
  };

  const response = await api.get<CatalogResponse>(
    config.SimulationCatalogDetailAPI,
    { headers }
  );

  // Handle different response structures
  let simulations: Simulation[] = [];
  if (Array.isArray(response.data)) {
    simulations = response.data;
  } else if (response.data?.data && Array.isArray(response.data.data)) {
    simulations = response.data.data;
  }

  // Filter for active and published simulations (exclude draft and archived)
  const activeSimulations = simulations.filter((sim) => {
    const status = String(sim.status ?? '')
      .toLowerCase()
      .trim();
    return status === 'active' || status === 'published';
  });

  return {
    activeCount: activeSimulations.length,
    totalCount: simulations.length,
    activeSimulations,
  };
};
