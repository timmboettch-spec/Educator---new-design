import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { normalizeScenarioForStudentRead } from './student-scenario.normalizer';
import { blobFieldToString } from 'src/common/utils/blob-field.util';
import { Transcript } from 'src/database/entities';
import type { ReportDetailWithStudentRow } from 'src/common/interfaces';
import { mapRowToReportDetail } from 'src/common/utils/simulation-report.util';
import {
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
  SimulationReportRepository,
  SimulationV2Repository,
  StudentRepository,
  TranscriptRepository,
  UnitRepository,
} from 'src/database/repositories';

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
    @Inject(SIMULATION_REPORT_REPOSITORY)
    private readonly reportRepo: SimulationReportRepository,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(UNIT_REPOSITORY)
    private readonly unitRepository: UnitRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repository: SimulationV2Repository,
    @Inject(TRANSCRIPT_REPOSITORY)
    private readonly transcriptRepository: TranscriptRepository,
  ) { }

  private reportFromDbRow(row: ReportDetailWithStudentRow): BlobReport {
    return { ...mapRowToReportDetail(row) };
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
    if (StudentReportsService.UUID_REGEX.test(studentKey)) {
      const byUuid = await this.studentRepo.findClassNameRowById(studentKey);
      if (byUuid) {
        return byUuid;
      }
    }

    return this.studentRepo.findClassNameRowByCode(studentKey);
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
    const row = await this.reportRepo.findDetailRowByIdOrReportId(id);
    if (!row) return null;
    return { report: this.reportFromDbRow(row), dbStudentId: row.studentId };
  }

  private async attachTranscript(report: BlobReport): Promise<BlobReport> {
    const transcriptId = blobFieldToString(
      report['transcriptId'] ?? report['transcript_id'],
    ).trim();
    const scenarioId = blobFieldToString(report['scenarioId'] ?? report['scenario_id']).trim();

    let transcript: Transcript | null = null;
    if (transcriptId) {
      const found = await this.transcriptRepository.findByBusinessId(transcriptId);
      transcript = found ? { ...found } : null;
    }

    const scenarioRaw = scenarioId
      ? await this.simulationV2Repository.findByBusinessId(scenarioId)
      : null;
    const scenario = scenarioRaw
      ? normalizeScenarioForStudentRead(scenarioRaw as unknown as Record<string, unknown>)
      : null;

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
    const row = await this.reportRepo.findDetailRowByTranscriptId(transcriptId);
    if (!row) {
      throw new NotFoundException(`Report for transcript ${transcriptId} not found`);
    }

    const enriched = await this.enrichReportWithStudentContext(
      this.reportFromDbRow(row),
      row.studentId,
    );
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
    const log = await this.transcriptRepository.findByBusinessId(id);
    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }
    return { ...log };
  }

  async getScenarioById(id: string): Promise<BlobReport> {
    const scenarioRaw = await this.simulationV2Repository.findByBusinessId(id);
    if (!scenarioRaw) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }
    const scenario = normalizeScenarioForStudentRead(
      scenarioRaw as unknown as Record<string, unknown>,
    );

    const unitId = blobFieldToString(scenario['unitId'] ?? scenario['unit_id']).trim();
    const unitEntity = unitId ? await this.unitRepository.findByBusinessId(unitId) : null;
    const unit = unitEntity
      ? {
        id: unitEntity.id,
        name: unitEntity.name,
        imageUrl: unitEntity.imageUrl ?? null,
        category: unitEntity.category ?? null,
        actionGroupName: unitEntity.actionGroupName ?? null,
        actionGroupDescription: unitEntity.actionGroupDescription ?? null,
        actions: unitEntity.actions ?? [],
      }
      : null;

    return {
      ...scenario,
      ...(unit ? { unit } : {}),
    };
  }
}
