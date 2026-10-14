import { TranscriptRepository } from '../../../src/database/repositories/transcript.repository';

describe('TranscriptRepository', () => {
  const findOne = jest.fn();
  const find = jest.fn();
  const create = jest.fn();
  const save = jest.fn();
  const update = jest.fn();
  const repo = {
    findOne,
    find,
    create,
    save,
    update,
  };

  const repository = new TranscriptRepository(repo as never);

  beforeEach(() => {
    findOne.mockReset();
    find.mockReset();
    create.mockReset();
    save.mockReset();
    update.mockReset();
  });

  describe('findByBusinessId', () => {
    it('looks up by the original transcript id, not the surrogate transcriptId', async () => {
      const transcript = { transcriptId: 'uuid-1', id: 'json-transcript-1' };
      findOne.mockResolvedValue(transcript);

      await expect(repository.findByBusinessId('json-transcript-1')).resolves.toBe(transcript);
      expect(findOne).toHaveBeenCalledWith({ where: { id: 'json-transcript-1' } });
    });

    it('returns null when not found', async () => {
      findOne.mockResolvedValue(null);
      await expect(repository.findByBusinessId('missing')).resolves.toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('filters by userId', async () => {
      const transcripts = [{ id: 't1', userId: 'user-1' }];
      find.mockResolvedValue(transcripts);

      await expect(repository.findByUserId('user-1')).resolves.toBe(transcripts);
      expect(find).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });
  });

  describe('findByScenarioId', () => {
    it('filters by scenarioId', async () => {
      const transcripts = [{ id: 't1', scenarioId: 'scenario-1' }];
      find.mockResolvedValue(transcripts);

      await expect(repository.findByScenarioId('scenario-1')).resolves.toBe(transcripts);
      expect(find).toHaveBeenCalledWith({ where: { scenarioId: 'scenario-1' } });
    });
  });

  describe('create', () => {
    it('creates and saves a new transcript', async () => {
      const data = { id: 't1', userId: 'user-1', startedAt: '2026-01-01T00:00:00.000Z' };
      const entity = { ...data };
      create.mockReturnValue(entity);
      save.mockResolvedValue(entity);

      await expect(repository.create(data)).resolves.toBe(entity);
      expect(create).toHaveBeenCalledWith(data);
      expect(save).toHaveBeenCalledWith(entity);
    });
  });

  describe('updateByBusinessId', () => {
    it('updates by id and returns the refreshed row', async () => {
      const updated = { id: 't1', messages: [{ text: 'hi' }] };
      update.mockResolvedValue(undefined);
      findOne.mockResolvedValue(updated);

      await expect(
        repository.updateByBusinessId('t1', { messages: [{ text: 'hi' }] as never }),
      ).resolves.toBe(updated);
      expect(update).toHaveBeenCalledWith({ id: 't1' }, { messages: [{ text: 'hi' }] });
      expect(findOne).toHaveBeenCalledWith({ where: { id: 't1' } });
    });
  });
});
