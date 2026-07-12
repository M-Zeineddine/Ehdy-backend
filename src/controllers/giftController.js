'use strict';

const giftService = require('../services/giftService');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse } = require('../utils/formatters');

const getSentGifts = async (req, res, next) => {
  try {
    const { page, limit, sort_order } = req.query;
    const result = await giftService.getSentGifts(req.userId, { page, limit, sort_order });
    return paginatedResponse(res, result.gifts, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const getReceivedGifts = async (req, res, next) => {
  try {
    const { page, limit, sort_order, redemption_status } = req.query;
    const result = await giftService.getReceivedGifts(req.userId, { page, limit, sort_order, redemption_status });
    return paginatedResponse(res, result.gifts, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const claimGift = async (req, res, next) => {
  try {
    const { share_code } = req.params;
    const result = await giftService.claimGift(share_code, req.userId);
    return successResponse(res, { gift_sent: result.giftSent }, 'Gift claimed and added to your wallet!');
  } catch (err) {
    return next(err);
  }
};

const initiatePayment = async (req, res, next) => {
  try {
    const result = await giftService.initiateGiftPayment(req.userId, req.body);
    return successResponse(res, result, 'Payment initiated.', 201);
  } catch (err) {
    return next(err);
  }
};

const saveRetryDraft = async (req, res, next) => {
  try {
    const draft = await giftService.saveRetryDraft(req.userId, req.body);
    return successResponse(res, { draft_id: draft.id }, 'Draft saved.', 201);
  } catch (err) {
    return next(err);
  }
};

const getRetryDraft = async (req, res, next) => {
  try {
    const draft = await giftService.getRetryDraft(req.params.draft_id, req.userId);
    return successResponse(res, { draft });
  } catch (err) {
    return next(err);
  }
};

const deleteRetryDraft = async (req, res, next) => {
  try {
    await giftService.deleteRetryDraft(req.params.draft_id, req.userId);
    return successResponse(res, {}, 'Draft deleted.');
  } catch (err) {
    return next(err);
  }
};

const confirmPayment = async (req, res, next) => {
  try {
    const { tap_id } = req.body;
    if (!tap_id) return next(new AppError('tap_id is required', 400, 'MISSING_TAP_ID'));

    // fulfillGiftFromTap now does the authoritative Tap charge-retrieve itself
    // (DB-gated, exactly one fetch) and fulfils only a validated CAPTURED charge.
    // Do NOT pre-fetch here — that would be a second fetch on the confirm path.
    // It is idempotent and returns null if the webhook already fulfilled the
    // charge, so we read the authoritative gifts_sent state afterwards.
    await giftService.fulfillGiftFromTap(tap_id);

    const state = await giftService.getPaymentStateByChargeId(tap_id, req.userId);
    if (!state) {
      return next(new AppError('Gift not found for this charge', 404, 'GIFT_NOT_FOUND'));
    }

    // state.payment_status is the server's verdict (paid | pending | failed);
    // unique_share_link is null unless paid. The app renders success only on paid.
    return successResponse(res, state, 'Payment status retrieved.');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /v1/gifts/:id/payment-status
 * Pure read of the current gifts_sent state — does not verify the charge with
 * Tap and does not trigger fulfilment. 'pending' is a valid answer; the caller
 * decides whether to wait.
 */
const getPaymentStatus = async (req, res, next) => {
  try {
    const state = await giftService.getPaymentStateByGiftSentId(req.params.id, req.userId);
    if (!state) {
      return next(new AppError('Gift not found', 404, 'GIFT_NOT_FOUND'));
    }
    // state.unique_share_link is null unless payment_status === 'paid'.
    return successResponse(res, state);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getSentGifts,
  getPaymentStatus,
  getReceivedGifts,
  claimGift,
  initiatePayment,
  confirmPayment,
  saveRetryDraft,
  getRetryDraft,
  deleteRetryDraft,
};
