import { Heart } from 'lucide-react';
import { AnimatedCard, CatalogCardImage } from "./AnimatedCard";
import { SectionItem } from "@/types";
import { useNavigate } from "react-router-dom";
import { useCatalogFavorite } from '@/hooks/useCatalogFavorite';

export const AllSimItems = ({
    item,
    idx,
    viewLabel = 'View',
}: {
    item: SectionItem;
    idx: number;
    viewLabel?: string;
}) => {
    const navigate = useNavigate();
    const { isInLibrary, loadingIds, handleAddSim, isStartTrial } = useCatalogFavorite();
    const inLibrary = isInLibrary(item);
    const simKey = String(item.scenarioId ?? item.id);
    const isLoading = loadingIds.has(simKey);

    // Learner-level + modality chips (top of the tile).
    const raw = item as unknown as Record<string, unknown>;
    const modalityLabel = raw.avatarEnabled ? "Avatar" : "Workstation";
    const auds = item.targetAudience ?? [];
    const levelStr = String(raw.learnerLevel ?? auds.join(" ")).toLowerCase();
    // Always resolve to Secondary or Post-Secondary (never the specific
    // audience like BSN/PA-PT). High school / secondary → Secondary; any other
    // named audience defaults to Post-Secondary; no audience → no chip.
    const learnerLevelLabel = !levelStr.trim()
        ? ""
        : /post[-\s]?secondary/.test(levelStr)
          ? "Post-Secondary"
          : /secondary|high school/.test(levelStr)
            ? "Secondary"
            : "Post-Secondary";
    const difficultyLabel = (item.difficulty ?? "").trim();
    const chipClass =
        "bg-white/90 text-gray-700 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap";

    return (
        <AnimatedCard
            key={item.scenarioId ?? `${item.id}-${idx}`}
            delay={idx * 60}
            className="relative rounded-xl overflow-hidden aspect-[3/2] bg-gray-900 group cursor-pointer shadow"
            onClick={() =>
                 navigate(`/simulationdetails/${item.scenarioId ?? item.id}`, {
                    state: { simulationId: item.scenarioId ?? item.id, initialData: item },
                })
            }
        >
            <CatalogCardImage
                src={item.image}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            {/* Chips - top left. Row 1: learner level + modality (in line with the
                heart). Row 2: difficulty, left-aligned beneath. */}
            <div className="absolute top-2 left-2 z-10 flex flex-col items-start gap-1.5 max-w-[calc(100%-2.75rem)]">
                <div className="flex flex-wrap items-center gap-1.5">
                    {learnerLevelLabel && (
                        <span className={chipClass}>{learnerLevelLabel}</span>
                    )}
                    <span className={chipClass}>{modalityLabel}</span>
                </div>
                {difficultyLabel && (
                    <span className={chipClass}>{difficultyLabel}</span>
                )}
            </div>
            {/* Heart - top right */}
            {!isStartTrial && (
            <button
                onClick={(e) => handleAddSim(e, item)}
                disabled={isLoading}
                aria-pressed={inLibrary}
                aria-label={inLibrary ? 'Remove from My Library' : 'Add to My Library'}
                className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 z-10 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <Heart size={13} fill={inLibrary ? 'currentColor' : 'none'} strokeWidth={2} aria-hidden="true" />
            </button>
            )}
            {/* Title (larger, wraps, up to the bottom half) + View button */}
            <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2">
                <p className="text-white text-lg sm:text-xl font-bold leading-snug break-words line-clamp-4 flex-1">
                    {item.title}
                </p>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                          navigate(`/simulationdetails/${item.scenarioId ?? item.id}`,{
                            state: { simulationId: item.scenarioId ?? item.id, initialData: item },
                        });
                    }}
                    className="shrink-0 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                >
                    {viewLabel}
                </button>
            </div>
        </AnimatedCard>
    );
};