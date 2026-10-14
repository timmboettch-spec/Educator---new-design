import { EntityManager } from 'typeorm';
import {
  assertGoogleClassroomEnabledForSchool,
  isDistrictAdminRequest,
  resolveSchoolIdFromRequest,
} from '../../../src/educators/utils/educator-school-access.util';
import { Educator, Schools } from '../../../src/database/entities';
import * as types from '../../../src/common/types';
import { RoleSlug, UserTokenType } from '../../../src/common/constants';
import { ForbiddenException } from '@nestjs/common';

describe('educator-school-access.util', () => {
  it('detects district admin by the selected role (type), not the full roles[] list', () => {
    expect(
      isDistrictAdminRequest({
        user: { roles: [RoleSlug.DISTRICT_ADMIN], type: UserTokenType.ADMIN },
      } as types.JwtRequest),
    ).toBe(true);
    expect(
      isDistrictAdminRequest({
        user: { roles: [RoleSlug.EDUCATOR], type: UserTokenType.EDUCATOR },
      } as types.JwtRequest),
    ).toBe(false);
  });

  it('treats a dual-role account acting as educator as not a district admin, even though roles[] still holds district_admin', () => {
    expect(
      isDistrictAdminRequest({
        user: { roles: [RoleSlug.DISTRICT_ADMIN, RoleSlug.EDUCATOR], type: UserTokenType.EDUCATOR },
      } as types.JwtRequest),
    ).toBe(false);
  });

  it('resolves explicit school for district admin', async () => {
    const schoolId = await resolveSchoolIdFromRequest(
      {} as EntityManager,
      { user: { roles: [RoleSlug.DISTRICT_ADMIN], type: UserTokenType.ADMIN } } as types.JwtRequest,
      'school-1',
    );
    expect(schoolId).toBe('school-1');
  });

  it('rejects educator for a school they do not belong to', async () => {
    const educator = {
      school: { id: 'school-a' },
      schoolAssignments: [],
    } as unknown as Educator;

    const manager = {
      findOne: jest.fn().mockResolvedValue(educator),
    } as unknown as EntityManager;

    await expect(
      resolveSchoolIdFromRequest(
        manager,
        { user: { educatorId: 'edu-1', roles: [RoleSlug.EDUCATOR] } } as types.JwtRequest,
        'school-b',
      ),
    ).rejects.toThrow('Educator is not assigned to the requested school');
  });

  it('allows district admin Google Classroom access without loading school', async () => {
    const manager = { findOne: jest.fn() } as unknown as EntityManager;
    await expect(
      assertGoogleClassroomEnabledForSchool(
        manager,
        { user: { roles: [RoleSlug.DISTRICT_ADMIN], type: UserTokenType.ADMIN } } as types.JwtRequest,
        'school-1',
      ),
    ).resolves.toBeUndefined();
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('rejects educator when school google_classroom_enabled is false', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'school-1',
        google_classroom_enabled: false,
      } as unknown as Schools),
    } as unknown as EntityManager;

    await expect(
      assertGoogleClassroomEnabledForSchool(
        manager,
        { user: { userId: 'edu-1', roles: [RoleSlug.EDUCATOR] } } as unknown as types.JwtRequest,
        'school-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects educator when school google_classroom_enabled is not explicitly true', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'school-1',
        google_classroom_enabled: undefined,
      } as unknown as Schools),
    } as unknown as EntityManager;

    await expect(
      assertGoogleClassroomEnabledForSchool(
        manager,
        { user: { userId: 'edu-1', roles: [RoleSlug.EDUCATOR] } } as unknown as types.JwtRequest,
        'school-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows educator when school google_classroom_enabled is true', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'school-1',
        google_classroom_enabled: true,
      } as unknown as Schools),
    } as unknown as EntityManager;

    await expect(
      assertGoogleClassroomEnabledForSchool(
        manager,
        { user: { userId: 'edu-1', roles: [RoleSlug.EDUCATOR] } } as unknown as types.JwtRequest,
        'school-1',
      ),
    ).resolves.toBeUndefined();
  });

});
