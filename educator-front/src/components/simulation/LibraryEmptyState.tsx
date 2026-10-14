import React from 'react';
import { Link } from 'react-router-dom';
import { Library, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ROUTE_PATHS } from '@/routes/routePath';

interface LibraryEmptyStateProps {
  /** `empty`: nothing in the library yet. `noMatches`: filters/search hide everything. */
  variant: 'empty' | 'noMatches';
  onClearFilters?: () => void;
}

// Type and colours follow the design's "No simulations found" text and its
// error-state retry button.
const actionClass =
  'mt-5 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2';

/** Empty states for the simulation library, each with a way forward. */
export const LibraryEmptyState: React.FC<LibraryEmptyStateProps> = ({
  variant,
  onClearFilters,
}) => {
  const { t } = useTranslation('simulationLibrary');
  const isEmpty = variant === 'empty';
  const Icon = isEmpty ? Library : SearchX;

  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center py-20 text-center text-slate-400"
    >
      <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-4">
        <Icon size={24} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">
        {isEmpty ? t('states.emptyTitle') : t('states.noMatchesTitle')}
      </p>
      <p className="mt-1 text-xs max-w-xs">
        {isEmpty ? t('states.emptyBody') : t('states.noMatchesBody')}
      </p>
      {isEmpty ? (
        <Link to={ROUTE_PATHS.simulation.catalog} className={actionClass}>
          {t('states.browseCatalog')}
        </Link>
      ) : (
        onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className={actionClass}
          >
            {t('states.clearFilters')}
          </button>
        )
      )}
    </div>
  );
};
