'use strict';

const {
  successResponse,
  errorResponse,
  paginatedResponse,
  sanitizeMerchant,
  sanitizeUser,
} = require('../../src/utils/formatters');

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status }, json, status };
}

// ─── sanitizeMerchant ─────────────────────────────────────────────────────────

describe('sanitizeMerchant', () => {
  test('removes stripe_account_id', () => {
    const merchant = { id: 'abc', name: 'Patchi', stripe_account_id: 'acct_secret' };
    const result = sanitizeMerchant(merchant);
    expect(result).not.toHaveProperty('stripe_account_id');
    expect(result.id).toBe('abc');
    expect(result.name).toBe('Patchi');
  });

  test('returns null for null input', () => {
    expect(sanitizeMerchant(null)).toBeNull();
  });

  test('does not mutate the original object', () => {
    const merchant = { id: 'abc', stripe_account_id: 'secret' };
    sanitizeMerchant(merchant);
    expect(merchant.stripe_account_id).toBe('secret');
  });

  test('passes through all other fields unchanged', () => {
    const merchant = {
      id: 'abc',
      name: 'Test',
      rating: '4.5',
      items: [{ id: 'item-1' }],
      stripe_account_id: 'secret',
    };
    const result = sanitizeMerchant(merchant);
    expect(result.rating).toBe('4.5');
    expect(result.items).toEqual([{ id: 'item-1' }]);
  });
});

// ─── sanitizeUser ─────────────────────────────────────────────────────────────

describe('sanitizeUser', () => {
  test('removes password_hash and stripe_customer_id', () => {
    const user = {
      id: 'abc',
      email: 'test@test.com',
      password_hash: '$2b$10$hashedvalue',
      stripe_customer_id: 'cus_secret',
    };
    const result = sanitizeUser(user);
    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('stripe_customer_id');
    expect(result.email).toBe('test@test.com');
  });

  test('returns null for null input', () => {
    expect(sanitizeUser(null)).toBeNull();
  });

  test('keeps all safe fields', () => {
    const user = {
      id: 'abc',
      email: 'test@test.com',
      first_name: 'Alice',
      password_hash: 'secret',
      stripe_customer_id: 'cus_secret',
    };
    const result = sanitizeUser(user);
    expect(result.first_name).toBe('Alice');
    expect(result.id).toBe('abc');
  });
});

// ─── successResponse ──────────────────────────────────────────────────────────

describe('successResponse', () => {
  test('sends 200 with success=true and data', () => {
    const { res, status, json } = mockRes();
    successResponse(res, { id: 1 });
    expect(status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 1 });
    expect(body.timestamp).toBeDefined();
  });

  test('accepts custom statusCode', () => {
    const { res, status } = mockRes();
    successResponse(res, {}, 'Created', 201);
    expect(status).toHaveBeenCalledWith(201);
  });

  test('includes message in response', () => {
    const { res, json } = mockRes();
    successResponse(res, {}, 'Done');
    expect(json.mock.calls[0][0].message).toBe('Done');
  });
});

// ─── errorResponse ────────────────────────────────────────────────────────────

describe('errorResponse', () => {
  test('sends 400 with success=false, error code and message', () => {
    const { res, status, json } = mockRes();
    errorResponse(res, 'SOME_ERROR', 'Something failed');
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('SOME_ERROR');
    expect(body.error.message).toBe('Something failed');
  });

  test('includes details when provided', () => {
    const { res, json } = mockRes();
    errorResponse(res, 'ERR', 'msg', 422, { field: 'email' });
    expect(json.mock.calls[0][0].error.details).toEqual({ field: 'email' });
  });

  test('omits details key when null', () => {
    const { res, json } = mockRes();
    errorResponse(res, 'ERR', 'msg', 400, null);
    expect(json.mock.calls[0][0].error).not.toHaveProperty('details');
  });
});

// ─── paginatedResponse ────────────────────────────────────────────────────────

describe('paginatedResponse', () => {
  test('includes data and pagination in response', () => {
    const { res, json } = mockRes();
    const pagination = { total: 100, page: 1, limit: 20, pages: 5 };
    paginatedResponse(res, [{ id: 1 }], pagination);
    const body = json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 1 }]);
    expect(body.pagination).toEqual(pagination);
  });

  test('always returns status 200', () => {
    const { res, status } = mockRes();
    paginatedResponse(res, [], {});
    expect(status).toHaveBeenCalledWith(200);
  });
});
