import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, TIMING_SAFE_DUMMY_HASH } from './password.js';

describe('password', () => {
  it('produces an argon2id PHC string of the expected shape', async () => {
    const hash = await hashPassword('a-real-password-97');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash.length).toBeGreaterThan(80); // PHC string is ~97 chars
  });

  it('round-trips: verifyPassword(hash, correctPlain) is true', async () => {
    const plain = 'CorrectHorseBatteryStaple!';
    const hash = await hashPassword(plain);
    await expect(verifyPassword(hash, plain)).resolves.toBe(true);
  });

  it('rejects the wrong password with false (not throw)', async () => {
    const hash = await hashPassword('right-password');
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('rejects a malformed hash with false, not throw', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false);
  });

  it('two hashes of the same plaintext are different (unique salt)', async () => {
    const a = await hashPassword('same-plain');
    const b = await hashPassword('same-plain');
    expect(a).not.toBe(b);
    await expect(verifyPassword(a, 'same-plain')).resolves.toBe(true);
    await expect(verifyPassword(b, 'same-plain')).resolves.toBe(true);
  });

  it('TIMING_SAFE_DUMMY_HASH is a valid argon2id PHC string that never verifies', async () => {
    expect(TIMING_SAFE_DUMMY_HASH).toMatch(/^\$argon2id\$/);
    // The dummy must NEVER verify against a real password — its purpose is
    // to burn CPU for constant-time timing on the no-user path.
    await expect(verifyPassword(TIMING_SAFE_DUMMY_HASH, 'any-guess')).resolves.toBe(false);
  });
});
