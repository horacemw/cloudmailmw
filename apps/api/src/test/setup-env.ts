/**
 * Vitest env setup — runs before test modules are imported.
 *
 * The api's config/env.ts uses zod safeParse and process.exit(1) on any
 * missing/malformed required var. That's the right behaviour for a real
 * server startup, but for unit tests it means we have to seed
 * process.env BEFORE env.ts loads.
 *
 * Every value here is a syntactically valid placeholder. None points at
 * real infrastructure — a test that accidentally tries to reach out
 * (dialing Postgres, opening a socket) will fail loudly rather than
 * silently authenticating against a real system.
 */

process.env.NODE_ENV ??= 'test';
process.env.PUBLIC_APP_URL ??= 'http://localhost:5173';
process.env.PUBLIC_API_URL ??= 'http://localhost:4000';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test?schema=public';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379/15';
process.env.JWT_ACCESS_SECRET ??= 'test-only-access-secret-32-chars-min-abcdef';
process.env.JWT_REFRESH_SECRET ??= 'test-only-refresh-secret-32-chars-min-abcdef';
process.env.DOVECOT_MASTER_PASSWORD ??= 'test-only-master-password';
process.env.CLOUDMAIL_INITIAL_MAIL_HOST ??= 'mail.test.example';
