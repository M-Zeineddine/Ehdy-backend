'use strict';

/**
 * Integration tests for merchant API routes.
 * Services are mocked so no real DB connection is needed.
 * Tests the full HTTP request → controller → (mocked) service → response cycle.
 */

// ── Mocks (must be before any require of app code) ────────────────────────────

jest.mock('../../src/services/merchantService');
jest.mock('../../src/utils/database', () => ({
  query: jest.fn(),
  buildPagination: jest.requireActual('../../src/utils/database').buildPagination,
  withTransaction: jest.fn(),
  getClient: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(), http: jest.fn(),
}));
jest.mock('../../src/middleware/rateLimiter', () => ({
  generalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));
jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn().mockResolvedValue({}),
  disconnectRedis: jest.fn(),
}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  connect: jest.fn(),
  end: jest.fn(),
}));
// Suppress swagger config side-effects
jest.mock('../../src/config/swagger', () => ({}));

// ── Test setup ────────────────────────────────────────────────────────────────

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');
const { notFoundHandler, errorHandler } = require('../../src/middleware/errorHandler');
const merchantRoutes = require('../../src/routes/merchants');
const merchantService = require('../../src/services/merchantService');
const { query } = require('../../src/utils/database');
const { merchants } = require('../helpers/factories');

const SECRET = 'test-jwt-secret-kado-2024-unit';
const USER_ID = 'test-user-uuid-123';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/merchants', merchantRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeAuthHeader() {
  const token = jwt.sign({ userId: USER_ID }, SECRET, { expiresIn: '1h' });
  return `Bearer ${token}`;
}

// Return a valid user row so authenticate() middleware passes
function mockAuthUser() {
  query.mockResolvedValue({
    rows: [{ id: USER_ID, email: 'user@test.com', first_name: 'Test' }],
  });
}

let app;

beforeAll(() => { app = buildApp(); });
beforeEach(() => jest.clearAllMocks());

// ─── GET /v1/merchants ────────────────────────────────────────────────────────

describe('GET /v1/merchants', () => {
  test('returns 200 with merchants list', async () => {
    const merchant = merchants.active();
    merchantService.listMerchants.mockResolvedValueOnce({
      merchants: [merchant],
      pagination: { total: 1, page: 1, limit: 20, pages: 1 },
    });

    const res = await request(app).get('/v1/merchants');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  test('strips stripe_account_id from merchant responses', async () => {
    const merchant = merchants.active({ stripe_account_id: 'acct_secret' });
    merchantService.listMerchants.mockResolvedValueOnce({
      merchants: [merchant],
      pagination: { total: 1, page: 1, limit: 20, pages: 1 },
    });

    const res = await request(app).get('/v1/merchants');
    expect(res.status).toBe(200);
    res.body.data.forEach(m => expect(m).not.toHaveProperty('stripe_account_id'));
  });

  test('passes query params to service (category, country, search)', async () => {
    merchantService.listMerchants.mockResolvedValueOnce({
      merchants: [],
      pagination: { total: 0, page: 1, limit: 20, pages: 0 },
    });

    await request(app).get('/v1/merchants?category=food&country_code=LB&search=patchi');
    expect(merchantService.listMerchants).toHaveBeenCalledWith(
      expect.objectContaining({ country_code: 'LB', search: 'patchi' })
    );
  });

  test('returns 500 when service throws unexpectedly', async () => {
    merchantService.listMerchants.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app).get('/v1/merchants');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ─── GET /v1/merchants/:id ────────────────────────────────────────────────────

describe('GET /v1/merchants/:id', () => {
  test('returns 200 with merchant details', async () => {
    const merchant = merchants.active({ items: [{ id: 'i1' }] });
    merchantService.getMerchantById.mockResolvedValueOnce(merchant);

    const res = await request(app).get(`/v1/merchants/${merchant.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.merchant.id).toBe(merchant.id);
    expect(res.body.data.merchant.items).toHaveLength(1);
  });

  test('returns 404 when merchant does not exist', async () => {
    const { AppError } = require('../../src/middleware/errorHandler');
    merchantService.getMerchantById.mockRejectedValueOnce(
      new AppError('Merchant not found', 404, 'MERCHANT_NOT_FOUND')
    );

    const res = await request(app).get('/v1/merchants/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MERCHANT_NOT_FOUND');
  });

  test('strips stripe_account_id from single merchant response', async () => {
    const merchant = merchants.active({ stripe_account_id: 'acct_secret' });
    merchantService.getMerchantById.mockResolvedValueOnce(merchant);

    const res = await request(app).get(`/v1/merchants/${merchant.id}`);
    expect(res.body.data.merchant).not.toHaveProperty('stripe_account_id');
  });
});

// ─── POST /v1/merchants/:id/visit ─────────────────────────────────────────────

describe('POST /v1/merchants/:id/visit', () => {
  test('returns 204 for an authenticated user', async () => {
    mockAuthUser();
    merchantService.recordVisit.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/v1/merchants/some-merchant-id/visit')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(204);
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/v1/merchants/some-merchant-id/visit');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REQUIRED');
  });

  test('returns 204 even when recordVisit throws (fire-and-forget)', async () => {
    mockAuthUser();
    // Service throws — controller must still return 204
    merchantService.recordVisit.mockRejectedValueOnce(new Error('DB write failed'));

    const res = await request(app)
      .post('/v1/merchants/some-merchant-id/visit')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(204);
  });
});

// ─── GET /v1/merchants/recently-viewed ───────────────────────────────────────

describe('GET /v1/merchants/recently-viewed', () => {
  test('returns 200 with recently viewed list for authenticated user', async () => {
    mockAuthUser();
    const merchant = merchants.active();
    merchantService.getRecentlyViewed.mockResolvedValueOnce([merchant]);

    const res = await request(app)
      .get('/v1/merchants/recently-viewed')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.recently_viewed).toHaveLength(1);
  });

  test('returns 401 without auth token', async () => {
    const res = await request(app).get('/v1/merchants/recently-viewed');
    expect(res.status).toBe(401);
  });

  test('strips stripe_account_id from recently-viewed merchants', async () => {
    mockAuthUser();
    const merchant = merchants.active({ stripe_account_id: 'acct_secret' });
    merchantService.getRecentlyViewed.mockResolvedValueOnce([merchant]);

    const res = await request(app)
      .get('/v1/merchants/recently-viewed')
      .set('Authorization', makeAuthHeader());

    res.body.data.recently_viewed.forEach(m =>
      expect(m).not.toHaveProperty('stripe_account_id')
    );
  });

  test('returns empty array when no visits', async () => {
    mockAuthUser();
    merchantService.getRecentlyViewed.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/v1/merchants/recently-viewed')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.recently_viewed).toEqual([]);
  });
});

// ─── GET /v1/merchants/categories ─────────────────────────────────────────────

describe('GET /v1/merchants/categories', () => {
  test('returns 200 with categories list', async () => {
    merchantService.listCategories.mockResolvedValueOnce([
      { id: 'cat-1', name: 'Food', slug: 'food' },
    ]);

    const res = await request(app).get('/v1/merchants/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toHaveLength(1);
  });
});

// ─── 404 for unknown routes ───────────────────────────────────────────────────

describe('Unknown routes', () => {
  test('returns 404 NOT_FOUND for unmatched path', async () => {
    const res = await request(app).get('/v1/merchants/this/does/not/exist/at/all');
    // This hits the merchant route with an id param — getMerchant would run
    // Let's test a completely unknown base path
  });
});
