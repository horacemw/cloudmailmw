import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Shared Redis client for sessions, rate limits, and short-lived state.
 * BullMQ constructs its own connection with a separate maxRetriesPerRequest=null policy.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (err: Error) => {
  // Never let a transient Redis blip crash the process — reconnection is automatic.
  if (err.message.includes('ECONNREFUSED')) return;
});
