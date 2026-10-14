import type {
  BrowseByItem,
  CatalogFilters,
  SectionItem,
} from '@/redux/simulation/FetchSimulationCatalogRedux';
import { matchDurationFilter } from '@/utils/helpers/matchDurationFilter';
import { matchesAny, toLearnerLevel, toModality } from '@/utils/libraryFilters';

/** Secondary / Post-Secondary, by the same rule as the library. */
export const getCatalogItemLevel = (item: SectionItem): string =>
  toLearnerLevel(item.learnerLevel, ...(item.targetAudience ?? []));

export const getCatalogItemModality = (item: SectionItem): string =>
  toModality(item.avatarEnabled);

/**
 * Builds a lookup from a catalogue item to its unit's display name: the
 * browse-by title for its unit code, else its unit name, else the raw code.
 * Filter options, chips and matching all use it, so they show and match the
 * same names the page displays.
 */
export const createUnitNameResolver = (browseByItems: BrowseByItem[]) => {
  const nameByCode = new Map<string, string>();
  browseByItems.forEach((b) => {
    if (b.unit) {
      nameByCode.set(
        b.unit.trim().toLowerCase(),
        b.title?.trim() || b.description?.trim() || b.unit
      );
    }
  });
  return (item: SectionItem): string => {
    const code = item.unit?.trim() ?? '';
    return nameByCode.get(code.toLowerCase()) ?? item.unit_name?.trim() ?? code;
  };
};

export const getCatalogItemProduct = (item: SectionItem): string =>
  (item.productName ?? '').trim();

/**
 * True when a catalogue item's title, subtitle, description, purpose or unit
 * name contains the search text (case-insensitive). Empty search matches all.
 */
export const matchesCatalogSearch = (
  item: SectionItem,
  query: string
): boolean => {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [
      item.title,
      item.subtitle,
      item.description,
      item.purpose,
      item.unit_name,
    ].some((text) => (text ?? '').toLowerCase().includes(q))
  );
};

/**
 * True when a catalogue item passes every applied filter. Values within a
 * field match any-of; fields combine. `unitDisplayName` is the unit's name from
 * the catalogue's browse-by list, so a unit matches by code or by name.
 */
export const matchesCatalogFilters = (
  item: SectionItem,
  filters: CatalogFilters,
  unitDisplayName: string
): boolean =>
  matchesAny(filters.learnerLevel, getCatalogItemLevel(item)) &&
  matchesAny(filters.targetAudience, ...(item.targetAudience ?? [])) &&
  matchesAny(filters.modality, getCatalogItemModality(item)) &&
  matchesAny(filters.productName, getCatalogItemProduct(item)) &&
  matchesAny(filters.difficulty, item.difficulty) &&
  matchesAny(filters.unit, item.unit, item.unit_name, unitDisplayName) &&
  // An item with no duration isn't filtered out by a duration range.
  (filters.duration.length === 0 ||
    filters.duration.some((range) =>
      matchDurationFilter(item.duration ?? '', range)
    ));
