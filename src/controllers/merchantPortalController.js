'use strict';

const merchantPortalService = require('../services/merchantPortalService');
const redemptionService = require('../services/redemptionService');
const { successResponse, paginatedResponse } = require('../utils/formatters');
const { AppError } = require('../middleware/errorHandler');

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await merchantPortalService.merchantLogin({ email, password });
    return successResponse(res, result, 'Logged in successfully.');
  } catch (err) {
    return next(err);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const dashboard = await merchantPortalService.getMerchantDashboard(req.merchantId);
    return successResponse(res, { dashboard });
  } catch (err) {
    return next(err);
  }
};

const validateRedemption = async (req, res, next) => {
  try {
    const { redemption_code } = req.body;
    const result = await redemptionService.validateRedemptionCode(
      redemption_code.toUpperCase(),
      req.merchantId
    );
    return successResponse(res, result, 'Code is valid.');
  } catch (err) {
    return next(err);
  }
};

const sendRedemptionOtp = async (req, res, next) => {
  try {
    const { redemption_code } = req.body;
    if (!redemption_code) return next(new AppError('Redemption code is required', 400));
    await redemptionService.sendRedemptionOtp(redemption_code.toUpperCase());
    return successResponse(res, null, 'Verification code sent to recipient.');
  } catch (err) { return next(err); }
};

const verifyRedemptionOtp = async (req, res, next) => {
  try {
    const { redemption_code, code } = req.body;
    if (!redemption_code || !code) return next(new AppError('Redemption code and OTP are required', 400));
    await redemptionService.verifyRedemptionOtp(redemption_code.toUpperCase(), code);
    return successResponse(res, null, 'Recipient verified.');
  } catch (err) { return next(err); }
};

const confirmRedemption = async (req, res, next) => {
  try {
    const { redemption_code, amount_to_redeem, notes } = req.body;
    const result = await redemptionService.confirmRedemption(
      redemption_code.toUpperCase(),
      req.merchantId,
      { amount_to_redeem, notes, merchant_user_id: req.merchantUserId, branch_id: req.branchId || null }
    );
    return successResponse(res, result, 'Redemption confirmed.');
  } catch (err) {
    return next(err);
  }
};

const getRedemptions = async (req, res, next) => {
  try {
    const { page, limit, date_from, date_to } = req.query;
    const result = await redemptionService.getMerchantRedemptions(req.merchantId, {
      page,
      limit,
      date_from,
      date_to,
    });
    return paginatedResponse(res, result.redemptions, result.pagination);
  } catch (err) {
    return next(err);
  }
};

module.exports = { login, getDashboard, validateRedemption, sendRedemptionOtp, verifyRedemptionOtp, confirmRedemption, getRedemptions };
