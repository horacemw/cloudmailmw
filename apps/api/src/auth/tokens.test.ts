import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccessToken, verifyAccessToken } from './tokens.js';
import { AppError } from '../lib/errors.js';

describe('access tokens', () => {
  it('round-trips: sign + verify returns the same userId', () => {
    const token = signAccessToken('user-abc-123');
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-abc-123');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken('user-abc-123');
    // Flip a byte in the middle of the payload segment.
    const parts = token.split('.');
    const munged = parts[1]!.slice(0, -3) + 'XXX';
    const bad = `${parts[0]}.${munged}.${parts[2]}`;
    expect(() => verifyAccessToken(bad)).toThrow(AppError);
    expect(() => verifyAccessToken(bad)).toThrow(/token_invalid|invalid|expired/i);
  });

  it('rejects a token signed with the wrong secret', () => {
    const attackerToken = jwt.sign({ sub: 'attacker' }, 'not-the-real-secret-32-chars-min-xyz', {
      algorithm: 'HS256',
      expiresIn: 900,
    });
    expect(() => verifyAccessToken(attackerToken)).toThrow(AppError);
  });

  it('rejects a token signed with a weaker algorithm (alg confusion)', () => {
    // A JWT signed with alg=none must be rejected by our verifier which
    // pins algorithms:['HS256'].
    // Manually construct a none-alg token — jsonwebtoken refuses to sign
    // alg:none from its own API, so we build it byte-by-byte.
    const b64 = (o: object): string =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const noneToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'attacker' })}.`;
    expect(() => verifyAccessToken(noneToken)).toThrow(AppError);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'user-x' }, process.env.JWT_ACCESS_SECRET!, {
      algorithm: 'HS256',
      expiresIn: -60, // already expired 60s ago
    });
    expect(() => verifyAccessToken(expired)).toThrow(AppError);
  });
});
