'use strict';

const giftService = require('../services/giftService');
const { successResponse, paginatedResponse } = require('../utils/formatters');

const createDraft = async (req, res, next) => {
  try {
    const draft = await giftService.createDraft(req.userId, req.body);
    return successResponse(res, { draft }, 'Gift draft created.', 201);
  } catch (err) {
    return next(err);
  }
};

const updateDraft = async (req, res, next) => {
  try {
    const draft = await giftService.updateDraft(req.params.draft_id, req.userId, req.body);
    return successResponse(res, { draft }, 'Draft updated.');
  } catch (err) {
    return next(err);
  }
};

const getDraftPreview = async (req, res, next) => {
  try {
    const draft = await giftService.getDraftPreview(req.params.draft_id, req.userId);
    return successResponse(res, { draft });
  } catch (err) {
    return next(err);
  }
};

const sendFromDraft = async (req, res, next) => {
  try {
    const { stripe_payment_intent_id } = req.body;
    const result = await giftService.sendFromDraft(req.params.draft_id, req.userId, {
      stripe_payment_intent_id,
    });
    return successResponse(res, {
      gift_instance: result.giftInstance,
      share_code: result.shareCode,
    }, 'Gift sent successfully!');
  } catch (err) {
    return next(err);
  }
};

const sendGift = async (req, res, next) => {
  try {
    const result = await giftService.sendGiftDirect(req.userId, req.body);
    return successResponse(res, {
      gift_instance: result.giftInstance,
      share_code: result.shareCode,
    }, 'Gift sent successfully!', 201);
  } catch (err) {
    return next(err);
  }
};

const getSentGifts = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await giftService.getSentGifts(req.userId, { page, limit });
    return paginatedResponse(res, result.gifts, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const getReceivedGifts = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await giftService.getReceivedGifts(req.userId, { page, limit });
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

module.exports = {
  createDraft,
  updateDraft,
  getDraftPreview,
  sendFromDraft,
  sendGift,
  getSentGifts,
  getReceivedGifts,
  claimGift,
  initiatePayment,
};
