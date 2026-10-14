import { NotFoundException } from '@nestjs/common';
import { StudentReportsService } from 'src/student-reports/student-reports.service';
import type { ReportDetailWithStudentRow } from 'src/common/interfaces';

describe('StudentReportsService (database-only reads)', () => {
  const row = {
    id: '00000000-0000-4000-8000-000000000001',
    studentId: '00000000-0000-4000-8000-0000000000aa',
    reportId: 'report-1',
    userId: 'STU-001',
    studentCode: 'STU-001',
    studentName: 'Alice',
    studentClass: 'Alice',
    scenarioId: 'sim-1',
    scenarioTitle: 'Cardiac Care',
    transcriptId: 'transcript-1',
    mode: 'Assessment',
    score: 82,
    totalTimeSeconds: 120,
    createdAt: new Date('2026-01-14T09:00:00.000Z'),
    summary: 'Good job',
  } as unknown as ReportDetailWithStudentRow;

  const reportRepo = {
    findDetailRowByIdOrReportId: jest.fn(),
    findDetailRowByTranscriptId: jest.fn(),
  };
  const studentRepo = {
    findClassNameRowById: jest.fn(),
    findClassNameRowByCode: jest.fn(),
  };
  const unitRepo = { findByBusinessId: jest.fn() };
  const simulationV2Repo = { findByBusinessId: jest.fn() };
  const transcriptRepo = { findByBusinessId: jest.fn() };

  const service = new StudentReportsService(
    reportRepo as never,
    studentRepo as never,
    unitRepo as never,
    simulationV2Repo as never,
    transcriptRepo as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    studentRepo.findClassNameRowById.mockResolvedValue({
      student_name: 'Alice Smith',
      student_id: 'STU-001',
      class_id: 'class-1',
      class_name: 'Nursing 101',
    });
    simulationV2Repo.findByBusinessId.mockResolvedValue(null);
    transcriptRepo.findByBusinessId.mockResolvedValue(null);
  });

  it('opens a report by database id or legacy report id and builds it from the columns', async () => {
    reportRepo.findDetailRowByIdOrReportId.mockResolvedValue(row);

    const report = await service.findReportById('report-1');

    expect(reportRepo.findDetailRowByIdOrReportId).toHaveBeenCalledWith('report-1');
    expect(report).toMatchObject({
      id: 'report-1',
      student_id: 'STU-001',
      scenarioId: 'sim-1',
      transcriptId: 'transcript-1',
      score: 82,
      summary: 'Good job',
      // `student_class` equal to the student's name is a placeholder, enriched from the class.
      studentClass: 'Nursing 101',
    });
    expect(report['report_data']).toBeUndefined();
    expect(transcriptRepo.findByBusinessId).toHaveBeenCalledWith('transcript-1');
  });

  it('throws the same NotFoundException for an unknown report id', async () => {
    reportRepo.findDetailRowByIdOrReportId.mockResolvedValue(null);

    await expect(service.findReportById('nope')).rejects.toThrow(
      new NotFoundException('Report with ID nope not found'),
    );
  });

  it('finds a report by transcript id in the database only', async () => {
    reportRepo.findDetailRowByTranscriptId.mockResolvedValue(row);

    const report = await service.findReportByTranscriptId('transcript-1');

    expect(reportRepo.findDetailRowByTranscriptId).toHaveBeenCalledWith('transcript-1');
    expect(report['id']).toBe('report-1');
  });

  it('throws NotFoundException for an unknown transcript id', async () => {
    reportRepo.findDetailRowByTranscriptId.mockResolvedValue(null);

    await expect(service.findReportByTranscriptId('nope')).rejects.toThrow(
      new NotFoundException('Report for transcript nope not found'),
    );
  });

  it('returns the admin report without the attached transcript', async () => {
    reportRepo.findDetailRowByIdOrReportId.mockResolvedValue(row);

    const report = await service.getAdminReportById('report-1');

    expect(report['id']).toBe('report-1');
    expect(report['_transcript']).toBeUndefined();
    expect(transcriptRepo.findByBusinessId).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown admin report id', async () => {
    reportRepo.findDetailRowByIdOrReportId.mockResolvedValue(null);

    await expect(service.getAdminReportById('nope')).rejects.toThrow(NotFoundException);
  });
});
