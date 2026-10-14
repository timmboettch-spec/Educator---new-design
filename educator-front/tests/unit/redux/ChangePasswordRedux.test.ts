import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../src/redux/api', () => ({
  default: { post: vi.fn() },
}));

import api from '../../../src/redux/api';
import config from '../../../src/redux/config';
import { changePasswordRequest } from '../../../src/redux/auth/ChangePasswordRedux';

const run = (payload: Parameters<typeof changePasswordRequest>[0]) =>
  changePasswordRequest(payload)(vi.fn(), () => ({}), undefined);

describe('changePasswordRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({ data: { message: 'ok' } });
  });

  it('sends only the old and new password, never the silent loader flag', async () => {
    await run({
      oldPassword: 'Old#Pass1',
      newPassword: 'New#Pass1',
      silent: true,
    });

    expect(api.post).toHaveBeenCalledWith(config.ChangePasswordAPI, {
      oldPassword: 'Old#Pass1',
      newPassword: 'New#Pass1',
    });
  });

  it('marks the pending action silent so the full-page loader stays off', () => {
    const pending = changePasswordRequest.pending('id', {
      oldPassword: 'a',
      newPassword: 'b',
      silent: true,
    });
    expect(pending.meta.arg.silent).toBe(true);
  });
});
