import { describe, expect, it } from 'vitest';

import { roomlyComparisonKey, validateLoginEmail } from '../src/auth/email';

describe('login email processing (FR-AUTH-001)', () => {
  it('trims only the specified edge whitespace and keeps entered case', () => {
    expect(validateLoginEmail('\u00a0 Admin@Northstar.Local\u3000')).toEqual({
      email: 'Admin@Northstar.Local',
      valid: true,
    });
  });

  it('accepts exactly one at sign and rejects inner specified whitespace', () => {
    expect(validateLoginEmail('a@b')).toEqual({ email: 'a@b', valid: true });
    expect(validateLoginEmail('a b@example.test').valid).toBe(false);
    expect(validateLoginEmail('a@@example.test').valid).toBe(false);
    expect(validateLoginEmail('@example.test').valid).toBe(false);
  });

  it('uses only the defined Latin and Cyrillic case pairs for lookup', () => {
    expect(roomlyComparisonKey('AБЁé')).toBe('aбёé');
    expect(roomlyComparisonKey('e\u0301')).toBe('e\u0301');
  });
});
