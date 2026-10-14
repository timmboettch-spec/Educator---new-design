import { runWithConcurrency } from 'src/common/utils/concurrency.util';
import { toCanonicalUuid, toCanonicalUuids } from 'src/common/utils/uuid.util';

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('runWithConcurrency', () => {
  it('processes every item, never more than `limit` at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const done: number[] = [];

    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      inFlight -= 1;
      done.push(item);
    });

    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(maxInFlight).toBe(3);
  });

  it('resolves immediately for no items', async () => {
    const worker = jest.fn();
    await runWithConcurrency([], 5, worker);
    expect(worker).not.toHaveBeenCalled();
  });

  it('treats a limit below 1 as 1', async () => {
    let maxInFlight = 0;
    let inFlight = 0;
    await runWithConcurrency([1, 2, 3], 0, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      inFlight -= 1;
    });
    expect(maxInFlight).toBe(1);
  });

  it('rejects when a worker throws', async () => {
    await expect(
      runWithConcurrency([1, 2], 2, async (item) => {
        await tick();
        if (item === 2) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});

describe('toCanonicalUuid / toCanonicalUuids', () => {
  it('trims and lowercases', () => {
    expect(toCanonicalUuid(' 4BFCF191-C608-4552-AF95-A479209B5E72 ')).toBe(
      '4bfcf191-c608-4552-af95-a479209b5e72',
    );
    expect(toCanonicalUuids(['ABC', ' def '])).toEqual(['abc', 'def']);
  });

  it('passes non-strings and non-arrays through for the validators to reject', () => {
    expect(toCanonicalUuid(42)).toBe(42);
    expect(toCanonicalUuids('ABC')).toBe('ABC');
    expect(toCanonicalUuids(['ABC', 7])).toEqual(['abc', 7]);
  });
});
