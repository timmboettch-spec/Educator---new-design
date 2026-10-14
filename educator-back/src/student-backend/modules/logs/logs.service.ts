import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { LoggerService } from '../../../common/services';
import { generateLegacyId } from 'src/common/utils/uuid.util';
import { SimulationV2Repository } from '../../../database/repositories/simulation-v2.repository';
import { TranscriptRepository } from '../../../database/repositories/transcript.repository';
import { SIMULATION_V2_REPOSITORY, TRANSCRIPT_REPOSITORY } from '../../../database/tokens';
import { ICurrentUser, TranscriptMessage } from '../../../common/interfaces';
import { ScenariosService } from '../scenarios/scenarios.service';
import {
  LIFECYCLE_SCHEMA_VERSION,
  SessionCompletionStatus,
} from '../telemetry/dto/lifecycle-events.dto';
import { LifecycleTelemetryService } from '../telemetry/lifecycle-telemetry.service';

import { type CreateLogDto } from './dto/create-log.dto';
import { type UpdateLogDto } from './dto/update-log.dto';

@Injectable()
export class LogsService {
  constructor(
    @Inject(TRANSCRIPT_REPOSITORY)
    private readonly transcriptRepository: TranscriptRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repository: SimulationV2Repository,
    private readonly lifecycleTelemetry: LifecycleTelemetryService,
    private readonly logger: LoggerService,
    private readonly scenariosService: ScenariosService,
  ) {}

  async create(currentUser: ICurrentUser, createLogDto: CreateLogDto) {
    await this.scenariosService.assertScenarioAssigned(currentUser, createLogDto.scenarioId);

    // Generate identifiers
    const transcriptId = generateLegacyId();
    const sessionId = LifecycleTelemetryService.generateInstanceId();
    const scenarioInstanceId = LifecycleTelemetryService.generateInstanceId();
    const startedAt = new Date().toISOString();

    const log = await this.transcriptRepository.create({
      id: transcriptId,
      userId: currentUser?.userId ?? currentUser?.student_id ?? currentUser.studentId,
      scenarioId: createLogDto.scenarioId,
      sessionId,
      scenarioInstanceId,
      messages: [],
      startedAt,
      ...(createLogDto.loginSessionId && { loginSessionId: createLogDto.loginSessionId }),
      ...(createLogDto.studentName && {
        studentName: createLogDto.studentName,
      }),
      ...(createLogDto.studentKey && { studentKey: createLogDto.studentKey }),
      ...(createLogDto.studentClass && {
        studentClass: createLogDto.studentClass,
      }),
    });

    this.logger.log(
      `Created new transcript log with ID: "${log.id}" for scenario: "${createLogDto.scenarioId}"`,
    );

    // Fetch scenario metadata for telemetry
    const scenario = await this.simulationV2Repository.findByBusinessId(createLogDto.scenarioId);
    const scenarioName = scenario?.title ?? 'Unknown Scenario';
    const scenarioVersion = (scenario?.metadata as { version?: string } | undefined)?.version;
    const scenarioType = log.scenarioType ?? 'Practice';
    const studentCode = log.studentKey ?? log.studentName ?? log.userId;

    // Emit consolidated Session.Started event (includes all fields from Session, Scenario, and business events)
    try {
      this.lifecycleTelemetry.emitSessionStarted({
        sessionId,
        transcriptId,
        scenarioInstanceId,
        scenarioId: createLogDto.scenarioId,
        scenarioName,
        scenarioVersion,
        studentCode,
        scenarioType,
        loginSessionId: createLogDto.loginSessionId,
        startedAtUtc: startedAt,
        schemaVersion: LIFECYCLE_SCHEMA_VERSION,
      });
    } catch (error) {
      this.logger.warn(`Failed to emit Session.Started: ${error}`);
    }

    return log;
  }

  async findAll() {
    return this.transcriptRepository.find();
  }

  async findOne(id: string) {
    return this.transcriptRepository.findByBusinessId(id);
  }

  async update(id: string, updateLogDto: UpdateLogDto) {
    const log = await this.transcriptRepository.findByBusinessId(id);

    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }

    if (updateLogDto.messages) {
      const updatedLog = await this.transcriptRepository.updateByBusinessId(id, {
        messages: updateLogDto.messages,
      });

      this.logger.log(
        `[updateLog] Saved ${updateLogDto.messages.length} messages for transcriptId: "${id}"`,
      );
      return updatedLog;
    }

    return log;
  }

  async endLog(id: string) {
    const log = await this.transcriptRepository.findByBusinessId(id);

    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }

    // Idempotency guard: if already ended, return the existing record without
    // re-writing the row or changing the timestamp. Handles the case where
    // two tabs both call endLog for the same transcript (e.g. both click
    // "End Scenario") — the second call is a safe no-op.
    if (log.endedAt) {
      this.logger.log(
        `[endLog] transcriptId: "${id}" already ended at ${log.endedAt} — skipping (idempotent)`,
      );
      return log;
    }

    const endedAt = new Date().toISOString();

    const updatedLog = await this.transcriptRepository.updateByBusinessId(id, { endedAt });

    this.logger.log(
      `[endLog] Marked transcriptId: "${id}" as ended at ${endedAt} | messages preserved: ${updatedLog?.messages?.length ?? 0}`,
    );

    // Emit lifecycle telemetry events
    if (log.sessionId && log.scenarioInstanceId) {
      const durationMs = new Date(endedAt).getTime() - new Date(log.startedAt).getTime();
      const scenario = log.scenarioId
        ? await this.simulationV2Repository.findByBusinessId(log.scenarioId)
        : null;
      const scenarioName = scenario?.title ?? 'Unknown Scenario';
      const scenarioType = log.scenarioType ?? 'Practice';
      const studentCode = log.studentKey ?? log.studentName ?? log.userId;

      // Emit consolidated Session.Completed event (includes all fields from Session, Scenario, and business events)
      try {
        this.lifecycleTelemetry.emitSessionCompleted({
          sessionId: log.sessionId,
          transcriptId: id,
          scenarioInstanceId: log.scenarioInstanceId,
          // scenarioId is always set at creation time (CreateLogDto.scenarioId is required);
          // the entity column is nullable only because scenario_id also serves as an
          // unconstrained FK-style join key (see transcript.entity.ts).
          scenarioId: log.scenarioId ?? '',
          scenarioName,
          studentCode,
          scenarioType,
          loginSessionId: log.loginSessionId,
          completionStatus: SessionCompletionStatus.Completed,
          durationMs,
          errorCode: undefined, // No error on normal completion
          finalScore: undefined, // Populated when grading is complete
          passingScore: undefined, // Populated when grading is complete
          passedAssessment: undefined, // Populated when grading is complete
          endedAtUtc: endedAt,
          schemaVersion: LIFECYCLE_SCHEMA_VERSION,
        });
      } catch (error) {
        this.logger.warn(`Failed to emit Session.Completed: ${error}`);
      }
    }

    return updatedLog;
  }

  async findByScenario(scenarioId: string) {
    return this.transcriptRepository.findByScenarioId(scenarioId);
  }

  async appendMessages(id: string, messages: TranscriptMessage[]) {
    const log = await this.transcriptRepository.findByBusinessId(id);

    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return log;
    }

    return this.transcriptRepository.updateByBusinessId(id, {
      messages: [...(log.messages ?? []), ...messages],
    });
  }
}
