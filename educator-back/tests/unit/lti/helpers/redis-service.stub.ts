export function createRedisServiceStub() {
  const store = new Map<string, unknown>();

  const setStrict = jest.fn<Promise<void>, [string, unknown, number]>((key, value) => {
    store.set(key, value);
    return Promise.resolve();
  });

  const getDelStrict = jest.fn<Promise<unknown>, [string]>((key) => {
    const value = store.get(key) ?? null;
    store.delete(key);
    return Promise.resolve(value);
  });

  return { store, setStrict, getDelStrict };
}

export type RedisServiceStub = ReturnType<typeof createRedisServiceStub>;
