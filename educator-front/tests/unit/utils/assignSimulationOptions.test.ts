import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import type { Class } from '../../../src/types/Class_types';
import {
  buildSimulationOptions,
  findAssignmentConflict,
  getSeatShortfall,
  isLearnerLevel,
  isSimulationModality,
  toAssignableStartDate,
  toAssignContextClass,
} from '../../../src/utils/assignSimulationOptions';

const cls = (overrides: Partial<Class> = {}): Class => ({
  id: 'class-1',
  class_name: 'Biology',
  school_id: 'school-1',
  school_name: 'North High',
  status: 'ACTIVE',
  start_date: '2026-09-01',
  end_date: '2026-12-15',
  ...overrides,
});

const sim = (overrides: Partial<Simulation> = {}): Simulation => ({
  id: 'colostomy-care',
  simulation_id: 'colostomy-care',
  title: 'Colostomy Care',
  name: 'Colostomy Care',
  unit: 'u1',
  unit_name: 'Gastro',
  duration: '',
  image: '',
  description: '',
  assigned: false,
  rating: 0,
  difficulty: '',
  learnerLevel: 'Secondary',
  avatarEnabled: false,
  ...overrides,
});

const seats = (total: number, available: number) => ({
  total,
  consumed: total - available,
  available,
  invalidatedAt: null,
});

describe('assignSimulationOptions', () => {
  it('maps a class-table row to the class the modal opens from', () => {
    expect(toAssignContextClass(cls({ studentsCount: 12 }))).toEqual({
      id: 'class-1',
      name: 'Biology',
      startDate: '2026-09-01',
      endDate: '2026-12-15',
      studentsCount: 12,
      schoolId: 'school-1',
      schoolName: 'North High',
    });
  });

  it('uses the no-school group for a class without a school', () => {
    const context = toAssignContextClass(
      cls({ school_id: undefined, school_name: 'No School', students: [] })
    );
    expect(context.schoolId).toBe('unassigned');
    expect(context.schoolName).toBe('No School');
    expect(context.studentsCount).toBe(0);
  });

  it('filters simulations by modality and learner level, A–Z', () => {
    const sims = [
      sim({ id: 'b', title: 'Bravo', avatarEnabled: true }),
      sim({ id: 'a', title: 'Alpha' }),
      sim({ id: 'c', title: 'Charlie', learnerLevel: 'Post-Secondary' }),
    ];
    expect(buildSimulationOptions(sims).map((o) => o.value)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(
      buildSimulationOptions(sims, {
        modality: 'Avatar',
        learnerLevel: '',
      }).map((o) => o.value)
    ).toEqual(['b']);
    expect(
      buildSimulationOptions(sims, {
        modality: 'Workstation',
        learnerLevel: 'Secondary',
      }).map((o) => o.value)
    ).toEqual(['a']);
  });

  it('reads the learner level from the target audience too, as the library does', () => {
    const sims = [
      sim({
        id: 'a',
        learnerLevel: '',
        targetAudience: 'High school students',
      }),
      sim({ id: 'b', learnerLevel: 'Nursing students' }),
      sim({ id: 'c', learnerLevel: '', targetAudience: '' }),
    ];
    const ids = (learnerLevel: 'Secondary' | 'Post-Secondary') =>
      buildSimulationOptions(sims, { modality: '', learnerLevel }).map(
        (o) => o.value
      );
    expect(ids('Secondary')).toEqual(['a']);
    expect(ids('Post-Secondary')).toEqual(['b']);
  });

  it('recognises only the known filter values', () => {
    expect(isSimulationModality('Avatar')).toBe(true);
    expect(isSimulationModality('avatar')).toBe(false);
    expect(isLearnerLevel('Post-Secondary')).toBe(true);
    expect(isLearnerLevel('')).toBe(false);
  });

  describe('getSeatShortfall', () => {
    const avatar = [sim({ avatarEnabled: true })];

    it('needs one seat per student per avatar simulation', () => {
      expect(getSeatShortfall(avatar, [10, 5], seats(20, 14))).toEqual({
        kind: 'insufficient',
        remaining: 14,
        needed: 15,
      });
      expect(getSeatShortfall(avatar, [10, 5], seats(20, 15))).toBeNull();
    });

    it('reports no avatar product when the educator has no seats at all', () => {
      expect(getSeatShortfall(avatar, [10], seats(0, 0))).toEqual({
        kind: 'noProduct',
      });
    });

    it('skips workstation-only selections, no classes, or unknown seats', () => {
      expect(getSeatShortfall([sim()], [10], seats(0, 0))).toBeNull();
      expect(getSeatShortfall(avatar, [], seats(0, 0))).toBeNull();
      expect(getSeatShortfall(avatar, [10], null)).toBeNull();
    });
  });

  describe('findAssignmentConflict', () => {
    const today = dayjs('2026-10-07');

    it('is active while the existing assignment is still open', () => {
      expect(
        findAssignmentConflict(
          [{ simulation_id: 'colostomy-care', end_date: '10-20-2026' }],
          ['colostomy-care'],
          today
        )
      ).toBe('active');
    });

    it("is still active on the existing assignment's end date", () => {
      expect(
        findAssignmentConflict(
          [{ simulation_id: 'colostomy-care', end_date: '2026-10-07' }],
          ['colostomy-care'],
          today
        )
      ).toBe('active');
    });

    it('is previous once the existing assignment has closed', () => {
      expect(
        findAssignmentConflict(
          [{ simulation_id: 'colostomy-care', end_date: '2026-09-30' }],
          ['stroke', 'colostomy-care'],
          today
        )
      ).toBe('previous');
    });

    it('is null when none of the simulations is assigned', () => {
      expect(
        findAssignmentConflict(
          [{ simulation_id: 'colostomy-care', end_date: '2026-10-20' }],
          ['stroke'],
          today
        )
      ).toBeNull();
    });
  });

  it('moves a passed start date up to today', () => {
    const today = dayjs('2026-10-07');
    expect(toAssignableStartDate('09-01-2026', today)).toBe('2026-10-07');
    expect(toAssignableStartDate('2026-11-01', today)).toBe('2026-11-01');
    expect(toAssignableStartDate(undefined, today)).toBe('');
  });
});
