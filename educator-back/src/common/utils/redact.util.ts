const REDACTED = '[redacted]';

export function redactEmail(email: string | null | undefined): string {
  const trimmed = email?.trim();
  if (!trimmed) {
    return REDACTED;
  }

  const at = trimmed.lastIndexOf('@');
  const domain = trimmed.slice(at + 1);
  if (at < 1 || !domain) {
    return REDACTED;
  }

  return `${trimmed[0]}***@${domain}`;
}

export function redactCode(code: string | null | undefined): string {
  const trimmed = code?.trim();
  if (!trimmed) {
    return REDACTED;
  }

  return trimmed.length > 4 ? `***${trimmed.slice(-4)}` : REDACTED;
}

export function redactCodes(codes: readonly (string | null | undefined)[]): string {
  return codes.length ? codes.map(redactCode).join(', ') : '(none)';
}
