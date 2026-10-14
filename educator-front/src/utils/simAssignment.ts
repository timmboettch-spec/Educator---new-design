import dayjs from 'dayjs';
import type { SimulationItem, SimulationReport } from '@/types';

/** Assignment dates arrive as MM-DD-YYYY or ISO (YYYY-MM-DD). */
export const SIM_DATE_FORMATS = ['MM-DD-YYYY', 'YYYY-MM-DD'];

export const parseSimDate = (raw: string | null | undefined) =>
  raw ? dayjs(raw, SIM_DATE_FORMATS) : null;

/** MM-DD-YYYY for display, or '-' when there is no date. */
export const formatSimDate = (raw: string | null | undefined): string =>
  raw ? dayjs(raw, SIM_DATE_FORMATS).format('MM-DD-YYYY') : '-';

/** YYYY-MM-DD (a date input's value), or '' when there is no valid date. */
export const toIsoSimDate = (raw: string | null | undefined): string => {
  const date = parseSimDate(raw);
  return date?.isValid() ? date.format('YYYY-MM-DD') : '';
};

/**
 * The catalog simulation id, falling back to the assignment row id. `||` because the
 * store normalises a missing simulation_id to ''.
 */
export const simIdOf = (sim: Pick<SimulationItem, 'simulation_id' | 'id'>) =>
  String((sim.simulation_id || sim.id) ?? '').trim();

/** The underlying scenario was archived (not the assignment being past its close date). */
export const isSimArchived = (sim: Pick<SimulationItem, 'scenario_status'>) =>
  /archiv/i.test(String(sim.scenario_status ?? ''));

export type AssignmentTimeStatus = 'ongoing' | 'future' | 'past';

/** Where `now` falls relative to the assignment's start and close dates (by day). */
export function getAssignmentTimeStatus(
  startDate: string | undefined,
  endDate: string | undefined,
  now: dayjs.Dayjs
): AssignmentTimeStatus {
  const start = parseSimDate(startDate);
  const end = parseSimDate(endDate);
  if (start && start.isAfter(now, 'day')) return 'future';
  if (end && end.isBefore(now, 'day')) return 'past';
  return 'ongoing';
}

const asRecord = (r: SimulationReport) =>
  r as unknown as Record<string, unknown>;

const normTitle = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

/** True when the report was completed within the assignment's window (or dates are unknown). */
export function reportFallsWithinAssignmentWindow(
  sim: SimulationItem,
  r: SimulationReport
): boolean {
  const start = parseSimDate(sim.start_date);
  const end = parseSimDate(sim.end_date);
  if (!start?.isValid() || !end?.isValid()) return true;

  const raw = asRecord(r);
  const reportDateRaw =
    raw['completed_at'] ??
    raw['scenarioEndTime'] ??
    raw['createdAt'] ??
    raw['created_at'] ??
    raw['scenarioStartTime'];
  const reportDate =
    typeof reportDateRaw === 'string' ? dayjs(reportDateRaw) : null;
  if (!reportDate?.isValid()) return true;

  return !reportDate.isBefore(start, 'day') && !reportDate.isAfter(end, 'day');
}

/** The class's reports for one assignment: in its window, matched by sim id or title. */
export function getReportsForSim(
  sim: SimulationItem,
  reports: SimulationReport[]
): SimulationReport[] {
  const simId = simIdOf(sim);
  const simTitle = normTitle(sim.simulation_title ?? '');
  const simLibName = normTitle(sim.simulation_lib_name ?? '');

  return reports.filter((r) => {
    if (!reportFallsWithinAssignmentWindow(sim, r)) return false;

    const raw = asRecord(r);
    const reportSimId = String(
      raw['scenarioId'] ??
        raw['simulation_id'] ??
        raw['scenario_id'] ??
        raw['class_simulation_id'] ??
        ''
    ).trim();
    if (simId && reportSimId && reportSimId === simId) return true;

    const reportTitle = normTitle(
      String(
        raw['scenarioTitle'] ??
          raw['simulation_name'] ??
          raw['scenario_title'] ??
          ''
      )
    );
    if (reportTitle) {
      if (simTitle && reportTitle === simTitle) return true;
      if (simLibName && reportTitle === simLibName) return true;
    }
    return false;
  });
}

/** One assignment's started / completed / average, as the row shows them. */
export interface SimStats {
  started: number;
  completed: number;
  avgScore: string;
}
