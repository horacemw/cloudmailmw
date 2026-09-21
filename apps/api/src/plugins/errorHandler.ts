import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Uniform JSON error envelope. Never leak stack traces or driver messages
 * to clients; the frontend can key off `code` for user-visible copy.
 */
const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
      });
    }
    // Fastify rate-limit
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({
        error: { code: 'rate_limited', message: 'Too many requests' },
      });
    }
    // Fastify built-in errors carry a statusCode + code. Respect the status
    // rather than blindly returning 500 — 400 body-empty, 415 unsupported media,
    // 413 payload too large, etc are legitimate client errors, not server bugs.
    const anyErr = err as {
      statusCode?: number;
      code?: string;
      validation?: unknown;
      message?: string;
      name?: string;
    };
    if (anyErr.statusCode === 400 && anyErr.validation) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: anyErr.message ?? 'Validation failed',
          details: anyErr.validation,
        },
      });
    }
    if (
      typeof anyErr.statusCode === 'number' &&
      anyErr.statusCode >= 400 &&
      anyErr.statusCode < 500
    ) {
      return reply.code(anyErr.statusCode).send({
        error: {
          code: anyErr.code ?? 'client_error',
          message: anyErr.message ?? 'Bad request',
        },
      });
    }
    // Anything else = unexpected. Log with context, tell the client nothing.
    logger.error(
      {
        err,
        route: req.url,
        method: req.method,
        reqId: req.id,
      },
      'unhandled error',
    );
    return reply.code(500).send({
      error: { code: 'internal_error', message: 'Something went wrong' },
    });
  });
};

export default fp(plugin, { name: 'error-handler' });
