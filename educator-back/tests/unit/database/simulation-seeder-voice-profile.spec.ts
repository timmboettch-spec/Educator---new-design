import { resolveSeededVoiceProfileId } from 'src/database/seeders/simulation.seeder';

describe('simulation.seeder — resolveSeededVoiceProfileId', () => {
  const repo = { exists: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('is undefined when the scenario JSON has no voiceProfileId', async () => {
    const result = await resolveSeededVoiceProfileId(repo as never, { id: 's-1' } as never);
    expect(result).toBeUndefined();
    expect(repo.exists).not.toHaveBeenCalled();
  });

  it('keeps the id when it exists in voice_profiles', async () => {
    repo.exists.mockResolvedValue(true);
    const result = await resolveSeededVoiceProfileId(
      repo as never,
      { id: 's-1', voiceProfileId: 'p-1' } as never,
    );
    expect(result).toBe('p-1');
    expect(repo.exists).toHaveBeenCalledWith({ where: { voiceProfileId: 'p-1' } });
  });

  it('nulls out (returns undefined) an unknown id, logging a notice', async () => {
    repo.exists.mockResolvedValue(false);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await resolveSeededVoiceProfileId(
      repo as never,
      { id: 's-1', voiceProfileId: 'unknown-id' } as never,
    );

    expect(result).toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-id'));
    logSpy.mockRestore();
  });
});
