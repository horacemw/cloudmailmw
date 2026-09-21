import pino from 'pino';
import { env } from '../config/env.js';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: 'cloudmail-api' },
  redact: {
    // Structured redaction — nothing sensitive ever hits logs.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
      'req.body.sourceSecret',
      '*.password',
      '*.passwordHash',
      '*.secret',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.dkimPrivateKey',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,app',
        },
      }
    : undefined,
});
