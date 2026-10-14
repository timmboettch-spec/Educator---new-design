const SECONDS_BY_UNIT: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function parseExpiresInSeconds(value: string | undefined, fallbackSeconds: number): number {
  if (!value) return fallbackSeconds;
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return fallbackSeconds;
  return Number(match[1]) * SECONDS_BY_UNIT[match[2]];
}
