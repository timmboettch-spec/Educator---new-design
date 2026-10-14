/**
 * Runs `worker` over every item with at most `limit` running at once, resolving once all have
 * finished. A worker that throws rejects the returned promise (the others keep draining the
 * queue). Same algorithm as `StudentsService`'s private helper, shared for other callers.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const concurrency = Math.min(Math.max(1, Math.floor(limit)), queue.length);
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift() as T;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
