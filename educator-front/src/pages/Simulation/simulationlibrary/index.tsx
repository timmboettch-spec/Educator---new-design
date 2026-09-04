import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Filter } from "lucide-react";
import ErrorState from "../../../components/simulation/ErrorState";
import FilterPanel from "../../../components/common/FilterPanel";
import { FilterChips } from "../../../components/simulationcatalog/FilterChips";
import LoadingState from "../../../components/simulation/LoadingState";
import SimulationGrid from "../../../components/simulation/SimulationGrid";
import { SearchBar } from "@/components/common/SearchBar";
import ViewToggle from "../../../components/simulation/ViewToggle";
import {
  clearSimulationLibraryState,
  fetchMyLibrarySimulations,
  selectSimulationError,
  selectSimulationLibraryData,
  selectSimulationLoading,
} from "../../../redux/dashboard/simulationlibrary/GetSimulationRedux";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import type { Simulation, ViewMode } from "../../../types/simulation.types";
import AddSimulationModal from "../../../components/modal/AddSimulationModal";
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

// Catalog-parity filter surface: the same seven searchable multi-select fields,
// the same quick-filter buttons (unified into the applied filter), and the same
// chips + filter-icon count badge as pages/Simulation/simulationcatalog.
const EMPTY_FILTER: Record<string, string[]> = {
  learnerLevel: [],
  targetAudience: [],
  modality: [],
  productName: [],
  difficulty: [],
  unit: [],
  duration: [],
};

const FIELD_LABELS: Record<string, string> = {
  learnerLevel: "Learner Level",
  targetAudience: "Target Audience",
  modality: "Modality",
  productName: "Required Product Name",
  difficulty: "Difficulty",
  unit: "Unit",
  duration: "Duration",
};

const DURATION_RANGES = [
  { value: "<15 min", label: "<15 min" },
  { value: "15–30 min", label: "15–30 min" },
  { value: "30–60 min", label: "30–60 min" },
  { value: "60+ min", label: "60+ min" },
];

const simLevel = (s: Simulation): string => {
  const hay = `${s.learnerLevel ?? ""} ${s.targetAudience ?? ""}`
    .trim()
    .toLowerCase();
  if (!hay) return "";
  if (/post[-\s]?secondary/.test(hay)) return "Post-Secondary";
  if (/secondary|high school/.test(hay)) return "Secondary";
  return "Post-Secondary";
};
const simModality = (s: Simulation): string =>
  s.avatarEnabled ? "Avatar" : "Workstation";
const simProduct = (s: Simulation): string => (s.productName ?? "").trim();
const simUnit = (s: Simulation): string =>
  (s.unit_name ?? s.unit ?? "").trim();

const matchDurationToRange = (
  durationValue: string | undefined,
  ranges: string[],
): boolean => {
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

const uniqSorted = (values: (string | undefined)[]): string[] =>
  Array.from(
    new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)),
  ).sort();

const inArr = (arr: string[] | undefined, val: string) =>
  !arr?.length || arr.includes(val);

const MyLibraryPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const librarySimulations = useAppSelector(selectSimulationLibraryData);
  const loading = useAppSelector(selectSimulationLoading);
  const error = useAppSelector(selectSimulationError);
  const language = getStoredLanguage();
  const locale = language === "es" ? loginEs : loginEn;
  const simLocale = locale.simulationLibrary;

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  // Simulations pre-selected into the assignment modal (one from a tile's Assign
  // button, or many from the bulk-select toolbar).
  const [assignSimIds, setAssignSimIds] = useState<string[]>([]);
  // Bulk selection across tiles / rows.
  const [selectedSimIds, setSelectedSimIds] = useState<string[]>([]);
  const [pendingFilter, setPendingFilter] = useState<Record<string, string[]>>({
    ...EMPTY_FILTER,
  });
  const [appliedFilter, setAppliedFilter] = useState<Record<string, string[]>>({
    ...EMPTY_FILTER,
  });

  useEffect(() => {
    dispatch(clearSimulationLibraryState());
    getSimulationLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const getSimulationLibrary = async () => {
    try {
      await dispatch(fetchMyLibrarySimulations()).unwrap();
    } catch {
      return;
    }
  };

  const options = useMemo(
    () => ({
      targetAudience: uniqSorted(librarySimulations.map((s) => s.targetAudience)),
      productName: uniqSorted(librarySimulations.map(simProduct)),
      difficulty: uniqSorted(librarySimulations.map((s) => s.difficulty)),
      unit: uniqSorted(librarySimulations.map(simUnit)),
    }),
    [librarySimulations],
  );

  // Panel filtering happens here; the title search is delegated to SimulationGrid
  // (controlled via searchValue/onSearchChange) so it runs exactly once. Sorted
  // alphabetically by title.
  const panelFiltered = useMemo(
    () =>
      librarySimulations
        .filter(
          (s) =>
            inArr(appliedFilter.learnerLevel, simLevel(s)) &&
            (!appliedFilter.targetAudience?.length ||
              appliedFilter.targetAudience.includes(s.targetAudience ?? "")) &&
            inArr(appliedFilter.modality, simModality(s)) &&
            inArr(appliedFilter.productName, simProduct(s)) &&
            inArr(appliedFilter.difficulty, s.difficulty ?? "") &&
            (!appliedFilter.unit?.length ||
              appliedFilter.unit.includes(s.unit ?? "") ||
              appliedFilter.unit.includes(s.unit_name ?? "")) &&
            matchDurationToRange(s.duration, appliedFilter.duration ?? []),
        )
        .slice()
        .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
    [librarySimulations, appliedFilter],
  );

  // Bulk-select helpers (functional updates so header select-all loops are safe).
  const toggleSelect = (id: string) =>
    setSelectedSimIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const clearSelection = () => setSelectedSimIds([]);
  const filteredIds = panelFiltered.map((s) => s.id);
  const selectableCount = filteredIds.length;
  const selectedInView = selectedSimIds.filter((id) =>
    filteredIds.includes(id),
  ).length;
  const allSelected =
    selectableCount > 0 && selectedInView === selectableCount;
  const toggleSelectAll = () =>
    setSelectedSimIds(allSelected ? [] : filteredIds);

  const activeFilterCount = Object.values(appliedFilter).reduce(
    (n, v) => n + v.length,
    0,
  );

  const activeFilterChips = Object.entries(appliedFilter).flatMap(
    ([key, values]) =>
      values.map((value) => ({
        key: `${key}::${value}`,
        label: FIELD_LABELS[key] ?? key,
        value,
        displayValue: value,
      })),
  );

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

  const clearAllFilters = () => {
    setAppliedFilter({ ...EMPTY_FILTER });
    setPendingFilter({ ...EMPTY_FILTER });
  };

  const handleAssignClass = (id: string) => {
    setAssignSimIds([id]);
    setIsModalOpen(true);
  };

  const handleBulkAssign = () => {
    if (selectedSimIds.length === 0) return;
    setAssignSimIds(selectedSimIds);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    getSimulationLibrary();
  };

  const handleRetry = () => {
    getSimulationLibrary();
  };

  const btnClass = (active: boolean) =>
    `px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors ${
      active
        ? "bg-primary-500 border-primary-500 text-white"
        : "bg-white border-gray-300 text-[#5f6060] hover:border-primary-300 hover:bg-[#e9e9e9]"
    }`;

  const FIELDS: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
  }[] = [
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
      label: "Target Audience",
      options: options.targetAudience.map((o) => ({ value: o, label: o })),
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
      options: options.productName.map((o) => ({ value: o, label: o })),
    },
    {
      key: "difficulty",
      label: "Difficulty",
      options: (options.difficulty.length
        ? options.difficulty
        : ["Easy", "Medium", "Hard"]
      ).map((o) => ({ value: o, label: o })),
    },
    {
      key: "unit",
      label: "Unit",
      options: options.unit.map((o) => ({ value: o, label: o })),
    },
    {
      key: "duration",
      label: "Duration",
      options: DURATION_RANGES,
    },
  ];

  return (
    <div className="p-6 min-h-screen font-sans text-text-primary">
      {/* Row 1: page title + grid/list toggle. */}
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-xl font-bold text-primary-500 mb-0.5">
          {simLocale.title}
        </h1>
        <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
      </div>

      {/* Row 2: caption + search + filter count, matching the catalog. */}
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-bold text-[#5f6060] flex-shrink-0">
          Simplify your search with filters
        </h2>
        <div className="flex-1 min-w-0 max-w-md ml-auto">
          <SearchBar
            value={librarySearch}
            onSearch={setLibrarySearch}
            placeholder={simLocale.searchPlaceholder ?? "Search Simulations..."}
            debounceMs={300}
          />
        </div>
        <span className="text-sm text-gray-500 flex-shrink-0">
          {panelFiltered.length} simulations
        </span>
      </div>

      {/* Quick filters unified into the applied filter, then the filter icon. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["Secondary", "Post-Secondary"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={quickActive("learnerLevel", v)}
            onClick={() => toggleQuickFilter("learnerLevel", v)}
            className={btnClass(quickActive("learnerLevel", v))}
          >
            {v}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-gray-300" aria-hidden="true" />
        {(["Avatar", "Workstation"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={quickActive("modality", v)}
            onClick={() => toggleQuickFilter("modality", v)}
            className={btnClass(quickActive("modality", v))}
          >
            {v}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-gray-300" aria-hidden="true" />
        {(["Easy", "Medium", "Hard"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={quickActive("difficulty", v)}
            onClick={() => toggleQuickFilter("difficulty", v)}
            className={btnClass(quickActive("difficulty", v))}
          >
            {v}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setPendingFilter({ ...appliedFilter });
            setIsFilterOpen((o) => !o);
          }}
          aria-label="Filters"
          aria-expanded={isFilterOpen}
          aria-pressed={activeFilterCount > 0}
          className={`relative ml-auto w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full border ${
            activeFilterCount > 0 || isFilterOpen
              ? "bg-[#5f6060] border-[#5f6060]"
              : "border-gray-400 hover:bg-[#e9e9e9]"
          }`}
        >
          <Filter
            size={16}
            className={
              activeFilterCount > 0 || isFilterOpen
                ? "text-white"
                : "text-gray-500"
            }
          />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {isFilterOpen && (
        <FilterPanel
          title={simLocale.filterTitle}
          resetLabel={simLocale.resetFilter}
          applyLabel={simLocale.applyFilter}
          noFiltersMessage={simLocale.noFiltersApplied}
          onClose={() => {
            setPendingFilter({ ...appliedFilter });
            setIsFilterOpen(false);
          }}
          onApply={() => {
            setAppliedFilter({ ...pendingFilter });
            setIsFilterOpen(false);
          }}
          onReset={() => {
            setPendingFilter({ ...EMPTY_FILTER });
            setAppliedFilter({ ...EMPTY_FILTER });
          }}
          fields={FIELDS.map((f) => ({
            label: f.label,
            placeholder: `Select ${f.label}`,
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

      {activeFilterChips.length > 0 && (
        <FilterChips
          filters={activeFilterChips}
          onRemove={handleRemoveFilter}
          onClearAll={clearAllFilters}
          labels={{ clearAll: simLocale.clearAllFilters }}
        />
      )}

      {/* Bulk-select toolbar — select some/all (filtered) simulations and assign
          them to one or more classes at once. */}
      {!loading && !error && selectableCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-sm font-semibold text-[#5f6060] hover:text-primary-600"
          >
            {allSelected ? "Clear all" : `Select all (${selectableCount})`}
          </button>
          <span className="text-sm text-gray-500">
            {selectedSimIds.length} selected
          </span>
          {selectedSimIds.length > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm font-medium text-gray-500 hover:text-primary-600 underline-offset-2 hover:underline"
            >
              Clear selection
            </button>
          )}
          <button
            type="button"
            onClick={handleBulkAssign}
            disabled={selectedSimIds.length === 0}
            className="ml-auto px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-btn hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Assign {selectedSimIds.length} simulation
            {selectedSimIds.length === 1 ? "" : "s"} to Class(es)
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState count={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={handleRetry} />
      ) : (
        <SimulationGrid
          simulations={panelFiltered}
          viewMode={viewMode}
          searchValue={librarySearch}
          onSearchChange={setLibrarySearch}
          labels={{
            searchPlaceholder: simLocale.searchPlaceholder,
            tableHeading: simLocale.tableHeading,
            headerSimulationName: simLocale.headerSimulationName,
            headerProductType: "Product Name",
            headerDuration: simLocale.headerDuration,
            headerLearnerLevel: simLocale.headerLearnerLevel,
            headerDifficulty: simLocale.headerDifficulty,
            headerAction: simLocale.headerAction,
            noSimulationsFound: simLocale.noSimulationsFound,
            noResultsFound: simLocale.noResultsFound,
            removedSuccess: simLocale.removedSuccess,
            removedFailed: simLocale.removedFailed,
          }}
          onAssignClass={(id) => handleAssignClass(id)}
          onMoreInfo={(id) =>
            navigate(`/simulationdetails/${id}`, {
              state: { fromLibrary: true, simulationId: id },
            })
          }
          onRemoveFromLibrary={() => getSimulationLibrary()}
          selectedIds={selectedSimIds}
          onToggleSelect={toggleSelect}
        />
      )}

      <AddSimulationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onAssigned={() => setSelectedSimIds([])}
        simulationIds={assignSimIds}
        students={[]}
        simulations={panelFiltered}
      />
    </div>
  );
};

export default MyLibraryPage;
