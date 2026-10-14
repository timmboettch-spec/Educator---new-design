import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/simulation/cardbutton';
import Checkbox from '../ui/Checkbox';
import type { Simulation } from '../../types/simulation.types';
import { isAISimulation } from '@/utils/simulationType';
import {
  getSimulationLevel,
  getSimulationModality,
} from '@/utils/libraryFilters';
import { cn } from '@/lib/utils';
import {
  useSimulationDurationLabel,
  useSimulationValueLabel,
} from '@/hooks/useSimulationValueLabel';

interface SimulationCardProps {
  simulation: Simulation;
  onAssignClass: (id: string) => void;
  /** Asks to remove the simulation; the caller confirms first. */
  onRemoveFromLibrary: (simulation: Simulation) => void;
  onMoreInfo: (id: string) => void;
  /** Bulk-select support: when provided, a selection checkbox is shown. */
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const CHIP_CLASS =
  'bg-white/90 text-gray-700 text-xs sm:text-sm font-semibold px-2.5 py-1 rounded-full whitespace-nowrap';

const SimulationCard: React.FC<SimulationCardProps> = ({
  simulation,
  onAssignClass,
  onRemoveFromLibrary,
  onMoreInfo,
  selected = false,
  onToggleSelect,
}) => {
  const { t } = useTranslation('simulationLibrary');
  const valueLabel = useSimulationValueLabel();
  const durationLabel = useSimulationDurationLabel();
  const { id, title, image, fromBundle, avatarEnabled, simulation_id } =
    simulation;
  // Use the correct simulation identifier for navigation
  const correctSimulationId = simulation_id ?? id;
  const [imageError, setImageError] = useState(false);

  const levelValue =
    getSimulationLevel(simulation) ||
    simulation.learnerLevel ||
    simulation.targetAudience ||
    '';
  const learnerLevelLabel = valueLabel(levelValue);
  const modalityLabel = valueLabel(getSimulationModality(simulation));
  const difficultyLabel = simulation.difficulty
    ? valueLabel(simulation.difficulty)
    : '';

  /** Determine if this is an AI simulation. Source of truth: avatarEnabled flag only */
  const isAI = isAISimulation(avatarEnabled);

  const hasValidImage = Boolean(image?.trim()) && !imageError;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
      <div className="relative aspect-[3/2] overflow-hidden bg-slate-100">
        {hasValidImage ? (
          <>
            {/* Blurred backdrop — extends the image's own colors into the letterbox area */}
            <img
              src={image}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg"
              onError={() => setImageError(true)}
            />
            {/* Foreground — full image, never cropped. The title is overlaid below, so the image is decorative. */}
            <img
              src={image}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-contain"
              onError={() => setImageError(true)}
            />
          </>
        ) : isAI ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 gap-2">
            <img
              src="/assets/RealityworksAI_logo.svg"
              alt=""
              className="w-10 h-10 object-contain opacity-70"
            />
            <span className="text-xs font-semibold text-primary-500">
              {t('card.aiSimulation')}
            </span>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <img
              src="/assets/RealityworksAI_logo.svg"
              alt=""
              className="w-12 h-12 object-contain opacity-40"
            />
          </div>
        )}
        {/* Legibility scrim so the overlaid chips + title read over any image. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

        {/* Checkbox + chips, top-left. Row 1: learner level + modality; row 2: difficulty + duration. */}
        <div className="absolute top-2 left-2 z-10 flex items-start gap-2 max-w-[calc(100%-2.75rem)]">
          {onToggleSelect && (
            <Checkbox
              checked={selected}
              onChange={() => onToggleSelect(id)}
              ariaLabel={t('selection.selectSimulation', {
                title: title.trim(),
              })}
              size="lg"
              boxClassName={cn(
                'shadow',
                !selected && 'bg-white/90 border-white hover:border-primary-300'
              )}
            />
          )}
          <div className="flex flex-col items-start gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {learnerLevelLabel && (
                <span className={CHIP_CLASS}>{learnerLevelLabel}</span>
              )}
              <span className={CHIP_CLASS}>{modalityLabel}</span>
            </div>
            {(difficultyLabel || simulation.duration) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {difficultyLabel && (
                  <span className={CHIP_CLASS}>{difficultyLabel}</span>
                )}
                {simulation.duration && (
                  <span className={CHIP_CLASS}>
                    {durationLabel(simulation.duration)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {isAI && (
          <span className="absolute top-11 right-2 z-10 bg-primary-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full shadow">
            {t('card.aiSeatsRequired')}
          </span>
        )}

        {/* Heart — filled because this sim is already in the library. Bundle sims can't be removed. */}
        {fromBundle ? (
          <span
            role="img"
            aria-label={t('card.bundlePart')}
            title={t('card.bundlePart')}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-300 shadow z-10 cursor-default"
          >
            <Heart
              size={13}
              fill="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromLibrary(simulation);
            }}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 shadow z-10 hover:bg-neutral-active transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            title={t('card.removeFromLibrary')}
            aria-label={t('card.removeFromLibrary')}
          >
            <Heart
              size={13}
              fill="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        )}

        {/* Simulation name — bottom of the tile, over the image (catalog style). */}
        <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
          <h3 className="text-white text-lg sm:text-xl font-bold leading-snug break-words line-clamp-3">
            {title}
          </h3>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="w-full mt-auto">
          {/* No "Associated Product Name" line: the approved design's cards
              don't show it. Product name stays in the filter and list view. */}
          <div className="flex gap-2 w-full">
            <Button
              label={t('card.assignToClass')}
              variant="primary"
              className="flex-1"
              onClick={() => onAssignClass(id)}
            />
            <Button
              label={t('card.moreInfo')}
              aria-label={t('card.moreInfoAbout', { title: title.trim() })}
              data-more-info-id={correctSimulationId}
              variant="neutral"
              className="flex-1"
              onClick={() => onMoreInfo(correctSimulationId)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationCard;
