import bannerImage from '@/assets/redeem/RW AI UI orange gradient -06.jpg';
import { Filter, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCatalogFavorite } from "@/hooks/useCatalogFavorite";
import FilterPanel from "@/components/common/FilterPanel";
import { SearchBar } from "@/components/common/SearchBar";
import HeroBanner from "@/components/simulation/Banner";
import SimulationAllView from "@/components/simulation/SimulationAllView";
import { type SectionItem } from "../../../types/index";
import { fetchSimulationCatalog } from "../../../redux/simulation/FetchSimulationCatalogRedux";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import Footer from "../../../components/common/Footer";
import { ViewAllUnits } from "@/components/simulationcatalog/ViewAllUnits";
import { ViewAllAudiences } from "@/components/simulationcatalog/ViewAllAudiences";
import { ViewAllFavourites } from "@/components/simulationcatalog/ViewAllFavourites";
import { AllSimItems } from "@/components/simulationcatalog/AllSimItems";
import { ActiveFilter } from "@/components/simulationcatalog/ActiveFilter";
import { LevelItems } from "@/components/simulationcatalog/LevelItems";
import { UnitList } from "@/components/simulationcatalog/UnitList";
import { FilterChips } from "@/components/simulationcatalog/FilterChips";
import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";

type SupportedLang = "en" | "es";

const LANGUAGE_STORAGE_KEY = "app_language";

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === "undefined") {
    return "en";
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

const SimulationCatalog = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { handleAddGroup, isGroupInLibrary } = useCatalogFavorite();
  const language = getStoredLanguage();
  const locale = language === "es" ? loginEs : loginEn;
  const catalogLocale = locale.simulationCatalogPage;
  const [activeFilter, setActiveFilter] = useState<"unit" | "target">("unit");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [viewAllState, setViewAllState] = useState<{
    title: string;
    items: SectionItem[];
  } | null>(null);
  const [viewAllUnits, setViewAllUnits] = useState(false);
  const [viewAllAudiences, setViewAllAudiences] = useState(false);
  const [viewAllFavourites, setViewAllFavourites] = useState(false);
  // Browse-by content switcher: the body section shows only the selected
  // category (all simulations / favorites / sim packs / units).
  const [browseTab, setBrowseTab] = useState<
    "all" | "favorites" | "packs" | "units"
  >("all");

  // Multi-select filters (searchable, select/clear multiple), in the requested
  // field order: learner level → target audience → modality → product name →
  // difficulty → unit → duration.
  const EMPTY_FILTER: Record<string, string[]> = {
    learnerLevel: [],
    targetAudience: [],
    modality: [],
    productName: [],
    difficulty: [],
    unit: [],
    duration: [],
  };
  const [pendingFilter, setPendingFilter] = useState<Record<string, string[]>>({
    ...EMPTY_FILTER,
  });
  const [appliedFilter, setAppliedFilter] = useState<Record<string, string[]>>({
    ...EMPTY_FILTER,
  });

  // Quick-filter buttons are a shortcut into the Filter Simulations menu: each
  // toggles a value in the matching multi-select field (learner level → Learner
  // Level, modality → Modality, difficulty → Difficulty). So selecting a quick
  // button shows the value in the filter menu AND as a chip, and clearing it
  // from either place clears the button. Applied immediately (pending +
  // applied), so no Apply press is needed and the filtering uses the panel's own
  // matching logic.
  const quickActive = (field: string, value: string): boolean =>
    (appliedFilter[field] ?? []).includes(value);
  const toggleQuickFilter = (field: string, value: string) => {
    const cur = appliedFilter[field] ?? [];
    const next = cur.includes(value)
      ? cur.filter((v) => v !== value)
      : [...cur, value];
    setAppliedFilter((prev) => ({ ...prev, [field]: next }));
    setPendingFilter((prev) => ({ ...prev, [field]: next }));
  };

  const handleApplyFilter = () => {
    setAppliedFilter({ ...pendingFilter });
    setIsFilterOpen(false);
  };

  const handleResetFilter = () => {
    setPendingFilter({ ...EMPTY_FILTER });
    setAppliedFilter({ ...EMPTY_FILTER });
  };

  const handleCloseFilter = () => {
    setPendingFilter({ ...appliedFilter });
    setIsFilterOpen(false);
  };

  const handleSearch = (query: string) => setSearchQuery(query);

  const { catalogData, loading, error } = useAppSelector(
    (state) => state.simulationCatalog,
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        await dispatch(fetchSimulationCatalog(language === 'es' ? 'es' : 'en')).unwrap();
      } catch {
        return;
      }
    };

    loadData();
  }, [dispatch, language]);

  const browseByItems = catalogData?.browseBy?.items ?? [];
  const sections = catalogData?.sections ?? [];
  // Requested filter order. Keys not present in the backend field set just sit
  // out until they're added (learnerLevel / modality / productName are net-new).
  const FILTER_ORDER = [
    "learnerLevel",
    "targetAudience",
    "modality",
    "productName",
    "difficulty",
    "unit",
    "duration",
  ];
  const filters = [...(catalogData?.filters?.fields ?? [])].sort((a, b) => {
    const ia = FILTER_ORDER.indexOf(a.key);
    const ib = FILTER_ORDER.indexOf(b.key);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const difficultyLabels: Record<"Easy" | "Medium" | "Hard", string> = {
    Easy: catalogLocale.difficultyEasy,
    Medium: catalogLocale.difficultyMedium,
    Hard: catalogLocale.difficultyHard,
  };

  const resolveFilterLabel = (key: string, fallback: string | undefined) => {
    if (key === "learnerLevel") return "Learner Level";
    if (key === "modality") return "Modality";
    if (key === "productName") return "Required Product Name";
    if (key === "unit") return catalogLocale.tabUnit;
    if (key === "targetAudience") return catalogLocale.tabTargetAudiences;
    if (key === "difficulty") return catalogLocale.filterDifficulty;
    if (key === "duration") return catalogLocale.filterDuration;
    return fallback ?? key;
  };

  // Duration range mapping for simplified filters
  const DURATION_RANGES = [
    { value: "<15 min", label: "<15 min" },
    { value: "15–30 min", label: "15–30 min" },
    { value: "30–60 min", label: "30–60 min" },
    { value: "60+ min", label: "60+ min" },
  ];

  // Match an item's duration against the selected duration ranges (any match).
  const matchDurationToRange = (durationValue: string | undefined): boolean => {
    const ranges = appliedFilter.duration ?? [];
    if (!durationValue || ranges.length === 0) return true;
    const durationStr = String(durationValue).toLowerCase();
    const numMatch = durationStr.match(/(\d+)/);
    if (!numMatch) return true;
    let mins = parseInt(numMatch[1]);
    if (/hour|hr/i.test(durationStr)) mins = mins * 60;
    return ranges.some((filter) => {
      if (filter === "<15 min") return mins < 15;
      if (filter === "15–30 min" || filter === "15-30 min")
        return mins >= 15 && mins <= 30;
      if (filter === "30–60 min" || filter === "30-60 min")
        return mins > 30 && mins <= 60;
      if (filter === "60+ min") return mins > 60;
      return false;
    });
  };

  // Item → its learner level / modality / product name (for the new filters).
  const itemLevel = (item: SectionItem): string => {
    const raw = item as unknown as Record<string, unknown>;
    const hay = [
      ...(item.targetAudience ?? []),
      String(raw.learnerLevel ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.trim()) return "";
    if (/post[-\s]?secondary/.test(hay)) return "Post-Secondary";
    if (/secondary|high school/.test(hay)) return "Secondary";
    // Any other named audience (BSN, PA/PT, etc.) is post-secondary.
    return "Post-Secondary";
  };
  const itemModality = (item: SectionItem): string =>
    (item as unknown as Record<string, unknown>).avatarEnabled
      ? "Avatar"
      : "Workstation";
  const itemProduct = (item: SectionItem): string =>
    String(
      (item as unknown as Record<string, unknown>).productName ??
        (item as unknown as Record<string, unknown>).product_name ??
        "",
    );

  // Remove one chip's value (key = "field::value"); clears the field if no value.
  const handleRemoveFilter = (key: string) => {
    const sep = key.indexOf("::");
    const field = sep === -1 ? key : key.slice(0, sep);
    const value = sep === -1 ? "" : key.slice(sep + 2);
    const updater = (
      f: Record<string, string[]>,
    ): Record<string, string[]> => ({
      ...f,
      [field]: value ? (f[field] ?? []).filter((v) => v !== value) : [],
    });
    setAppliedFilter(updater);
    setPendingFilter(updater);
  };

  const unitCodeToDisplayName = new Map<string, string>();
  browseByItems.forEach((b) => {
    if (b.unit) {
      unitCodeToDisplayName.set(
        b.unit.trim().toLowerCase(),
        b.title?.trim() || b.description?.trim() || b.unit,
      );
    }
  });

  const resolveUnitDisplayName = (item: SectionItem): string => {
    const code = item.unit?.trim() ?? "";
    return (
      unitCodeToDisplayName.get(code.toLowerCase()) ??
      item.unit_name?.trim() ??
      item.unit?.trim() ??
      ""
    );
  };

  const filteredSections = sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      const normalizedSearch = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        item.title.toLowerCase().includes(normalizedSearch) ||
        (item.subtitle ?? "").toLowerCase().includes(normalizedSearch) ||
        (item.description ?? "").toLowerCase().includes(normalizedSearch) ||
        (item.purpose ?? "").toLowerCase().includes(normalizedSearch) ||
        (item.unit_name ?? "").toLowerCase().includes(normalizedSearch);
      const itemUnitDisplayName = resolveUnitDisplayName(item);
      const inArr = (arr: string[] | undefined, val: string) =>
        !arr?.length || arr.includes(val);
      const matchesFilter =
        (!appliedFilter.unit?.length ||
          appliedFilter.unit.includes(item.unit ?? "") ||
          appliedFilter.unit.includes(item.unit_name ?? "") ||
          appliedFilter.unit.some(
            (u) => u.toLowerCase() === itemUnitDisplayName.toLowerCase(),
          )) &&
        (!appliedFilter.targetAudience?.length ||
          appliedFilter.targetAudience.some((a) =>
            item.targetAudience?.includes(a),
          )) &&
        matchDurationToRange(item.duration) &&
        inArr(appliedFilter.difficulty, item.difficulty ?? "") &&
        inArr(appliedFilter.learnerLevel, itemLevel(item)) &&
        inArr(appliedFilter.modality, itemModality(item)) &&
        inArr(appliedFilter.productName, itemProduct(item));

      const isHidden = item.status?.toLowerCase().trim() === 'draft' ||
        item.status?.toLowerCase().trim() === 'archived';

      // Quick filters now write into appliedFilter (learnerLevel / modality /
      // difficulty), so matchesFilter already covers them — no separate pass.
      return (
        matchesSearch &&
        matchesFilter &&
        !isHidden
      );
    }),
  }));

  const allSimItems = (() => {
    const primarySection = filteredSections[0];
    const primaryItems = primarySection?.items ?? [];
    const seen = new Set<string>(
      primaryItems
        .map((item) => item.scenarioId ?? item.title?.trim() ?? "")
        .filter(Boolean),
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

  const hasAppliedFilters = Object.values(appliedFilter).some(
    (v) => v.length > 0,
  );
  const appliedFilterCount = Object.values(appliedFilter).reduce(
    (n, v) => n + v.length,
    0,
  );
  const hasMatchingRecords = allSimItems.length > 0;

  // Sim-pack bundles (audience × modality). Built from the full catalog (not the
  // active filters) so the four bundles are always available.
  const allSimsForPacks = (() => {
    const seen = new Set<string>();
    return sections
      .flatMap((s) => s.items)
      .filter((item) => {
        const key = item.scenarioId ?? item.title?.trim();
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((item) => {
        const st = item.status?.toLowerCase().trim();
        return st !== "draft" && st !== "archived";
      });
  })();
  const simPacks = (
    [
      { audience: "Secondary", modality: "Avatar" },
      { audience: "Secondary", modality: "Workstation" },
      { audience: "Post-Secondary", modality: "Avatar" },
      { audience: "Post-Secondary", modality: "Workstation" },
    ] as const
  ).map((p) => ({
    name: `${p.audience} ${p.modality} Simulation Pack`,
    sims: allSimsForPacks.filter(
      (s) => itemLevel(s) === p.audience && itemModality(s) === p.modality,
    ),
  }));

  // Build active filter chips — one per selected value across all fields.
  const activeFilterChips = Object.entries(appliedFilter).flatMap(
    ([key, values]) =>
      (values ?? []).map((value) => ({
        key: `${key}::${value}`,
        label: resolveFilterLabel(key, key),
        value,
        displayValue: value,
      })),
  );
  
  if (viewAllUnits) {
    const unitMap = new Map<string, { sims: SectionItem[]; image: string }>();
    allSimItems.forEach((sim) => {
      const unitKey = sim.unit?.trim();
      if (!unitKey) return;
      const browseMatch = browseByItems.find(
        (b) => b.unit && b.unit.trim().toLowerCase() === unitKey.toLowerCase(),
      );
      const displayUnitName =
        browseMatch?.title?.trim() || browseMatch?.description?.trim() || unitKey;

      if (!unitMap.has(displayUnitName)) {
        unitMap.set(displayUnitName, {
          sims: [],
          image: browseMatch?.image ?? sim.image ?? "",
        });
      }
      unitMap.get(displayUnitName)!.sims.push(sim);
    });
    const unitEntries = Array.from(unitMap.entries());
    return (
      <ViewAllUnits
        setViewAllUnits={setViewAllUnits}
        setViewAllState={setViewAllState}
        unitEntries={unitEntries}
      />
    );
  }

  if (viewAllAudiences) {
    const audienceMap = new Map<string, SectionItem[]>();
    allSimItems.forEach((sim) => {
      (sim.targetAudience ?? []).forEach((audience) => {
        if (!audienceMap.has(audience)) audienceMap.set(audience, []);
        audienceMap.get(audience)!.push(sim);
      });
    });
    const audienceEntries = Array.from(audienceMap.entries());
    return (
      <ViewAllAudiences
        setViewAllAudiences={setViewAllAudiences}
        audienceEntries={audienceEntries}
        setViewAllState={setViewAllState}
      />
    );
  }

  if (viewAllFavourites) {
    return (
      <ViewAllFavourites
        setViewAllFavourites={setViewAllFavourites}
        allSimItems={allSimItems}
        labels={{
          noFavourites: catalogLocale.noFavourites,
          noFavouritesSubtitle: catalogLocale.noFavouritesSubtitle,
          searchPlaceholder: catalogLocale.searchFavouritesPlaceholder,
          title: catalogLocale.browseFavourites,
        }}
      />
    );
  }

  if (viewAllState !== null) {
    return (
      <SimulationAllView
        title={viewAllState.title}
        items={viewAllState.items}
        onBack={() => setViewAllState(null)}
        onSelect={(item) => {
          setViewAllState(null);
          navigate(`/simulationdetails/${item.scenarioId ?? item.id}`, {
            state: {
              simulationId: item.scenarioId ?? item.id,
              initialData: item,
            },
          });
        }}
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
        {/* Row 1: search + filter icon, aligned to the top-right. */}
        <div className="px-6 pt-3 flex items-center gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-[#5f6060] flex-shrink-0">
            Simplify your search with filters
          </h2>
          <div className="flex-1 min-w-0 sm:min-w-[160px] max-w-md ml-auto">
            <SearchBar
              value={searchQuery}
              onSearch={handleSearch}
              placeholder={catalogLocale.searchPlaceholder}
              debounceMs={500}
            />
          </div>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            aria-label="Filters"
            aria-pressed={hasAppliedFilters}
            className={`relative w-11 h-11 flex-shrink-0 self-center flex items-center justify-center rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 ${
              hasAppliedFilters
                ? "bg-[#5f6060] border-[#5f6060]"
                : "border-gray-400"
            }`}
            style={{ minWidth: '2.75rem', minHeight: '2.75rem' }}
          >
            <Filter
              size={16}
              aria-hidden="true"
              className={hasAppliedFilters ? "text-white" : "text-gray-500"}
            />
            {appliedFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">
                {appliedFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Row 2: Browse by — quick-filter buttons (learner level | modality |
            difficulty). Each toggles on/off; the groups combine. */}
        <div className="px-6 pb-3 pt-1 flex flex-col gap-1.5">
          <h2 className="text-sm font-bold text-[#5f6060]">
            {catalogLocale.browseBy}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {(["Secondary", "Post-Secondary"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleQuickFilter("learnerLevel", v)}
                aria-pressed={quickActive("learnerLevel", v)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold border-2 transition-colors ${
                  quickActive("learnerLevel", v)
                    ? "bg-primary-500 border-primary-500 text-white"
                    : "bg-white border-gray-300 text-[#5f6060] hover:border-primary-300 hover:bg-[#e9e9e9]"
                }`}
              >
                {v}
              </button>
            ))}
            <span className="mx-1 h-6 w-px bg-gray-300" aria-hidden="true" />
            {(["Avatar", "Workstation"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleQuickFilter("modality", v)}
                aria-pressed={quickActive("modality", v)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold border-2 transition-colors ${
                  quickActive("modality", v)
                    ? "bg-primary-500 border-primary-500 text-white"
                    : "bg-white border-gray-300 text-[#5f6060] hover:border-primary-300 hover:bg-[#e9e9e9]"
                }`}
              >
                {v}
              </button>
            ))}
            <span className="mx-1 h-6 w-px bg-gray-300" aria-hidden="true" />
            {(["Easy", "Medium", "Hard"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleQuickFilter("difficulty", v)}
                aria-pressed={quickActive("difficulty", v)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold border-2 transition-colors ${
                  quickActive("difficulty", v)
                    ? "bg-primary-500 border-primary-500 text-white"
                    : "bg-white border-gray-300 text-[#5f6060] hover:border-primary-300 hover:bg-[#e9e9e9]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {isFilterOpen && (
        <FilterPanel
          title={catalogLocale.filterTitle}
          applyLabel={locale.classes.applyFilter}
          resetLabel={locale.classes.resetFilter}
          noFiltersMessage={locale.classes.noFiltersApplied}
          onApply={handleApplyFilter}
          onReset={handleResetFilter}
          onClose={handleCloseFilter}
          fields={[
            {
              key: "learnerLevel",
              label: "Learner Level",
              options: [
                { value: "Secondary", label: "Secondary" },
                { value: "Post-Secondary", label: "Post-Secondary" },
              ],
            },
            {
              key: "targetAudience",
              label: resolveFilterLabel("targetAudience", "Target Audience"),
              options: (
                filters.find((f) => f.key === "targetAudience")?.options ?? []
              ).map((o: string) => ({ value: o, label: o })),
            },
            {
              key: "modality",
              label: "Modality",
              options: [
                { value: "Avatar", label: "Avatar" },
                { value: "Workstation", label: "Workstation" },
              ],
            },
            {
              key: "productName",
              label: "Required Product Name",
              options: Array.from(
                new Set(
                  sections.flatMap((s) => s.items).map(itemProduct).filter(Boolean),
                ),
              )
                .sort()
                .map((p) => ({ value: p, label: p })),
            },
            {
              key: "difficulty",
              label: resolveFilterLabel("difficulty", "Difficulty"),
              options: (() => {
                const o = filters.find((f) => f.key === "difficulty")?.options ?? [];
                return (o.length ? o : ["Easy", "Medium", "Hard"]).map(
                  (x: string) => ({ value: x, label: x }),
                );
              })(),
            },
            {
              key: "unit",
              label: resolveFilterLabel("unit", "Unit"),
              options: (
                filters.find((f) => f.key === "unit")?.options ?? []
              ).map((o: string) => ({ value: o, label: o })),
            },
            {
              key: "duration",
              label: resolveFilterLabel("duration", "Duration"),
              options: DURATION_RANGES,
            },
          ].map((f) => ({
            label: f.label,
            placeholder: `${catalogLocale.filterSelectPrefix} ${f.label}`,
            multiple: true as const,
            searchable: true,
            values: pendingFilter[f.key] ?? [],
            onValuesChange: (vals: string[]) =>
              setPendingFilter((prev) => ({ ...prev, [f.key]: vals })),
            value: "",
            onChange: () => undefined,
            options: f.options,
          }))}
        />
      )}

        <FilterChips
          filters={activeFilterChips}
          onRemove={handleRemoveFilter}
          onClearAll={handleResetFilter}
          labels={{
            clearAll: locale.simulationLibrary.clearAllFilters,
          }}
        />

      </div>

      {/* View Simulations content switcher — just below the divider line. The
          section below shows ONLY the selected category (All / Favorites /
          Sim Packs / Units). */}
      <div className="px-6 mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold text-[#5f6060]">
          View Simulations
        </span>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#e9e9e9] p-1">
          {(
            [
              { key: "all", label: "All" },
              { key: "favorites", label: "Favorites" },
              { key: "packs", label: "Sim Packs" },
              { key: "units", label: "Units" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setBrowseTab(t.key)}
              aria-pressed={browseTab === t.key}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                browseTab === t.key
                  ? "bg-primary-500 text-white shadow"
                  : "text-[#5f6060] hover:bg-white/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 mt-6">
        {hasAppliedFilters && !hasMatchingRecords ? (
          <div className="py-16 text-center bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-lg font-semibold text-gray-500">{catalogLocale.noDataFoundTitle}</p>
            <p className="mt-2 text-[13px] text-gray-500">
              {catalogLocale.noDataFoundSubtitle}
            </p>
          </div>
        ) : (
          <>
            {/* All simulations */}
            {browseTab === "all" &&
              (allSimItems.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  {catalogLocale.noDataFoundTitle}
                </div>
              ) : (
                <div className="mb-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {allSimItems.map((item, idx) => (
                    <AllSimItems
                      key={item.scenarioId ?? `sim-${item.id}`}
                      item={item}
                      idx={idx}
                      viewLabel={catalogLocale.buttonView}
                    />
                  ))}
                </div>
              ))}

            {/* Favorites */}
            {browseTab === "favorites" &&
              (() => {
                const favs = allSimItems.filter((i) => i.myFavorite);
                return favs.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-lg font-semibold text-gray-500">
                      {catalogLocale.noFavourites}
                    </p>
                    <p className="mt-2 text-[13px] text-gray-500">
                      {catalogLocale.noFavouritesSubtitle}
                    </p>
                  </div>
                ) : (
                  <div className="mb-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {favs.map((item, idx) => (
                      <AllSimItems
                        key={item.scenarioId ?? `fav-${item.id}`}
                        item={item}
                        idx={idx}
                        viewLabel={catalogLocale.buttonView}
                      />
                    ))}
                  </div>
                );
              })()}

            {/* Sim Packs — audience × modality bundles. Favorite the whole pack,
                or View to see the individual sims in it. */}
            {browseTab === "packs" && (
              <div className="mb-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {simPacks.map((pack) => (
                  <div
                    key={pack.name}
                    className="relative rounded-xl overflow-hidden aspect-[3/2] group cursor-pointer shadow"
                    style={{
                      // Locked Sim Pack tile background (fixed teal gradient).
                      background:
                        "linear-gradient(135deg, #6cbfab 0%, #4f9b98 100%)",
                    }}
                    onClick={() =>
                      setViewAllState({ title: pack.name, items: pack.sims })
                    }
                  >
                    <div className="absolute inset-0 bg-black/10" />
                    {(() => {
                      const packInLibrary = isGroupInLibrary(pack.sims);
                      return (
                        <button
                          type="button"
                          aria-pressed={packInLibrary}
                          aria-label={
                            packInLibrary
                              ? `Remove ${pack.name} from my library`
                              : `Add ${pack.name} to my library`
                          }
                          title={
                            packInLibrary
                              ? "Remove whole pack from My Library"
                              : "Add whole pack to My Library"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddGroup(e, pack.sims);
                          }}
                          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 z-10"
                        >
                          <Heart
                            size={13}
                            strokeWidth={2}
                            fill={packInLibrary ? "currentColor" : "none"}
                          />
                        </button>
                      );
                    })()}
                    <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2">
                      <div className="min-w-0 text-white">
                        <p className="text-base sm:text-lg font-bold leading-snug break-words">
                          {pack.name}
                        </p>
                        <p className="text-xs text-white mt-0.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                          {pack.sims.length}{" "}
                          {pack.sims.length === 1
                            ? catalogLocale.simulationCountSingular
                            : catalogLocale.simulationCountPlural}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewAllState({
                            title: pack.name,
                            items: pack.sims,
                          });
                        }}
                        className="shrink-0 bg-white text-[#db8833] text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/90 transition-colors"
                      >
                        {catalogLocale.buttonView}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Units — one tile per unit; View drills into that unit's sims. */}
            {browseTab === "units" &&
              (() => {
                const unitMap = new Map<
                  string,
                  { sims: SectionItem[]; image: string }
                >();
                allSimItems.forEach((sim) => {
                  const unitKey = sim.unit?.trim();
                  if (!unitKey) return;
                  const browseMatch = browseByItems.find(
                    (b) =>
                      b.unit &&
                      b.unit.trim().toLowerCase() === unitKey.toLowerCase(),
                  );
                  const displayUnitName =
                    browseMatch?.title?.trim() ||
                    browseMatch?.description?.trim() ||
                    unitKey;
                  if (!unitMap.has(displayUnitName)) {
                    unitMap.set(displayUnitName, {
                      sims: [],
                      image: browseMatch?.image ?? sim.image ?? "",
                    });
                  }
                  unitMap.get(displayUnitName)!.sims.push(sim);
                });
                const unitEntries = Array.from(unitMap.entries());
                return unitEntries.length === 0 ? (
                  <div className="text-center py-16 text-gray-500">
                    {catalogLocale.noDataFoundTitle}
                  </div>
                ) : (
                  <div className="mb-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {unitEntries.map(([unitName, { sims }]) => (
                      <div
                        key={unitName}
                        className="relative rounded-xl overflow-hidden aspect-[3/2] group cursor-pointer shadow"
                        style={{
                          background:
                            "linear-gradient(135deg, #db8833 0%, #ED621F 100%)",
                        }}
                        onClick={() =>
                          setViewAllState({ title: unitName, items: sims })
                        }
                      >
                        <div className="absolute inset-0 bg-black/10" />
                        {(() => {
                          const unitInLibrary = isGroupInLibrary(sims);
                          return (
                            <button
                              type="button"
                              aria-pressed={unitInLibrary}
                              aria-label={
                                unitInLibrary
                                  ? `Remove ${unitName} from my library`
                                  : `Add ${unitName} to my library`
                              }
                              title={
                                unitInLibrary
                                  ? "Remove whole unit from My Library"
                                  : "Add whole unit to My Library"
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddGroup(e, sims);
                              }}
                              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 z-10"
                            >
                              <Heart
                                size={13}
                                strokeWidth={2}
                                fill={unitInLibrary ? "currentColor" : "none"}
                              />
                            </button>
                          );
                        })()}
                        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2">
                          <div className="min-w-0 text-white">
                            <p className="text-base sm:text-lg font-bold leading-snug break-words">
                              {unitName}
                            </p>
                            <p className="text-xs text-white mt-0.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                              {sims.length}{" "}
                              {sims.length === 1
                                ? catalogLocale.simulationCountSingular
                                : catalogLocale.simulationCountPlural}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewAllState({ title: unitName, items: sims });
                            }}
                            className="shrink-0 bg-white text-[#db8833] text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/90 transition-colors"
                          >
                            {catalogLocale.buttonView}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default SimulationCatalog;
