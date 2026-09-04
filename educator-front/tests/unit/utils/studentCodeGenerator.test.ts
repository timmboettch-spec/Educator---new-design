import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateUniqueStudentCode,
  generateUniqueStudentCodes,
  getClassPrefix,
  isValidAccessCode,
} from '../../../src/utils/studentCodeGenerator';

// ── helpers ──────────────────────────────────────────────────────────────────

// Safe chars: A-Z minus I,L,O  +  2-9  (31 total)
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

function isValidCode(code: string) {
  return CODE_REGEX.test(code);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── generateUniqueStudentCode ─────────────────────────────────────────────────

describe('generateUniqueStudentCode', () => {
  it('returns a code matching the CCC-XXXX format', () => {
    const code = generateUniqueStudentCode(new Set(), 'Nursing');
    expect(code).toMatch(CODE_REGEX);
  });

  it('contains only safe characters (no I, L, O, 0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateUniqueStudentCode(new Set(), 'Test');
      expect(isValidCode(code)).toBe(true);
    }
  });

  it('does not return a code already in existingCodes', () => {
    // With Uint8Array(4): bytes all=0 → SAFE_CHARS[0]x4 = 'AAAA'
    //                     bytes all=1 → SAFE_CHARS[1]x4 = 'BBBB'
    let callCount = 0;
    const getRandomValues = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const val = callCount++ === 0 ? 0 : 1;
      const buf = array as Uint8Array;
      for (let i = 0; i < buf.length; i++) buf[i] = val;
      return array;
    });

    const prefix = getClassPrefix('Nursing');
    const taken = `${prefix}-${SAFE_CHARS[0].repeat(4)}`;
    const existing = new Set([taken]);
    const code = generateUniqueStudentCode(existing, 'Nursing');

    expect(code).toMatch(CODE_REGEX);
    expect(code).not.toBe(taken);
    expect(existing.has(code)).toBe(false);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });

  it('works with an empty existing set', () => {
    const code = generateUniqueStudentCode(new Set(), 'Science');
    expect(isValidCode(code)).toBe(true);
  });

  it('works when no existingCodes argument is provided', () => {
    const code = generateUniqueStudentCode();
    expect(code).toMatch(CODE_REGEX);
  });
});

// ── generateUniqueStudentCodes ────────────────────────────────────────────────

describe('generateUniqueStudentCodes', () => {
  it('returns the requested number of codes', () => {
    const codes = generateUniqueStudentCodes(5, new Set(), 'Biology');
    expect(codes).toHaveLength(5);
  });

  it('returns codes that are all valid CCC-XXXX strings', () => {
    const codes = generateUniqueStudentCodes(10, new Set(), 'Biology');
    for (const code of codes) {
      expect(isValidCode(code)).toBe(true);
    }
  });

  it('returns no duplicates within the batch', () => {
    const codes = generateUniqueStudentCodes(20, new Set(), 'Nursing');
    expect(new Set(codes).size).toBe(20);
  });

  it('does not include any code from the supplied existingCodes set', () => {
    const prefix = getClassPrefix('Test');
    const existing = new Set([`${prefix}-AAAA`, `${prefix}-BBBB`, `${prefix}-CCCC`]);
    const codes = generateUniqueStudentCodes(5, existing, 'Test');
    for (const code of codes) {
      expect(existing.has(code)).toBe(false);
    }
  });

  it('adds each generated code to the used set so siblings are unique', () => {
    let callCount = 0;
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const val = callCount++;
      const buf = array as Uint8Array;
      for (let i = 0; i < buf.length; i++) buf[i] = val % 31;
      return array;
    });

    const codes = generateUniqueStudentCodes(3, new Set(), 'Test');
    expect(new Set(codes).size).toBe(3);
  });

  it('returns an empty array when count is 0', () => {
    expect(generateUniqueStudentCodes(0, new Set(), 'Test')).toEqual([]);
  });
});

// ── isValidAccessCode ─────────────────────────────────────────────────────────

describe('isValidAccessCode', () => {
  it('accepts the new CCC-XXXX format', () => {
    expect(isValidAccessCode('NUR-7K4P')).toBe(true);
    expect(isValidAccessCode('ABB-2345')).toBe(true);
  });

  it('accepts legacy 8-digit numeric codes for backward compatibility', () => {
    expect(isValidAccessCode('12345678')).toBe(true);
  });

  it('rejects codes without hyphen', () => {
    expect(isValidAccessCode('NURABC23')).toBe(false);
  });

  it('rejects codes with excluded characters I, L, O, 0, 1', () => {
    expect(isValidAccessCode('ABC-0000')).toBe(false);
    expect(isValidAccessCode('ILL-AAAA')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidAccessCode('')).toBe(false);
  });
});

