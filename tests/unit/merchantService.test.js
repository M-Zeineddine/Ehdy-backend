'use strict';

/**
 * Unit tests for merchantService.
 * Focus: input sanitisation, clamping, query construction, and error handling.
 * The database is mocked — no real connection required.
 */

jest.mock('../../src/utils/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  getClient: jest.fn(),
  // Use the real buildPagination so listMerchants pagination logic is exercised
  buildPagination: jest.requireActual('../../src/utils/database').buildPagination,
}));
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const { query } = require('../../src/utils/database');
const merchantService = require('../../src/services/merchantService');
const { merchants } = require('../helpers/factories');

beforeEach(() => jest.clearAllMocks());

// ─── getMerchantById ──────────────────────────────────────────────────────────

describe('getMerchantById', () => {
  test('throws 404 MERCHANT_NOT_FOUND when no row returned', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(merchantService.getMerchantById('bad-id'))
      .rejects.toMatchObject({ statusCode: 404, code: 'MERCHANT_NOT_FOUND' });
  });

  test('returns merchant with items and store_credit_presets attached', async () => {
    const merchant = merchants.active();
    const item = { id: 'item-1', name: 'Box', price: '25.00' };
    const preset = { id: 'preset-1', amount: '50.00', currency_code: 'USD' };

    query
      .mockResolvedValueOnce({ rows: [merchant] })   // merchant
      .mockResolvedValueOnce({ rows: [item] })        // items
      .mockResolvedValueOnce({ rows: [preset] });     // presets

    const result = await merchantService.getMerchantById(merchant.id);
    expect(result.items).toEqual([item]);
    expect(result.store_credit_presets).toEqual([preset]);
  });

  test('queries with the provided merchantId as a parameter', async () => {
    const id = 'specific-merchant-uuid';
    query.mockResolvedValueOnce({ rows: [] });
    try { await merchantService.getMerchantById(id); } catch (_) {}
    expect(query.mock.calls[0][1]).toContain(id);
  });
});

// ─── getRecentlyViewed — limit clamping ───────────────────────────────────────

describe('getRecentlyViewed — limit clamping', () => {
  // [input, expected SQL $2 value]
  test.each([
    [10,        10],
    [1,          1],
    [20,        20],
    [0,          10],  // 0 is falsy → parseInt(0)||10 = 10 (not clamped to 1)
    [-5,         1],   // negative → Math.max(1, -5) = 1
    [100,       20],   // clamp above max
    ['15',      15],   // string input
    ['abc',     10],   // non-numeric → default 10
    [undefined, 10],   // undefined → default 10
  ])('limit=%p → SQL param=%p', async (input, expected) => {
    query.mockResolvedValueOnce({ rows: [] });
    await merchantService.getRecentlyViewed('user-id', input);
    // $2 in the query is the limit parameter
    expect(query.mock.calls[0][1][1]).toBe(expected);
  });

  test('reads from user_merchant_last_visit (not the growing merchant_visits table)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await merchantService.getRecentlyViewed('user-id');
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('user_merchant_last_visit');
    expect(sql).not.toContain('FROM merchant_visits');
  });

  test('orders results by last_visited_at DESC', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await merchantService.getRecentlyViewed('user-id');
    expect(query.mock.calls[0][0]).toContain('last_visited_at DESC');
  });
});

// ─── getVisitAnalytics — days clamping ───────────────────────────────────────

describe('getVisitAnalytics — days clamping', () => {
  function setupQueryMocks() {
    query.mockResolvedValue({ rows: [{ total_visits: '0', unique_visitors: '0' }] });
  }

  test.each([
    [30,    30],
    [1,      1],
    [365,  365],
    [0,      30],   // 0 is falsy → parseInt(0)||30 = 30 (not clamped to 1)
    [-10,    1],    // negative → Math.max(1, -10) = 1
    [500,  365],    // over max → 365
    ['90',  90],    // string
    ['abc', 30],    // non-numeric → default 30
  ])('days=%p → SQL param=%p', async (input, expected) => {
    setupQueryMocks();
    await merchantService.getVisitAnalytics('merchant-id', input);
    // Both parallel queries receive the same $2 param
    expect(query.mock.calls[0][1][1]).toBe(expected);
  });

  test('uses parameterized interval — no string interpolation of the days value', async () => {
    setupQueryMocks();
    await merchantService.getVisitAnalytics('merchant-id', 30);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("$2::int * INTERVAL '1 day'");
    // Verify the days value (30) is not literally embedded in the SQL string
    expect(sql).not.toContain("INTERVAL '30");
  });

  test('returns parsed integers for total_visits and unique_visitors', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total_visits: '150', unique_visitors: '50' }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await merchantService.getVisitAnalytics('merchant-id');
    expect(typeof result.total_visits).toBe('number');
    expect(result.total_visits).toBe(150);
    expect(result.unique_visitors).toBe(50);
  });
});

// ─── recordVisit ─────────────────────────────────────────────────────────────

describe('recordVisit', () => {
  test('inserts into both merchant_visits and user_merchant_last_visit', async () => {
    query.mockResolvedValue({ rows: [] });
    await merchantService.recordVisit('merchant-id', 'user-id');
    expect(query).toHaveBeenCalledTimes(2);
    const sqls = query.mock.calls.map(c => c[0]);
    expect(sqls.some(s => s.includes('merchant_visits'))).toBe(true);
    expect(sqls.some(s => s.includes('user_merchant_last_visit'))).toBe(true);
  });

  test('upserts last_visit row on conflict', async () => {
    query.mockResolvedValue({ rows: [] });
    await merchantService.recordVisit('m-id', 'u-id');
    const upsertSql = query.mock.calls.find(([s]) => s.includes('ON CONFLICT'))?.[0];
    expect(upsertSql).toBeDefined();
    expect(upsertSql).toContain('DO UPDATE SET last_visited_at');
  });

  test('passes merchantId and userId as query parameters (not embedded in SQL)', async () => {
    const maliciousId = "'; DROP TABLE merchant_visits; --";
    query.mockResolvedValue({ rows: [] });
    await merchantService.recordVisit(maliciousId, 'user-id');
    query.mock.calls.forEach(([sql, params]) => {
      expect(sql).not.toContain(maliciousId);
      expect(params).toContain(maliciousId);
    });
  });
});

// ─── listMerchants ────────────────────────────────────────────────────────────

describe('listMerchants', () => {
  test('returns merchants list with pagination metadata', async () => {
    const merchant = merchants.active();
    query
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [merchant] });

    const result = await merchantService.listMerchants({ page: 1, limit: 20 });
    expect(result.merchants).toHaveLength(1);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.pages).toBe(1);
  });

  test('adds is_featured condition when is_featured=true', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await merchantService.listMerchants({ is_featured: true });
    query.mock.calls.forEach(([sql]) => expect(sql).toContain('is_featured'));
  });

  test('adds country_code condition when provided', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await merchantService.listMerchants({ country_code: 'LB' });
    query.mock.calls.forEach(([sql]) => expect(sql).toContain('country_code'));
  });

  test('adds ILIKE search condition when search is provided', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await merchantService.listMerchants({ search: 'patchi' });
    query.mock.calls.forEach(([sql]) => expect(sql).toContain('ILIKE'));
  });
});
