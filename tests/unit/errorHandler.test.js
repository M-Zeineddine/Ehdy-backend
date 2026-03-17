'use strict';

const { AppError, notFoundHandler, errorHandler } = require('../../src/middleware/errorHandler');

// Suppress logger output during tests
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
}));

// ─── AppError ────────────────────────────────────────────────────────────────

describe('AppError', () => {
  test('sets message, statusCode, code, and isOperational', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.isOperational).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  test('uses default statusCode=500 and code=INTERNAL_ERROR', () => {
    const err = new AppError('Oops');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  test('stores details when provided', () => {
    const err = new AppError('Validation failed', 422, 'VALIDATION_ERROR', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });

  test('details is null when not provided', () => {
    const err = new AppError('Test', 400, 'TEST');
    expect(err.details).toBeNull();
  });

  test('has a stack trace pointing to this test file', () => {
    const err = new AppError('Test', 400, 'TEST');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('errorHandler.test.js');
  });

  test('is an instance of Error', () => {
    const err = new AppError('Test', 400, 'TEST');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AppError).toBe(true);
  });
});

// ─── notFoundHandler ─────────────────────────────────────────────────────────

describe('notFoundHandler', () => {
  test('calls next() with a 404 AppError containing method + url', () => {
    const req = { method: 'GET', originalUrl: '/v1/nonexistent' };
    const next = jest.fn();
    notFoundHandler(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('GET');
    expect(err.message).toContain('/v1/nonexistent');
  });

  test('works for any HTTP method', () => {
    const req = { method: 'DELETE', originalUrl: '/v1/gone' };
    const next = jest.fn();
    notFoundHandler(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.message).toContain('DELETE');
  });
});

// ─── errorHandler ─────────────────────────────────────────────────────────────

describe('errorHandler', () => {
  let req, jsonMock, statusMock, res, next;

  beforeEach(() => {
    req = { method: 'GET', path: '/test', user: undefined };
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    res = { status: statusMock };
    next = jest.fn();
  });

  function getBody() {
    return jsonMock.mock.calls[0][0];
  }

  test('returns correct status and code for AppError', () => {
    errorHandler(new AppError('Not found', 404, 'NOT_FOUND'), req, res, next);
    expect(statusMock).toHaveBeenCalledWith(404);
    expect(getBody().success).toBe(false);
    expect(getBody().error.code).toBe('NOT_FOUND');
    expect(getBody().error.message).toBe('Not found');
  });

  test('response always includes a timestamp', () => {
    errorHandler(new AppError('Test', 400, 'TEST'), req, res, next);
    expect(getBody().timestamp).toBeDefined();
    expect(() => new Date(getBody().timestamp)).not.toThrow();
  });

  test('includes error details when present', () => {
    const err = new AppError('Bad', 422, 'VALIDATION_ERROR', { field: 'email' });
    errorHandler(err, req, res, next);
    expect(getBody().error.details).toEqual({ field: 'email' });
  });

  test('omits details key when details is null', () => {
    errorHandler(new AppError('Test', 400, 'TEST'), req, res, next);
    expect(getBody().error).not.toHaveProperty('details');
  });

  // ── PostgreSQL error code mapping ──

  test('maps pg 23505 (unique violation) → 409 DUPLICATE_ENTRY', () => {
    errorHandler({ code: '23505', message: 'duplicate key' }, req, res, next);
    expect(statusMock).toHaveBeenCalledWith(409);
    expect(getBody().error.code).toBe('DUPLICATE_ENTRY');
  });

  test('maps pg 23503 (foreign key violation) → 400 INVALID_REFERENCE', () => {
    errorHandler({ code: '23503', message: 'fk violation' }, req, res, next);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(getBody().error.code).toBe('INVALID_REFERENCE');
  });

  test('maps pg 23514 (check constraint violation) → 400 CONSTRAINT_VIOLATION', () => {
    errorHandler({ code: '23514', message: 'check violation' }, req, res, next);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(getBody().error.code).toBe('CONSTRAINT_VIOLATION');
  });

  // ── JWT error mapping ──

  test('maps JsonWebTokenError → 401 INVALID_TOKEN', () => {
    errorHandler({ name: 'JsonWebTokenError', message: 'invalid sig' }, req, res, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(getBody().error.code).toBe('INVALID_TOKEN');
  });

  test('maps TokenExpiredError → 401 TOKEN_EXPIRED', () => {
    errorHandler({ name: 'TokenExpiredError', message: 'jwt expired' }, req, res, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(getBody().error.code).toBe('TOKEN_EXPIRED');
  });

  // ── Stripe error mapping ──

  test('maps Stripe errors → 402 PAYMENT_ERROR', () => {
    errorHandler({ type: 'StripeCardError', message: 'Card declined' }, req, res, next);
    expect(statusMock).toHaveBeenCalledWith(402);
    expect(getBody().error.code).toBe('PAYMENT_ERROR');
    expect(getBody().error.message).toBe('Card declined');
  });

  // ── Default ──

  test('defaults to 500 INTERNAL_ERROR for unknown errors', () => {
    errorHandler(new Error('Something broke'), req, res, next);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(getBody().error.code).toBe('INTERNAL_ERROR');
  });
});
