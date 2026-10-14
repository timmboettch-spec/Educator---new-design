import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CATALOG_VIEWS, type CatalogView } from '@/utils/catalogViews';

interface CatalogViewSwitcherProps {
  value: CatalogView;
  onChange: (view: CatalogView) => void;
}

/** Segmented control choosing which catalogue view shows below it. */
export const CatalogViewSwitcher: React.FC<CatalogViewSwitcherProps> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation('simulationCatalog');
  const labelId = useId();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span id={labelId} className="text-sm font-bold text-neutral-strong">
        {t('viewSwitcher.label')}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="inline-flex flex-wrap items-center gap-1 rounded-full bg-neutral-active p-1"
      >
        {CATALOG_VIEWS.map((view) => {
          const isActive = view === value;
          return (
            <button
              key={view}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(view)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
                isActive
                  ? 'bg-primary-500 text-white shadow'
                  : 'text-neutral-strong hover:bg-white/70'
              )}
            >
              {t(`viewSwitcher.${view}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
};
