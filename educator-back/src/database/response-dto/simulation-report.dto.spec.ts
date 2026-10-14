import { SimulationReportResponseDto } from './simulation-report.dto';
import { emptyReportEntryColumns } from '../../../tests/test-data/simulation-report.fixture';

describe('SimulationReportResponseDto', () => {
  it('is a constructible class (value import resolves)', () => {
    expect(new SimulationReportResponseDto()).toBeInstanceOf(SimulationReportResponseDto);
  });

  it('accepts every field defined on the SimulationReport entity', () => {
    const dto: SimulationReportResponseDto = {
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      studentId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      studentName: 'Ava Thompson',
      scenarioId: 'cardiac-arrest-101',
      viewedAt: new Date('2026-01-01T00:00:00.000Z'),
      viewedBy: '9b2e1a34-1111-4f2a-8b3c-2c963f66afa6',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...emptyReportEntryColumns(),
    };

    expect(dto.id).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(dto.viewedAt).toBeInstanceOf(Date);
  });

  it('allows viewed_at/viewed_by to be null (toggleable, per RE-38)', () => {
    const dto: SimulationReportResponseDto = {
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      studentId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      studentName: 'Ava Thompson',
      scenarioId: 'cardiac-arrest-101',
      viewedAt: null,
      viewedBy: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...emptyReportEntryColumns(),
    };

    expect(dto.viewedAt).toBeNull();
    expect(dto.viewedBy).toBeNull();
  });
});
