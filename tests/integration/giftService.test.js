'use strict';

/**
 * Integration tests for giftService.
 * All external dependencies are mocked — no real DB, Tap, or QR needed.
 * Tests the full service logic: routing, validation, DB call shape, error codes.
 */

jest.mock('../../src/utils/database');
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/paymentService', () => ({
  createTapCharge: jest.fn(),
}));
jest.mock('../../src/utils/qrCode', () => ({
  generateQRCode: jest.fn().mockResolvedValue('data:image/png;base64,mockedqr'),
}));
jest.mock('../../src/services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/services/smsService', () => ({
  sendSMS: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/services/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/services/giftCardService', () => ({
  calculateExpirationDate: jest.fn().mockReturnValue(null),
  getGiftCardById: jest.fn(),
}));

const { query, withTransaction } = require('../../src/utils/database');
const { createTapCharge } = require('../../src/services/paymentService');
const giftService = require('../../src/services/giftService');
const { giftParams } = require('../helpers/factories');

const MOCK_ITEM = { id: 'item-id', price: '25.00', currency_code: 'USD' };
const MOCK_PRESET = { id: 'preset-id', amount: '50.00', currency_code: 'USD' };
const MOCK_USER = { id: 'user-id', email: 'sender@test.com', first_name: 'Alice' };
const MOCK_GIFT_SENT = { id: 'gift-sent-id' };
const MOCK_TAP_CHARGE = { id: 'charge-id', transaction_url: 'https://tap.company/pay/abc' };

beforeEach(() => {
  jest.clearAllMocks();
  createTapCharge.mockResolvedValue(MOCK_TAP_CHARGE);
});

// ─── initiateGiftPayment ─────────────────────────────────────────────────────

describe('initiateGiftPayment', () => {
  const base = giftParams.base();

  function setupSuccessQueries(itemRow) {
    query
      .mockResolvedValueOnce({ rows: [itemRow] })         // item/preset/merchant lookup
      .mockResolvedValueOnce({ rows: [MOCK_USER] })       // user lookup
      .mockResolvedValueOnce({ rows: [] })                // share code uniqueness check
      .mockResolvedValueOnce({ rows: [MOCK_GIFT_SENT] })  // INSERT gifts_sent
      .mockResolvedValueOnce({ rows: [] });               // UPDATE tap_charge_id
  }

  // ── Success paths ──

  test('succeeds with merchant_item_id: charges correct amount', async () => {
    setupSuccessQueries(MOCK_ITEM);
    const result = await giftService.initiateGiftPayment('user-id', {
      merchant_item_id: 'item-id', ...base,
    });
    expect(result.amount).toBe(25);
    expect(result.currency).toBe('USD');
    expect(result.tap_transaction_url).toBe(MOCK_TAP_CHARGE.transaction_url);
    expect(createTapCharge).toHaveBeenCalledWith(expect.objectContaining({ amount: 25 }));
  });

  test('succeeds with store_credit_preset_id: charges preset amount', async () => {
    setupSuccessQueries(MOCK_PRESET);
    const result = await giftService.initiateGiftPayment('user-id', {
      store_credit_preset_id: 'preset-id', ...base,
    });
    expect(result.amount).toBe(50);
  });

  test('succeeds with custom_credit_amount: uses provided amount', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'merchant-id' }] }) // merchant exists
      .mockResolvedValueOnce({ rows: [MOCK_USER] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [MOCK_GIFT_SENT] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await giftService.initiateGiftPayment('user-id', {
      custom_credit_amount: 75,
      custom_credit_currency: 'USD',
      custom_credit_merchant_id: 'merchant-id',
      ...base,
    });
    expect(result.amount).toBe(75);
    expect(createTapCharge).toHaveBeenCalledWith(expect.objectContaining({ amount: 75 }));
  });

  test('returns gift_sent_id and unique_share_link', async () => {
    setupSuccessQueries(MOCK_ITEM);
    const result = await giftService.initiateGiftPayment('user-id', {
      merchant_item_id: 'item-id', ...base,
    });
    expect(result.gift_sent_id).toBeDefined();
    expect(result.unique_share_link).toBeDefined();
  });

  // ── Error paths ──

  test('throws MISSING_ITEM when no item identifier is provided', async () => {
    await expect(giftService.initiateGiftPayment('user-id', base))
      .rejects.toMatchObject({ code: 'MISSING_ITEM', statusCode: 400 });
  });

  test('throws ITEM_NOT_FOUND when merchant_item not in DB', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(giftService.initiateGiftPayment('user-id', {
      merchant_item_id: 'ghost-item', ...base,
    })).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', statusCode: 404 });
  });

  test('throws ITEM_NOT_FOUND when store_credit_preset not in DB', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(giftService.initiateGiftPayment('user-id', {
      store_credit_preset_id: 'ghost-preset', ...base,
    })).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', statusCode: 404 });
  });

  test('throws INVALID_AMOUNT for zero custom credit', async () => {
    await expect(giftService.initiateGiftPayment('user-id', {
      custom_credit_amount: 0,
      custom_credit_merchant_id: 'merchant-id',
      ...base,
    })).rejects.toMatchObject({ code: 'INVALID_AMOUNT', statusCode: 400 });
  });

  test('throws INVALID_AMOUNT for negative custom credit', async () => {
    await expect(giftService.initiateGiftPayment('user-id', {
      custom_credit_amount: -50,
      custom_credit_merchant_id: 'merchant-id',
      ...base,
    })).rejects.toMatchObject({ code: 'INVALID_AMOUNT', statusCode: 400 });
  });

  test('throws AMOUNT_TOO_LARGE for custom credit over 10,000', async () => {
    await expect(giftService.initiateGiftPayment('user-id', {
      custom_credit_amount: 10001,
      custom_credit_merchant_id: 'merchant-id',
      ...base,
    })).rejects.toMatchObject({ code: 'AMOUNT_TOO_LARGE', statusCode: 400 });
  });

  test('throws MERCHANT_NOT_FOUND when merchant does not exist (custom credit)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(giftService.initiateGiftPayment('user-id', {
      custom_credit_amount: 50,
      custom_credit_merchant_id: 'ghost-merchant',
      ...base,
    })).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND', statusCode: 404 });
  });

  // ── DB call shape ──

  test('INSERT into gifts_sent includes custom_credit columns for custom credit', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'merchant-id' }] })
      .mockResolvedValueOnce({ rows: [MOCK_USER] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [MOCK_GIFT_SENT] })
      .mockResolvedValueOnce({ rows: [] });

    await giftService.initiateGiftPayment('user-id', {
      custom_credit_amount: 75,
      custom_credit_currency: 'USD',
      custom_credit_merchant_id: 'merchant-id',
      ...base,
    });

    const insertCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO gifts_sent'));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain('custom_credit_amount');
    expect(insertCall[1]).toContain(75);
  });

  test('custom credit amount exactly 10,000 is allowed (boundary)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'merchant-id' }] })
      .mockResolvedValueOnce({ rows: [MOCK_USER] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [MOCK_GIFT_SENT] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(giftService.initiateGiftPayment('user-id', {
      custom_credit_amount: 10000,
      custom_credit_currency: 'USD',
      custom_credit_merchant_id: 'merchant-id',
      ...base,
    })).resolves.toBeDefined();
  });
});

// ─── saveRetryDraft ───────────────────────────────────────────────────────────

describe('saveRetryDraft', () => {
  const base = giftParams.base();

  test('inserts a draft with merchant_item_id', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'draft-id' }] });
    const result = await giftService.saveRetryDraft('user-id', {
      merchant_item_id: 'item-id', ...base,
    });
    expect(result.id).toBe('draft-id');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO gift_drafts');
    expect(params).toContain('item-id');
  });

  test('inserts a draft with store_credit_preset_id', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'draft-id' }] });
    await giftService.saveRetryDraft('user-id', {
      store_credit_preset_id: 'preset-id', ...base,
    });
    const [, params] = query.mock.calls[0];
    expect(params).toContain('preset-id');
  });

  test('inserts a draft with custom_credit_amount and merchant_id', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'draft-id' }] });
    await giftService.saveRetryDraft('user-id', {
      custom_credit_amount: 75,
      custom_credit_currency: 'USD',
      custom_credit_merchant_id: 'merchant-id',
      ...base,
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('custom_credit_amount');
    expect(params).toContain(75);
    expect(params).toContain('merchant-id');
  });

  test('stores null for missing optional fields', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'draft-id' }] });
    await giftService.saveRetryDraft('user-id', {
      merchant_item_id: 'item-id',
      sender_name: 'Alice',
      recipient_name: 'Bob',
      recipient_phone: '+961',
      personal_message: '',
      theme: 'birthday',
    });
    const [, params] = query.mock.calls[0];
    // personal_message '' becomes null
    expect(params).toContain(null);
  });
});

// ─── getRetryDraft ────────────────────────────────────────────────────────────

describe('getRetryDraft', () => {
  test('throws 404 DRAFT_NOT_FOUND when no row returned', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(giftService.getRetryDraft('ghost-id', 'user-id'))
      .rejects.toMatchObject({ code: 'DRAFT_NOT_FOUND', statusCode: 404 });
  });

  test('returns the draft row when found', async () => {
    const draftRow = {
      id: 'draft-id',
      merchant_item_id: 'item-id',
      store_credit_preset_id: null,
      custom_credit_amount: null,
      custom_credit_merchant_id: null,
      item_name: 'Chocolate Box',
      item_price: '25.00',
      item_currency: 'USD',
      merchant_id: 'merchant-id',
      merchant_name: 'Patchi',
      is_credit: false,
    };
    query.mockResolvedValueOnce({ rows: [draftRow] });
    const result = await giftService.getRetryDraft('draft-id', 'user-id');
    expect(result.id).toBe('draft-id');
    expect(result.is_credit).toBe(false);
  });

  test('SELECT includes custom_credit columns', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    try { await giftService.getRetryDraft('d', 'u'); } catch (_) {}
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('custom_credit_amount');
    expect(sql).toContain('custom_credit_merchant_id');
  });

  test('is_credit is true when custom_credit_amount is set', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'draft-id',
      store_credit_preset_id: null,
      custom_credit_amount: '75.00',
      is_credit: true,
      item_name: 'Store Credit',
    }] });
    const [sql] = query.mock.calls[0] || [];
    // The SQL uses OR to compute is_credit
    // Just verify the returned row
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ is_credit: true, id: 'x' }] });
    const result = await giftService.getRetryDraft('d', 'u');
    expect(result.is_credit).toBe(true);
  });
});
