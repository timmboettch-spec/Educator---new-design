import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import * as types from 'src/common/types';
import { Educator, Schools } from 'src/database/entities';
import { educatorBelongsToSchool } from './educator-school.util';
import { UserTokenType } from 'src/common/constants';


/**
 * Whether the caller is acting as district admin *right now* — the token's selected role
 * (`type`), not the account's full `roles[]`. Per ADR-0006, a dual-role account acting as
 * educator must get the school-membership check below, not the admin bypass, even though its
 * `roles[]` still includes `district_admin`.
 */
export function isDistrictAdminRequest(req: types.JwtRequest): boolean {
  return req.user.type === UserTokenType.ADMIN;
}

/**
 * `req.user.educatorId` is set by `JwtStrategy` only for an EDUCATOR-type access token. An admin
 * token, or a `purpose: 'login'` token, leaves it undefined — so every educator-scoped handler
 * must resolve it through here rather than casting (`req.user.educatorId as string`), which
 * would pass `undefined` straight into a repository query and either throw a driver error or
 * silently return an unscoped result. Checking `req.user.userId` is NOT a substitute: it is
 * always populated, for every role.
 */
export function resolveActingEducatorId(req: types.JwtRequest): string {
  const educatorId = String(req.user?.educatorId ?? '').trim();
  if (!educatorId) {
    throw new BadRequestException('Missing authenticated educator id');
  }
  return educatorId;
}

/**
 * District-admin counterpart of {@link resolveActingEducatorId}. `req.user.adminId` is the
 * linked `district_admins.district_admin_id` (not the account's `users.id`), and is set only for
 * an ADMIN-type access token.
 */
export function resolveActingAdminId(req: types.JwtRequest): string {
  const adminId = String(req.user?.adminId ?? '').trim();
  if (!adminId) {
    throw new BadRequestException('Missing authenticated district admin id');
  }
  return adminId;
}

export async function loadEducatorForSchoolCheck(
  manager: EntityManager,
  educatorId: string,
): Promise<Educator> {
  const educator = await manager.findOne(Educator, {
    where: { id: educatorId },
    relations: ['school', 'schoolAssignments', 'schoolAssignments.school'],
  });
  if (!educator) {
    throw new BadRequestException('Educator account not found');
  }
  return educator;
}

/**
 * Educators may use GC only when the target school has google_classroom_enabled.
 * District admins are always allowed.
 */
export async function assertGoogleClassroomEnabledForSchool(
  manager: EntityManager,
  req: types.JwtRequest,
  schoolId: string,
  forbiddenMessage = 'Google Classroom is not enabled for this school',
): Promise<void> {
  if (isDistrictAdminRequest(req)) {
    return;
  }
  const trimmed = schoolId.trim();
  if (!trimmed) {
    throw new BadRequestException('schoolId is required');
  }
  const school = await manager.findOne(Schools, { where: { id: trimmed } });
  if (!school) {
    throw new BadRequestException('School not found');
  }
  if (school.google_classroom_enabled !== true) {
    throw new ForbiddenException(forbiddenMessage);
  }
}


/**
 * Resolves the school context for educator / district-admin LMS-style APIs.
 * District admins must pass an explicit schoolId; educators must belong to it.
 */
export async function resolveSchoolIdFromRequest(
  manager: EntityManager,
  req: types.JwtRequest,
  requestedSchoolId?: string,
  options?: { districtAdminMissingSchoolMessage?: string },
): Promise<string> {
  const trimmed = requestedSchoolId?.trim();

  if (isDistrictAdminRequest(req)) {
    if (trimmed) {
      return trimmed;
    }
    throw new BadRequestException(
      options?.districtAdminMissingSchoolMessage ??
      'schoolId is required for district admin access',
    );
  }

  const educatorId = resolveActingEducatorId(req);
  const educator = await loadEducatorForSchoolCheck(manager, educatorId);

  if (trimmed) {
    if (!educatorBelongsToSchool(educator, trimmed)) {
      throw new ForbiddenException('Educator is not assigned to the requested school');
    }
    return trimmed;
  }

  const schoolId = educator.school?.id ?? null;
  if (!schoolId) {
    throw new BadRequestException('No school linked to educator account');
  }

  return schoolId;
}
