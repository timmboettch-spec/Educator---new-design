import { Test } from '@nestjs/testing';
import { LogsService } from '@/modules/logs/logs.service';
import type { CreateLogDto } from '@/modules/logs/dto/create-log.dto';
import type { UpdateLogDto } from '@/modules/logs/dto/update-log.dto';
import { NotFoundException } from '@nestjs/common';
import { LifecycleTelemetryService } from '@/modules/telemetry/lifecycle-telemetry.service';
import { LoggerService } from 'src/common/services';
import { SIMULATION_V2_REPOSITORY, TRANSCRIPT_REPOSITORY } from 'src/database/tokens';
import type { Transcript } from 'src/database/entities';
import { ForbiddenException } from '@nestjs/common';
import { ScenariosService } from '@/modules/scenarios/scenarios.service';
import type { ICurrentUser } from 'src/common/interfaces';

describe('LogsService', () => {
  let service: LogsService;
  let transcriptRepository: {
    create: jest.Mock;
    find: jest.Mock;
    findByBusinessId: jest.Mock;
    findByScenarioId: jest.Mock;
    updateByBusinessId: jest.Mock;
  };
  let simulationV2Repository: {
    findByBusinessId: jest.Mock;
  };
  let scenariosService: { assertScenarioAssigned: jest.Mock };
  const currentUser = { userId: 'REP-1', type: 'student' } as ICurrentUser;

  beforeEach(async () => {
    transcriptRepository = {
      create: jest.fn(),
      find: jest.fn(),
      findByBusinessId: jest.fn(),
      findByScenarioId: jest.fn(),
      updateByBusinessId: jest.fn(),
    };

    simulationV2Repository = {
      findByBusinessId: jest
        .fn()
        .mockResolvedValue({ title: 'Test Scenario', metadata: { version: '1.0' } }),
    };

    scenariosService = { assertScenarioAssigned: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LogsService,
        { provide: ScenariosService, useValue: scenariosService },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repository },
        { provide: TRANSCRIPT_REPOSITORY, useValue: transcriptRepository },
        { provide: LifecycleTelemetryService, useValue: {} },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(LogsService);
  });

  describe('create', () => {
    it('should create and return a log with required fields', async () => {
      transcriptRepository.create.mockImplementation((data: Partial<Transcript>) =>
        Promise.resolve(data as Transcript),
      );

      const dto = {
        scenarioId: 'scenario-1',
      };

      const result = await service.create(currentUser, dto as unknown as CreateLogDto);

      expect(result.id).toMatch(/^\d+-[a-z0-9]+$/);
      expect(result).toMatchObject({
        scenarioId: 'scenario-1',
        userId: currentUser.userId,
        messages: [],
      });

      expect(transcriptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: result.id,
          scenarioId: 'scenario-1',
        }),
      );
    });

    it('should include optional student fields when provided', async () => {
      transcriptRepository.create.mockImplementation((data: Partial<Transcript>) =>
        Promise.resolve(data as Transcript),
      );

      const dto = {
        scenarioId: 'scenario-1',
        studentName: 'John',
        studentKey: 'S123',
        studentClass: '10A',
      };

      const result = await service.create(currentUser, dto as unknown as CreateLogDto);

      expect(result.studentName).toBe('John');
      expect(result.studentKey).toBe('S123');
      expect(result.studentClass).toBe('10A');
    });

    it('checks the scenario is assigned before creating the log', async () => {
      scenariosService.assertScenarioAssigned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.create(currentUser, { scenarioId: 'scenario-9' } as unknown as CreateLogDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(scenariosService.assertScenarioAssigned).toHaveBeenCalledWith(
        currentUser,
        'scenario-9',
      );
      expect(transcriptRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all transcripts', async () => {
      const transcripts = [{ id: '1' }, { id: '2' }];
      transcriptRepository.find.mockResolvedValue(transcripts);

      const result = await service.findAll();

      expect(result).toBe(transcripts);
      expect(transcriptRepository.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return transcript by id', async () => {
      const transcript = { id: 'log-1' };
      transcriptRepository.findByBusinessId.mockResolvedValue(transcript);

      const result = await service.findOne('log-1');

      expect(result).toBe(transcript);
      expect(transcriptRepository.findByBusinessId).toHaveBeenCalledWith('log-1');
    });
  });

  describe('update', () => {
    it('should update messages when log exists', async () => {
      const existingLog = { id: 'log-1', messages: [] };
      transcriptRepository.findByBusinessId.mockResolvedValue(existingLog);

      const dto = { messages: [{ speaker: 'user', text: 'hi' }] };
      transcriptRepository.updateByBusinessId.mockResolvedValue({
        id: 'log-1',
        messages: dto.messages,
      });

      await service.update('log-1', dto as unknown as UpdateLogDto);

      expect(transcriptRepository.updateByBusinessId).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({ messages: dto.messages }),
      );
    });

    it('should throw NotFoundException when log does not exist', () => {
      transcriptRepository.findByBusinessId.mockResolvedValue(null);

      return expect(service.update('missing', {} as unknown as UpdateLogDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('endLog', () => {
    it('should set endedAt when log exists', async () => {
      const log = { id: 'log-1' };
      transcriptRepository.findByBusinessId.mockResolvedValue(log);
      transcriptRepository.updateByBusinessId.mockResolvedValue({
        id: 'log-1',
        endedAt: new Date().toISOString(),
      });

      await service.endLog('log-1');

      expect(transcriptRepository.updateByBusinessId).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({ endedAt: expect.any(String) }),
      );
    });

    it('should not re-write when log already ended (idempotent)', async () => {
      const log = { id: 'log-1', endedAt: '2026-01-01T00:00:00.000Z' };
      transcriptRepository.findByBusinessId.mockResolvedValue(log);

      const result = await service.endLog('log-1');

      expect(result).toBe(log);
      expect(transcriptRepository.updateByBusinessId).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when log does not exist', () => {
      transcriptRepository.findByBusinessId.mockResolvedValue(null);
      return expect(service.endLog('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByScenario', () => {
    it('should return logs matching scenarioId', async () => {
      const transcripts = [
        { id: '1', scenarioId: 'A' },
        { id: '3', scenarioId: 'A' },
      ];
      transcriptRepository.findByScenarioId.mockResolvedValue(transcripts);

      const result = await service.findByScenario('A');

      expect(transcriptRepository.findByScenarioId).toHaveBeenCalledWith('A');
      expect(result).toHaveLength(2);
      expect(result.every((log) => log.scenarioId === 'A')).toBe(true);
    });

    it('should return empty array when no logs match', async () => {
      transcriptRepository.findByScenarioId.mockResolvedValue([]);

      const result = await service.findByScenario('X');

      expect(result).toEqual([]);
    });
  });
});
