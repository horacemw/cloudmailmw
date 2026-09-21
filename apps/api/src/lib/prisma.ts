import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Single Prisma client per process. In dev, avoid recreating on hot reload.
 */
declare global {
  // eslint-disable-next-line no-var
  var __cloudmail_prisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__cloudmail_prisma__ ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV === 'development') {
  globalThis.__cloudmail_prisma__ = prisma;
}
