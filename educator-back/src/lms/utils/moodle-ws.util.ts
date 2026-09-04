export interface MoodleWsCredentials {
  moodleUrl: string;
  wsToken: string;
}

type LmsApiConfigLike = {
  lmsBaseUrl?: string | null;
  lmsApiToken?: string | null;
};

/** Merge LMS API fields across sources; first non-empty value wins per field. */
export function mergeMoodleWsConfigFields(
  ...sources: Array<LmsApiConfigLike | null | undefined>
): LmsApiConfigLike {
  let lmsBaseUrl: string | null = null;
  let lmsApiToken: string | null = null;

  for (const source of sources) {
    const url = source?.lmsBaseUrl?.trim();
    const token = source?.lmsApiToken?.trim();
    if (!lmsBaseUrl && url) {
      lmsBaseUrl = url;
    }
    if (!lmsApiToken && token) {
      lmsApiToken = token;
    }
  }

  return { lmsBaseUrl, lmsApiToken };
}

export function resolveMoodleWsCredentials(
  config: LmsApiConfigLike | null | undefined,
  envMoodleUrl = '',
  envWsToken = '',
): MoodleWsCredentials | null {
  const moodleUrl = (config?.lmsBaseUrl || envMoodleUrl).trim().replace(/\/$/, '');
  const wsToken = (config?.lmsApiToken || envWsToken).trim();
  if (!moodleUrl || !wsToken) {
    return null;
  }
  return { moodleUrl, wsToken };
}

export function normalizeMoodleUserId(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const urnMatch = trimmed.match(/\/user\/(\d+)\/?$/i);
  if (urnMatch) {
    return String(Number(urnMatch[1]));
  }

  if (/^\d+$/.test(trimmed)) {
    return String(Number(trimmed));
  }

  return trimmed;
}
