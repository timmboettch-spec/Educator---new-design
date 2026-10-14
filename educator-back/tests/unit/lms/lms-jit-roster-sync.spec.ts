import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';
import { LoggerService } from '../../../src/common/services';
import { LmsClassMapping, Class } from 'src/database/entities';

describe('LmsProvisionService - JIT roster sync', () => {
  let service: LmsProvisionService;
  let findOne: jest.Mock;

  beforeEach(async () => {
    findOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LmsProvisionService,
        {
          provide: DataSource,
          useValue: {
            manager: { findOne, save: jest.fn(), create: jest.fn(), count: jest.fn() },
            transaction: jest.fn(),
            query: jest.fn(),
          },
        },
        {
          provide: LmsRosterService,
          useValue: { fetchRosterWithWsFallback: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: LmsAdapterFactory, useValue: {} },
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

    service = module.get(LmsProvisionService);
  });

  it('returns false when class mapping is missing', async () => {
    findOne.mockResolvedValueOnce(null);

    const synced = await service.syncRosterForMappedCourse({
      schoolId: 'school-1',
      lmsCourseId: '115',
    });

    expect(synced).toBe(false);
    expect(findOne).toHaveBeenCalledWith(LmsClassMapping, {
      where: { schoolId: 'school-1', lmsCourseId: '115' },
    });
  });

  it('returns false when mapped class has no educator', async () => {
    findOne
      .mockResolvedValueOnce({
        classId: 'class-1',
        nrpsUrl: 'https://example.com/nrps',
      } as LmsClassMapping)
      .mockResolvedValueOnce({ id: 'class-1', educator_id: undefined } as Class);

    const synced = await service.syncRosterForMappedCourse({
      schoolId: 'school-1',
      lmsCourseId: '115',
    });

    expect(synced).toBe(false);
  });

  it('calls doProvision for the class educator and returns true', async () => {
    findOne
      .mockResolvedValueOnce({
        classId: 'class-1',
        nrpsUrl: 'https://example.com/nrps',
      } as LmsClassMapping)
      .mockResolvedValueOnce({
        id: 'class-1',
        educator_id: 'educator-1',
      } as Class);

    const doProvision = jest
      .spyOn(
        service as unknown as {
          doProvision: (...args: unknown[]) => Promise<void>;
        },
        'doProvision',
      )
      .mockResolvedValue(undefined);

    const synced = await service.syncRosterForMappedCourse({
      schoolId: 'school-1',
      lmsCourseId: '115',
      nrpsUrl: 'https://launch.example/nrps',
    });

    expect(synced).toBe(true);
    expect(doProvision).toHaveBeenCalledWith(
      'educator-1',
      '115',
      'school-1',
      'https://launch.example/nrps',
      undefined,
      undefined,
      undefined,
      { deactivateMissingLearners: false },
    );
  });

  it('returns false when mapping lookup throws (best-effort)', async () => {
    findOne.mockRejectedValueOnce(new Error('db timeout'));

    const synced = await service.syncRosterForMappedCourse({
      schoolId: 'school-1',
      lmsCourseId: '115',
    });

    expect(synced).toBe(false);
  });
});
