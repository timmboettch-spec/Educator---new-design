// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g;
const UNSAFE_MARKUP_OR_SCRIPT_REGEX =
  /(<[^>]*>|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|on\w+\s*=)/i;
const CLASS_NAME_DISALLOWED_CHARS_REGEX = /[<>]/;
const SQL_INJECTION_LIKE_REGEX =
  /\b(select|insert|update|delete|drop|truncate|alter|exec|union)\b\s*[\s\S]{0,40}\b(from|into|table|set|where|values|join)\b|\b(or|and)\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?|(--|\/\*|\*\/|;)/i;
const BLOCKED_CODING_KEYWORD_REGEX =
  /\b(select|insert|update|delete|drop|truncate|alter|union|exec|script|javascript|vbscript|eval|function|constructor|prototype|import|export|require|document|window|onerror|onclick|onload|innerhtml|outerhtml)\b/i;
const CODE_LIKE_SYNTAX_REGEX =
  /\b[a-z_][a-z0-9_]*\(\s*(["'`].*["'`]|\d+|true|false|null|undefined)?[^)]*\)\s*;?|=>|\b(def|lambda|printf|println|console\.log|system\.out\.println|echo)\b|[{};]/i;
const NAME_CODE_LIKE_REGEX =
  /\b(if|for|while|switch|case|typeof|return|const|let|var|function)\b\s*[([]|===|==|&&|\|\||=>|\b(classname|style|onclick|onchange|onsubmit|href|src|id)\s*=|\b(div|span|button|input|form|script|img|a)\b\s+[a-zA-Z_][\w-]*\s*=/i;

export const CLASS_NAME_MAX_LENGTH = 50;

export const sanitizeTextForTyping = (
  value: string,
  maxLength: number
): string => value.replace(CONTROL_CHAR_REGEX, '').slice(0, maxLength);

export const trimBoundaryWhitespace = (value: string): string => value.trim();

export const normalizePlainTextInput = (
  value: string,
  maxLength: number
): string => trimBoundaryWhitespace(sanitizeTextForTyping(value, maxLength));

export const hasUnsafeMarkupOrScriptPattern = (value: string): boolean =>
  UNSAFE_MARKUP_OR_SCRIPT_REGEX.test(value);

export const hasDisallowedClassNameChars = (value: string): boolean =>
  CLASS_NAME_DISALLOWED_CHARS_REGEX.test(value);

export const hasSqlInjectionLikePattern = (value: string): boolean =>
  SQL_INJECTION_LIKE_REGEX.test(value);

export const hasBlockedCodingKeyword = (value: string): boolean =>
  BLOCKED_CODING_KEYWORD_REGEX.test(value);

export const hasCodeLikeSyntaxPattern = (value: string): boolean =>
  CODE_LIKE_SYNTAX_REGEX.test(value);

export const hasNameCodeLikePattern = (value: string): boolean =>
  NAME_CODE_LIKE_REGEX.test(value);

export const sanitizeClassNameForSubmission = (value: string): string =>
  normalizePlainTextInput(value, CLASS_NAME_MAX_LENGTH);

export const SCHOOL_NAME_MAX_LENGTH = 50;

export const sanitizeSchoolNameForSubmission = (value: string): string =>
  normalizePlainTextInput(value, SCHOOL_NAME_MAX_LENGTH);

export const EDUCATOR_NAME_MAX_LENGTH = 50;

export const sanitizeEducatorNameForSubmission = (value: string): string =>
  normalizePlainTextInput(value, EDUCATOR_NAME_MAX_LENGTH);

export const PASSWORD_MAX_LENGTH = 20;

const PASSWORD_CODE_LIKE_PATTERN_REGEX =
  /\b(script|javascript|vbscript|eval|function|import|export|require|console\.log|document\.|window\.|select|insert|update|delete|drop|truncate|alter|union|exec)\b|\b[a-z_][a-z0-9_]*\([^)]*\)|=>|<\/?script/i;

export const sanitizePasswordForTyping = (value: string): string =>
  sanitizeTextForTyping(value, PASSWORD_MAX_LENGTH).replace(/\s/g, '');

export const hasUnsafePasswordPattern = (value: string): boolean =>
  hasUnsafeMarkupOrScriptPattern(value) ||
  hasDisallowedClassNameChars(value) ||
  PASSWORD_CODE_LIKE_PATTERN_REGEX.test(value);
