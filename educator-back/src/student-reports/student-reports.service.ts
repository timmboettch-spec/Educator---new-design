import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { SimulationReport } from 'src/simulation-reports/entity/simulation-report.entity';
import { Student } from 'src/students/entity/students.entity';
import { normalizeScenarioForStudentRead } from './student-scenario.normalizer';
import { blobFieldToString } from 'src/common/utils/blob-field.util';

type BlobReport = Record<string, unknown>;

type StudentClassRow = {
  student_name: string;
  student_id: string;
  class_id: string;
  class_name: string;
};

type ResolvedReport = {
  report: BlobReport;
  dbStudentId?: string;
};

/**
 * HS-online-shaped reports and transcript API parity.
 * Returns raw JSON — no Educator { status, message, data } wrapper.
 */
@Injectable()
export class StudentReportsService {
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(
    private readonly tutorPatientService: TutorPatientService,
    @InjectRepository(SimulationReport)
    private readonly reportRepo: Repository<SimulationReport>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  private asBlobReport(raw: unknown): BlobReport | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as BlobReport;
  }

  private reportFromDbRow(row: SimulationReport): BlobReport {
    const raw = this.asBlobReport(row.report_data) ?? {};
    return { ...raw };
  }

  private isPlaceholderClassName(value: string, studentName?: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (
      !normalized ||
      normalized === 'student' ||
      normalized === 'learner' ||
      normalized === 'n/a'
    ) {
      return true;
    }
    if (studentName && normalized === studentName.trim().toLowerCase()) {
      return true;
    }
    return false;
  }

  private extractStudentLookupKeys(report: BlobReport, dbStudentId?: string): string[] {
    const keys: string[] = [];
    if (dbStudentId?.trim()) {
      keys.push(dbStudentId.trim());
    }
    for (const field of ['userId', 'user_id', 'studentId', 'student_id', 'key']) {
      const value = blobFieldToString(report[field]).trim();
      if (value) {
        keys.push(value);
      }
    }
    return [...new Set(keys)];
  }

  private async lookupStudentRow(studentKey: string): Promise<StudentClassRow | undefined> {
    const baseQuery = (): SelectQueryBuilder<Student> =>
      this.studentRepo
        .createQueryBuilder('s')
        .leftJoin('classes', 'c', 'c.id = s.class_id')
        .select('s.student_name', 'student_name')
        .addSelect('s.student_id', 'student_id')
        .addSelect('s.class_id', 'class_id')
        .addSelect('c.class_name', 'class_name');

    if (StudentReportsService.UUID_REGEX.test(studentKey)) {
      const byUuid = await baseQuery()
        .where('s.id = :studentId', { studentId: studentKey })
        .limit(1)
        .getRawMany<StudentClassRow>();
      if (byUuid[0]) {
        return byUuid[0];
      }
    }

    const byCode = await baseQuery()
      .where('s.student_id = :studentCode', { studentCode: studentKey })
      .limit(1)
      .getRawMany<StudentClassRow>();
    return byCode[0];
  }

  private async enrichReportWithStudentContext(
    report: BlobReport,
    dbStudentId?: string,
  ): Promise<BlobReport> {
    const lookupKeys = this.extractStudentLookupKeys(report, dbStudentId);
    let studentRow: StudentClassRow | undefined;

    for (const key of lookupKeys) {
      studentRow = await this.lookupStudentRow(key);
      if (studentRow?.class_name) {
        break;
      }
    }

    const studentName = blobFieldToString(report['studentName'] ?? report['student_name']).trim();
    const currentClass = blobFieldToString(report['studentClass']).trim();
    const enriched: BlobReport = { ...report };

    if (studentRow?.class_name) {
      if (this.isPlaceholderClassName(currentClass, studentName)) {
        enriched['studentClass'] = studentRow.class_name;
      }
      if (!studentName || studentName.toLowerCase() === 'student') {
        if (studentRow.student_name) {
          enriched['studentName'] = studentRow.student_name;
        }
      }
      return enriched;
    }

    const blobClass = blobFieldToString(
      report['className'] ?? report['class_name'] ?? report['classTitle'] ?? report['class'],
    ).trim();
    if (blobClass && this.isPlaceholderClassName(currentClass, studentName)) {
      enriched['studentClass'] = blobClass;
    }

    return enriched;
  }

  private async resolveReport(id: string): Promise<ResolvedReport | null> {
    if (StudentReportsService.UUID_REGEX.test(id)) {
      const byUuid = await this.reportRepo.findOne({ where: { id } });
      if (byUuid) {
        return {
          report: this.reportFromDbRow(byUuid),
          dbStudentId: byUuid.student_id,
        };
      }
    }

    const byBlobId = await this.reportRepo
      .createQueryBuilder('r')
      .where(`r.report_data->>'id' = :id`, { id })
      .getOne();
    if (byBlobId) {
      return {
        report: this.reportFromDbRow(byBlobId),
        dbStudentId: byBlobId.student_id,
      };
    }

    const fromBlob = await this.tutorPatientService.getReportByIdFresh(id);
    if (fromBlob) {
      return { report: fromBlob };
    }

    return null;
  }

  private async attachTranscript(report: BlobReport): Promise<BlobReport> {
    const transcriptId = blobFieldToString(
      report['transcriptId'] ?? report['transcript_id'],
    ).trim();
    const scenarioId = blobFieldToString(report['scenarioId'] ?? report['scenario_id']).trim();

    let transcript: Record<string, unknown> | null = null;
    if (transcriptId) {
      transcript = await this.tutorPatientService.getTranscriptByIdFresh(transcriptId);
    }

    const scenarioRaw = scenarioId
      ? await this.tutorPatientService.getScenarioByIdFromMap(scenarioId)
      : null;
    const scenario = scenarioRaw ? normalizeScenarioForStudentRead(scenarioRaw) : null;

    return {
      ...report,
      _transcript: {
        ...(transcript ?? {}),
        scenario: scenario ?? undefined,
      },
    };
  }

  async findReportById(id: string): Promise<BlobReport> {
    const resolved = await this.resolveReport(id);
    if (!resolved) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    const enriched = await this.enrichReportWithStudentContext(
      resolved.report,
      resolved.dbStudentId,
    );
    return this.attachTranscript(enriched);
  }

  async findReportByTranscriptId(transcriptId: string): Promise<BlobReport> {
    let report: BlobReport | null = null;
    let dbStudentId: string | undefined;

    report = await this.tutorPatientService.getReportByTranscriptIdFresh(transcriptId);
    if (!report) {
      const dbReport = await this.reportRepo
        .createQueryBuilder('r')
        .where(`r.report_data->>'transcriptId' = :transcriptId`, { transcriptId })
        .orWhere(`r.report_data->>'transcript_id' = :transcriptId`, { transcriptId })
        .getOne();
      if (dbReport) {
        report = this.reportFromDbRow(dbReport);
        dbStudentId = dbReport.student_id;
      }
    }

    if (!report) {
      throw new NotFoundException(`Report for transcript ${transcriptId} not found`);
    }

    const enriched = await this.enrichReportWithStudentContext(report, dbStudentId);
    return this.attachTranscript(enriched);
  }

  async getAdminReportById(id: string): Promise<BlobReport> {
    const resolved = await this.resolveReport(id);
    if (!resolved) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    try {
      return await this.enrichReportWithStudentContext(resolved.report, resolved.dbStudentId);
    } catch {
      // Enrichment is best-effort — return the raw report if it fails
      return resolved.report;
    }
  }

  async getTranscriptLog(id: string): Promise<BlobReport> {
    const log = await this.tutorPatientService.getTranscriptByIdFresh(id);
    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }
    return log;
  }

  async getScenarioById(id: string, ls?: string): Promise<BlobReport> {
    const scenarioRaw = await this.tutorPatientService.getScenarioByIdFresh(id, ls);
    if (!scenarioRaw) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }
    const scenario = normalizeScenarioForStudentRead(scenarioRaw);

    const unitId = blobFieldToString(scenario['unitId'] ?? scenario['unit_id']).trim();
    const unit = unitId ? await this.tutorPatientService.getUnitById(unitId) : null;

    return {
      ...scenario,
      ...(unit ? { unit } : {}),
    };
  }
}
