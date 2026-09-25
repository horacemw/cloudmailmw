import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest picks up **/*.test.{ts,js,mjs} co-located with source files.
    include: ['src/**/*.test.ts'],
    // Exclude operational one-off scripts (they hit the real DB/Redis and
    // are meant to be run manually, not from CI).
    exclude: ['node_modules/**', 'dist/**', 'scripts/**'],
    // Setup file seeds process.env with dummy values so that env.ts's zod
    // schema validates successfully at import time. Tests that need real
    // Postgres/Redis should mark themselves .skip in CI or gate on a flag.
    setupFiles: ['src/test/setup-env.ts'],
    // Fail on unhandled rejection — a promise leak in a test is a bug.
    dangerouslyIgnoreUnhandledErrors: false,
    // 20s cap per test — most units finish in milliseconds; anything longer
    // is either an infra dependency (bad) or a genuine timeout worth surfacing.
    testTimeout: 20_000,
  },
});
