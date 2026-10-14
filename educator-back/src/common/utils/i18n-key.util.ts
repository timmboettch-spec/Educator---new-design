/**
 * New-module i18n message-key convention, ported from eye-recommend-backend:
 * a translation key and its interpolation args are encoded into a single
 * string as `<translationKey>|<argsJSON>`, so the value can be dropped
 * directly into class-validator's `message:` option or thrown via
 * `throwAppError`. `HttpExceptionFilter`/`ResponseInterceptor` decode
 * and translate it at the edge.
 */
export interface EncodedI18nArgs {
  args?: Record<string, string | number>;
}

export function encodeI18nKey(translationKey: string, args?: Record<string, string | number>): string {
  if (!args) {
    return translationKey;
  }
  return `${translationKey}|${JSON.stringify({ args })}`;
}

export function decodeI18nKey(message: string): { key: string; args?: Record<string, string | number> } {
  const separatorIndex = message.indexOf('|');
  if (separatorIndex === -1) {
    return { key: message };
  }

  const key = message.slice(0, separatorIndex);
  const rawArgs = message.slice(separatorIndex + 1);

  try {
    const parsed = JSON.parse(rawArgs) as EncodedI18nArgs;
    return { key, args: parsed.args };
  } catch {
    return { key: message };
  }
}
