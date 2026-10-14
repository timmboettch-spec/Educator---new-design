import { Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatedCard, CatalogCardImage } from './AnimatedCard';
import type { SectionItem } from '@/redux/simulation/FetchSimulationCatalogRedux';
import { useCatalogFavorite } from '@/hooks/useCatalogFavorite';
import { useSimulationValueLabel } from '@/hooks/useSimulationValueLabel';
import {
  getCatalogItemLevel,
  getCatalogItemModality,
} from '@/utils/catalogFilters';

const CHIP_CLASS =
  'bg-white/90 text-gray-700 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';

/**
 * A simulation tile: image, learner level / modality / difficulty chips, a
 * heart to add or remove it from My Library, and View to open its details.
 */
export const AllSimItems = ({
  item,
  idx,
  viewLabel,
}: {
  item: SectionItem;
  idx: number;
  viewLabel?: string;
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation('simulationCatalog');
  const valueLabel = useSimulationValueLabel();
  const { isInLibrary, loadingIds, handleAddSim, isStartTrial } =
    useCatalogFavorite();
  const inLibrary = isInLibrary(item);
  const simKey = String(item.scenarioId ?? item.id);
  const isLoading = loadingIds.has(simKey);

  // Same rules as the filters, so a chip always matches its quick filter.
  const level = getCatalogItemLevel(item);
  const modality = getCatalogItemModality(item);
  const difficulty = (item.difficulty ?? '').trim();

  const openDetails = () =>
    navigate(`/simulationdetails/${item.scenarioId ?? item.id}`, {
      state: {
        simulationId: item.scenarioId ?? item.id,
        initialData: item,
      },
    });

  return (
    <AnimatedCard
      key={item.scenarioId ?? `${item.id}-${idx}`}
      delay={idx * 60}
      className="relative rounded-xl overflow-hidden aspect-[3/2] bg-gray-900 group cursor-pointer shadow"
      onClick={openDetails}
    >
      <CatalogCardImage
        src={item.image}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      {/* Chips, top left: learner level + modality, then difficulty below. */}
      <div className="absolute top-2 left-2 z-10 flex flex-col items-start gap-1.5 max-w-[calc(100%-2.75rem)]">
        <div className="flex flex-wrap items-center gap-1.5">
          {level && <span className={CHIP_CLASS}>{valueLabel(level)}</span>}
          <span className={CHIP_CLASS}>{valueLabel(modality)}</span>
        </div>
        {difficulty && (
          <span className={CHIP_CLASS}>{valueLabel(difficulty)}</span>
        )}
      </div>
      {!isStartTrial && (
        <button
          type="button"
          onClick={(e) => handleAddSim(e, item)}
          disabled={isLoading}
          aria-pressed={inLibrary}
          aria-label={t(
            inLibrary ? 'card.removeFromLibrary' : 'card.addToLibrary',
            { title: item.title }
          )}
          className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Heart
            size={13}
            fill={inLibrary ? 'currentColor' : 'none'}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2">
        <p className="text-white text-lg sm:text-xl font-bold leading-snug break-words line-clamp-4 flex-1">
          {item.title}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openDetails();
          }}
          aria-label={t('groups.viewAria', { name: item.title })}
          className="shrink-0 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {viewLabel ?? t('groups.view')}
        </button>
      </div>
    </AnimatedCard>
  );
};
