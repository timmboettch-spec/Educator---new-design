import { describe, expect, it } from 'vitest';
import { UNASSIGNED_SCHOOL } from '../../../src/redux/api/classes/classes.types';
import { ClassSimulationSortField } from '../../../src/redux/api/classSimulations/classSimulations.types';
import {
  buildBulkAssignBody,
  buildClassSimulationsInfiniteArg,
  getApiErrorMessage,
  mapClassSimulationStats,
  mapClassSimulationToSimItem,
} from '../../../src/redux/api/classSimulations/classSimulationsService';

const dto = {
  classSimulationId: 'cs-1',
  simId: 'colostomy-care',
  simName: 'Colostomy Care',
  isArchived: false,
  startDate: '2026-01-01',
  dueDate: '2026-01-15',
  closeDate: '2026-01-31',
  startedCount: 4,
  completedCount: 2,
  averageScore: 78,
  avatarEnabled: true,
  unitId: 'gastrointestinal-care',
  unitName: 'Gastrointestinal Care',
};

describe('buildClassSimulationsInfiniteArg', () => {
  it('keeps the BE default sort when no column is chosen', () => {
    expect(buildClassSimulationsInfiniteArg('class-1')).toEqual({
      classId: 'class-1',
      pageSize: 10,
    });
  });

  it('only sends the direction with a sort column', () => {
    expect(
      buildClassSimulationsInfiniteArg(
        'class-1',
        ClassSimulationSortField.AVERAGE_SCORE,
        'desc'
      )
    ).toEqual({
      classId: 'class-1',
      pageSize: 10,
      sortBy: 'averageScore',
      sortDir: 'desc',
    });
    expect(
      buildClassSimulationsInfiniteArg('class-1', undefined, 'desc')
    ).toEqual({ classId: 'class-1', pageSize: 10 });
  });
});

describe('mapClassSimulationToSimItem', () => {
  it('maps the BE row to the assignment shape the table reads', () => {
    expect(mapClassSimulationToSimItem(dto, 'class-1')).toMatchObject({
      id: 'cs-1',
      simulation_id: 'colostomy-care',
      simulation_title: 'Colostomy Care',
      start_date: '2026-01-01',
      due_date: '2026-01-15',
      end_date: '2026-01-31',
      class_id: 'class-1',
      scenario_status: null,
      avatarEnabled: true,
      unit: 'gastrointestinal-care',
      unit_name: 'Gastrointestinal Care',
    });
  });

  it('marks an archived simulation and blanks missing names, dates and unit', () => {
    expect(
      mapClassSimulationToSimItem(
        {
          ...dto,
          simName: null,
          isArchived: true,
          startDate: null,
          dueDate: null,
          closeDate: null,
          avatarEnabled: null,
          unitId: null,
          unitName: null,
        },
        'class-1'
      )
    ).toMatchObject({
      simulation_title: '',
      scenario_status: 'ARCHIVED',
      start_date: '',
      due_date: '',
      end_date: '',
      avatarEnabled: undefined,
      unit: '',
      unit_name: '',
    });
  });
});

describe('mapClassSimulationStats', () => {
  it('shows the average as a percentage', () => {
    expect(mapClassSimulationStats(dto)).toEqual({
      started: 4,
      completed: 2,
      avgScore: '78%',
    });
  });

  it("shows '-' when no report has a score", () => {
    expect(
      mapClassSimulationStats({ ...dto, averageScore: null }).avgScore
    ).toBe('-');
  });
});

describe('buildBulkAssignBody', () => {
  const values = {
    schoolId: 'school-1',
    classIds: ['class-1'],
    simulationIds: ['colostomy-care', 'stroke-evaluation'],
    startDate: '2026-09-01',
    dueDate: '2026-10-16',
    endDate: '2026-12-15',
  };

  it('sends the form values as the bulk body', () => {
    expect(buildBulkAssignBody(values)).toEqual(values);
  });

  it('always sends the school group id it was given', () => {
    expect(
      buildBulkAssignBody({ ...values, schoolId: UNASSIGNED_SCHOOL }).schoolId
    ).toBe(UNASSIGNED_SCHOOL);
  });

  it('sends only the fields the BE accepts', () => {
    const formValues = { ...values, reduceToken: 5 };
    expect(buildBulkAssignBody(formValues)).toEqual(values);
  });
});

describe('getApiErrorMessage', () => {
  it('reads the BE message from a mutation error, or falls back', () => {
    expect(
      getApiErrorMessage({ data: { message: 'Class is archived' } }, 'Failed')
    ).toBe('Class is archived');
    expect(getApiErrorMessage(new Error('network'), 'Failed')).toBe('Failed');
  });
});
