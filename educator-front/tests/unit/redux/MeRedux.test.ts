import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../src/redux/api', () => ({
  default: { get: vi.fn() },
}));
vi.mock('../../../src/utils/storage', () => ({
  updateStoredUser: vi.fn(),
  getParsedUser: vi.fn(() => null),
}));

import api from '../../../src/redux/api';
import config from '../../../src/redux/config';
import { getParsedUser, updateStoredUser } from '../../../src/utils/storage';
import { fetchCurrentUser } from '../../../src/redux/auth/MeRedux';

const run = () => fetchCurrentUser()(vi.fn(), () => ({}), undefined);

const meResponse = {
  message: 'Success.',
  data: {
    accessStatus: 'access_granted',
    activeRole: {
      id: 'role-1',
      name: 'District Admin',
      slug: 'district_admin',
      aiSeats: { total: 100, consumed: 82, available: 18, invalidatedAt: null },
    },
    user: {
      userId: 'user-1',
      email: 'sub3@yopmail.com',
      userRoles: [
        {
          id: 'role-1',
          name: 'District Admin',
          slug: 'district_admin',
          districtAdmin: {
            districtAdminId: 'admin-1',
            fullName: 'Sub 3',
            isLicenseActive: true,
          },
        },
      ],
    },
  },
};

describe('fetchCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: meResponse });
  });

  it('calls /auth/me', async () => {
    await run();
    expect(api.get).toHaveBeenCalledWith(config.MeAPI);
  });

  it('returns the flattened user with seats from activeRole', async () => {
    const action = await run();

    expect(action.payload).toMatchObject({
      role: 'District Admin',
      full_name: 'Sub 3',
      is_license_active: true,
      ai_seats: { total: 100, consumed: 82, available: 18 },
    });
  });

  it('writes the refreshed user to storage', async () => {
    await run();
    expect(updateStoredUser).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Sub 3' })
    );
  });

  it('rejects with the API message', async () => {
    vi.mocked(api.get).mockRejectedValue({
      response: { data: { message: 'Unauthorized' } },
    });

    const action = await run();

    expect(action.payload).toEqual({ message: 'Unauthorized' });
  });

  it('keeps the selected role when the response omits activeRole', async () => {
    vi.mocked(getParsedUser).mockReturnValue({
      active_role_id: 'role-educator',
    });
    vi.mocked(api.get).mockResolvedValue({
      data: {
        message: 'Success.',
        data: {
          accessStatus: 'access_granted',
          user: {
            userId: 'user-1',
            userRoles: [
              { id: 'role-1', name: 'District Admin', slug: 'district_admin' },
              {
                id: 'role-educator',
                name: 'Educator',
                slug: 'educator',
                educator: { id: 'edu-1', fullName: 'Sam Rivera' },
              },
            ],
          },
        },
      },
    });

    const action = await run();

    expect(action.payload).toMatchObject({
      role: 'Educator',
      full_name: 'Sam Rivera',
      active_role_id: 'role-educator',
    });
  });
});
