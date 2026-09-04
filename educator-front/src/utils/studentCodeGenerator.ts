
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function getClassPrefix(className: string): string {
  const cleaned = className
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .filter((c) => SAFE_CHARS.includes(c));

  while (cleaned.length < 3) cleaned.push('X');
  return cleaned.slice(0, 3).join('');
}

function generateSuffix(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => SAFE_CHARS[b % SAFE_CHARS.length]).join('');
}
export function generateUniqueStudentCode(
  existingCodes: Set<string> = new Set(),
  className = '',
): string {
  const prefix = getClassPrefix(className);
  const MAX_ATTEMPTS = 200;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = `${prefix}-${generateSuffix()}`;
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  return `${prefix}-${generateSuffix()}`;
}
export function generateUniqueStudentCodes(
  count: number,
  existingCodes: Set<string> = new Set(),
  className = '',
): string[] {
  const used = new Set<string>(existingCodes);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = generateUniqueStudentCode(used, className);
    codes.push(code);
    used.add(code);
  }
  return codes;
}

export function isValidAccessCode(code: string): boolean {
  return (
    /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(code) ||
    /^\d{8}$/.test(code)
  );
}

