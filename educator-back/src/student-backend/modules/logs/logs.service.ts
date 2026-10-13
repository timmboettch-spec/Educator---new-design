import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { JsonDataService, type Transcript } from '../../data/json-data.service';
import {
  LIFECYCLE_SCHEMA_VERSION,
  SessionCompletionStatus,
} from '../telemetry/dto/lifecycle-events.dto';
import { LifecycleTelemetryService } from '../telemetry/lifecycle-telemetry.service';

import { type CreateLogDto } from './dto/create-log.dto';
import { type UpdateLogDto } from './dto/update-log.dto';

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    private readonly jsonDataService: JsonDataService,
    private readonly lifecycleTelemetry: LifecycleTelemetryService,
  ) {}

  async create(createLogDto: CreateLogDto) {
    // Generate identifiers
    const transcriptId = this.jsonDataService.generateId();
    const sessionId = LifecycleTelemetryService.generateInstanceId();
    const scenarioInstanceId = LifecycleTelemetryService.generateInstanceId();
    const startedAt = new Date().toISOString();

    const log: Transcript = {
      id: transcriptId,
      userId: createLogDto.userId ?? 'user-1',
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
    };

    this.jsonDataService.addTranscript(log);
    this.logger.log(
      `Created new transcript log with ID: "${log.id}" for scenario: "${createLogDto.scenarioId}"`,
    );
    await this.jsonDataService.flushJson('transcripts.json');

    // Fetch scenario metadata for telemetry
    const scenario = this.jsonDataService.getScenarioById(createLogDto.scenarioId);
    const scenarioName = scenario?.title ?? 'Unknown Scenario';
    const scenarioVersion = scenario?.metadata?.version;
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

  findAll() {
    return this.jsonDataService.getTranscripts();
  }

  async findOne(id: string) {
    return this.jsonDataService.getTranscriptByIdFresh(id);
  }

  async update(id: string, updateLogDto: UpdateLogDto) {
    // Read freshest version from individual blob (works across workers).
    const log = await this.jsonDataService.getTranscriptByIdFresh(id);

    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }

    if (updateLogDto.messages) {
      // Merge messages onto the fresh log object.
      const updatedLog = { ...log, messages: updateLogDto.messages };

      // Write the complete record DIRECTLY to the individual blob.
      // Do NOT use updateTranscriptAndPersist — it reads from the per-process
      // in-memory array cache to find the transcript by id. If a different
      // worker created the transcript, this worker's cache doesn't have it,
      // findIndex returns -1, and the function silently does nothing — no
      // blob write — but update() still returns success to the frontend.
      await this.jsonDataService.persistIndividualBlob(`transcripts/${id}.json`, updatedLog);

      // Patch in-memory array cache as best-effort for same-worker reads.
      this.jsonDataService.updateTranscript(id, {
        messages: updateLogDto.messages,
      });
      await this.jsonDataService.flushJson('transcripts.json');

      this.logger.log(
        `[updateLog] Saved ${updateLogDto.messages.length} messages to blob for transcriptId: "${id}"`,
      );
      return updatedLog;
    }

    return log;
  }

  async endLog(id: string) {
    // Read the freshest version — individual blob has the committed messages.
    const log = await this.jsonDataService.getTranscriptByIdFresh(id);

    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }

    // Idempotency guard: if already ended, return the existing record without
    // re-writing the blob or changing the timestamp. Handles the case where
    // two tabs both call endLog for the same transcript (e.g. both click
    // "End Scenario") — the second call is a safe no-op.
    if (log.endedAt) {
      this.logger.log(
        `[endLog] transcriptId: "${id}" already ended at ${log.endedAt} — skipping (idempotent)`,
      );
      return log;
    }

    const endedAt = new Date().toISOString();

    // Merge endedAt onto the FRESH log (which already has the correct messages).
    const updatedLog = { ...log, endedAt };

    // Write the complete merged record directly to the individual blob.
    // Do NOT use updateTranscriptAndPersist — it reads from the in-memory
    // array cache which is per-process and stale, so it would merge { endedAt }
    // onto messages:[] and overwrite the just-saved messages in the blob.
    await this.jsonDataService.persistIndividualBlob(`transcripts/${id}.json`, updatedLog);

    // Patch ONLY the in-memory array cache — do NOT call updateTranscript here.
    // updateTranscript fires an async persistIndividualBlob using the stale
    // in-memory transcript (which has messages:[]) and would overwrite the
    // correct blob we just wrote above, causing getLog to return 0 messages.
    this.jsonDataService.patchTranscriptInMemory(id, { endedAt });
    await this.jsonDataService.flushJson('transcripts.json');

    this.logger.log(
      `[endLog] Marked transcriptId: "${id}" as ended at ${endedAt} | messages preserved: ${updatedLog.messages?.length ?? 0}`,
    );

    // Emit lifecycle telemetry events
    if (log.sessionId && log.scenarioInstanceId) {
      const durationMs = new Date(endedAt).getTime() - new Date(log.startedAt).getTime();
      const scenario = this.jsonDataService.getScenarioById(log.scenarioId);
      const scenarioName = scenario?.title ?? 'Unknown Scenario';
      const scenarioType = log.scenarioType ?? 'Practice';
      const studentCode = log.studentKey ?? log.studentName ?? log.userId;

      // Emit consolidated Session.Completed event (includes all fields from Session, Scenario, and business events)
      try {
        this.lifecycleTelemetry.emitSessionCompleted({
          sessionId: log.sessionId,
          transcriptId: id,
          scenarioInstanceId: log.scenarioInstanceId,
          scenarioId: log.scenarioId,
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

  findByScenario(scenarioId: string) {
    const transcripts = this.jsonDataService.getTranscripts();
    return transcripts.filter((log: Transcript) => log.scenarioId === scenarioId);
  }

  async appendMessages(id: string, messages: Transcript['messages']) {
    const log = await this.jsonDataService.getTranscriptByIdFresh(id);

    if (!log) {
      throw new NotFoundException(`Log with ID ${id} not found`);
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return log;
    }

    this.jsonDataService.addMessagesToTranscript(id, messages);
    await this.jsonDataService.flushJson('transcripts.json');
    return this.jsonDataService.getTranscriptByIdFresh(id);
  }

  // addMessage(id: string, messageDto: { speaker: string; text: string; timestamp?: string }) {
  //   const log = this.jsonDataService.getTranscriptById(id);

  //   if (!log) {
  //     throw new NotFoundException(`Log with ID ${id} not found`);
  //   }

  //   const message = {
  //     speaker: messageDto.speaker,
  //     text: messageDto.text,
  //     timestamp: messageDto.timestamp || new Date().toISOString()
  //   };

  //   const updatedMessages = [...(log.messages || []), message];
  //   this.jsonDataService.updateTranscript(id, { messages: updatedMessages });

  //   return { success: true, message: 'Message added successfully' };
  // }
}
