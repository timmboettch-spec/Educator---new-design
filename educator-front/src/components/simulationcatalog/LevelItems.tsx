import { Heart } from "lucide-react";
import { AnimatedCard, CatalogCardImage } from "./AnimatedCard";
import { SectionItem } from "@/types";
import { useNavigate } from "react-router-dom";
import { useCatalogFavorite } from "@/hooks/useCatalogFavorite";

export const LevelItems = ({
  level,
  levelItems,
  setDifficultyFilter,
  setViewAllSims,
  labels,
}: {
  level: "All" | "Easy" | "Medium" | "Hard";
  levelItems: SectionItem[];
  setDifficultyFilter: (level: "All" | "Easy" | "Medium" | "Hard") => void;
  setViewAllSims: (value: boolean) => void;
  labels?: {
    levelTitle?: string;
    viewAll?: string;
    view?: string;
  };
}) => {
  const navigate = useNavigate();
  const { isInLibrary, loadingIds, handleAddSim, isStartTrial } = useCatalogFavorite();

  return (
    <div key={level} className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">{labels?.levelTitle ?? level}</h2>
        <button
          onClick={() => {
            setDifficultyFilter(level);
            setViewAllSims(true);
          }}
          className="text-sm text-primary-500 font-medium hover:underline flex items-center gap-1"
        >
          {labels?.viewAll ?? 'View All'} <span>›</span>
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {levelItems.slice(0, 4).map((item, idx) => {
          const inLibrary = isInLibrary(item);
          const simKey = String(item.scenarioId ?? item.id);
          const isLoading = loadingIds.has(simKey);
          return (
            <AnimatedCard
              key={item.scenarioId ?? `${item.id}-${idx}`}
              delay={idx * 60}
              className="relative rounded-xl overflow-hidden aspect-[3/2] bg-gray-900 group cursor-pointer shadow"
              onClick={() =>
                navigate(`/simulationdetails/${item.scenarioId ?? item.id}`, {
                  state: {
                    simulationId: item.scenarioId ?? item.id,
                    initialData: item,
                  },
                })
              }
            >
              <CatalogCardImage
                src={item.image}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              {/* Heart - top right */}
              {!isStartTrial && (
              <button
                onClick={(e) => handleAddSim(e, item)}
                disabled={isLoading}
                className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 z-10 ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Heart
                  size={13}
                  fill={inLibrary ? "currentColor" : "none"}
                  strokeWidth={2}
                />
              </button>
              )}
              {/* Title + View button - bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2">
                <p className="text-white text-base font-semibold line-clamp-2 flex-1">
                  {item.title}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(
                      `/simulationdetails/${item.scenarioId ?? item.id}`,
                      {
                        state: {
                          simulationId: item.scenarioId ?? item.id,
                          initialData: item,
                        },
                      },
                    );
                  }}
                  className="shrink-0 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
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
