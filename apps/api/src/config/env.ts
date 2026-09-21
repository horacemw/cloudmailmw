import 'dotenv/config';
import { z } from 'zod';

/**
 * All environment access goes through this parsed object.
 * Fail fast at startup if anything critical is missing or malformed.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_APP_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  IMAP_HOST: z.string().default('127.0.0.1'),
  IMAP_PORT: z.coerce.number().int().positive().default(143),
  IMAP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  IMAP_STARTTLS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  SMTP_SUBMISSION_HOST: z.string().default('127.0.0.1'),
  SMTP_SUBMISSION_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SUBMISSION_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_SUBMISSION_STARTTLS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  DOVECOT_MASTER_USER: z.string().default('cloudmail-api'),
  DOVECOT_MASTER_PASSWORD: z.string().min(1),

  CLOUDMAIL_PLATFORM_DOMAIN: z.string().default('cloudmail.dev'),
  CLOUDMAIL_INITIAL_MAIL_HOST: z.string().default('mail.digiskills.live'),
  CLOUDMAIL_INITIAL_IPV4: z.string().default('167.233.22.55'),

  UPLOAD_TMP_DIR: z.string().default('./.uploads'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
