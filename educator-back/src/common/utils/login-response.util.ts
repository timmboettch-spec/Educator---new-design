import { ActiveRoleDto, LoginResDto, LoginUserRoleDto } from 'src/auth/dto/login.dto';
import { Role, Student, User } from 'src/database/entities';
import { LoginAccessStatus, RoleSlug } from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { mapEducatorSchoolsForAuth } from 'src/common/utils/educator-school.util';
import { calculateAiSeats } from 'src/common/utils/ai-seats.util';
import { SubscriptionSummary } from 'src/common/types';

/**
 * Builds the common login response payload — the account's ACTIVE role assignments, each
 * carrying whichever profile (district admin / educator / student) is linked to that specific
 * user_roles row — from an already-joined User. Shared by signup/login/selectRole so every auth
 * endpoint shapes its response the same way. Only a role's own `status` gates whether it (and
 * its profile) is surfaced here — never `users.status`.
 *
 * `accessStatus` is a sibling of `user`, not derived from `user.userRoles` — the caller knows
 * whether the token it just issued is a full access token or a login-purpose one, and that
 * doesn't always match "does this account have more than one active role" (e.g. `selectRole`
 * always grants access even for a still-multi-role account).
 */
export async function buildLoginResponseData(
  user: User,
  accessStatus: LoginAccessStatus,
  activeRoleSlug?: string | null,
  sanitizeUrl?: (url?: string | null) => Promise<string | null | undefined>,
): Promise<LoginResDto> {
  const activeRoles = (user.userRoles ?? []).filter(
    (userRole) => userRole.status === CommonStatus.ACTIVE && !!userRole.role,
  );

  const userRoles: LoginUserRoleDto[] = await Promise.all(
    activeRoles.map(async (userRole) => ({
      id: userRole.role!.id,
      name: userRole.role!.role_name,
      slug: userRole.role!.slug ?? '',
      districtAdmin: userRole.districtAdmin
        ? {
          districtAdminId: userRole.districtAdmin.districtAdminId,
          fullName: userRole.districtAdmin.fullName,
          isLicenseActive: userRole.districtAdmin.isLicenseActive ?? false,
          subscriptions: userRole.districtAdmin.subscriptions ?? [],
          profilePictureUrl: sanitizeUrl
            ? (await sanitizeUrl(userRole.districtAdmin.profilePicture)) || null
            : null,
        }
        : undefined,
      educator: userRole.educator
        ? {
          id: userRole.educator.id,
          email: user.email,
          fullName: userRole.educator.full_name,
          status: userRole.status,
          phoneNumber: userRole.educator.phone_number,
          profilePictureUrl: sanitizeUrl
            ? (await sanitizeUrl(userRole.educator.profile_picture)) || null
            : null,
          lmsEnabled: userRole.educator.lms_enabled,
          schools: mapEducatorSchoolsForAuth(userRole.educator).map((school) => ({
            id: school.id,
            schoolName: school.school_name,
            lmsEnabled: school.lms_enabled,
            googleClassroomEnabled: school.google_classroom_enabled,
          })),
        }
        : undefined,
      student: userRole.student
        ? {
          id: userRole.student.id as string,
          studentCode: userRole.student.student_id,
          status: userRole.student.status,
          classId: userRole.student.class_id,
        }
        : undefined,
    })),
  );

  const activeUserRole = activeRoleSlug
    ? (activeRoles.find((userRole) => userRole.role!.slug === activeRoleSlug) ?? null)
    : null;

  const activeRole: ActiveRoleDto | null = activeUserRole
    ? {
      id: activeUserRole.role!.id,
      name: activeUserRole.role!.role_name,
      slug: activeUserRole.role!.slug ?? '',
      aiSeats:
        calculateAiSeats(activeUserRole.role!.slug ?? '', {
          educator: activeUserRole.educator,
          subscriptions:
            (activeUserRole.districtAdmin?.subscriptions as SubscriptionSummary[]) ?? [],
        }) ?? undefined,
    }
    : null;

  return {
    accessStatus,
    activeRole,
    user: {
      userId: user.id,
      email: user.email ?? '',
      status: user.status,
      createdAt: user.created_at,
      userRoles,
    },
  };
}

/**
 * Student counterpart of `buildLoginResponseData`, for callers holding a `students` row rather
 * than a `User` — a student session (`type: 'student'` token) is issued off a login code and the
 * account may have no `users`/`user_roles` row at all, so the shared shape is assembled from the
 * student and its joined class instead.
 *
 * `role` is the `student` role row (looked up by the caller) used to fill the role entry's
 * id/name/slug when the student isn't linked to a `user_roles` row that already carries one.
 */
export function buildStudentLoginResponseData(
  student: Student,
  role: Role | null,
  accessStatus: LoginAccessStatus,
): LoginResDto {
  const userRole = student.userRole ?? undefined;
  const user = userRole?.user;
  const resolvedRole = userRole?.role ?? role;

  const studentUserRole: LoginUserRoleDto = {
    id: resolvedRole?.id ?? '',
    name: resolvedRole?.role_name ?? '',
    slug: resolvedRole?.slug ?? RoleSlug.STUDENT,
    student: {
      id: student.id as string,
      studentCode: student.student_id,
      status: student.status,
      classId: student.class_id ?? student.class?.id,
      className: student.class?.class_name,
    },
  };

  return {
    accessStatus,
    activeRole: studentUserRole,
    user: {
      userId: user?.id ?? (student.id as string),
      email: user?.email ?? student.email ?? '',
      status: user?.status ?? student.status ?? CommonStatus.ACTIVE,
      createdAt: user?.created_at ?? (student.created_at as Date),
      userRoles: [studentUserRole],
    },
  };
}
