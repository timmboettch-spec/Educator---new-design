import {
  LibraryLearnerLevel,
  SimulationConstants,
  SimulationScope,
} from '../constants/simulation.constants';
import type { FilterDropdownReqDto } from '../dtos/simulation.dto';
import type { FilterDropdownPage, FilterDropdownParams } from '../interfaces/simulation.interface';
import type { IPaginationMeta } from '../interfaces/pagination.interface';
import { buildPaginationMeta, getPagination } from './pagination.util';
import { buildSimulationVisibleToEducatorsSql } from './simulation-visibility.util';

/** Trims a filter or search text and collapses every run of whitespace into one space. */
export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * The form a filter text is compared in: whitespace collapsed, lower case. Its SQL counterpart is
 * {@link buildNormalizedTextSql}. Both treat the same characters as whitespace (JS `\s`), but case
 * folding is only as alike as `toLowerCase()` and Postgres `LOWER()` are for the database locale,
 * so a title with locale-specific capitals (for example a Turkish `İ`) may not match.
 */
export function normalizeFilterText(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

/**
 * SQL for the Learner Level of a Simulation's audience text column: text mentioning
 * post-secondary (any non-alphanumeric separator, or none: `Post-Secondary`, `Post / Secondary`,
 * `Post–Secondary`) is Post-Secondary; otherwise text mentioning secondary or high school is
 * Secondary; any other non-empty text (for example `BSN`) is Post-Secondary; blank or missing text
 * is NULL, so it matches no level.
 */
export const buildLearnerLevelSql = (column: string): string => `CASE
  WHEN COALESCE(${column}, '') ~ '^[${SimulationConstants.VISIBILITY.TRIMMED_WHITESPACE_CLASS}]*$' THEN NULL
  WHEN LOWER(${column}) ~ 'post[^[:alnum:]]*secondary' THEN '${LibraryLearnerLevel.POST_SECONDARY}'
  WHEN LOWER(${column}) ~ 'secondary|high[${SimulationConstants.VISIBILITY.TRIMMED_WHITESPACE_CLASS}]+school' THEN '${LibraryLearnerLevel.SECONDARY}'
  ELSE '${LibraryLearnerLevel.POST_SECONDARY}'
END`;

/** A text column trimmed with every run of whitespace collapsed to one space, keeping its case. */
export const buildCollapsedTextSql = (column: string): string =>
  `BTRIM(REGEXP_REPLACE(${column}, '[${SimulationConstants.VISIBILITY.TRIMMED_WHITESPACE_CLASS}]+', ' ', 'g'))`;

/** SQL counterpart of {@link normalizeFilterText}: the form a filter compares a text column in. */
export const buildNormalizedTextSql = (column: string): string =>
  `LOWER(${buildCollapsedTextSql(column)})`;

/**
 * The one definition of which Simulations belong to a scope, as a SQL predicate over a joined
 * `simulations_v2` alias. The Catalogue is every live Simulation that educators may see; My Library
 * is the part of it the Educator saved and has not removed. The My Library form reads the bound
 * parameter `:educatorId` (`SimulationConstants.SCOPE.EDUCATOR_PARAM`), so the caller must set it.
 * The result is wrapped in parentheses, so it is safe to combine with `OR`.
 */
export const buildSimulationScopeSql = (scope: SimulationScope, simAlias: string): string => {
  const catalogue = `${simAlias}.deleted_at IS NULL AND ${buildSimulationVisibleToEducatorsSql(`${simAlias}.status`)}`;
  if (scope === SimulationScope.CATALOG) return `(${catalogue})`;
  return `(${catalogue} AND EXISTS (SELECT 1 FROM educator_simulations scope_es WHERE scope_es.scenario_id = ${simAlias}.id AND scope_es.educator_id = :${SimulationConstants.SCOPE.EDUCATOR_PARAM} AND scope_es.deleted_at IS NULL))`;
};

/**
 * A Simulation's learning objectives as a clean list. The column is JSONB holding either one
 * newline-separated text or an array of texts; blank entries are dropped, the rest trimmed.
 */
export function toLearningObjectiveList(value: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : [];
  return parts
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Reads one page of a filter dropdown: turns the request's paging and search box into the query
 * params, runs `read`, and builds the page `meta`. The scope (My Library or Catalogue) is decided
 * by `read`.
 */
export async function readFilterDropdownPage<T>(
  educatorId: string,
  dto: FilterDropdownReqDto,
  read: (params: FilterDropdownParams) => Promise<FilterDropdownPage<T>>,
): Promise<{ items: T[]; meta: IPaginationMeta }> {
  const { page, pageSize, skip, take } = getPagination({
    page: dto.page,
    pageSize: dto.pageSize,
  });
  const { items, total } = await read({
    educatorId,
    search: dto.search === undefined ? undefined : normalizeFilterText(dto.search),
    skip,
    take,
  });
  return { items, meta: buildPaginationMeta(total, page, pageSize) };
}
