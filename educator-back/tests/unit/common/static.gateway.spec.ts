import { StaticAiGateway } from 'src/common/providers/ai/static.gateway';

describe('StaticAiGateway', () => {
  const gateway = new StaticAiGateway();
  const request = { caller: 'test', messages: 'hello' };

  it('is always configured', () => {
    expect(gateway.isConfigured()).toBe(true);
  });

  it('returns a canned text completion', async () => {
    await expect(gateway.complete(request)).resolves.toEqual(expect.any(String));
  });

  it('returns a fresh canned JSON object per call', async () => {
    const first = await gateway.completeJson<{ results: unknown[] }>(request);
    const second = await gateway.completeJson<{ results: unknown[] }>(request);
    expect(first.results).toEqual([]);
    expect(first).not.toBe(second);
  });
});
