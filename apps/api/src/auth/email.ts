const EDGE_WHITESPACE = new Set([
  ...Array.from({ length: 5 }, (_, index) => String.fromCodePoint(0x0009 + index)),
  '\u0020',
  '\u0085',
  '\u00a0',
  '\u1680',
  ...Array.from({ length: 11 }, (_, index) => String.fromCodePoint(0x2000 + index)),
  '\u2028',
  '\u2029',
  '\u202f',
  '\u205f',
  '\u3000',
]);

function isEdgeWhitespace(character: string): boolean {
  return EDGE_WHITESPACE.has(character);
}

/** Applies BR-DATA-001 without relying on the runtime locale or String.trim(). */
export function trimRoomlyWhitespace(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end) {
    const character = value.codePointAt(start)!;
    const text = String.fromCodePoint(character);
    if (!isEdgeWhitespace(text)) break;
    start += text.length;
  }
  while (end > start) {
    const character = value.codePointAt(end - 1)!;
    const text = String.fromCodePoint(character);
    if (!isEdgeWhitespace(text)) break;
    end -= text.length;
  }
  return value.slice(start, end);
}

/** Implements the deliberately limited case comparison from BR-DATA-004. */
export function roomlyComparisonKey(value: string): string {
  return value.replace(/[A-ZА-ЯЁ]/g, (character) => {
    if (character >= 'A' && character <= 'Z') {
      return String.fromCodePoint(character.codePointAt(0)! + 32);
    }
    if (character === 'Ё') return 'ё';
    return String.fromCodePoint(character.codePointAt(0)! + 32);
  });
}

export interface EmailValidationResult {
  email: string;
  valid: boolean;
}

export function validateLoginEmail(value: unknown): EmailValidationResult {
  if (typeof value !== 'string') return { email: '', valid: false };
  const email = trimRoomlyWhitespace(value);
  const at = email.indexOf('@');
  const valid =
    Array.from(email).length <= 254 &&
    at > 0 &&
    at === email.lastIndexOf('@') &&
    at < email.length - 1 &&
    !Array.from(email).some(isEdgeWhitespace);
  return { email, valid };
}
