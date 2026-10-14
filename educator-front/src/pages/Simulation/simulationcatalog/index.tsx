import bannerImage from '@/assets/redeem/RW AI UI orange gradient -06.jpg';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterToggleButton } from '@/components/common/FilterToggleButton';
import { SearchBar } from '@/components/common/SearchBar';
import HeroBanner from '@/components/simulation/Banner';
import { QuickFilters } from '@/components/simulation/QuickFilters';
import SimulationAllView from '@/components/simulation/SimulationAllView';
import { type SectionItem } from '../../../types/index';
import { fetchSimulationCatalog } from '../../../redux/simulation/FetchSimulationCatalogRedux';
import { fetchMyLibrary } from '../../../redux/simulation/MyLibraryRedux';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useCatalogFavorite } from '@/hooks/useCatalogFavorite';
import { useCatalogFilters } from '@/hooks/useCatalogFilters';
import {
  createUnitNameResolver,
  matchesCatalogFilters,
  matchesCatalogSearch,
} from '@/utils/catalogFilters';
import Footer from '../../../components/common/Footer';
import { CatalogEmptyState } from '@/components/simulationcatalog/CatalogEmptyState';
import { CatalogFilterPanel } from '@/components/simulationcatalog/CatalogFilterPanel';
import {
  CatalogGroupGrid,
  type CatalogGroup,
} from '@/components/simulationcatalog/CatalogGroupGrid';
import { CatalogSimGrid } from '@/components/simulationcatalog/CatalogSimGrid';
import { CatalogViewSwitcher } from '@/components/simulationcatalog/CatalogViewSwitcher';
import { useCatalogView } from '@/hooks/useCatalogView';
import { buildSimPacks, groupByUnit } from '@/utils/catalogViews';
import FilterChips from '@/components/common/FilterChips';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

const SimulationCatalog = () => {
  const dispatch = useAppDispatch();
  // What the hearts show: the educator's saved library, not `/combined`'s
  // `myFavorite` flag (which the BE computes against the wrong id).
  const { isInLibrary } = useCatalogFavorite();
  const { t } = useTranslation('common');
  const { t: tCatalog } = useTranslation('simulationCatalog');
  const { view, setView } = useCatalogView();
  const filterPanelId = useId();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const catalogLocale = locale.simulationCatalogPage;
  const [searchQuery, setSearchQuery] = useState('');
  const [viewAllState, setViewAllState] = useState<{
    title: string;
    items: SectionItem[];
  } | null>(null);

  const { catalogData, loading, error } = useAppSelector(
    (state) => state.simulationCatalog
  );

  const handleSearch = (query: string) => setSearchQuery(query);

  useEffect(() => {
    const loadData = async () => {
      try {
        await dispatch(
          fetchSimulationCatalog(language === 'es' ? 'es' : 'en')
        ).unwrap();
      } catch {
        return;
      }
    };

    loadData();
  }, [dispatch, language]);

  // The hearts show what is saved in the educator's library, so load it fresh
  // whenever the catalogue opens (another screen may have changed it).
  useEffect(() => {
    void dispatch(fetchMyLibrary());
  }, [dispatch]);

  const sections = catalogData?.sections ?? [];
  const catalogItems = useMemo(
    () => (catalogData?.sections ?? []).flatMap((section) => section.items),
    [catalogData]
  );
  const resolveUnitDisplayName = useMemo(
    () => createUnitNameResolver(catalogData?.browseBy?.items ?? []),
    [catalogData]
  );
  const filters = useCatalogFilters(
    catalogItems,
    catalogData?.filters?.fields ?? [],
    resolveUnitDisplayName
  );

  const filteredSections = sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      const matchesSearch = matchesCatalogSearch(item, searchQuery);
      const matchesFilter = matchesCatalogFilters(
        item,
        filters.applied,
        resolveUnitDisplayName(item)
      );

      const isHidden =
        item.status?.toLowerCase().trim() === 'draft' ||
        item.status?.toLowerCase().trim() === 'archived';

      return matchesSearch && matchesFilter && !isHidden;
    }),
  }));

  const allSimItems = (() => {
    const primarySection = filteredSections[0];
    const primaryItems = primarySection?.items ?? [];
    const seen = new Set<string>(
      primaryItems
        .map((item) => item.scenarioId ?? item.title?.trim() ?? '')
        .filter(Boolean)
    );
    const secondaryItems = filteredSections
      .slice(1)
      .flatMap((s) => s.items)
      .filter((item) => {
        const key = item.scenarioId ?? item.title?.trim();
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return [...primaryItems, ...secondaryItems];
  })();

  const hasAppliedFilters = filters.activeCount > 0;
  const hasMatchingRecords = allSimItems.length > 0;

  // Packs come from the whole catalogue, unaffected by search and filters,
  // so all four are always available (as in the approved design).
  const packGroups: CatalogGroup[] = buildSimPacks(catalogItems).map(
    (pack) => ({
      key: `${pack.level}-${pack.modality}`,
      name: tCatalog('groups.packName', {
        level: filters.valueLabel(pack.level),
        modality: filters.valueLabel(pack.modality),
      }),
      sims: pack.sims,
    })
  );
  const unitGroups: CatalogGroup[] = groupByUnit(
    allSimItems,
    resolveUnitDisplayName
  ).map((unit) => ({ key: unit.name, ...unit }));
  const openGroup = (group: CatalogGroup) =>
    setViewAllState({ title: group.name, items: group.sims });

  const renderView = () => {
    // Packs ignore search and filters, so they never show the no-match state.
    if (view !== 'packs' && hasAppliedFilters && !hasMatchingRecords) {
      return (
        <CatalogEmptyState
          title={catalogLocale.noDataFoundTitle}
          body={catalogLocale.noDataFoundSubtitle}
          boxed
        />
      );
    }
    switch (view) {
      case 'favorites':
        return (
          <CatalogSimGrid
            items={allSimItems.filter((item) => isInLibrary(item))}
            viewLabel={tCatalog('groups.view')}
            emptyTitle={tCatalog('empty.favoritesTitle')}
            emptyBody={tCatalog('empty.favoritesBody')}
          />
        );
      case 'packs':
        return (
          <CatalogGroupGrid
            groups={packGroups}
            tone="pack"
            onView={openGroup}
          />
        );
      case 'units':
        return unitGroups.length === 0 ? (
          <CatalogEmptyState title={tCatalog('empty.unitsTitle')} />
        ) : (
          <CatalogGroupGrid
            groups={unitGroups}
            tone="unit"
            onView={openGroup}
          />
        );
      default:
        return (
          <CatalogSimGrid
            items={allSimItems}
            viewLabel={tCatalog('groups.view')}
            emptyTitle={tCatalog('empty.allTitle')}
          />
        );
    }
  };

  if (viewAllState !== null) {
    return (
      <SimulationAllView
        title={viewAllState.title}
        items={viewAllState.items}
        onBack={() => setViewAllState(null)}
        resolveUnitName={resolveUnitDisplayName}
      />
    );
  }

  if (error && !loading) {
    return (
      <div className="min-h-screen bg-white font-sans">
        <div className="p-4 text-red-500 text-center">{error}</div>
      </div>
    );
  }

  if (!catalogData) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <HeroBanner
        backgroundImage={bannerImage}
        title={catalogLocale.heroTitle}
        subtitle={catalogLocale.heroSubtitle}
      />
      <div className="bg-white shadow-sm rounded-2xl mx-3 sm:mx-5 mt-4 pb-3">
        {/* Row 1: caption, search and filter button on one row. On phones the
            caption takes its own line so nothing scrolls sideways. */}
        <div className="px-6 pt-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
          <h2 className="w-full sm:w-auto text-lg sm:text-xl font-bold text-neutral-strong sm:flex-shrink-0">
            {t('simulationFilters.caption')}
          </h2>
          <div className="flex-1 min-w-0 sm:min-w-[160px] max-w-md ml-auto">
            <SearchBar
              value={searchQuery}
              onSearch={handleSearch}
              placeholder={catalogLocale.searchPlaceholder}
              debounceMs={500}
            />
          </div>
          <FilterToggleButton
            activeCount={filters.activeCount}
            isOpen={filters.isPanelOpen}
            onClick={filters.togglePanel}
            panelId={filterPanelId}
            highlightWhenOpen={false}
          />
        </div>

        {/* Row 2: "Browse by" quick filters. */}
        <div className="px-6 pb-3 pt-1 flex flex-col gap-1.5">
          <h2 className="text-sm font-bold text-neutral-strong">
            {t('simulationFilters.browseBy')}
          </h2>
          <QuickFilters
            isActive={filters.isQuickActive}
            onToggle={filters.toggleQuick}
            fieldLabel={filters.fieldLabel}
            valueLabel={filters.valueLabel}
            size="lg"
            showDividersOnMobile
            className=""
          />
        </div>

        <CatalogFilterPanel filters={filters} panelId={filterPanelId} />

        {filters.chips.length > 0 && (
          <FilterChips
            filters={filters.chips}
            onRemoveFilter={filters.removeChip}
            onClearAll={filters.resetFilters}
            className="px-6"
          />
        )}
      </div>

      <div className="px-6 mt-4">
        <CatalogViewSwitcher value={view} onChange={setView} />
      </div>

      <div className="px-6 mt-6">{renderView()}</div>
      <Footer />
    </div>
  );
};

export default SimulationCatalog;
