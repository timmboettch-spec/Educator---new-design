import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LmsController } from '../../../src/lms/lms.controller';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsConnectService } from '../../../src/lms/services/lms-connect.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { LmsGradeService } from '../../../src/lms/services/lms-grade.service';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';
import { Educator, LmsSchoolConfig } from '../../../src/database/entities';
import { RoleSlug } from '../../../src/common/constants';
import * as types from '../../../src/common/types';

describe('LmsController.getLiveClasses - per-class school context', () => {
  let controller: LmsController;
  let getRawMany: jest.Mock;
  let findOne: jest.Mock;
  let getActiveOptionalBySchoolId: jest.Mock;
  let fetchRosterForLiveEndpoint: jest.Mock;

  const EDUCATOR_ID = '00000000-0000-0000-0000-0000000000ed';
  const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
  const SCHOOL_B = '22222222-2222-2222-2222-222222222222';
  const SCHOOL_C = '33333333-3333-3333-3333-333333333333';
  const URL_A =
    'https://moodle.example.com/mod/lti/services.php/CourseSection/10/bindings/1/memberships';
  const URL_B = 'https://canvas.example.com/api/lti/courses/20/names_and_roles';

  const config = (schoolId: string): LmsSchoolConfig =>
    ({ id: `cfg-${schoolId}`, schoolId }) as LmsSchoolConfig;

  const roster = (contextId: string) => ({
    context: { id: contextId, label: contextId, title: contextId },
    members: [{ userId: `${contextId}-student`, name: 'Student', email: null, roles: [] }],
  });

  const educatorRequest = (): types.JwtRequest =>
    ({
      user: { roles: [RoleSlug.EDUCATOR], educatorId: EDUCATOR_ID },
      headers: {},
    }) as unknown as types.JwtRequest;

  const multiSchoolEducator = (): Educator =>
    ({
      id: EDUCATOR_ID,
      school: { id: SCHOOL_A },
      schoolAssignments: [{ school: { id: SCHOOL_B } }],
    }) as unknown as Educator;

  type LiveClassEntry = {
    nrpsUrl: string;
    schoolId: string | null;
    total: number;
    error?: string;
  };

  const liveClasses = (response: types.ApiResponse): LiveClassEntry[] =>
    (response.data as { classes: LiveClassEntry[] }).classes;

  beforeEach(async () => {
    getRawMany = jest.fn().mockResolvedValue([]);
    findOne = jest.fn().mockResolvedValue(multiSchoolEducator());
    getActiveOptionalBySchoolId = jest.fn((schoolId: string) => Promise.resolve(config(schoolId)));
    fetchRosterForLiveEndpoint = jest.fn((_config, nrpsUrl: string) =>
      Promise.resolve(roster(nrpsUrl === URL_A ? 'course-a' : 'course-b')),
    );

    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LmsController],
      providers: [
        { provide: LmsConfigService, useValue: { getActiveOptionalBySchoolId } },
        { provide: LmsConnectService, useValue: {} },
        { provide: LmsLookupService, useValue: {} },
        { provide: LmsProvisionService, useValue: {} },
        { provide: LmsRosterService, useValue: { fetchRosterForLiveEndpoint } },
        { provide: LmsGradeService, useValue: {} },
        { provide: LmsAdapterFactory, useValue: {} },
        {
          provide: DataSource,
          useValue: {
            createQueryBuilder: jest.fn(() => queryBuilder),
            manager: { findOne },
          },
        },
      ],
    }).compile();

    controller = module.get(LmsController);
  });

  it('UNIT: fetches each mapped class with its own school config', async () => {
    getRawMany.mockResolvedValue([
      { nrpsUrl: URL_A, schoolId: SCHOOL_A },
      { nrpsUrl: URL_B, schoolId: SCHOOL_B },
    ]);

    const result = await controller.getLiveClasses(undefined, educatorRequest());

    expect(getActiveOptionalBySchoolId).toHaveBeenCalledWith(SCHOOL_A);
    expect(getActiveOptionalBySchoolId).toHaveBeenCalledWith(SCHOOL_B);
    expect(fetchRosterForLiveEndpoint).toHaveBeenCalledWith(config(SCHOOL_A), URL_A);
    expect(fetchRosterForLiveEndpoint).toHaveBeenCalledWith(config(SCHOOL_B), URL_B);
    expect(liveClasses(result).map((entry) => entry.schoolId)).toEqual([SCHOOL_A, SCHOOL_B]);
  });

  it('UNIT: resolves the school per class for explicitly requested nrpsUrls', async () => {
    getRawMany.mockResolvedValue([
      { nrpsUrl: URL_B, schoolId: SCHOOL_B },
      { nrpsUrl: URL_A, schoolId: SCHOOL_A },
    ]);

    await controller.getLiveClasses(`${URL_A},${URL_B}`, educatorRequest());

    expect(fetchRosterForLiveEndpoint).toHaveBeenCalledWith(config(SCHOOL_A), URL_A);
    expect(fetchRosterForLiveEndpoint).toHaveBeenCalledWith(config(SCHOOL_B), URL_B);
  });

  it('UNIT: skips a class whose school the educator does not belong to', async () => {
    getRawMany.mockResolvedValue([
      { nrpsUrl: URL_A, schoolId: SCHOOL_A },
      { nrpsUrl: URL_B, schoolId: SCHOOL_C },
    ]);

    const result = await controller.getLiveClasses(undefined, educatorRequest());
    const entries = liveClasses(result);

    expect(fetchRosterForLiveEndpoint).toHaveBeenCalledTimes(1);
    expect(fetchRosterForLiveEndpoint).toHaveBeenCalledWith(config(SCHOOL_A), URL_A);
    expect(getActiveOptionalBySchoolId).not.toHaveBeenCalledWith(SCHOOL_C);
    expect(entries[1].error).toContain('not assigned to the requested school');
    expect(entries[1].total).toBe(0);
  });

  it('UNIT: rejects unmapped nrpsUrls instead of borrowing another school config', async () => {
    getRawMany.mockResolvedValue([{ nrpsUrl: URL_A, schoolId: SCHOOL_A }]);

    await expect(
      controller.getLiveClasses(`${URL_A},${URL_B}`, educatorRequest()),
    ).rejects.toThrow('nrpsUrls must match mapped class NRPS URLs for this educator');
    expect(fetchRosterForLiveEndpoint).not.toHaveBeenCalled();
  });

  it('UNIT: loads the school config once for a single-school educator with two classes', async () => {
    getRawMany.mockResolvedValue([
      { nrpsUrl: URL_A, schoolId: SCHOOL_A },
      { nrpsUrl: URL_B, schoolId: SCHOOL_A },
    ]);

    const result = await controller.getLiveClasses(undefined, educatorRequest());

    expect(getActiveOptionalBySchoolId).toHaveBeenCalledTimes(1);
    expect(fetchRosterForLiveEndpoint).toHaveBeenCalledTimes(2);
    expect(liveClasses(result).every((entry) => entry.schoolId === SCHOOL_A)).toBe(true);
  });
});

describe('LmsController.getLiveStudents - mapped school config', () => {
  let controller: LmsController;
  let getRawMany: jest.Mock;
  let findOne: jest.Mock;
  let getActiveOptionalBySchoolId: jest.Mock;
  let fetchRosterForLiveEndpoint: jest.Mock;

  const EDUCATOR_ID = '00000000-0000-0000-0000-0000000000ed';
  const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
  const NRPS_URL =
    'https://moodle.example.com/mod/lti/services.php/CourseSection/10/bindings/1/memberships';

  const educatorRequest = (): types.JwtRequest =>
    ({
      user: { roles: [RoleSlug.EDUCATOR], educatorId: EDUCATOR_ID },
      headers: {},
    }) as unknown as types.JwtRequest;

  beforeEach(async () => {
    getRawMany = jest.fn().mockResolvedValue([{ nrpsUrl: NRPS_URL, schoolId: SCHOOL_A }]);
    findOne = jest.fn().mockResolvedValue({
      id: EDUCATOR_ID,
      school: { id: SCHOOL_A },
      schoolAssignments: [],
    } as Educator);
    getActiveOptionalBySchoolId = jest.fn().mockResolvedValue({ schoolId: SCHOOL_A } as LmsSchoolConfig);
    fetchRosterForLiveEndpoint = jest.fn().mockResolvedValue({
      context: { id: 'ctx-1', label: null, title: null },
      members: [],
    });

    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LmsController],
      providers: [
        { provide: LmsConfigService, useValue: { getActiveOptionalBySchoolId } },
        { provide: LmsConnectService, useValue: {} },
        { provide: LmsLookupService, useValue: {} },
        { provide: LmsProvisionService, useValue: {} },
        { provide: LmsRosterService, useValue: { fetchRosterForLiveEndpoint } },
        { provide: LmsGradeService, useValue: {} },
        { provide: LmsAdapterFactory, useValue: {} },
        {
          provide: DataSource,
          useValue: {
            createQueryBuilder: jest.fn(() => queryBuilder),
            manager: { findOne },
          },
        },
      ],
    }).compile();

    controller = module.get(LmsController);
  });

  it('UNIT: uses NRPS mapping schoolId and active LMS config (no access-token fallback)', async () => {
    await controller.getLiveStudents(NRPS_URL, educatorRequest());

    expect(getActiveOptionalBySchoolId).toHaveBeenCalledWith(SCHOOL_A);
    expect(fetchRosterForLiveEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: SCHOOL_A }),
      NRPS_URL,
    );
  });

  it('UNIT: propagates school access errors instead of masking as missing LMS config', async () => {
    findOne.mockResolvedValue({
      id: EDUCATOR_ID,
      school: { id: 'other-school' },
      schoolAssignments: [],
    } as Educator);

    await expect(controller.getLiveStudents(NRPS_URL, educatorRequest())).rejects.toThrow(
      'not assigned to the requested school',
    );
    expect(fetchRosterForLiveEndpoint).not.toHaveBeenCalled();
  });
});
