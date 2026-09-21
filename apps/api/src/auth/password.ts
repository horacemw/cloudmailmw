import argon2 from 'argon2';

/**
 * Argon2id is a memory-hard password hash. Parameters chosen so verification is
 * ~100 ms on a modern CPU — slow enough to resist offline attacks, fast enough
 * for real logins.
 *
 * NOTE: Dovecot's ARGON2ID scheme uses the same PHC-formatted string, so
 * mailbox passwords hashed here can be handed directly to dovecot-auth via
 * the passdb query. See src/mail/mailboxPassword.ts.
 */
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Return a hash-shaped string the request handler can use to run a *fake*
 * verify against, keeping response time constant even when the user doesn't
 * exist. Prevents user-enumeration via login timing.
 */
export const TIMING_SAFE_DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$0nD5T8XCImrshLKI6PJ2VwWv9m6VnXXZlvHXtGpAvJk';
