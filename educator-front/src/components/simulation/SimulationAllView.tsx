import { useId, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FilterChips from '../common/FilterChips';
import { SearchBar } from '../common/SearchBar';
import { QuickFilters } from './QuickFilters';
import { AllSimItems } from '../simulationcatalog/AllSimItems';
import { CatalogFilterPanel } from '../simulationcatalog/CatalogFilterPanel';
import { useLocalCatalogFilters } from '@/hooks/useCatalogFilters';
import type { SectionItem } from '@/redux/simulation/FetchSimulationCatalogRedux';
import {
  matchesCatalogFilters,
  matchesCatalogSearch,
} from '@/utils/catalogFilters';

interface SimulationAllViewProps {
  items: SectionItem[];
  title: string;
  onBack: () => void;
  /** The catalogue's unit-name lookup, so units show and match by name. */
  resolveUnitName: (item: SectionItem) => string;
}

/**
 * An opened simulation pack or unit: its simulations with their own search,
 * quick filters and filter panel (as in the approved design). Filters here are
 * local to this screen and don't change the catalogue's.
 */
const SimulationAllView = ({
  items,
  title,
  onBack,
  resolveUnitName,
}: SimulationAllViewProps) => {
  const { t } = useTranslation('simulationCatalog');
  const { t: tCommon } = useTranslation('common');
  const panelId = useId();
  const [search, setSearch] = useState('');
  const filters = useLocalCatalogFilters(items, resolveUnitName);

  const visibleSims = items.filter(
    (item) =>
      matchesCatalogSearch(item, search) &&
      matchesCatalogFilters(item, filters.applied, resolveUnitName(item))
  );

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="w-full bg-white shadow-sm sticky top-0 z-10 pb-2">
        {/* Row 1: Back + the pack or unit name. */}
        <div className="px-6 pt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-500 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
          >
            <ArrowLeft size={15} aria-hidden="true" /> {t('groupPage.back')}
          </button>
          <h1 className="text-lg font-bold text-gray-800">{title}</h1>
        </div>
        {/* Row 2: caption, search and count. On phones the caption takes its
            own line so nothing scrolls sideways. */}
        <div className="px-6 pt-2 flex flex-wrap sm:flex-nowrap items-center gap-3">
          <h2 className="w-full sm:w-auto text-lg sm:text-xl font-bold text-neutral-strong sm:flex-shrink-0">
            {tCommon('simulationFilters.caption')}
          </h2>
          <div className="flex-1 min-w-0 max-w-md ml-auto">
            <SearchBar
              value={search}
              onSearch={setSearch}
              placeholder={t('groupPage.searchPlaceholder')}
              debounceMs={300}
            />
          </div>
          <span
            className="text-sm text-gray-500 flex-shrink-0"
            aria-live="polite"
          >
            {t('groups.simulationCount', { count: visibleSims.length })}
          </span>
        </div>
        {/* Row 3: quick filters + filter button. */}
        <QuickFilters
          isActive={filters.isQuickActive}
          onToggle={filters.toggleQuick}
          fieldLabel={filters.fieldLabel}
          valueLabel={filters.valueLabel}
          showDividersOnMobile
          className="px-6 pt-2 pb-3"
          filterButton={{
            activeCount: filters.activeCount,
            isPanelOpen: filters.isPanelOpen,
            onTogglePanel: filters.togglePanel,
            panelId,
          }}
        />
        <CatalogFilterPanel filters={filters} panelId={panelId} />
        {filters.chips.length > 0 && (
          <div className="pb-2">
            <FilterChips
              filters={filters.chips}
              onRemoveFilter={filters.removeChip}
              onClearAll={filters.resetFilters}
              className="px-6"
            />
          </div>
        )}
      </div>

      <div className="w-full px-6 py-8">
        {visibleSims.length === 0 ? (
          <p role="status" className="text-center py-20 text-gray-500">
            {t('groupPage.empty')}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visibleSims.map((item, idx) => (
              <AllSimItems
                key={item.scenarioId ?? `sim-${item.id}`}
                item={item}
                idx={idx}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulationAllView;
