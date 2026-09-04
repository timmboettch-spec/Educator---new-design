import { Heart } from 'lucide-react';
import { AnimatedCard, CatalogCardImage } from "./AnimatedCard";
import { SectionItem } from "@/types";
import { useCatalogFavorite } from '@/hooks/useCatalogFavorite';

export const UnitList = ({
  setViewAllState,
  setViewAllUnits,
  allSimItems,
  browseByItems,
  labels,
}: {
  setViewAllState: (state: { title: string; items: SectionItem[] }) => void;
  setViewAllUnits: (value: boolean) => void;
  allSimItems: SectionItem[];
  browseByItems: { unit?: string; image?: string; title?: string; description?: string }[];
  labels?: {
    browseByUnit?: string;
    viewAllUnits?: string;
    view?: string;
    simulationSingular?: string;
    simulationPlural?: string;
  };
}) => {
  const { isGroupInLibrary, loadingIds, handleAddGroup, isStartTrial } = useCatalogFavorite();

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
        image: browseMatch?.image ?? sim.image ?? '',
      });
    }
    unitMap.get(displayUnitName)!.sims.push(sim);
  });
  const unitEntries = Array.from(unitMap.entries());
  if (unitEntries.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">{labels?.browseByUnit ?? 'Browse by Unit'}</h2>
        <button
          onClick={() => setViewAllUnits(true)}
          className="text-sm text-primary-500 font-medium hover:underline flex items-center gap-1"
        >
          {labels?.viewAllUnits ?? 'View All Units'} <span>›</span>
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {unitEntries.slice(0, 4).map(([unitName, { sims, image }], idx) => {
          const allInLibrary = isGroupInLibrary(sims);
          const isLoading = sims.some((s) => loadingIds.has(String(s.scenarioId ?? s.id)));
          return (
            <AnimatedCard
              key={unitName}
              delay={idx * 80}
              className="relative rounded-xl overflow-hidden aspect-[3/2] bg-gray-900 group cursor-pointer shadow"
              onClick={() => setViewAllState({ title: unitName, items: sims })}
            >
              <CatalogCardImage
                src={image}
                alt={unitName}
                className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              {!isStartTrial && (
              <button
                onClick={(e) => handleAddGroup(e, sims)}
                disabled={isLoading}
                className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 z-10 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Heart size={13} fill={allInLibrary ? 'currentColor' : 'none'} strokeWidth={2} />
              </button>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-base font-semibold line-clamp-2">
                    {unitName}
                  </p>
                  <p className="text-white/70 text-xs mt-0.5">
                    {sims.length}{' '}
                    {sims.length !== 1
                      ? labels?.simulationPlural ?? 'simulations'
                      : labels?.simulationSingular ?? 'simulation'}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewAllState({ title: unitName, items: sims });
                  }}
                  className="text-xs bg-primary-500 hover:bg-primary-600 text-white px-3 py-1 rounded-full transition-all flex-shrink-0 ml-2"
                >
                  {labels?.view ?? 'View'}
                </button>
              </div>
            </AnimatedCard>
          );
        })}
      </div>
    </div>
  );
};