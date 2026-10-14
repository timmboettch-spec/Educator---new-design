import type { SectionItem } from '@/redux/simulation/FetchSimulationCatalogRedux';
import {
  getCatalogItemLevel,
  getCatalogItemModality,
} from '@/utils/catalogFilters';
import { LEARNER_LEVELS, MODALITIES } from '@/utils/libraryFilters';

/** The catalogue's views, in switcher order. */
export const CATALOG_VIEWS = ['all', 'favorites', 'packs', 'units'] as const;

export type CatalogView = (typeof CATALOG_VIEWS)[number];

export const isCatalogView = (value: string | null): value is CatalogView =>
  CATALOG_VIEWS.some((view) => view === value);

export interface SimPack {
  level: (typeof LEARNER_LEVELS)[number];
  modality: (typeof MODALITIES)[number];
  sims: SectionItem[];
}

/**
 * The four simulation packs from the approved design: one per learner level
 * and modality (Secondary / Post-Secondary × Avatar / Workstation). A
 * simulation belongs to the pack matching its own level and modality.
 */
export const buildSimPacks = (items: SectionItem[]): SimPack[] =>
  LEARNER_LEVELS.flatMap((level) =>
    MODALITIES.map((modality) => ({
      level,
      modality,
      sims: items.filter(
        (item) =>
          getCatalogItemLevel(item) === level &&
          getCatalogItemModality(item) === modality
      ),
    }))
  );

export interface UnitGroup {
  name: string;
  sims: SectionItem[];
}

/**
 * Groups simulations by unit display name, in first-seen order. Simulations
 * with no unit are left out.
 */
export const groupByUnit = (
  items: SectionItem[],
  resolveUnitName: (item: SectionItem) => string
): UnitGroup[] => {
  const groups = new Map<string, SectionItem[]>();
  items.forEach((item) => {
    const name = resolveUnitName(item).trim();
    if (!name) return;
    groups.set(name, [...(groups.get(name) ?? []), item]);
  });
  return Array.from(groups, ([name, sims]) => ({ name, sims }));
};
