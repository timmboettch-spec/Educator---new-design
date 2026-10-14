import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { HttpException } from '@nestjs/common';
import { AdminService } from '@/modules/admin/admin.service';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import { LoggerService } from 'src/common/services';
import { AzureBlobService } from 'src/common/services/azure-blob.service';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
import {
  SIMULATION_ACTION_REPOSITORY,
  SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
  SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
  SIMULATION_ORDER_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
  VOICE_PROFILE_REPOSITORY,
} from 'src/database/tokens';
import {
  createMockDataSource,
  createMockSimulationChildRepository,
  createMockSimulationOrderLinkedActionRepository,
  createMockUnitRepository,
  createStatefulMockSimulationRepository,
} from '../../common/utils/mock-factory';

const ACTIVE_VOICE = '3f2b8c1e-5d4a-4b6f-8a7c-1e2d3c4b5a69';
const RETIRED_VOICE = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

/**
 * createDraftVersion's new-draft branch builds the row from the request body, so it must run the
 * same voice check createScenario/updateScenario do. The REAL VoiceProfilesService runs here, over
 * a mocked repository, so the 400s are produced by the production validator.
 */
describe('AdminService.createDraftVersion voice validation', () => {
  let service: AdminService;
  let simulationRepository: ReturnType<typeof createStatefulMockSimulationRepository>;
  let voiceRepo: { findActiveById: jest.Mock };

  beforeEach(async () => {
    simulationRepository = createStatefulMockSimulationRepository();
    voiceRepo = {
      findActiveById: jest.fn((id: string) =>
        Promise.resolve(id === ACTIVE_VOICE ? { voiceProfileId: id, displayName: 'Stock' } : null),
      ),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        VoiceProfilesService,
        { provide: VOICE_PROFILE_REPOSITORY, useValue: voiceRepo },
        { provide: AzureBlobService, useValue: {} },
        { provide: AudioNormalizerService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'voice-profiles') } },
        {
          provide: LoggerService,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: createMockDataSource({ simulationRepository }),
        },
        { provide: UNIT_REPOSITORY, useValue: createMockUnitRepository() },
        {
          provide: ClassSimulationService,
          useValue: { recalculateSeatsForSimulationChange: jest.fn() },
        },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepository },
        { provide: SIMULATION_ACTION_REPOSITORY, useValue: createMockSimulationChildRepository() },
        { provide: SIMULATION_ORDER_REPOSITORY, useValue: createMockSimulationChildRepository() },
        {
          provide: SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
          useValue: createMockSimulationOrderLinkedActionRepository(),
        },
        {
          provide: SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
          useValue: createMockSimulationChildRepository(),
        },
        { provide: TRANSCRIPT_REPOSITORY, useValue: { find: jest.fn() } },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: { findDetailRowByReportId: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
    simulationRepository.__reset();
    simulationRepository.__seed({
      id: 'sc-1',
      title: 'Parent',
      status: 'published',
      versionNumber: 1,
    });
    jest.clearAllMocks();
  });

  const statusOf = async (promise: Promise<unknown>): Promise<number | undefined> =>
    promise.then(
      () => undefined,
      (error: unknown) => (error instanceof HttpException ? error.getStatus() : 500),
    );

  it('400s a new draft carrying a retired/unknown voice and saves nothing', async () => {
    const status = await statusOf(
      service.createDraftVersion('sc-1', { voiceProfileId: RETIRED_VOICE }),
    );
    expect(status).toBe(400);
    expect(simulationRepository.create).not.toHaveBeenCalled();
  });

  it('400s (not 500) a new draft carrying a non-UUID voice id, without querying the database', async () => {
    const status = await statusOf(
      service.createDraftVersion('sc-1', { voiceProfileId: 'not-a-uuid' }),
    );
    expect(status).toBe(400);
    expect(voiceRepo.findActiveById).not.toHaveBeenCalled();
    expect(simulationRepository.create).not.toHaveBeenCalled();
  });

  it('saves a new draft carrying an active voice', async () => {
    await service.createDraftVersion('sc-1', { voiceProfileId: ACTIVE_VOICE });
    // The write also asks the repository to share-lock that voice row inside its transaction, so
    // a concurrent retire cannot slip in between this validation and the insert.
    expect(simulationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sc-1-draft', voiceProfileId: ACTIVE_VOICE }),
      { lockVoiceProfileId: ACTIVE_VOICE },
    );
  });

  it('saves a new draft with no voice at all', async () => {
    await service.createDraftVersion('sc-1', {});
    expect(simulationRepository.create).toHaveBeenCalledTimes(1);
  });

  it('still validates through updateScenario when the draft already exists', async () => {
    simulationRepository.__seed({
      id: 'sc-1-draft',
      title: 'Draft',
      status: 'draft',
      parentScenarioId: 'sc-1',
      versionNumber: 2,
    });
    const status = await statusOf(
      service.createDraftVersion('sc-1', { voiceProfileId: RETIRED_VOICE }),
    );
    expect(status).toBe(400);
    expect(simulationRepository.updateById).not.toHaveBeenCalled();

    await service.createDraftVersion('sc-1', { voiceProfileId: ACTIVE_VOICE });
    expect(simulationRepository.updateById).toHaveBeenCalledTimes(1);
    expect(simulationRepository.updateById).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ voiceProfileId: ACTIVE_VOICE }),
      { lockVoiceProfileId: ACTIVE_VOICE },
    );
  });

  it('keeps the voice on the authenticated admin scenario read (only the public link drops it)', async () => {
    simulationRepository.__seed({
      id: 'sc-voice',
      title: 'With voice',
      status: 'published',
      voiceProfileId: ACTIVE_VOICE,
    });
    const result = await service.getScenarioByIdForController('sc-voice');
    expect(result.voiceProfileId).toBe(ACTIVE_VOICE);
    expect(result.voiceProfile).toEqual({
      id: ACTIVE_VOICE,
      displayName: 'Stock',
      source: 'scenario',
    });
  });
});
