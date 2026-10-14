import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SortDir } from '../../../redux/api/classes/classes.types';
import { ClassSimulationSortField } from '../../../redux/api/classSimulations/classSimulations.types';
import { cn } from '../../../lib/utils';
import SortableHeader from '../../common/SortableHeader';

const TH_BASE = 'px-3 py-2.5 font-semibold text-sm';

interface SortState {
  sortKey: ClassSimulationSortField | null;
  sortDir: SortDir | null;
  onSort: (key: ClassSimulationSortField) => void;
}

/** A sortable column: the shared sort button inside the th, with aria-sort on the th. */
function SortableTh({
  field,
  label,
  sort,
  extra,
  isCentered = false,
  className = '',
}: {
  field: ClassSimulationSortField;
  label: string;
  sort: SortState;
  extra?: ReactNode;
  isCentered?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('classManagement');
  const isSorted = sort.sortKey === field;
  const ariaSort = isSorted
    ? sort.sortDir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  return (
    <th
      aria-sort={ariaSort}
      className={cn(TH_BASE, 'whitespace-nowrap', className)}
    >
      <div
        className={cn(
          'flex items-center gap-3',
          isCentered && 'justify-center'
        )}
      >
        <SortableHeader
          label={label}
          field={field}
          focusable
          ariaLabel={t(`table.sortState.${ariaSort}`, { label })}
          sortField={sort.sortKey}
          sortDirection={sort.sortDir}
          onSort={() => sort.onSort(field)}
          className={cn(
            'text-sm font-semibold',
            isCentered && 'justify-center w-full'
          )}
        />
        {extra}
      </div>
    </th>
  );
}

/**
 * Column headers. Every BE-sortable column sorts (status is derived from the
 * dates, so the BE can't sort it); Sim Name also keys the archived dot and
 * stays fixed while the table scrolls sideways.
 */
export function SimsTableHeader(sort: SortState) {
  const { t } = useTranslation('classManagement');
  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-[#5a6475] text-white text-left">
        <SortableTh
          field={ClassSimulationSortField.SIM_NAME}
          label={t('simSubtable.headerSimName')}
          sort={sort}
          className="sticky left-0 z-20 bg-[#5a6475]"
          extra={
            <span className="flex items-center gap-1 text-[10px] font-normal text-white/70">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-full bg-[#e9e9e9] border border-gray-300 inline-block"
              />
              {t('rowActions.archivedSimulation')}
            </span>
          }
        />
        <SortableTh
          field={ClassSimulationSortField.START_DATE}
          label={t('simSubtable.headerStartDate')}
          sort={sort}
        />
        <SortableTh
          field={ClassSimulationSortField.DUE_DATE}
          label={t('simSubtable.headerDueDate')}
          sort={sort}
        />
        <SortableTh
          field={ClassSimulationSortField.CLOSE_DATE}
          label={t('simSubtable.headerCloseDate')}
          sort={sort}
        />
        <th className={`${TH_BASE} whitespace-nowrap`}>
          {t('rowActions.assignmentStatus')}
        </th>
        <SortableTh
          field={ClassSimulationSortField.STARTED_COUNT}
          label={t('simSubtable.headerStarted')}
          sort={sort}
          isCentered
        />
        <SortableTh
          field={ClassSimulationSortField.COMPLETED_COUNT}
          label={t('simSubtable.headerCompleted')}
          sort={sort}
          isCentered
        />
        <SortableTh
          field={ClassSimulationSortField.AVERAGE_SCORE}
          label={t('simSubtable.headerAverage')}
          sort={sort}
          isCentered
        />
        <th className={`${TH_BASE} whitespace-nowrap`}>
          {t('rowActions.reportsTranscripts')}
        </th>
        <th className={TH_BASE}>{t('simSubtable.headerActions')}</th>
      </tr>
    </thead>
  );
}
