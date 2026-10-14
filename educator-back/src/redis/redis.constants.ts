export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_DEFAULT_TTL_SECONDS = 24 * 60 * 60;

const IN_MEMORY_ALLOWED_ENVS: ReadonlySet<string> = new Set(['development', 'test']);

export function isInMemoryAllowed(nodeEnv: string | undefined): boolean {
  return IN_MEMORY_ALLOWED_ENVS.has(nodeEnv ?? 'development');
}
