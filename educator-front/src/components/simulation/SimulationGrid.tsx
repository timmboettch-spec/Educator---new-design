import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SortableHeader from '../../components/common/SortableHeader';
import SimulationCard from '../../components/simulation/Simulationcard';
import ActionMenu from '../../components/simulation/table/ActionMenu';
import Checkbox from '../ui/Checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import type { Simulation, ViewMode } from '../../types/simulation.types';
import {
  getSimulationAudience,
  getSimulationLevel,
  getSimulationModality,
  getSimulationProduct,
  type LibrarySortField,
  type SortDirection,
} from '@/utils/libraryFilters';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  useSimulationDurationLabel,
  useSimulationValueLabel,
} from '@/hooks/useSimulationValueLabel';

export interface SimulationGridSort {
  field: LibrarySortField | null;
  direction: SortDirection;
  onSort: (field: LibrarySortField) => void;
}

export interface SimulationGridProps {
  /** Already filtered, searched and sorted by the page. */
  simulations: Simulation[];
  viewMode: ViewMode;
  /**
   * Makes the table columns sortable. Without it the columns are plain labels:
   * the paged library is ordered by the BE, which has no sort param yet.
   */
  sort?: SimulationGridSort;
  isSelected: (id: string) => boolean;
  onToggleSelect: (id: string) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelectAll: () => void;
  onAssignClass: (id: string) => void;
  onMoreInfo: (id: string) => void;
  onRemoveFromLibrary: (simulation: Simulation) => void;
  removingId: string | null;
}

// Colours, sizes and spacing follow the approved design's library table.
const DIFFICULTY_STYLES: Record<string, string> = {
  easy: 'bg-green-50 text-green-600',
  medium: 'bg-amber-50 text-amber-600',
  hard: 'bg-red-50 text-red-500',
  expert: 'bg-purple-50 text-purple-600',
};

const PILL_CLASS =
  'inline-block text-xs font-medium px-2.5 py-0.5 rounded-full';

const SORT_COLUMNS = [
  { field: 'title', labelKey: 'table.name' },
  { field: 'learnerLevel', labelKey: 'table.learnerLevel' },
  { field: 'targetAudience', labelKey: 'table.targetAudience' },
  { field: 'modality', labelKey: 'table.modality' },
  { field: 'productName', labelKey: 'table.productName' },
  { field: 'difficulty', labelKey: 'table.difficulty' },
  { field: 'duration', labelKey: 'table.duration' },
] as const satisfies readonly { field: LibrarySortField; labelKey: string }[];

/** Tailwind's `md` breakpoint: the table needs this much room. */
const TABLE_MEDIA_QUERY = '(min-width: 768px)';

const SimulationGrid: React.FC<SimulationGridProps> = ({
  simulations,
  viewMode,
  sort,
  isSelected,
  onToggleSelect,
  allSelected,
  someSelected,
  onToggleSelectAll,
  onAssignClass,
  onMoreInfo,
  onRemoveFromLibrary,
  removingId,
}) => {
  const { t } = useTranslation('simulationLibrary');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const isWide = useMediaQuery(TABLE_MEDIA_QUERY);

  useEffect(() => {
    setOpenMenuId(null);
  }, [viewMode]);

  const valueLabel = useSimulationValueLabel();
  const durationLabel = useSimulationDurationLabel();

  const pill = (value: string, className = 'bg-slate-100 text-slate-600') =>
    value ? (
      <span className={cn(PILL_CLASS, className)}>{value}</span>
    ) : (
      <span className="text-xs text-slate-400">—</span>
    );

  const difficultyPill = (difficulty: string) =>
    pill(
      difficulty ? valueLabel(difficulty) : '',
      DIFFICULTY_STYLES[difficulty.toLowerCase()] ??
        'bg-slate-50 text-slate-500'
    );

  // Avatar sims need no product, so the Product Name column shows a dash.
  const productOf = (sim: Simulation) =>
    getSimulationModality(sim) === 'Avatar' ? '' : getSimulationProduct(sim);

  const sortAriaLabel = (label: string, field: LibrarySortField) => {
    if (sort?.field !== field || !sort.direction) return label;
    return sort.direction === 'asc'
      ? t('table.sortedAscending', { label })
      : t('table.sortedDescending', { label });
  };

  const ariaSort = (
    field: LibrarySortField
  ): React.AriaAttributes['aria-sort'] => {
    if (!sort) return undefined;
    if (sort.field !== field || !sort.direction) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  };

  const renderActionMenu = (sim: Simulation) => (
    <ActionMenu
      id={sim.id}
      open={openMenuId === sim.id}
      onToggle={() => setOpenMenuId(openMenuId === sim.id ? null : sim.id)}
      onAssignClass={() => {
        setOpenMenuId(null);
        onAssignClass(sim.id);
      }}
      onMoreInfo={() => {
        setOpenMenuId(null);
        onMoreInfo(sim.simulation_id ?? sim.id);
      }}
      onRemoveFromLibrary={() => {
        setOpenMenuId(null);
        onRemoveFromLibrary(sim);
      }}
      removingId={removingId}
      fromBundle={sim.fromBundle}
      simulationTitle={sim.title}
      moreInfoId={sim.simulation_id ?? sim.id}
    />
  );

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {simulations.map((sim) => (
          <SimulationCard
            key={sim.id}
            simulation={sim}
            selected={isSelected(sim.id)}
            onToggleSelect={onToggleSelect}
            onAssignClass={onAssignClass}
            onRemoveFromLibrary={onRemoveFromLibrary}
            onMoreInfo={onMoreInfo}
          />
        ))}
      </div>
    );
  }

  const headerCheckbox = (
    <Checkbox
      checked={allSelected}
      indeterminate={someSelected}
      onChange={onToggleSelectAll}
      ariaLabel={t('selection.selectAllVisible')}
      size="sm"
      boxClassName={cn(
        !allSelected && !someSelected && 'bg-white border-white'
      )}
    />
  );

  if (isWide) {
    return (
      // Medium screens and up: the table.
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <Table containerClassName="rounded-none border-0">
          <caption className="sr-only">{t('table.caption')}</caption>
          <TableHeader className="bg-primary-500">
            <TableRow>
              <TableHead className="w-10 text-center">
                <div className="flex justify-center">{headerCheckbox}</div>
              </TableHead>
              {SORT_COLUMNS.map(({ field, labelKey }) => {
                const label = t(labelKey);
                const centered = field !== 'title';
                return (
                  <TableHead
                    key={field}
                    aria-sort={ariaSort(field)}
                    className={centered ? 'text-center' : ''}
                  >
                    <div className={centered ? 'flex justify-center' : ''}>
                      {sort ? (
                        <SortableHeader
                          label={label}
                          field={field}
                          sortField={sort.field}
                          sortDirection={sort.direction}
                          onSort={() => sort.onSort(field)}
                          focusable
                          ariaLabel={sortAriaLabel(label, field)}
                        />
                      ) : (
                        <span className="font-medium">{label}</span>
                      )}
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="text-center">{t('table.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {simulations.map((sim) => {
              const selected = isSelected(sim.id);
              return (
                <TableRow
                  key={sim.id}
                  aria-selected={selected}
                  className="hover:bg-slate-50/60 transition-colors"
                >
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={selected}
                        onChange={() => onToggleSelect(sim.id)}
                        ariaLabel={t('selection.selectSimulation', {
                          title: sim.title.trim(),
                        })}
                        size="sm"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-slate-800 whitespace-nowrap">
                    {sim.title}
                  </TableCell>
                  <TableCell className="text-center">
                    {pill(valueLabel(getSimulationLevel(sim)))}
                  </TableCell>
                  <TableCell className="text-center">
                    {pill(getSimulationAudience(sim))}
                  </TableCell>
                  <TableCell className="text-center">
                    {pill(valueLabel(getSimulationModality(sim)))}
                  </TableCell>
                  <TableCell className="text-center">
                    {pill(productOf(sim))}
                  </TableCell>
                  <TableCell className="text-center">
                    {difficultyPill(sim.difficulty ?? '')}
                  </TableCell>
                  <TableCell className="text-center">
                    {pill(durationLabel(sim.duration ?? ''))}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderActionMenu(sim)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    // Small screens: the same rows stacked, so nothing scrolls sideways.
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 bg-primary-500 rounded-t-2xl text-white text-sm font-semibold">
        {headerCheckbox}
        <span>{t('table.name')}</span>
      </div>
      <ul aria-label={t('table.caption')} className="divide-y divide-gray-100">
        {simulations.map((sim) => {
          const selected = isSelected(sim.id);
          return (
            <li key={sim.id} className="flex items-start gap-3 px-4 py-3">
              <Checkbox
                checked={selected}
                onChange={() => onToggleSelect(sim.id)}
                ariaLabel={t('selection.selectSimulation', {
                  title: sim.title.trim(),
                })}
                className="pt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 break-words">
                  {sim.title}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {getSimulationLevel(sim) &&
                    pill(valueLabel(getSimulationLevel(sim)))}
                  {pill(valueLabel(getSimulationModality(sim)))}
                  {sim.difficulty && difficultyPill(sim.difficulty)}
                  {sim.duration && pill(durationLabel(sim.duration))}
                </div>
              </div>
              {renderActionMenu(sim)}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SimulationGrid;
