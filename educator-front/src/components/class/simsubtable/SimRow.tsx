import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type dayjs from 'dayjs';
import type { SimulationItem } from '@/types';
import { Link2 } from 'lucide-react';
import type {
  ClassLinkageAssignment,
  ClassLinkageProvider,
} from '../../../hooks/useClassLmsLinkage';
import { HoverTip } from '../../ui/HoverTip';
import { LMS_PILL_TONE } from '../../../utils/lmsLinkage';
import { cn } from '../../../lib/utils';
import StatusBadge from '../../ui/StatusBadge';
import type { StatusTone } from '../../../utils/statusTone';
import type { SimDateField } from '../../../redux/api/classSimulations/classSimulationsService';
import {
  getAssignmentTimeStatus,
  isSimArchived,
  type AssignmentTimeStatus,
  type SimStats,
} from '../../../utils/simAssignment';
import { EditableDateCell } from './EditableDateCell';

// Date text by assignment status: dark gray for ongoing, dark orange for
// future, red for past (design: educator-front). The name has its own rule.
// Future uses the Future chip's text orange: the design's #db8833 is only
// 2.77:1 on white, below the 4.5:1 WCAG AA needs for this 14px text.
const DATE_COLOR: Record<AssignmentTimeStatus, string> = {
  ongoing: 'text-[#5f6060]',
  future: 'text-[#a55a12]',
  past: 'text-red-500',
};

const STATUS_TONE: Record<AssignmentTimeStatus, StatusTone> = {
  ongoing: 'success',
  future: 'warning',
  past: 'danger',
};

// The design's compact, uppercase status chip: a light tint with dark same-hue
// text, so small text clears WCAG AA.
const STATUS_CHIP =
  'px-2.5 py-0.5 text-[10px] leading-4 uppercase tracking-wide font-semibold';

const STATUS_CHIP_COLOR: Record<AssignmentTimeStatus, string> = {
  ongoing: 'bg-green-100 text-green-800',
  future: 'bg-[#fbe7d0] text-[#a55a12]',
  past: 'bg-red-100 text-red-800',
};

const STATUS_LABEL_KEY = {
  ongoing: 'simSubtable.statusActive',
  future: 'simSubtable.statusFuture',
  past: 'simSubtable.statusPast',
} as const satisfies Record<AssignmentTimeStatus, string>;

// The three date columns, in table order, with their translated field names.
const DATE_FIELDS = [
  { field: 'start_date', labelKey: 'simSubtable.dateFieldStart' },
  { field: 'due_date', labelKey: 'simSubtable.dateFieldDue' },
  { field: 'end_date', labelKey: 'simSubtable.dateFieldClose' },
] as const satisfies readonly { field: SimDateField; labelKey: string }[];

const STAT_CELL =
  'px-4 py-3 text-base text-center font-semibold text-gray-700 tabular-nums';

interface SimRowProps {
  sim: SimulationItem;
  now: dayjs.Dayjs;
  stats: SimStats | undefined;
  isHighlighted: boolean;
  lmsAssignment?: ClassLinkageAssignment;
  lmsProvider?: ClassLinkageProvider | null;
  isMenuOpen: boolean;
  onOpenReports: (sim: SimulationItem) => void;
  onOpenMenu: (simId: string, anchor: HTMLElement) => void;
  /** Dates are read-only once the class is archived (and on a Past assignment). */
  isClassArchived: boolean;
  /** The date cell of this row being edited, if any. */
  editingDateField: SimDateField | null;
  dateError: string | null;
  isSavingDate: boolean;
  onEditDate: (sim: SimulationItem, field: SimDateField) => void;
  onSaveDate: (sim: SimulationItem, field: SimDateField, value: string) => void;
  onCancelDate: () => void;
}

/** One assignment: title, dates coloured by status, status chip, stats and actions. */
export function SimRow({
  sim,
  now,
  stats,
  isHighlighted,
  lmsAssignment,
  lmsProvider,
  isMenuOpen,
  onOpenReports,
  onOpenMenu,
  isClassArchived,
  editingDateField,
  dateError,
  isSavingDate,
  onEditDate,
  onSaveDate,
  onCancelDate,
}: SimRowProps) {
  const { t } = useTranslation('classManagement');
  const archivedLabel = t('rowActions.archivedSimulation');
  const title = sim.simulation_title || '-';
  const status = getAssignmentTimeStatus(sim.start_date, sim.end_date, now);
  const archived = isSimArchived(sim);
  const dateClass = `px-4 py-3 text-sm font-medium whitespace-nowrap ${DATE_COLOR[status]}`;
  const isCoursework = lmsProvider === 'google_classroom';
  const mappingLabel = lmsAssignment?.label?.trim() ?? '';
  const mappingKind = t(
    isCoursework
      ? 'simSubtable.lmsCourseworkChip'
      : 'simSubtable.lmsAssignmentChip'
  );
  const mappingChip =
    !mappingLabel || mappingLabel.toLowerCase() === title.trim().toLowerCase()
      ? mappingKind
      : mappingLabel;
  const mappingTip = mappingLabel || mappingKind;

  return (
    <tr
      className={cn(
        'border-t border-gray-100 hover:bg-gray-50 transition-colors',
        isHighlighted ? 'bg-[#e9e9e9]' : 'bg-white'
      )}
    >
      {/* Fixed while the table scrolls sideways; takes the row's background.
          Above the other cells but below the sticky header (`thead` is z-10),
          so scrolled rows pass under the Sim Name header. */}
      <td className="sticky left-0 z-[1] bg-inherit px-4 py-3 font-medium">
        <div
          className={cn(
            'flex items-center gap-2 font-medium',
            // Muted but readable: the design's #e9e9e9 is 1.21:1 on white.
            archived ? 'text-gray-500' : 'text-[#5f6060]'
          )}
        >
          {archived && (
            <span
              role="img"
              aria-label={archivedLabel}
              title={archivedLabel}
              className="w-2.5 h-2.5 rounded-full bg-[#e9e9e9] border border-gray-300 inline-block flex-shrink-0"
            />
          )}
          {title}
        </div>
        {lmsAssignment && (
          <HoverTip
            tip={mappingTip}
            href={lmsAssignment?.url ?? undefined}
            className={`mt-1 flex w-fit max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] font-normal ${LMS_PILL_TONE}`}
          >
            <Link2 size={10} aria-hidden="true" className="shrink-0" />
            {mappingChip}
          </HoverTip>
        )}
      </td>
      {DATE_FIELDS.map(({ field, labelKey }) => {
        const isEditing = editingDateField === field;
        return (
          <EditableDateCell
            key={field}
            value={sim[field]}
            fieldLabel={t(labelKey)}
            simTitle={title}
            className={dateClass}
            isEditable={!isClassArchived && status !== 'past'}
            isEditing={isEditing}
            isSaving={isEditing && isSavingDate}
            isDisabled={!isEditing && isSavingDate}
            error={isEditing ? dateError : null}
            onEdit={() => onEditDate(sim, field)}
            onSave={(value) => onSaveDate(sim, field, value)}
            onCancel={onCancelDate}
          />
        );
      })}
      <td className="px-4 py-3">
        <StatusBadge
          tone={STATUS_TONE[status]}
          label={t(STATUS_LABEL_KEY[status])}
          className={cn(STATUS_CHIP, STATUS_CHIP_COLOR[status])}
        />
      </td>
      <td className={STAT_CELL}>
        {stats && stats.started > 0 ? stats.started : '-'}
      </td>
      <td className={STAT_CELL}>
        {stats && stats.completed > 0 ? stats.completed : '-'}
      </td>
      <td className={STAT_CELL}>{stats ? stats.avgScore : '-'}</td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => onOpenReports(sim)}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full font-medium cursor-pointer transition-colors border whitespace-nowrap bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          {t('rowActions.reportsTranscripts')}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          aria-label={t('simSubtable.actionsFor', { title })}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          data-sim-trigger="true"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onOpenMenu(sim.id, e.currentTarget);
          }}
          className="text-gray-500 hover:text-gray-600 text-lg font-bold tracking-widest px-2 py-1 rounded hover:bg-gray-100 transition-colors"
        >
          <span aria-hidden="true">···</span>
        </button>
      </td>
    </tr>
  );
}
