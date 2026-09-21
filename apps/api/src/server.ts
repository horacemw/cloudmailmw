import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import errorHandler from './plugins/errorHandler.js';
import authGuard from './plugins/authGuard.js';
import authRoutes from './routes/auth.js';
import domainsRoutes from './routes/domains.js';
import mailboxesRoutes from './routes/mailboxes.js';
import aliasesRoutes from './routes/aliases.js';
import mailRoutes from './routes/mail.js';
import migrationsRoutes from './routes/migrations.js';
import exportsRoutes from './routes/exports.js';
import clientConfigRoutes from './routes/clientConfig.js';
import sessionsRoutes from './routes/sessions.js';
import apiKeysRoutes from './routes/apiKeys.js';
import adminRelayRoutes from './routes/adminRelay.js';
import adminRoutes from './routes/admin.js';
import contactsRoutes from './routes/contacts.js';
import signaturesRoutes from './routes/signatures.js';
import filtersRoutes, { autoReplyRoutes } from './routes/filters.js';
import calendarRoutes from './routes/calendar.js';
import mfaRoutes from './routes/mfa.js';
import notificationsRoutes from './routes/notifications.js';
import avatarRoutes from './routes/avatar.js';
import healthRoutes from './routes/health.js';

async function build() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    disableRequestLogging: env.NODE_ENV === 'production',
    ajv: { customOptions: { removeAdditional: 'all' } },
  });

  await app.register(helmet, {
    // Frontend is on a different origin in dev; strict CSP is applied by the web server (nginx) in prod.
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });
  await app.register(cors, {
    origin: [env.PUBLIC_APP_URL],
    credentials: true,
  });
  await app.register(cookie);
  await app.register(sensible);
  await app.register(rateLimit, {
    global: false, // opted-in per route
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB per attachment
  });

  await app.register(errorHandler);
  await app.register(authGuard);

  // Routes
  await app.register(healthRoutes, { prefix: '/v1' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(domainsRoutes, { prefix: '/v1/domains' });
  await app.register(mailboxesRoutes, { prefix: '/v1/mailboxes' });
  await app.register(aliasesRoutes, { prefix: '/v1/aliases' });
  await app.register(mailRoutes, { prefix: '/v1/mail' });
  await app.register(migrationsRoutes, { prefix: '/v1/migrations' });
  await app.register(exportsRoutes, { prefix: '/v1/exports' });
  await app.register(clientConfigRoutes, { prefix: '/v1' });
  await app.register(sessionsRoutes, { prefix: '/v1/sessions' });
  await app.register(apiKeysRoutes, { prefix: '/v1/api-keys' });
  await app.register(mfaRoutes, { prefix: '/v1/auth/mfa' });
  await app.register(contactsRoutes, { prefix: '/v1/contacts' });
  await app.register(signaturesRoutes, { prefix: '/v1/signatures' });
  await app.register(filtersRoutes, { prefix: '/v1/filters' });
  await app.register(autoReplyRoutes, { prefix: '/v1/auto-reply' });
  await app.register(calendarRoutes, { prefix: '/v1' });
  await app.register(notificationsRoutes, { prefix: '/v1/notifications' });
  await app.register(avatarRoutes, { prefix: '/v1' });
  await app.register(adminRelayRoutes, { prefix: '/v1/admin/mail-relay' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });

  return app;
}

const app = await build();

app.listen({ host: env.API_HOST, port: env.API_PORT }).then(() => {
  logger.info({ url: `http://${env.API_HOST}:${env.API_PORT}` }, 'cloudmail api listening');
});

// Graceful shutdown so Postgres connections drain cleanly.
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
