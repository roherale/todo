import { describe, expect, it } from 'vitest';
import { SignupBodySchema } from './profile.js';

const ok = { displayName: 'Ana', timezone: 'America/Mexico_City' };

describe('profile schemas', () => {
  it('UC-SIGNUP-04: rejects a timezone that is not an IANA zone', () => {
    for (const timezone of ['Mars/Olympus', '+01:00', 'mexico', '']) {
      expect(SignupBodySchema.safeParse({ ...ok, timezone }).success, timezone).toBe(false);
    }
    expect(SignupBodySchema.safeParse({ ...ok, timezone: 'UTC' }).success).toBe(true);
  });

  it('UC-SIGNUP-04: rejects an empty or blank displayName', () => {
    for (const displayName of ['', '   ']) {
      expect(SignupBodySchema.safeParse({ ...ok, displayName }).success).toBe(false);
    }
  });

  it('UC-SIGNUP-01: an email in the body is rejected, because email comes from the token', () => {
    expect(SignupBodySchema.safeParse({ ...ok, email: 'x@example.com' }).success).toBe(false);
  });

  it('UC-SIGNUP-04: avatarUrl must be an absolute https URL of at most 2048 characters', () => {
    const good = 'https://example.com/a.png';
    expect(SignupBodySchema.safeParse({ ...ok, avatarUrl: good }).success).toBe(true);
    const bad = ['http://example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/a.png', 'a.png', `https://example.com/${'a'.repeat(2048)}`];
    for (const avatarUrl of bad) {
      expect(SignupBodySchema.safeParse({ ...ok, avatarUrl }).success, avatarUrl).toBe(false);
    }
    expect(SignupBodySchema.safeParse({ ...ok, avatarUrl: `https://e.com/${'a'.repeat(2033)}` }).success).toBe(true);
  });

});
