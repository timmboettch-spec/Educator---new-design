import { describe, expect, it } from 'vitest';

import {
  findRoleById,
  getAiSeats,
  getActiveRole,
  getEducatorId,
  getSwitchTargetRole,
  getUserRoles,
  isSupportedRoleSlug,
  normalizeAuthUser,
} from '../../../src/utils/normalizeAuthUser';

const districtAdminUser = {
  userId: 'user-1',
  email: 'district.admin@example.com',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  userRoles: [
    {
      id: 'role-assignment-1',
      name: 'District Admin',
      slug: 'district_admin',
      districtAdmin: {
        districtAdminId: 'role-assignment-1',
        fullName: 'Ava Thompson',
        phoneNumber: '+1 555 0100',
        isLicenseActive: true,
        subscriptions: [{ id: 'sub-1' }],
      },
      educator: null,
      student: null,
    },
  ],
};

const educatorUser = {
  userId: 'user-2',
  email: 'educator@example.com',
  status: 'active',
  userRoles: [
    {
      id: 'role-assignment-2',
      name: 'Educator',
      slug: 'educator',
      districtAdmin: null,
      educator: {
        id: 'educator-1',
        fullName: 'Sam Rivera',
        status: 'active',
        phoneNumber: '+1 555 0200',
        lmsEnabled: true,
      },
      student: null,
    },
  ],
};

describe('normalizeAuthUser', () => {
  it('returns null for a missing user', () => {
    expect(normalizeAuthUser(null)).toBeNull();
    expect(normalizeAuthUser(undefined)).toBeNull();
    expect(normalizeAuthUser('nope')).toBeNull();
  });

  it('flattens a district admin onto the legacy user shape', () => {
    const user = normalizeAuthUser(districtAdminUser);

    expect(user).toMatchObject({
      id: 'user-1',
      email: 'district.admin@example.com',
      full_name: 'Ava Thompson',
      role: 'District Admin',
      is_license_active: true,
      phone_number: '+1 555 0100',
      subscriptions: [{ id: 'sub-1' }],
    });
  });

  it('flattens an educator, including the LMS flag', () => {
    const user = normalizeAuthUser(educatorUser);

    expect(user).toMatchObject({
      id: 'user-2',
      full_name: 'Sam Rivera',
      role: 'Educator',
      phone_number: '+1 555 0200',
      lms_enabled: true,
    });
  });

  it('keeps pre-migration snake_case payloads working', () => {
    const user = normalizeAuthUser({
      id: 'user-3',
      email: 'legacy@example.com',
      full_name: 'Legacy User',
      role: 'Educator',
      is_license_active: false,
      school: { id: 'school-1', school_name: 'Riverside High' },
    });

    expect(user).toMatchObject({
      id: 'user-3',
      full_name: 'Legacy User',
      role: 'Educator',
      is_license_active: false,
    });
  });

  it('preserves fields it does not map', () => {
    const user = normalizeAuthUser({
      ...educatorUser,
      profile_picture: 'https://example.test/avatar.png',
      total_tokens: 42,
    });

    expect(user).toMatchObject({
      profile_picture: 'https://example.test/avatar.png',
      total_tokens: 42,
    });
  });

  it('leaves full_name absent when no profile supplies one', () => {
    const user = normalizeAuthUser({
      userId: 'user-4',
      email: 'scenario.admin@example.com',
      userRoles: [
        {
          id: 'role-assignment-4',
          name: 'Scenario Admin',
          slug: 'scenario_admin',
          districtAdmin: null,
          educator: null,
          student: null,
        },
      ],
    });

    expect(user).not.toHaveProperty('full_name');
    expect(user).toMatchObject({ role: 'Scenario Admin' });
  });
});

describe('getActiveRole', () => {
  it('returns the only active role', () => {
    expect(getActiveRole(districtAdminUser)?.slug).toBe('district_admin');
  });

  it('returns null when there are no roles', () => {
    expect(getActiveRole({ email: 'legacy@example.com' })).toBeNull();
    expect(getActiveRole(null)).toBeNull();
  });

  it('prefers an explicit activeRole over the first entry', () => {
    const multiRoleUser = {
      ...districtAdminUser,
      userRoles: [...districtAdminUser.userRoles, educatorUser.userRoles[0]],
    };

    expect(getActiveRole(multiRoleUser)?.slug).toBe('district_admin');
    expect(getActiveRole(multiRoleUser, educatorUser.userRoles[0])?.slug).toBe(
      'educator'
    );
  });
});

describe('normalizeAuthUser with an explicit active role', () => {
  it('flattens the chosen role, not the first one', () => {
    const multiRoleUser = {
      ...districtAdminUser,
      userRoles: [...districtAdminUser.userRoles, educatorUser.userRoles[0]],
    };

    const user = normalizeAuthUser(multiRoleUser, educatorUser.userRoles[0]);

    expect(user).toMatchObject({
      role: 'Educator',
      full_name: 'Sam Rivera',
      lms_enabled: true,
    });
  });
});

describe('getUserRoles', () => {
  it('returns every role for a multi-role account', () => {
    const roles = getUserRoles({
      userRoles: [districtAdminUser.userRoles[0], educatorUser.userRoles[0]],
    });

    expect(roles.map((role) => role.slug)).toEqual([
      'district_admin',
      'educator',
    ]);
  });

  it('returns an empty list for a legacy payload', () => {
    expect(getUserRoles({ email: 'legacy@example.com' })).toEqual([]);
    expect(getUserRoles(null)).toEqual([]);
  });
});

describe('findRoleById', () => {
  it('finds the role the user picked', () => {
    expect(findRoleById(educatorUser, 'role-assignment-2')?.slug).toBe(
      'educator'
    );
  });

  it('returns null for an unknown id', () => {
    expect(findRoleById(educatorUser, 'nope')).toBeNull();
  });
});

describe('isSupportedRoleSlug', () => {
  it('accepts the slugs this app can route', () => {
    expect(isSupportedRoleSlug('educator')).toBe(true);
    expect(isSupportedRoleSlug('district_admin')).toBe(true);
  });

  it('rejects slugs with no dashboard here', () => {
    expect(isSupportedRoleSlug('scenario_admin')).toBe(false);
    expect(isSupportedRoleSlug('scenario_designer')).toBe(false);
    expect(isSupportedRoleSlug('student')).toBe(false);
    expect(isSupportedRoleSlug(undefined)).toBe(false);
  });
});

describe('available roles for switching', () => {
  const multiRoleUser = {
    userId: 'user-3',
    userRoles: [
      ...districtAdminUser.userRoles,
      ...educatorUser.userRoles,
      { id: 'role-assignment-9', name: 'Student', slug: 'student' },
    ],
  };

  it('stores only the supported roles and the active role id', () => {
    const normalized = normalizeAuthUser(
      multiRoleUser,
      educatorUser.userRoles[0]
    );
    expect(normalized?.['available_roles']).toEqual([
      {
        id: 'role-assignment-1',
        name: 'District Admin',
        slug: 'district_admin',
      },
      { id: 'role-assignment-2', name: 'Educator', slug: 'educator' },
    ]);
    expect(normalized?.['active_role_id']).toBe('role-assignment-2');
  });

  it('adds nothing for the legacy user shape', () => {
    const normalized = normalizeAuthUser({ id: 'u', role: 'Educator' });
    expect(normalized).not.toHaveProperty('available_roles');
  });

  it('getSwitchTargetRole returns the non-active role', () => {
    const stored = normalizeAuthUser(multiRoleUser, educatorUser.userRoles[0]);
    expect(getSwitchTargetRole(stored)?.slug).toBe('district_admin');
  });

  it('getSwitchTargetRole returns null for a single role or no data', () => {
    expect(getSwitchTargetRole(normalizeAuthUser(educatorUser))).toBeNull();
    expect(getSwitchTargetRole(null)).toBeNull();
  });
});

describe('activeRole without a profile (real login response shape)', () => {
  // Login returns activeRole as { id, name, slug } only; the districtAdmin
  // profile is on the matching userRoles[] entry.
  const slimActiveRole = {
    id: 'role-assignment-1',
    name: 'District Admin',
    slug: 'district_admin',
  };

  it('reads license, name and subscriptions from the matching role', () => {
    const normalized = normalizeAuthUser(districtAdminUser, slimActiveRole);
    expect(normalized).toMatchObject({
      role: 'District Admin',
      full_name: 'Ava Thompson',
      is_license_active: true,
      subscriptions: [{ id: 'sub-1' }],
      active_role_id: 'role-assignment-1',
    });
  });

  it('getActiveRole returns the full userRoles[] entry', () => {
    expect(
      getActiveRole(districtAdminUser, slimActiveRole)?.districtAdmin
    ).toMatchObject({ fullName: 'Ava Thompson', isLicenseActive: true });
  });

  it('falls back to the given activeRole when no entry matches', () => {
    const orphan = { id: 'missing', name: 'Educator', slug: 'educator' };
    expect(getActiveRole(districtAdminUser, orphan)).toEqual(orphan);
  });
});

describe('aiSeats', () => {
  const activeRole = {
    id: 'role-assignment-1',
    name: 'District Admin',
    slug: 'district_admin',
    aiSeats: { total: 100, consumed: 82, available: 18, invalidatedAt: null },
  };

  it('stores the seat counts from activeRole', () => {
    const stored = normalizeAuthUser(districtAdminUser, activeRole);
    expect(getAiSeats(stored)).toEqual({
      total: 100,
      consumed: 82,
      available: 18,
      invalidatedAt: null,
    });
  });

  it('falls back to zeros when the role carries no seats', () => {
    expect(getAiSeats(normalizeAuthUser(educatorUser))).toEqual({
      total: 0,
      consumed: 0,
      available: 0,
      invalidatedAt: null,
    });
    expect(getAiSeats(null)).toEqual({
      total: 0,
      consumed: 0,
      available: 0,
      invalidatedAt: null,
    });
  });

  it('keeps an educator invalidatedAt timestamp', () => {
    const stored = normalizeAuthUser(educatorUser, {
      ...educatorUser.userRoles[0],
      aiSeats: {
        total: 25,
        consumed: 10,
        available: 15,
        invalidatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(getAiSeats(stored).invalidatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('profile picture', () => {
  const withPicture = (profile: Record<string, unknown>) => ({
    userId: 'user-1',
    userRoles: [
      {
        id: 'role-1',
        name: 'District Admin',
        slug: 'district_admin',
        districtAdmin: {
          districtAdminId: 'admin-1',
          fullName: 'Test 1',
          ...profile,
        },
      },
    ],
  });

  it('reads profilePicture from the active role', () => {
    const normalized = normalizeAuthUser(
      withPicture({ profilePicture: 'https://cdn.example.com/a.png' })
    );
    expect(normalized?.['profile_picture']).toBe(
      'https://cdn.example.com/a.png'
    );
  });

  it('also accepts profilePictureUrl', () => {
    const normalized = normalizeAuthUser(
      withPicture({ profilePictureUrl: 'https://cdn.example.com/b.png' })
    );
    expect(normalized?.['profile_picture']).toBe(
      'https://cdn.example.com/b.png'
    );
  });

  it('keeps a null picture so a removed photo clears', () => {
    const normalized = normalizeAuthUser(withPicture({ profilePicture: null }));
    expect(normalized?.['profile_picture']).toBeNull();
  });

  it('reads the educator picture for an educator session', () => {
    const user = {
      userId: 'user-2',
      userRoles: [
        {
          id: 'role-2',
          name: 'Educator',
          slug: 'educator',
          educator: {
            id: 'edu-1',
            fullName: 'Sam',
            profilePicture: 'https://cdn.example.com/edu.png',
          },
        },
      ],
    };
    expect(normalizeAuthUser(user)?.['profile_picture']).toBe(
      'https://cdn.example.com/edu.png'
    );
  });
});

describe('educator schools', () => {
  const multiRoleUser = {
    userId: 'user-5',
    email: 'both@example.com',
    userRoles: [
      {
        id: 'role-admin',
        name: 'District Admin',
        slug: 'district_admin',
        districtAdmin: { districtAdminId: 'da-1', fullName: 'Admin Name' },
      },
      {
        id: 'role-educator',
        name: 'Educator',
        slug: 'educator',
        educator: {
          id: 'educator-5',
          fullName: 'Educator Name',
          schools: [
            {
              id: 'school-1',
              schoolName: 'Greenwood High School',
              lmsEnabled: false,
              googleClassroomEnabled: true,
            },
            { id: 'school-2', schoolName: 'Lakeside Middle' },
          ],
        },
      },
    ],
  };

  it('maps the active educator role schools onto the legacy snake_case shape', () => {
    const user = normalizeAuthUser(multiRoleUser, {
      id: 'role-educator',
      name: 'Educator',
      slug: 'educator',
    });

    expect(user?.['schools']).toEqual([
      {
        id: 'school-1',
        school_name: 'Greenwood High School',
        lms_enabled: false,
        google_classroom_enabled: true,
      },
      { id: 'school-2', school_name: 'Lakeside Middle' },
    ]);
    expect(user?.['school']).toEqual({
      id: 'school-1',
      school_name: 'Greenwood High School',
      lms_enabled: false,
      google_classroom_enabled: true,
    });
    expect(user?.['google_classroom_enabled']).toBe(true);
  });

  it('does not attach educator schools when acting as district admin', () => {
    const user = normalizeAuthUser(multiRoleUser, {
      id: 'role-admin',
      name: 'District Admin',
      slug: 'district_admin',
    });

    expect(user).not.toHaveProperty('schools');
    expect(user).not.toHaveProperty('school');
  });

  it('clears school when the educator has no schools left', () => {
    const user = normalizeAuthUser({
      userId: 'user-7',
      userRoles: [
        {
          id: 'role-educator',
          name: 'Educator',
          slug: 'educator',
          educator: { id: 'educator-7', schools: [] },
        },
      ],
    });

    expect(user?.['schools']).toEqual([]);
    expect(user?.['school']).toBeNull();
  });

  it('keeps a legacy top-level school and schools untouched', () => {
    const legacy = {
      id: 'user-6',
      role: 'Educator',
      school: { id: 'school-9', school_name: 'Legacy High' },
      schools: [{ id: 'school-9', school_name: 'Legacy High' }],
    };

    const user = normalizeAuthUser(legacy);

    expect(user?.['school']).toEqual(legacy.school);
    expect(user?.['schools']).toEqual(legacy.schools);
  });
});

describe('educator id', () => {
  it('stores the educator record id separately from the account id', () => {
    const user = normalizeAuthUser(educatorUser);

    expect(user?.['id']).toBe('user-2');
    expect(user?.['educator_id']).toBe('educator-1');
    expect(getEducatorId(user)).toBe('educator-1');
  });

  it('does not set an educator id for a district admin', () => {
    const user = normalizeAuthUser(districtAdminUser);

    expect(user).not.toHaveProperty('educator_id');
  });

  it('falls back to the account id for pre-migration sessions', () => {
    expect(getEducatorId({ id: 'legacy-educator', role: 'Educator' })).toBe(
      'legacy-educator'
    );
  });

  it('returns null when no id is stored', () => {
    expect(getEducatorId(null)).toBeNull();
    expect(getEducatorId({ educator_id: '' })).toBeNull();
  });
});

describe('normalizeAuthUser — active_role_slug', () => {
  const slimActiveRole = {
    id: 'role-assignment-1',
    name: 'District Admin',
    slug: 'district_admin',
  };

  it('writes the canonical slug alongside the display name', () => {
    const normalized = normalizeAuthUser(districtAdminUser, slimActiveRole);
    // `role` stays the display name so existing screens keep working.
    expect(normalized?.['role']).toBe('District Admin');
    expect(normalized?.['active_role_slug']).toBe('district_admin');
  });

  it('writes the slug even when userRoles[] carries no supported role', () => {
    // available_roles is gated on a non-empty supported list; the slug is not,
    // which is what makes it the reliable first lookup link.
    const user = {
      userId: 'u-1',
      email: 'a@b.com',
      userRoles: [{ id: 'r-9', name: 'Student', slug: 'student' }],
    };
    const normalized = normalizeAuthUser(user, {
      id: 'r-9',
      name: 'Student',
      slug: 'student',
    });
    expect(normalized?.['available_roles']).toBeUndefined();
    expect(normalized?.['active_role_slug']).toBe('student');
  });

  it('omits the slug entirely when no active role can be resolved', () => {
    const legacy = { id: 'u-2', email: 'c@d.com', role: 'Educator' };
    const normalized = normalizeAuthUser(legacy);
    expect(normalized?.['active_role_slug']).toBeUndefined();
    expect(normalized?.['role']).toBe('Educator');
  });

  it('follows the chosen role through a switch', () => {
    const educatorRole = {
      id: 'role-assignment-2',
      name: 'Educator',
      slug: 'educator',
    };
    const normalized = normalizeAuthUser(districtAdminUser, educatorRole);
    expect(normalized?.['active_role_slug']).toBe('educator');
    expect(normalized?.['active_role_id']).toBe('role-assignment-2');
  });
});
