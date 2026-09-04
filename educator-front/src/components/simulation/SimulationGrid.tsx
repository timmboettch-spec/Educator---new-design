import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SortableHeader from "../../components/common/SortableHeader";
import SimulationCard from "../../components/simulation/Simulationcard";
import ActionMenu from "../../components/simulation/table/ActionMenu";
import CategoryPill from "../../components/simulation/table/CategoryPill";
import { SearchBar } from "../../components/common/SearchBar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import type { Simulation, ViewMode } from "../../types/simulation.types";
import { useAppDispatch } from "../../store/hooks";
import { fetchMyLibrary } from "../../redux/simulation/MyLibraryRedux";
import { toast } from "../common/Toast";
import { RemoveFromLibraryRequest } from "@/redux/simulation/RemoveFromLibraryRedux";

interface SimulationGridProps {
  simulations: Simulation[];
  viewMode: ViewMode;
  onAssignClass: (id: string, category: string) => void;
  onMoreInfo: (id: string) => void;
  onRemoveFromLibrary?: (id: string) => void;
  labels?: {
    searchPlaceholder?: string;
    tableHeading?: string;
    headerSimulationName?: string;
    headerProductType?: string;
    headerDuration?: string;
    headerLearnerLevel?: string;
    headerDifficulty?: string;
    headerAction?: string;
    noSimulationsFound?: string;
    noResultsFound?: string;
    removedSuccess?: string;
    removedFailed?: string;
  };
  /** When provided, search is controlled by the parent (toolbar) and the grid's
   * own search box is hidden. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Bulk-select support: selected sim ids + per-sim toggle. When onToggleSelect
   * is provided, a selection checkbox is shown on each tile / row. */
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}


const DIFFICULTY_STYLES: Record<string, string> = {
  Easy: "bg-green-50 text-green-600",
  Medium: "bg-amber-50 text-amber-600",
  Hard: "bg-red-50 text-red-500",
  Expert: "bg-purple-50 text-purple-600",
};


const SimulationGrid: React.FC<SimulationGridProps> = ({
  simulations,
  viewMode,
  onAssignClass,
  onRemoveFromLibrary,
  labels,
  searchValue,
  onSearchChange,
  selectedIds,
  onToggleSelect,
}) => {
  const dispatch = useAppDispatch();
  const selectedSet = new Set(selectedIds ?? []);
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [internalSearch, setInternalSearch] = useState("");
  const searchQuery = onSearchChange ? searchValue ?? "" : internalSearch;
  const setSearchQuery = onSearchChange ?? setInternalSearch;
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    null,
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemoveFromLibrary = async (id: string) => {
    if (removingId) return;
    setRemovingId(id);
    try {
      await dispatch(RemoveFromLibraryRequest({ scenario_id: id })).unwrap();
      toast.success("Removed from library successfully");
      dispatch(fetchMyLibrary());
      onRemoveFromLibrary?.(id);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "";
      toast.error(
        msg || labels?.removedFailed || "Failed to remove from library",
      );
    } finally {
      setRemovingId(null);
    }
  };

  useEffect(() => {
    setOpenMenuId(null);
  }, [viewMode]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === "asc") setSortDirection("desc");
      else {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filtered = simulations.filter((s) =>
    (s.title ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const sorted = sortField
    ? [...filtered].sort((a, b) => {
        const aVal = ((a as unknown as Record<string, unknown>)[sortField] ??
          "") as string;
        const bVal = ((b as unknown as Record<string, unknown>)[sortField] ??
          "") as string;
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      })
    : filtered;


  if (simulations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-sm font-medium">
          {labels?.noSimulationsFound ?? "No simulations found"}
        </p>
      </div>
    );
  }
  if (viewMode === "grid") {
    return (
      <>
        {!onSearchChange && (
          <div className="flex justify-end mb-4">
            <SearchBar
              value={searchQuery}
              onSearch={(val) => setSearchQuery(val)}
              placeholder={labels?.searchPlaceholder ?? "Search Simulations..."}
              className="w-64"
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <p className="text-sm font-medium">
              {labels?.noResultsFound ?? "No results found"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((sim) => {
              return (
                <SimulationCard
                  key={sim.id}
                  simulation={sim}
                  selected={selectedSet.has(sim.id)}
                  onToggleSelect={onToggleSelect}
                  onAssignClass={() => onAssignClass(sim.id, "")} // Category no longer sourced from units
                  onRemoveFromLibrary={() => handleRemoveFromLibrary(sim.id)}
                  onMoreInfo={(id) =>
                    navigate(`/simulationdetails/${id}`, {
                      state: { fromLibrary: true, simulationId: id },
                    })
                  }
                />
              );
            })}
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {!onSearchChange && (
          <div className="flex items-center justify-end px-6 py-5 border-b border-slate-100">
            <SearchBar
              value={searchQuery}
              onSearch={(val) => setSearchQuery(val)}
              placeholder={labels?.searchPlaceholder ?? "Search Simulations..."}
              className="w-64"
            />
          </div>
        )}

        <Table containerClassName="rounded-none border-0">
          <TableHeader>
            <TableRow>
              {onToggleSelect && (
                <TableHead className="w-10 text-center">
                  <input
                    type="checkbox"
                    aria-label="Select all simulations"
                    className="w-4 h-4 accent-white cursor-pointer align-middle"
                    checked={
                      sorted.length > 0 &&
                      sorted.every((s) => selectedSet.has(s.id))
                    }
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          sorted.some((s) => selectedSet.has(s.id)) &&
                          !sorted.every((s) => selectedSet.has(s.id));
                    }}
                    onChange={() => {
                      const allSel =
                        sorted.length > 0 &&
                        sorted.every((s) => selectedSet.has(s.id));
                      sorted.forEach((s) => {
                        const isSel = selectedSet.has(s.id);
                        if (allSel ? isSel : !isSel) onToggleSelect(s.id);
                      });
                    }}
                  />
                </TableHead>
              )}
              {[
                {
                  label: labels?.headerSimulationName ?? "Simulation Name",
                  field: "title",
                  centered: false,
                },
                {
                  label: labels?.headerLearnerLevel ?? "Learner Level",
                  field: "learnerLevel",
                  centered: true,
                },
                {
                  label: "Target Audience",
                  field: "targetAudience",
                  centered: true,
                },
                {
                  label: "Modality",
                  field: "modality",
                  centered: true,
                },
                {
                  label: labels?.headerProductType ?? "Product Name",
                  field: "productName",
                  centered: true,
                },
                {
                  label: labels?.headerDifficulty ?? "Difficulty",
                  field: "difficulty",
                  centered: true,
                },
                {
                  label: labels?.headerDuration ?? "Duration",
                  field: "duration",
                  centered: true,
                },
              ].map(({ label, field, centered }) => (
                <TableHead
                  key={field}
                  className={centered ? "text-center" : ""}
                >
                  <div className={centered ? "flex justify-center" : ""}>
                    <SortableHeader
                      label={label}
                      field={field}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-center">
                {labels?.headerAction ?? "Action"}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={onToggleSelect ? 9 : 8}
                  className="py-12 text-center text-xs text-slate-400"
                >
                  {labels?.noResultsFound ?? "No results found"}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((sim) => {
                const correctSimId =
                  sim.simulation_id ?? sim.scenario_id ?? sim.id;
                const raw = sim as unknown as Record<string, unknown>;
                const modality = raw.avatarEnabled ? "Avatar" : "Workstation";
                const productName = String(
                  raw.productName ?? raw.product_name ?? raw.category ?? "",
                ).trim();
                // Raw audience (e.g. "Post-Secondary Nursing", "BSN") shown in the
                // Target Audience column; Learner Level resolves it to just
                // Secondary / Post-Secondary.
                const targetAudience = String(
                  raw.targetAudience ?? sim.learnerLevel ?? "",
                ).trim();
                const audHay = targetAudience.toLowerCase();
                const learnerLevelResolved = !audHay
                  ? ""
                  : /post[-\s]?secondary/.test(audHay)
                    ? "Post-Secondary"
                    : /secondary|high school/.test(audHay)
                      ? "Secondary"
                      : "Post-Secondary";
                return (
                  <TableRow
                    key={sim.id}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    {onToggleSelect && (
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select ${sim.title}`}
                          className="w-4 h-4 accent-white cursor-pointer align-middle"
                          checked={selectedSet.has(sim.id)}
                          onChange={() => onToggleSelect(sim.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium text-slate-800 whitespace-nowrap">
                      {sim.title}
                    </TableCell>
                    {/* Learner Level (resolved Secondary / Post-Secondary) */}
                    <TableCell className="text-center">
                      {learnerLevelResolved ? (
                        <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {learnerLevelResolved}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    {/* Target Audience (raw) */}
                    <TableCell className="text-center">
                      {targetAudience ? (
                        <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {targetAudience}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    {/* Modality */}
                    <TableCell className="text-center">
                      <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {modality}
                      </span>
                    </TableCell>
                    {/* Product Name — none required for avatar sims */}
                    <TableCell className="text-center">
                      {modality === "Avatar" || !productName ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {productName}
                        </span>
                      )}
                    </TableCell>
                    {/* Difficulty */}
                    <TableCell className="text-center">
                      {sim.difficulty ? (
                        <span
                          className={`inline-block text-[12px] font-medium px-2.5 py-0.5 rounded-full ${
                            DIFFICULTY_STYLES[sim.difficulty] ??
                            "bg-slate-50 text-slate-500"
                          }`}
                        >
                          {sim.difficulty}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    {/* Duration */}
                    <TableCell className="text-center">
                      {sim.duration ? (
                        <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {sim.duration}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    {/* Action */}
                    <TableCell className="text-center">
                      <ActionMenu
                        id={correctSimId}
                        open={openMenuId === sim.id}
                        onToggle={() =>
                          setOpenMenuId(openMenuId === sim.id ? null : sim.id)
                        }
                        onAssignClass={(_id) => onAssignClass(sim.id, "")} // Category no longer sourced from units
                        onMoreInfo={(id) => {
                          navigate(`/simulationdetails/${id}`, {
                            state: { fromLibrary: true, simulationId: id },
                          });
                          setOpenMenuId(null);
                        }}
                        onRemoveFromLibrary={handleRemoveFromLibrary}
                        removingId={removingId}
                        fromBundle={sim.fromBundle}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

      </div>
    </>
  );
};

export default SimulationGrid;
