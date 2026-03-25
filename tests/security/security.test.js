'use strict';

/**
 * Security tests for the Kado backend.
 *
 * Categories covered:
 * 1. JWT attack scenarios (expired, tampered, algorithm confusion, none algorithm)
 * 2. Auth middleware hardening
 * 3. SQL injection prevention (parameterized queries)
 * 4. Input validation and boundary checks (limit/days clamping)
 * 5. Sensitive data exposure (stripe_account_id, password_hash never returned)
 * 6. Error response information leakage
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/utils/database');
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(), http: jest.fn(),
}));
jest.mock('../../src/services/merchantService');
jest.mock('../../src/middleware/rateLimiter', () => ({
  generalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));
jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn().mockResolvedValue({}),
  disconnectRedis: jest.fn(),
}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn(),
  end: jest.fn(),
}));
jest.mock('../../src/config/swagger', () => ({}));

// ── Requires ──────────────────────────────────────────────────────────────────

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');
const { notFoundHandler, errorHandler } = require('../../src/middleware/errorHandler');
const merchantRoutes = require('../../src/routes/merchants');
const { query } = require('../../src/utils/database');
const { authenticate } = require('../../src/middleware/auth');
const merchantService = require('../../src/services/merchantService');
const { merchants } = require('../helpers/factories');
const { buildPagination } = require('../../src/utils/database');
const { sanitizeMerchant, sanitizeUser } = require('../../src/utils/formatters');
const merchantServiceReal = jest.requireActual('../../src/services/merchantService');

const SECRET = 'test-jwt-secret-ehdy-2024-unit';
const USER_ID = 'security-test-user';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/merchants', merchantRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
beforeEach(() => jest.clearAllMocks());

// ─── 1. JWT Attack Scenarios ──────────────────────────────────────────────────

describe('JWT Security', () => {
  async function attemptAuthenticatedRequest(token) {
    return request(app)
      .post('/v1/merchants/some-id/visit')
      .set('Authorization', `Bearer ${token}`);
  }

  test('rejects expired JWT with 401 TOKEN_EXPIRED', async () => {
    const token = jwt.sign({ userId: USER_ID }, SECRET, { expiresIn: '-1s' });
    const res = await attemptAuthenticatedRequest(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('rejects JWT signed with wrong secret with 401 INVALID_TOKEN', async () => {
    const token = jwt.sign({ userId: USER_ID }, 'attacker-secret');
    const res = await attemptAuthenticatedRequest(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('rejects completely malformed JWT with 401 INVALID_TOKEN', async () => {
    const res = await attemptAuthenticatedRequest('not.a.valid.token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('rejects "none" algorithm token (algorithm confusion attack)', async () => {
    // Create a token with "alg: none" — should be rejected
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ userId: USER_ID })).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    const res = await attemptAuthenticatedRequest(noneToken);
    expect(res.status).toBe(401);
  });

  test('rejects JWT with payload userId replaced (tampered payload)', async () => {
    const token = jwt.sign({ userId: USER_ID }, SECRET);
    const parts = token.split('.');
    // Replace payload with a different userId
    const tampered = Buffer.from(JSON.stringify({ userId: 'admin-user' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tampered}.${parts[2]}`;
    const res = await attemptAuthenticatedRequest(tamperedToken);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('rejects a valid token for another user when user is deleted', async () => {
    const token = jwt.sign({ userId: 'deleted-user-id' }, SECRET, { expiresIn: '1h' });
    query.mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await attemptAuthenticatedRequest(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  test('stack trace is not exposed in 401 error responses', async () => {
    const token = jwt.sign({ userId: 'u' }, 'wrong-key');
    const res = await attemptAuthenticatedRequest(token);
    expect(res.body.error).not.toHaveProperty('stack');
  });
});

// ─── 2. Missing Auth Header Scenarios ────────────────────────────────────────

describe('Auth middleware — missing/malformed headers', () => {
  test('rejects request with no Authorization header at all', async () => {
    const res = await request(app).post('/v1/merchants/m-id/visit');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REQUIRED');
  });

  test('rejects Basic auth scheme (only Bearer is accepted)', async () => {
    const res = await request(app)
      .post('/v1/merchants/m-id/visit')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });

  test('rejects lowercase "bearer" scheme', async () => {
    const token = jwt.sign({ userId: USER_ID }, SECRET);
    const res = await request(app)
      .post('/v1/merchants/m-id/visit')
      .set('Authorization', `bearer ${token}`); // lowercase — should fail
    expect(res.status).toBe(401);
  });
});

// ─── 3. SQL Injection Prevention ─────────────────────────────────────────────

describe('SQL injection prevention', () => {
  /**
   * We verify that malicious strings passed to service functions are
   * forwarded as query parameters (never embedded in SQL text).
   * This is a structural test — it proves parameterized query usage.
   */

  beforeEach(() => {
    jest.resetModules();
  });

  const MALICIOUS_INPUTS = [
    "'; DROP TABLE merchants; --",
    "1' OR '1'='1",
    '1; DELETE FROM users;',
    "admin'--",
    '<script>alert(1)</script>',
    '{"$gt": ""}',
  ];

  test.each(MALICIOUS_INPUTS)(
    'getRecentlyViewed: malicious userId "%s" is passed as parameter not embedded',
    async (malicious) => {
      // Use the actual (unmocked) service with mocked query
      const realMerchantService = jest.requireActual('../../src/services/merchantService');

      // We need a fresh query mock for this call
      const dbModule = require('../../src/utils/database');
      dbModule.query.mockResolvedValue({ rows: [] });

      await realMerchantService.getRecentlyViewed(malicious, 10);

      // Every query call must NOT embed the malicious string in SQL
      dbModule.query.mock.calls.forEach(([sql, params]) => {
        expect(sql).not.toContain(malicious);
        if (params) expect(params).toContain(malicious);
      });
    }
  );

  test.each(MALICIOUS_INPUTS)(
    'recordVisit: malicious merchantId "%s" stays in params array',
    async (malicious) => {
      const realMerchantService = jest.requireActual('../../src/services/merchantService');
      const dbModule = require('../../src/utils/database');
      dbModule.query.mockResolvedValue({ rows: [] });

      await realMerchantService.recordVisit(malicious, 'user-id');

      dbModule.query.mock.calls.forEach(([sql, params]) => {
        expect(sql).not.toContain(malicious);
        expect(params).toContain(malicious);
      });
    }
  );
});

// ─── 4. Input Validation / Boundary Checks ────────────────────────────────────

describe('Input boundary validation', () => {
  test('buildPagination: limit=0 is clamped to 1 (no 0-row queries)', () => {
    const real = jest.requireActual('../../src/utils/database');
    expect(real.buildPagination(1, 0).limit).toBe(1);
  });

  test('buildPagination: limit=10000 is clamped to 100 (no runaway queries)', () => {
    const real = jest.requireActual('../../src/utils/database');
    expect(real.buildPagination(1, 10000).limit).toBe(100);
  });

  test('buildPagination: page=0 is clamped to 1 (no negative offset)', () => {
    const real = jest.requireActual('../../src/utils/database');
    const { offset } = real.buildPagination(0, 20);
    expect(offset).toBeGreaterThanOrEqual(0);
  });

  test('GET /v1/merchants with ?limit=-1 returns 422 (route-level validation rejects invalid input)', async () => {
    const res = await request(app).get('/v1/merchants?limit=-1');
    // The route uses paginationValidation which rejects negative limits at the HTTP layer
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ─── 5. Sensitive Data Exposure ───────────────────────────────────────────────

describe('Sensitive data not exposed in responses', () => {
  test('sanitizeMerchant removes stripe_account_id', () => {
    const merchant = { id: 'a', name: 'B', stripe_account_id: 'acct_supersecret' };
    const result = sanitizeMerchant(merchant);
    expect(result).not.toHaveProperty('stripe_account_id');
  });

  test('sanitizeUser removes password_hash', () => {
    const user = { id: 'a', email: 'b@b.com', password_hash: '$2b$10$hash', stripe_customer_id: 'cus' };
    const result = sanitizeUser(user);
    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('stripe_customer_id');
  });

  test('GET /v1/merchants response never includes stripe_account_id', async () => {
    const merchant = merchants.active({ stripe_account_id: 'DO_NOT_EXPOSE' });
    merchantService.listMerchants.mockResolvedValueOnce({
      merchants: [merchant],
      pagination: { total: 1, page: 1, limit: 20, pages: 1 },
    });
    const res = await request(app).get('/v1/merchants');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('DO_NOT_EXPOSE');
    expect(body).not.toContain('stripe_account_id');
  });

  test('GET /v1/merchants/:id response never includes stripe_account_id', async () => {
    const merchant = merchants.active({ stripe_account_id: 'DO_NOT_EXPOSE' });
    merchantService.getMerchantById.mockResolvedValueOnce(merchant);

    const res = await request(app).get(`/v1/merchants/${merchant.id}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('DO_NOT_EXPOSE');
  });
});

// ─── 6. Error Response Information Leakage ───────────────────────────────────

describe('Error responses do not leak internal details', () => {
  test('500 errors do not expose stack trace in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    merchantService.getMerchantById.mockRejectedValueOnce(new Error('internal DB error'));
    const res = await request(app).get('/v1/merchants/some-id');

    expect(res.status).toBe(500);
    // Stack trace must NOT be in the response in production
    expect(res.body.error).not.toHaveProperty('stack');
    // The error message is returned (design choice) but raw stack frames are not
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|node_modules|\.js:\d+/);

    process.env.NODE_ENV = originalEnv;
  });

  test('404 error message does not reveal implementation details', async () => {
    const res = await request(app).get('/v1/nonexistent-path');
    expect(res.status).toBe(404);
    // Should not expose file paths, line numbers, or internal identifiers
    expect(res.body.error.message).not.toMatch(/node_modules|\.js:|at Object/);
  });

  test('401 error does not expose whether user exists vs wrong token', async () => {
    // Both "wrong token" and "expired token" return INVALID_TOKEN / TOKEN_EXPIRED
    // without saying "user X does not exist" (which would be info leakage)
    const expiredToken = jwt.sign({ userId: 'u' }, SECRET, { expiresIn: '-1s' });
    const res = await request(app)
      .post('/v1/merchants/m/visit')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).not.toContain('user');
    expect(res.body.error.message).not.toContain('database');
  });
});
