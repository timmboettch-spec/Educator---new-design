import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useClassDerivedData,
  type UseClassDerivedDataParams,
} from '../../../src/hooks/useClassDerivedData';
import type { SimulationReportItem } from '../../../src/redux/simulation/GetSimulationReportsRedux';
import type { Student } from '../../../src/types/Class_types';

const student = (overrides: Partial<Student>): Student => ({
  student_id: null,
  student_name: null,
  email: null,
  score: null,
  ...overrides,
});

const report = (id: string, userId?: string) =>
  ({ id, userId }) as SimulationReportItem;

const renderDerived = (params: Partial<UseClassDerivedDataParams> = {}) =>
  renderHook(() =>
    useClassDerivedData({
      classResponse: null,
      reports: [],
      needAttentionByClassId: {},
      needsAttentionByIdMap: {},
      ...params,
    })
  );

describe('useClassDerivedData', () => {
  it('returns empty data before the class list has loaded', () => {
    const { result } = renderDerived();
    expect(result.current.allClasses).toEqual([]);
    expect(result.current.localNeedsAttentionById).toEqual({});
    expect(result.current.reportsByClassId.size).toBe(0);
  });

  it('defaults missing students and sims to empty lists', () => {
    const { result } = renderDerived({
      classResponse: { data: { classes: [{ id: 'c-1', class_name: 'Bio' }] } },
    });
    expect(result.current.allClasses).toEqual([
      { id: 'c-1', class_name: 'Bio', students: [], sims: [] },
    ]);
  });

  it('prefers the need-attention count, then the id map, then the class flag', () => {
    const { result } = renderDerived({
      classResponse: {
        data: {
          classes: [
            { id: 'count', class_name: 'A', needsAttention: false },
            { id: 'zero', class_name: 'B', needsAttention: true },
            { id: 'map', class_name: 'C', needsAttention: false },
            { id: 'flag', class_name: 'D', needsAttention: true },
          ],
        },
      },
      needAttentionByClassId: { count: 2, zero: 0 },
      needsAttentionByIdMap: { map: true, count: false },
    });
    expect(result.current.localNeedsAttentionById).toEqual({
      count: true,
      zero: false,
      map: true,
      flag: true,
    });
  });

  it("groups reports under the class of each report's student", () => {
    const { result } = renderDerived({
      classResponse: {
        data: {
          classes: [
            {
              id: 'c-1',
              class_name: 'Bio',
              students: [student({ user_id: 'u-1' })],
            },
            {
              id: 'c-2',
              class_name: 'Chem',
              students: [student({ student_id: 'st-2' })],
            },
          ],
        },
      },
      reports: [report('r-1', 'u-1'), report('r-2', 'st-2'), report('r-3')],
    });
    expect(
      result.current.reportsByClassId.get('c-1')?.map((r) => r.id)
    ).toEqual(['r-1']);
    expect(
      result.current.reportsByClassId.get('c-2')?.map((r) => r.id)
    ).toEqual(['r-2']);
  });
});
