'use strict';

/**
 * Unit tests for auth middleware.
 * The DB is mocked — no real database connection required.
 */

jest.mock('../../src/utils/database');
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { query } = require('../../src/utils/database');
const { authenticate, optionalAuthenticate, authenticateAdmin } = require('../../src/middleware/auth');

const SECRET = 'test-jwt-secret-kado-2024-unit';

function makeToken(payload, secret = SECRET, options = {}) {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...options });
}

function mockUser(id = 'user-id-123') {
  return { id, email: 'test@test.com', first_name: 'Test', last_name: 'User' };
}

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('authenticate', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  test('calls next(TOKEN_REQUIRED) when no Authorization header', async () => {
    await authenticate(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_REQUIRED');
  });

  test('calls next(TOKEN_REQUIRED) when Authorization is not Bearer', async () => {
    req.headers.authorization = 'Basic dXNlcjpwYXNz';
    await authenticate(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('TOKEN_REQUIRED');
  });

  test('calls next(TOKEN_REQUIRED) when Bearer has no token', async () => {
    req.headers.authorization = 'Bearer ';
    await authenticate(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('TOKEN_REQUIRED');
  });

  test('calls next(TOKEN_EXPIRED) for an expired token', async () => {
    const token = makeToken({ userId: 'abc' }, SECRET, { expiresIn: '-1s' });
    req.headers.authorization = `Bearer ${token}`;
    await authenticate(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('TOKEN_EXPIRED');
    expect(err.statusCode).toBe(401);
  });

  test('calls next(INVALID_TOKEN) for a tampered/invalid token', async () => {
    req.headers.authorization = 'Bearer header.payload.badsignature';
    await authenticate(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_TOKEN');
    expect(err.statusCode).toBe(401);
  });

  test('calls next(INVALID_TOKEN) for token signed with wrong secret', async () => {
    const token = makeToken({ userId: 'abc' }, 'wrong-secret');
    req.headers.authorization = `Bearer ${token}`;
    await authenticate(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_TOKEN');
  });

  test('calls next(USER_NOT_FOUND) when user not in DB', async () => {
    const token = makeToken({ userId: 'ghost-user' });
    req.headers.authorization = `Bearer ${token}`;
    query.mockResolvedValueOnce({ rows: [] });
    await authenticate(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('USER_NOT_FOUND');
    expect(err.statusCode).toBe(401);
  });

  test('attaches user + userId to req and calls next() with no error', async () => {
    const userId = 'valid-user-id';
    const token = makeToken({ userId });
    req.headers.authorization = `Bearer ${token}`;
    query.mockResolvedValueOnce({ rows: [mockUser(userId)] });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(); // no argument = no error
    expect(req.user.id).toBe(userId);
    expect(req.userId).toBe(userId);
  });

  test('queries DB with the userId from the token', async () => {
    const userId = 'specific-user-id';
    const token = makeToken({ userId });
    req.headers.authorization = `Bearer ${token}`;
    query.mockResolvedValueOnce({ rows: [mockUser(userId)] });

    await authenticate(req, res, next);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      [userId]
    );
  });
});

// ─── optionalAuthenticate ─────────────────────────────────────────────────────

describe('optionalAuthenticate', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  test('calls next() without error when no token is present', async () => {
    await optionalAuthenticate(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  test('attaches user when a valid token is provided', async () => {
    const token = makeToken({ userId: 'user-123' });
    req.headers.authorization = `Bearer ${token}`;
    query.mockResolvedValueOnce({ rows: [mockUser('user-123')] });

    await optionalAuthenticate(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user-123');
  });

  test('silently ignores an invalid token and calls next()', async () => {
    req.headers.authorization = 'Bearer invalid.token.string';
    await optionalAuthenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(); // no error propagated
    expect(req.user).toBeUndefined();
  });

  test('silently ignores an expired token and calls next()', async () => {
    const token = makeToken({ userId: 'abc' }, SECRET, { expiresIn: '-1s' });
    req.headers.authorization = `Bearer ${token}`;
    await optionalAuthenticate(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });
});

// ─── authenticateAdmin ────────────────────────────────────────────────────────

describe('authenticateAdmin', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  test('rejects a regular user token (missing type=admin)', async () => {
    const token = makeToken({ userId: 'user-123' }); // no type field
    req.headers.authorization = `Bearer ${token}`;
    await authenticateAdmin(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_TOKEN');
  });

  test('rejects a merchant token (type=merchant, not admin)', async () => {
    const token = makeToken({ merchantUserId: 'mu-123', type: 'merchant' });
    req.headers.authorization = `Bearer ${token}`;
    await authenticateAdmin(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_TOKEN');
  });

  test('accepts a valid admin token and attaches admin to req', async () => {
    const adminId = 'admin-uuid-abc';
    const token = makeToken({ adminId, type: 'admin' });
    req.headers.authorization = `Bearer ${token}`;
    query.mockResolvedValueOnce({
      rows: [{ id: adminId, email: 'admin@kado.app', role: 'super_admin' }],
    });

    await authenticateAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.admin.id).toBe(adminId);
    expect(req.adminId).toBe(adminId);
  });

  test('rejects when admin not found in DB', async () => {
    const token = makeToken({ adminId: 'ghost', type: 'admin' });
    req.headers.authorization = `Bearer ${token}`;
    query.mockResolvedValueOnce({ rows: [] });

    await authenticateAdmin(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('USER_NOT_FOUND');
  });
});
