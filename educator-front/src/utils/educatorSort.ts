import type { Educator } from '../types';

export type SortableEducatorField = 'full_name' | 'email' | 'school_name' | 'createdAt' | 'totalTokens' | 'tokensUsed' | 'remainingTokens' | 'status' | 'associatedProducts' | 'hardwareHours';
export type EducatorSortDirection = 'asc' | 'desc';

export interface EducatorSortState {
  field: SortableEducatorField;
  direction: EducatorSortDirection;
}

export const DEFAULT_SORT_STATE: EducatorSortState = {
  field: 'createdAt',
  direction: 'desc',
};

const NUMERIC_FIELDS: SortableEducatorField[] = ['totalTokens', 'tokensUsed', 'remainingTokens'];

function getNumericValue(educator: Educator, field: SortableEducatorField): number {
  switch (field) {
    case 'totalTokens': return educator.totalTokens ?? 0;
    case 'tokensUsed': return educator.tokensUsed ?? 0;
    case 'remainingTokens': return educator.remainingTokens ?? 0;
    default: return 0;
  }
}

function getStringValue(educator: Educator, field: SortableEducatorField): string {
  switch (field) {
    case 'full_name':
      return (educator.full_name ?? '').toLowerCase().trim();
    case 'email':
      return (educator.email ?? '').toLowerCase().trim();
    case 'school_name':
      return (educator.school_name ?? '').toLowerCase().trim();
    case 'status':
      return (educator.status ?? '').toLowerCase().trim();
    default:
      return '';
  }
}

function getDateMs(educator: Educator): number {
  if (!educator.createdAt) return 0;
  const ms = Date.parse(educator.createdAt);
  return Number.isNaN(ms) ? 0 : ms;
}

export function sortEducators(
  educators: Educator[],
  field: SortableEducatorField,
  direction: EducatorSortDirection,
): Educator[] {
  return [...educators].sort((a, b) => {
    if (field === 'createdAt') {
      const aMs = getDateMs(a);
      const bMs = getDateMs(b);

      if (!aMs && bMs) return 1;
      if (aMs && !bMs) return -1;
      if (!aMs && !bMs) return 0;

      return direction === 'desc' ? bMs - aMs : aMs - bMs;
    }

    if (NUMERIC_FIELDS.includes(field)) {
      const aNum = getNumericValue(a, field);
      const bNum = getNumericValue(b, field);
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }

    if (field === 'status') {
      const STATUS_PRIORITY: Record<EducatorSortDirection, Record<string, number>> = {
        asc:  { active: 0, pending: 1, inactive: 2 },
        desc: { inactive: 0, pending: 1, active: 2 },
      };
      const priority = STATUS_PRIORITY[direction];
      const aRank = priority[(a.status ?? '').toLowerCase()] ?? 99;
      const bRank = priority[(b.status ?? '').toLowerCase()] ?? 99;
      return aRank - bRank;
    }

    const aVal = getStringValue(a, field);
    const bVal = getStringValue(b, field);

    if (!aVal && bVal) return 1;
    if (aVal && !bVal) return -1;
    if (!aVal && !bVal) return 0;

    const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
    return direction === 'asc' ? cmp : -cmp;
  });
}

export function nextSortState(
  current: EducatorSortState,
  clickedField: string,
): EducatorSortState {
  const field = clickedField as SortableEducatorField;

  if (field === 'status') {
    if (current.field !== field) return { field, direction: 'asc' };
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }

  if (current.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }

  return { field, direction: 'asc' };
}
