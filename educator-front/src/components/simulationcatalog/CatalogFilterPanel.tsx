import React from 'react';
import { useTranslation } from 'react-i18next';
import FilterPanel from '@/components/common/FilterPanel';
import type { CatalogFilterControls } from '@/hooks/useCatalogFilters';
import { LIBRARY_FILTER_FIELDS } from '@/utils/libraryFilters';

interface CatalogFilterPanelProps {
  filters: CatalogFilterControls;
  /** id for the panel, matching the filter button's `aria-controls`. */
  panelId: string;
}

/**
 * The catalogue's multi-select filter panel with all seven fields, as in the
 * approved design. Renders nothing while closed.
 */
export const CatalogFilterPanel: React.FC<CatalogFilterPanelProps> = ({
  filters,
  panelId,
}) => {
  const { t } = useTranslation('common');

  if (!filters.isPanelOpen) return null;

  return (
    <div id={panelId}>
      <FilterPanel
        title={t('simulationFilters.panel.title')}
        resetLabel={t('simulationFilters.panel.reset')}
        applyLabel={t('simulationFilters.panel.apply')}
        noFiltersMessage={t('simulationFilters.panel.noneApplied')}
        onClose={filters.closePanel}
        onApply={filters.applyPanel}
        onReset={filters.resetFilters}
        fields={LIBRARY_FILTER_FIELDS.map((field) => ({
          label: filters.fieldLabel(field),
          placeholder: t('simulationFilters.panel.selectPlaceholder', {
            field: filters.fieldLabel(field),
          }),
          multiple: true as const,
          searchable: true,
          options: filters.options[field],
          values: filters.pending[field],
          onValuesChange: (values: string[]) =>
            filters.setPendingField(field, values),
        }))}
      />
    </div>
  );
};
