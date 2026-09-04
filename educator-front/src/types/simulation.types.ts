export interface Simulation {
  id: string;
  simulation_id?: string;
  title: string;
  scenario_id?: string | null;
  unit: string;
  unit_name: string;
  duration: string;
  image: string;
  description: string;
  assigned: boolean;
  rating: number;
  difficulty: string;
  learnerLevel: string;
  targetAudience?: string;
  learningObjectives?: string[];
  topicsAddressed?: string;
  productName?: string;
  clinicalSetting?: string;
  fromBundle?: boolean;
  /** Simulation type flag — true = AI Only, false = Manikin, undefined = unknown */
  avatarEnabled?: boolean;
}

export interface SimulationLibraryResponse {
  status: string;
  message: string;
  data: Simulation[];
}

export type ViewMode = 'grid' | 'list';
export type FilterType = 'All' | 'Recently Used' | 'Recently Added';
