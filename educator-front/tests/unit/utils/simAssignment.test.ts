import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { describe, expect, it } from 'vitest';
import type { SimulationItem, SimulationReport } from '../../../src/types';
import {
  formatSimDate,
  getAssignmentTimeStatus,
  getReportsForSim,
  isSimArchived,
  parseSimDate,
  simIdOf,
} from '../../../src/utils/simAssignment';

dayjs.extend(customParseFormat);

const sim = (overrides: Partial<SimulationItem> = {}): SimulationItem =>
  ({
    id: 'assign-1',
    simulation_id: 'lib-1',
    simulation_title: 'Cardiac Care',
    simulation_lib_name: 'Cardiac Care',
    start_date: '2026-01-01',
    due_date: '2026-01-20',
    end_date: '2026-01-31',
    ...overrides,
  }) as SimulationItem;

const report = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'r',
    scenarioId: 'lib-1',
    scenarioTitle: 'Cardiac Care',
    completed_at: '2026-01-10T09:00:00Z',
    mode: 'assessment',
    score: 80,
    userId: 'u1',
    ...overrides,
  }) as unknown as SimulationReport;

describe('simIdOf', () => {
  it('uses the catalog id, falling back to the row id when it is empty', () => {
    expect(simIdOf({ simulation_id: 'lib-1', id: 'a' })).toBe('lib-1');
    expect(simIdOf({ simulation_id: '', id: 'a' })).toBe('a');
  });
});

describe('dates and status', () => {
  it('parses and formats both date formats', () => {
    expect(formatSimDate('2026-01-05')).toBe('01-05-2026');
    expect(formatSimDate('01-05-2026')).toBe('01-05-2026');
    expect(formatSimDate('')).toBe('-');
    expect(parseSimDate(undefined)).toBeNull();
  });

  it('classifies the assignment window against today', () => {
    const now = dayjs('2026-01-15');
    expect(getAssignmentTimeStatus('2026-02-01', '2026-02-28', now)).toBe(
      'future'
    );
    expect(getAssignmentTimeStatus('2025-12-01', '2026-01-10', now)).toBe(
      'past'
    );
    expect(getAssignmentTimeStatus('2026-01-01', '2026-01-31', now)).toBe(
      'ongoing'
    );
  });

  it('detects an archived scenario', () => {
    expect(isSimArchived({ scenario_status: 'ARCHIVED' })).toBe(true);
    expect(isSimArchived({ scenario_status: 'ACTIVE' })).toBe(false);
    expect(isSimArchived({ scenario_status: null })).toBe(false);
  });
});

describe('getReportsForSim', () => {
  it('matches by id or title and keeps only reports inside the window', () => {
    const reports = [
      report({ id: 'by-id' }),
      report({
        id: 'by-title',
        scenarioId: 'other',
        scenarioTitle: 'cardiac-care',
      }),
      report({ id: 'outside', completed_at: '2026-03-01T09:00:00Z' }),
      report({ id: 'other-sim', scenarioId: 'x', scenarioTitle: 'Wound Care' }),
    ];
    expect(getReportsForSim(sim(), reports).map((r) => r.id)).toEqual([
      'by-id',
      'by-title',
    ]);
  });
});
