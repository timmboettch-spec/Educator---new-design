import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, ChevronUp, Layers } from "lucide-react";
import type { Subscription } from "../../types";
import type { SectionItem } from "../../types";

interface Props {
  subscriptions?: Subscription[];
  bundleSimulationMap?: Record<string, { unit_id: string; simulations: Record<string, unknown>[] }>;
  isEducator?: boolean;
  copy?: {
    header?: string;
    bundleSingular?: string;
    bundlePlural?: string;
    simulationSingular?: string;
    simulationPlural?: string;
    viewDetails?: string;
    viewMore?: string;
    viewLess?: string;
    moreSuffix?: string;
    noSimulationsInBundle?: string;
    noBundlesFound?: string;
    bundlesAutoAppear?: string;
  };
}

interface SubscriptionBundle {
  id: string;
  name: string;
  category: string;
  simulations: BundleSimulationItem[];
}

interface BundleSimulationItem {
  id: string;
  title: string;
  simulationId: string;
  imageUrl: string;
  unit: string | undefined;
  description: string | undefined;
  difficulty: string | undefined;
  duration: string | undefined;
  targetAudience: string[] | undefined;
  category: string | undefined;
  language: string | undefined;
  purpose: string | undefined;
  developer: string | undefined;
  institution: string | undefined;
  lastUpdate: string | undefined;
  learningObjectives: string[] | undefined;
  sectionItem: SectionItem | undefined;
}

function normalizeBundleKey(name: string): string {
  return name.toLowerCase().replace(/[_\s]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function isAiSeatProduct(productName: string): boolean {
  const lower = productName.toLowerCase();
  return /ai\s*simulation\s*seats?|simulation\s*seats?|\bai\b.*\bseats?\b|\bseats?\b.*\bai\b/.test(lower);
}

function isSimulationBundleProduct(productName: string, platform = ""): boolean {
  return /bundle/i.test(productName) || /bundle/i.test(platform);
}

function parseLeadingQuantity(value: string): { quantity: number; cleanName: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    return { quantity: 1, cleanName: trimmed };
  }
  return {
    quantity: Number(match[1]) || 1,
    cleanName: match[2].trim(),
  };
}

function getSimulationsForBundle(
  rows: Record<string, unknown>[],
  productIndex: number,
  unitId: string,
): BundleSimulationItem[] {
  const results: BundleSimulationItem[] = [];

  rows.forEach((item, idx) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const row = item as Record<string, unknown>;

    const title =
      (typeof row.title === "string" && row.title) ||
      (typeof row.name === "string" && row.name) ||
      (typeof row.simulation_name === "string" && row.simulation_name) ||
      null;

    const simulationId =
      (typeof row.scenario_id === "string" && row.scenario_id) ||
      (typeof row.simulation_id === "string" && row.simulation_id) ||
      (typeof row.id === "string" && row.id) ||
      "";

    const imageUrl =
      (typeof row.image_url === "string" && row.image_url) ||
      (typeof row.imageUrl === "string" && row.imageUrl) ||
      (typeof row.imageURL === "string" && row.imageURL) ||
      (typeof row.scenarioImage === "string" && row.scenarioImage) ||
      (typeof row.thumbnail === "string" && row.thumbnail) ||
      (typeof row.unit_image === "string" && row.unit_image) ||
      (Array.isArray(row.images) && typeof row.images[0] === "string" && row.images[0]) ||
      "";

    if (!title) {
      return;
    }

    const unit =
      (typeof row.unit === "string" && row.unit) ||
      (typeof row.unit_name === "string" && row.unit_name) ||
      unitId ||
      undefined;

    const description =
      (typeof row.description === "string" && row.description) ||
      undefined;

    const difficulty =
      (typeof row.difficulty === "string" && row.difficulty) ||
      (typeof row.difficultyLevel === "string" && row.difficultyLevel) ||
      undefined;

    const duration =
      (typeof row.duration === "string" && row.duration) ||
      (typeof row.estimatedDuration === "string" && row.estimatedDuration) ||
      undefined;

    const category =
      (typeof row.category === "string" && row.category) ||
      undefined;

    const language =
      (typeof row.language === "string" && row.language) ||
      undefined;

    const purpose =
      (typeof row.purpose === "string" && row.purpose) ||
      undefined;

    const developer =
      (typeof row.developer === "string" && row.developer) ||
      undefined;

    const institution =
      (typeof row.institution === "string" && row.institution) ||
      undefined;

    const lastUpdate =
      (typeof row.last_update === "string" && row.last_update) ||
      (typeof row.lastUpdate === "string" && row.lastUpdate) ||
      undefined;

    const learningObjectives = Array.isArray(row.learning_objectives)
      ? (row.learning_objectives as unknown[]).filter((obj) => typeof obj === "string")
      : undefined;

    const targetAudience = Array.isArray(row.targetAudience)
      ? (row.targetAudience as unknown[]).filter((aud) => typeof aud === "string")
      : undefined;

    const sectionItem: SectionItem = {
      id: productIndex * 1000 + idx,
      scenarioId: simulationId,
      title,
      image: imageUrl,
      cta: "View Details",
      unit,
      description,
      difficulty,
      duration,
      category,
      language,
      purpose,
      developer,
      institution,
      last_update: lastUpdate,
      learning_objectives: learningObjectives,
      targetAudience,
    };

    results.push({
      id: `${productIndex}-${idx}`,
      title,
      simulationId,
      imageUrl,
      unit,
      description,
      difficulty,
      duration,
      targetAudience,
      category,
      language,
      purpose,
      developer,
      institution,
      lastUpdate,
      learningObjectives,
      sectionItem,
    });
  });

  return results;
}

function getSubscriptionBundles(
  subscriptions: Subscription[],
  bundleSimulationMap: Record<string, { unit_id: string; simulations: Record<string, unknown>[] }>,
): SubscriptionBundle[] {
  const bundles: SubscriptionBundle[] = [];
  subscriptions.forEach((sub, subIndex) => {
    (sub.product_name ?? []).forEach((name, productIndex) => {
      const lower = name.toLowerCase();
      const platform = sub.platform?.[productIndex] ?? "";
      const isHardware = /manikin|device|hardware/.test(lower);
      const isAiSeat = isAiSeatProduct(name);
      const isSimulationBundle = isSimulationBundleProduct(name, platform);
      const parsed = parseLeadingQuantity(name);

      // Admin/Educator parity: only render bundle products from subscription data.
      if (!isHardware && !isAiSeat && isSimulationBundle) {
        const bundleName = parsed.cleanName || name;
        const normalizedName = normalizeBundleKey(bundleName);
        const entry = bundleSimulationMap[normalizedName];
        const rows = entry?.simulations ?? [];
        const unitId = entry?.unit_id ?? '';

        for (let unit = 0; unit < parsed.quantity; unit += 1) {
          bundles.push({
            id: `${subIndex}-${productIndex}-${unit}`,
            name: bundleName,
            category: unitId ? `Unit: ${unitId}` : "Simulation Bundle",
            simulations: getSimulationsForBundle(rows, productIndex, unitId),
          });
        }
      }
    });
  });
  return bundles;
}

const BUNDLES_VISIBLE_DEFAULT = 3;
const SIMS_VISIBLE_DEFAULT = 3;

export default function SimulationBundles({
  subscriptions = [],
  bundleSimulationMap = {},
  isEducator = false,
  copy,
}: Props) {
  const navigate = useNavigate();
  const [expandedBundleId, setExpandedBundleId] = useState<string | null>(null);
  const [showAllBundles, setShowAllBundles] = useState(false);
  const [showAllSimsMap, setShowAllSimsMap] = useState<Set<string>>(new Set());

  const localizedCopy = {
    header: copy?.header ?? 'Simulations',
    bundleSingular: copy?.bundleSingular ?? 'bundle',
    bundlePlural: copy?.bundlePlural ?? 'bundles',
    simulationSingular: copy?.simulationSingular ?? 'simulation',
    simulationPlural: copy?.simulationPlural ?? 'simulations',
    viewDetails: copy?.viewDetails ?? 'View Details',
    viewMore: copy?.viewMore ?? 'View More',
    viewLess: copy?.viewLess ?? 'View Less',
    moreSuffix: copy?.moreSuffix ?? 'more',
    noSimulationsInBundle:
      copy?.noSimulationsInBundle ?? 'No simulations available for this bundle yet.',
    noBundlesFound: copy?.noBundlesFound ?? 'No simulation bundles found.',
    bundlesAutoAppear:
      copy?.bundlesAutoAppear ?? 'Purchased bundles will appear here automatically.',
  };

  const subscriptionBundles = getSubscriptionBundles(subscriptions, bundleSimulationMap);
  const hasSubscriptionBundles = subscriptionBundles.length > 0;
  const visibleBundles = showAllBundles ? subscriptionBundles : subscriptionBundles.slice(0, BUNDLES_VISIBLE_DEFAULT);
  const hasMoreBundles = subscriptionBundles.length > BUNDLES_VISIBLE_DEFAULT;

  const toggleBundle = (bundleId: string) => {
    setExpandedBundleId((prev) => (prev === bundleId ? null : bundleId));
  };

  const toggleShowAllSims = (bundleId: string) => {
    setShowAllSimsMap((prev) => {
      const next = new Set(prev);
      if (next.has(bundleId)) {
        next.delete(bundleId);
      } else {
        next.add(bundleId);
      }
      return next;
    });
  };

  const openSimulation = (simulation: BundleSimulationItem) => {
    if (simulation.simulationId) {
      navigate(`/simulationdetails/${encodeURIComponent(simulation.simulationId)}`, {
        state: {
          simulationId: simulation.simulationId,
          initialData: simulation.sectionItem,
          fromProducts: true,
        },
      });
      return;
    }
    navigate("/simulation-catalog");
  };



  return (
    <>
      <div className="flex items-center gap-2 mt-8 mb-4">
        <Layers size={18} className="text-primary-500" />
        <h2 className="text-lg font-bold text-slate-900">{localizedCopy.header}</h2>
        <span className="bg-primary-100 text-primary-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
          {subscriptionBundles.length}{" "}
          {subscriptionBundles.length === 1
            ? localizedCopy.bundleSingular
            : localizedCopy.bundlePlural}
        </span>
      </div>

      {hasSubscriptionBundles ? (
        <div className="space-y-3">
          {visibleBundles.map((bundle) => (
            <div
              key={bundle.id}
              className="rounded-2xl border border-primary-100 bg-white p-4 shadow-sm overflow-hidden"
            >
              <button
                type="button"
                aria-expanded={expandedBundleId === bundle.id}
                aria-controls={`bundle-panel-${bundle.id}`}
                onClick={() => toggleBundle(bundle.id)}
                className="w-full flex items-center justify-between gap-2 text-left min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="h-8 w-8 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <Layers size={14} className="text-primary-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">
                      {bundle.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {bundle.simulations.length}{" "}
                        {bundle.simulations.length === 1
                          ? localizedCopy.simulationSingular
                          : localizedCopy.simulationPlural}
                      </span>
                    </div>
                  </div>
                </div>

                <span className="h-7 w-7 flex-shrink-0 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center transition-colors">
                  {expandedBundleId === bundle.id ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </span>
              </button>

              <div
                id={`bundle-panel-${bundle.id}`}
                className="grid transition-all duration-300 ease-in-out"
                style={{
                  gridTemplateRows: expandedBundleId === bundle.id ? "1fr" : "0fr",
                  opacity: expandedBundleId === bundle.id ? 1 : 0,
                  marginTop: expandedBundleId === bundle.id ? "0.75rem" : "0rem",
                }}
              >
                <div className="overflow-hidden">
                  {bundle.simulations.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {(showAllSimsMap.has(bundle.id) ? bundle.simulations : bundle.simulations.slice(0, SIMS_VISIBLE_DEFAULT)).map((simulation) => (
                        <div
                          key={simulation.id}
                          className={`rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-center justify-between gap-3 flex-wrap ${isEducator ? "cursor-pointer hover:bg-[#e9e9e9]/60" : ""}`}
                          onClick={() => {
                            if (isEducator) {
                              openSimulation(simulation);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                              <BookOpen size={14} className="text-primary-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {simulation.title}
                              </p>
                            </div>
                          </div>

                          {isEducator && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSimulation(simulation);
                              }}
                              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-colors"
                            >
                              {localizedCopy.viewDetails}
                            </button>
                          )}
                        </div>
                      ))}
                      {bundle.simulations.length > SIMS_VISIBLE_DEFAULT && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleShowAllSims(bundle.id); }}
                          className="w-full flex items-center justify-center gap-1.5 text-[13px] font-medium text-primary-600 transition-colors mt-1"
                        >
                          {showAllSimsMap.has(bundle.id) ? (
                            <><ChevronUp size={13} /> {localizedCopy.viewLess}</>
                          ) : (
                            <>
                              <ChevronDown size={13} /> {localizedCopy.viewMore} ({bundle.simulations.length - SIMS_VISIBLE_DEFAULT} {localizedCopy.moreSuffix})
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 px-1 py-2">
                      {localizedCopy.noSimulationsInBundle}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {hasMoreBundles && (
            <button
              type="button"
              onClick={() => setShowAllBundles((prev) => !prev)}
              className="w-full flex items-center justify-center gap-1.5 text-[13px] font-medium text-primary-500 hover:text-primary-600 transition-colors mt-2 py-2 rounded-xl border border-primary-100 bg-white"
            >
              {showAllBundles ? (
                <><ChevronUp size={13} /> {localizedCopy.viewLess}</>
              ) : (
                <>
                  <ChevronDown size={13} /> {localizedCopy.viewMore} ({subscriptionBundles.length - BUNDLES_VISIBLE_DEFAULT} {localizedCopy.moreSuffix})
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm text-center">
          <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">{localizedCopy.noBundlesFound}</p>
          <p className="text-xs text-slate-400 mt-1">
            {localizedCopy.bundlesAutoAppear}
          </p>
        </div>
      )}
    </>
  );
}
