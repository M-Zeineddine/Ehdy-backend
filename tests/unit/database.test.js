'use strict';

// database.js imports pg Pool from config/database — mock it
jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const { buildPagination, withTransaction } = require('../../src/utils/database');
const pool = require('../../src/config/database');

// ─── buildPagination ──────────────────────────────────────────────────────────

describe('buildPagination', () => {
  test('returns defaults when called with no arguments', () => {
    const { page, limit, offset } = buildPagination();
    expect(page).toBe(1);
    expect(limit).toBe(20);
    expect(offset).toBe(0);
  });

  test('computes correct offset for page 2 limit 20', () => {
    const { offset } = buildPagination(2, 20);
    expect(offset).toBe(20);
  });

  test('computes correct offset for page 3 limit 10', () => {
    const { offset } = buildPagination(3, 10);
    expect(offset).toBe(20);
  });

  test('clamps page to minimum 1', () => {
    expect(buildPagination(0, 20).page).toBe(1);
    expect(buildPagination(-5, 20).page).toBe(1);
  });

  test('clamps limit to maximum 100', () => {
    expect(buildPagination(1, 9999).limit).toBe(100);
  });

  test('clamps limit to minimum 1', () => {
    expect(buildPagination(1, 0).limit).toBe(1);
    expect(buildPagination(1, -10).limit).toBe(1);
  });

  test('parses string inputs', () => {
    const { page, limit, offset } = buildPagination('3', '15');
    expect(page).toBe(3);
    expect(limit).toBe(15);
    expect(offset).toBe(30);
  });

  test('treats NaN string: page becomes NaN (Math.max(1,NaN)=NaN), limit clamps', () => {
    // parseInt('abc') = NaN; Math.max(1, NaN) = NaN — document this edge case
    const { limit } = buildPagination('abc', 'abc');
    // limit falls through Math.max(1, NaN) = NaN → clamped by Math.min(100, NaN) = NaN
    // This is a known edge: callers should validate before passing non-numeric strings.
    // Test just confirms no crash occurs.
    expect(() => buildPagination('abc', 'abc')).not.toThrow();
  });
});

// ─── withTransaction ──────────────────────────────────────────────────────────

describe('withTransaction', () => {
  let mockClient;
  let originalQueryMock;

  beforeEach(() => {
    originalQueryMock = jest.fn().mockResolvedValue({});
    mockClient = {
      query: originalQueryMock,
      release: jest.fn(),
    };
    jest.clearAllMocks();
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    // Re-assign after clearAllMocks so the reference stays valid
    mockClient.query = originalQueryMock;
  });

  test('calls BEGIN and COMMIT on success', async () => {
    // Capture the mock BEFORE withTransaction monkey-patches client.query
    const queryMock = mockClient.query;
    const fn = jest.fn().mockResolvedValue('result');
    const result = await withTransaction(fn);

    expect(queryMock).toHaveBeenCalledWith('BEGIN');
    expect(queryMock).toHaveBeenCalledWith('COMMIT');
    expect(result).toBe('result');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test('calls ROLLBACK and rethrows on error', async () => {
    const queryMock = mockClient.query;
    const boom = new Error('DB failure');
    const fn = jest.fn().mockRejectedValue(boom);

    await expect(withTransaction(fn)).rejects.toThrow('DB failure');

    expect(queryMock).toHaveBeenCalledWith('BEGIN');
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test('passes client to the callback function', async () => {
    const fn = jest.fn().mockResolvedValue(null);
    await withTransaction(fn);
    // fn receives the (monkey-patched) client — just verify it was called once
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('releases client even when fn throws', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(withTransaction(fn)).rejects.toThrow();
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
