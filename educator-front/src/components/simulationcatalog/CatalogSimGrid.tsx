import React from 'react';
import type { SectionItem } from '@/redux/simulation/FetchSimulationCatalogRedux';
import { AllSimItems } from './AllSimItems';
import { CatalogEmptyState } from './CatalogEmptyState';

interface CatalogSimGridProps {
  items: SectionItem[];
  viewLabel: string;
  emptyTitle: string;
  emptyBody?: string;
}

/** Simulation tiles for the All and Favorites views, or an empty state. */
export const CatalogSimGrid: React.FC<CatalogSimGridProps> = ({
  items,
  viewLabel,
  emptyTitle,
  emptyBody,
}) => {
  if (items.length === 0) {
    return <CatalogEmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <div className="mb-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {items.map((item, idx) => (
        <AllSimItems
          key={item.scenarioId ?? `sim-${item.id}`}
          item={item}
          idx={idx}
          viewLabel={viewLabel}
        />
      ))}
    </div>
  );
};
