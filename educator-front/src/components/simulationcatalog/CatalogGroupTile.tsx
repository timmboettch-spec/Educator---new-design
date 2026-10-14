import React from 'react';
import type { MouseEvent } from 'react';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface CatalogGroupTileProps {
  name: string;
  simulationCount: number;
  /** Tile colour: teal for simulation packs, orange for units (as designed). */
  tone: 'pack' | 'unit';
  isInLibrary: boolean;
  /** False for trial accounts, which can't save to My Library. */
  canFavorite: boolean;
  /** True while a bulk add/remove for this group is in flight. */
  isSaving: boolean;
  onToggleLibrary: (e: MouseEvent) => void;
  onView: () => void;
}

const TONE_CLASS = {
  pack: 'bg-gradient-sim-pack',
  unit: 'bg-gradient-sim-unit',
} as const;

/**
 * A simulation pack or unit: name, simulation count, a heart that adds or
 * removes the whole group from My Library, and View to open its simulations.
 * The View button stretches over the tile, so the whole tile opens the group
 * while keeping a single keyboard stop.
 */
export const CatalogGroupTile: React.FC<CatalogGroupTileProps> = ({
  name,
  simulationCount,
  tone,
  isInLibrary,
  canFavorite,
  isSaving,
  onToggleLibrary,
  onView,
}) => {
  const { t } = useTranslation('simulationCatalog');

  return (
    <div
      className={cn(
        // Fixed 3:2 tile as designed. The design's light dark tint is an inset
        // shadow, which (unlike an overlay element) paints under the text and
        // keeps the stretched View button covering the whole tile.
        'relative flex flex-col justify-end p-3 rounded-xl overflow-hidden aspect-[3/2] shadow-[0_1px_3px_rgba(0,0,0,0.1),inset_0_0_0_9999px_rgba(0,0,0,0.1)]',
        TONE_CLASS[tone]
      )}
    >
      {canFavorite && (
        <button
          type="button"
          aria-pressed={isInLibrary}
          aria-label={t(
            isInLibrary ? 'groups.removeFromLibrary' : 'groups.addToLibrary',
            { name }
          )}
          onClick={onToggleLibrary}
          disabled={isSaving}
          className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Heart
            size={13}
            strokeWidth={2}
            fill={isInLibrary ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>
      )}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 text-white">
          <p className="text-base sm:text-lg font-bold leading-snug break-words">
            {name}
          </p>
          <p className="text-xs mt-0.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
            {t('groups.simulationCount', { count: simulationCount })}
          </p>
        </div>
        <button
          type="button"
          onClick={onView}
          aria-label={t('groups.viewAria', { name })}
          className="shrink-0 bg-white text-primary-500 text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white after:absolute after:inset-0 after:content-['']"
        >
          {t('groups.view')}
        </button>
      </div>
    </div>
  );
};
