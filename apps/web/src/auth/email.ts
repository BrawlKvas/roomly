const edgeWhitespace = new Set([
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

export function normalizeLoginEmail(value: string): string {
  let first = 0;
  let last = value.length;
  while (first < last) {
    const character = String.fromCodePoint(value.codePointAt(first)!);
    if (!edgeWhitespace.has(character)) break;
    first += character.length;
  }
  while (last > first) {
    const character = String.fromCodePoint(value.codePointAt(last - 1)!);
    if (!edgeWhitespace.has(character)) break;
    last -= character.length;
  }
  return value.slice(first, last);
}

export function isValidLoginEmail(value: string): boolean {
  const at = value.indexOf('@');
  return (
    Array.from(value).length <= 254 &&
    at > 0 &&
    at === value.lastIndexOf('@') &&
    at < value.length - 1 &&
    !Array.from(value).some((character) => edgeWhitespace.has(character))
  );
}
