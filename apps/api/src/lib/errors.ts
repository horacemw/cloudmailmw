/**
 * Domain errors. Fastify's error handler maps these to JSON responses with
 * a stable `code` field so the frontend can react to specific failure modes.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  badRequest: (code: string, message: string, details?: unknown) =>
    new AppError(400, code, message, details),
  unauthorized: (code = 'unauthorized', message = 'Authentication required') =>
    new AppError(401, code, message),
  forbidden: (code = 'forbidden', message = 'You do not have access to this resource') =>
    new AppError(403, code, message),
  notFound: (code = 'not_found', message = 'Resource not found') =>
    new AppError(404, code, message),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  unprocessable: (code: string, message: string, details?: unknown) =>
    new AppError(422, code, message, details),
  tooManyRequests: (code = 'rate_limited', message = 'Too many requests') =>
    new AppError(429, code, message),
  internal: (code = 'internal_error', message = 'Something went wrong') =>
    new AppError(500, code, message),
  serviceUnavailable: (code = 'unavailable', message = 'The service is unavailable') =>
    new AppError(503, code, message),
};
