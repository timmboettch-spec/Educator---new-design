import React from 'react';
import type { SectionItem } from '@/redux/simulation/FetchSimulationCatalogRedux';
import { useCatalogFavorite } from '@/hooks/useCatalogFavorite';
import { CatalogGroupTile } from './CatalogGroupTile';

export interface CatalogGroup {
  key: string;
  name: string;
  sims: SectionItem[];
}

interface CatalogGroupGridProps {
  groups: CatalogGroup[];
  tone: 'pack' | 'unit';
  onView: (group: CatalogGroup) => void;
}

/**
 * Tiles for the Sim Packs and Units views. Each tile's heart adds or removes
 * the whole group from My Library.
 */
export const CatalogGroupGrid: React.FC<CatalogGroupGridProps> = ({
  groups,
  tone,
  onView,
}) => {
  const { isGroupInLibrary, isGroupSaving, handleAddGroup, isStartTrial } =
    useCatalogFavorite();

  return (
    <div className="mb-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {groups.map((group) => (
        <CatalogGroupTile
          key={group.key}
          name={group.name}
          simulationCount={group.sims.length}
          tone={tone}
          isInLibrary={isGroupInLibrary(group.sims)}
          canFavorite={!isStartTrial}
          isSaving={isGroupSaving(group.sims)}
          onToggleLibrary={(e) => void handleAddGroup(e, group.sims)}
          onView={() => onView(group)}
        />
      ))}
    </div>
  );
};
