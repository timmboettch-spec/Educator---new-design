import { ArrowLeft, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionItem } from "@/types";
import { SearchBar } from "@/components/common/SearchBar";
import { AllSimItems } from "./AllSimItems";
import FilterPanel from "@/components/common/FilterPanel";
import { FilterChips } from "./FilterChips";

/**
 * Shared "View All" grid for the simulation catalog sub-pages (View All
 * simulations, Browse by Favorites, Sim-Pack / section drill-downs). Gives every
 * one of them the same treatment: a full-width responsive tile grid that absorbs
 * white space, plus the three filtering surfaces — a search box, the quick
 * Secondary/Post-Secondary · Avatar/Workstation · Easy/Medium/Hard buttons, and
 * the full multi-select Filter panel. All filter options are derived from the
 * `items` passed in, so this component is self-contained.
 */

const EMPTY_FILTER: Record<string, string[]> = {
  learnerLevel: [],
  targetAudience: [],
  modality: [],
  productName: [],
  difficulty: [],
  unit: [],
  duration: [],
};

const DURATION_RANGES = [
  { value: "<15 min", label: "<15 min" },
  { value: "15–30 min", label: "15–30 min" },
  { value: "30–60 min", label: "30–60 min" },
  { value: "60+ min", label: "60+ min" },
];

const asRaw = (item: SectionItem) => item as unknown as Record<string, unknown>;

const itemLevel = (item: SectionItem): string => {
  const hay = [...(item.targetAudience ?? []), String(asRaw(item).learnerLevel ?? "")]
    .join(" ")
    .toLowerCase();
  if (!hay.trim()) return "";
  if (/post[-\s]?secondary/.test(hay)) return "Post-Secondary";
  if (/secondary|high school/.test(hay)) return "Secondary";
  return "Post-Secondary";
};
const itemModality = (item: SectionItem): string =>
  asRaw(item).avatarEnabled ? "Avatar" : "Workstation";
const itemProduct = (item: SectionItem): string =>
  String(asRaw(item).productName ?? asRaw(item).product_name ?? "");
const itemUnit = (item: SectionItem): string =>
  (item.unit_name ?? item.unit ?? "").trim();

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
    if (filter === "15–30 min" || filter === "15-30 min") return mins >= 15 && mins <= 30;
    if (filter === "30–60 min" || filter === "30-60 min") return mins > 30 && mins <= 60;
    if (filter === "60+ min") return mins > 60;
    return false;
  });
};

const uniqSorted = (values: (string | undefined)[]): string[] =>
  Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort();

export const SimCatalogGrid = ({
  items,
  onBack,
  title,
  viewLabel,
}: {
  items: SectionItem[];
  onBack: () => void;
  title?: string;
  viewLabel?: string;
}) => {
  // Search + quick filters.
  const [searchQuery, setSearchQuery] = useState("");
  // Full filter panel (multi-select), derived from the items.
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [pendingFilter, setPendingFilter] = useState<Record<string, string[]>>({ ...EMPTY_FILTER });
  const [appliedFilter, setAppliedFilter] = useState<Record<string, string[]>>({ ...EMPTY_FILTER });

  // Quick-filter buttons are a shortcut into the filter menu: each toggles a
  // value in the matching multi-select field (learner level / modality /
  // difficulty), so a quick selection shows in the menu AND as a chip, and
  // clearing it from either place clears the button. Applied immediately.
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

  const options = useMemo(
    () => ({
      targetAudience: uniqSorted(items.flatMap((i) => i.targetAudience ?? [])),
      productName: uniqSorted(items.map(itemProduct)),
      difficulty: uniqSorted(items.map((i) => i.difficulty)),
      unit: uniqSorted(items.map(itemUnit)),
    }),
    [items],
  );

  const inArr = (arr: string[] | undefined, val: string) => !arr?.length || arr.includes(val);

  const visibleSims = items.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.title.toLowerCase().includes(q) ||
      (item.subtitle ?? "").toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q) ||
      (item.unit_name ?? "").toLowerCase().includes(q);

    const matchesPanel =
      inArr(appliedFilter.learnerLevel, itemLevel(item)) &&
      (!appliedFilter.targetAudience?.length ||
        appliedFilter.targetAudience.some((a) => item.targetAudience?.includes(a))) &&
      inArr(appliedFilter.modality, itemModality(item)) &&
      inArr(appliedFilter.productName, itemProduct(item)) &&
      inArr(appliedFilter.difficulty, item.difficulty ?? "") &&
      (!appliedFilter.unit?.length ||
        appliedFilter.unit.includes(item.unit ?? "") ||
        appliedFilter.unit.includes(item.unit_name ?? "")) &&
      matchDurationToRange(item.duration, appliedFilter.duration ?? []);

    return matchesSearch && matchesPanel;
  });

  const activeFilterCount = Object.values(appliedFilter).reduce((n, v) => n + v.length, 0);

  const activeFilterChips = Object.entries(appliedFilter).flatMap(([key, values]) =>
    values.map((value) => ({
      key: `${key}::${value}`,
      label: FIELD_LABELS[key] ?? key,
      value,
      displayValue: value,
    })),
  );

  const handleRemoveFilter = (key: string) => {
    const sep = key.indexOf("::");
    const field = sep === -1 ? key : key.slice(0, sep);
    const value = sep === -1 ? "" : key.slice(sep + 2);
    const updater = (f: Record<string, string[]>): Record<string, string[]> => ({
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

  const btnClass = (active: boolean) =>
    `px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors ${
      active
        ? "bg-primary-500 border-primary-500 text-white"
        : "bg-white border-gray-300 text-[#5f6060] hover:border-primary-300 hover:bg-[#e9e9e9]"
    }`;

  const FIELDS: { key: string; label: string; options: { value: string; label: string }[] }[] = [
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
      options: (options.difficulty.length ? options.difficulty : ["Easy", "Medium", "Hard"]).map(
        (o) => ({ value: o, label: o }),
      ),
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
    <div className="min-h-screen bg-white font-sans">
      <div className="w-full bg-white shadow-sm sticky top-0 z-10 pb-2">
        {/* Row 1: Back + the simulation-family name on its own line. */}
        <div className="px-6 pt-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-500 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={15} /> Back
          </button>
          {title && (
            <h1 className="text-lg font-bold text-gray-800">{title}</h1>
          )}
        </div>
        {/* Row 2: caption + search + count, moved down under the family name. */}
        <div className="px-6 pt-2 flex items-center gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-[#5f6060] flex-shrink-0">
            Simplify your search with filters
          </h2>
          <div className="flex-1 min-w-0 max-w-md ml-auto">
            <SearchBar
              value={searchQuery}
              onSearch={setSearchQuery}
              placeholder="Search..."
              debounceMs={300}
            />
          </div>
          <span className="text-sm text-gray-500 flex-shrink-0">
            {visibleSims.length} simulations
          </span>
        </div>
        <div className="px-6 pb-3 flex flex-wrap items-center gap-2">
          {(["Secondary", "Post-Secondary"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={quickActive("learnerLevel", v)} onClick={() => toggleQuickFilter("learnerLevel", v)} className={btnClass(quickActive("learnerLevel", v))}>
              {v}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-gray-300" aria-hidden="true" />
          {(["Avatar", "Workstation"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={quickActive("modality", v)} onClick={() => toggleQuickFilter("modality", v)} className={btnClass(quickActive("modality", v))}>
              {v}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-gray-300" aria-hidden="true" />
          {(["Easy", "Medium", "Hard"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={quickActive("difficulty", v)} onClick={() => toggleQuickFilter("difficulty", v)} className={btnClass(quickActive("difficulty", v))}>
              {v}
            </button>
          ))}
          {/* Filter icon only (no label), matching the rest of the app: dark-gray
              applied state + orange count badge. */}
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
                activeFilterCount > 0 || isFilterOpen ? "text-white" : "text-gray-500"
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
            title="Filter Simulations"
            onApply={() => {
              setAppliedFilter({ ...pendingFilter });
              setIsFilterOpen(false);
            }}
            onReset={() => {
              setPendingFilter({ ...EMPTY_FILTER });
              setAppliedFilter({ ...EMPTY_FILTER });
            }}
            onClose={() => {
              setPendingFilter({ ...appliedFilter });
              setIsFilterOpen(false);
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
        {/* Applied-filter chips sit ABOVE the header's bottom divider line
            (last element inside the sticky header), with a gap so they aren't
            glued to it. */}
        {activeFilterChips.length > 0 && (
          <div className="pb-2">
            <FilterChips
              filters={activeFilterChips}
              onRemove={handleRemoveFilter}
              onClearAll={clearAllFilters}
            />
          </div>
        )}
      </div>

      <div className="w-full px-6 py-8">
        {visibleSims.length === 0 ? (
          <div className="text-center py-20 text-gray-500">No simulations found.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visibleSims.map((item, idx) => (
              <AllSimItems
                key={item.scenarioId ?? `${item.id}-${idx}`}
                item={item}
                idx={idx}
                viewLabel={viewLabel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
