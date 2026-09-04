import { IsString } from 'class-validator';
import { BlobScenario } from 'src/common/types';

export class AddToLibraryDto {
  @IsString()
  scenario_id!: string;
}

export interface SimulationReview {
  reviewer: string;
  rating: number;
  title: string;
  comment: string;
  date: string;
}

export interface RatingBreakdown {
  stars: number;
  count: number;
}

export interface WhatsNew {
  version: string;
  timeAgo: string;
  notes: string;
}

export interface SimulationCatalogItem {
  id: number;
  scenario_id: string | null;
  scenarioId: string | null;
  title: string;
  unit: string;
  unit_id: string | null;
  unit_image: string | null;
  scenario_count: number;
  category: string;
  target_audience: string;
  difficulty_level?: string;
  estimated_duration?: string;
  language: string;
  purpose?: string;
  description?: string;
  learning_objectives: string[];
  rating: number;
  total_ratings: number;
  usage?: string;
  scenarioImage?: string;
  image_url?: string;
  images: string[];
  rating_breakdown: RatingBreakdown[];
  reviews: SimulationReview[];
  whats_new?: WhatsNew;
  simulation_privacy?: string;
  developer?: string;
  institution?: string;
  status?: string;
  last_update?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DashboardCard {
  id: string;
  title: string;
  image: string | null;
  scenarioImage: string | null;
  cta: string;
  unit: string;
  difficulty: string | null;
  targetAudience: string[];
}

export interface SimulationDashboard {
  banner: { title: string; subtitle: string; image: string | null };
  filters: { fields: Array<{ key: string; label: string; options: string[] }> };
  browseBy: {
    filters: Array<{ id: string; label: string; active: boolean }>;
    items: Array<{
      id: number;
      title: string;
      description: string;
      duration: string;
      image: string | null;
      cta: string;
      unit: string;
    }>;
  };
  sections: Array<{
    key: string;
    title: string;
    viewAll: boolean;
    type: string;
    items: DashboardCard[];
  }>;
}

export interface CombinedCatalogData {
  dashboard: SimulationDashboard;
  catalog: SimulationCatalogItem[];
  scenarios: Array<BlobScenario & { unit_image: string | null; in_library: boolean }>;
}
