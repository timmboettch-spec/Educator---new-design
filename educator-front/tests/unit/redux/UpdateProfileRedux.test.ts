import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../src/redux/api', () => ({
  default: { put: vi.fn() },
}));

import api from '../../../src/redux/api';
import config from '../../../src/redux/config';
import { updateProfileRequest } from '../../../src/redux/auth/UpdateProfileRedux';

const run = (payload: Parameters<typeof updateProfileRequest>[0]) =>
  updateProfileRequest(payload)(vi.fn(), () => ({}), undefined);

describe('updateProfileRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.put).mockResolvedValue({ data: { message: 'ok' } });
  });

  it('sends a name change as JSON with fullName', async () => {
    await run({ fullName: 'Sam Rivera' });

    expect(api.put).toHaveBeenCalledWith(config.UpdateProfileAPI, {
      fullName: 'Sam Rivera',
    });
  });

  it('sends fullName alongside a photo upload', async () => {
    const file = new File(['img'], 'avatar.png', { type: 'image/png' });

    await run({ fullName: 'Sam Rivera', profile_image: file });

    const [url, body] = vi.mocked(api.put).mock.calls[0] ?? [];
    expect(url).toBe(config.UpdateProfileAPI);
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get('fullName')).toBe('Sam Rivera');
    expect(form.get('full_name')).toBeNull();
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('never sends the silent loader flag to the API', async () => {
    const file = new File(['img'], 'avatar.png', { type: 'image/png' });

    await run({ fullName: 'Sam Rivera', profile_image: file, silent: true });
    const form = vi.mocked(api.put).mock.calls[0]?.[1] as FormData;
    expect(form.has('silent')).toBe(false);

    await run({ fullName: 'Sam Rivera', silent: true });
    expect(vi.mocked(api.put).mock.calls[1]?.[1]).toEqual({
      fullName: 'Sam Rivera',
    });
  });
});
