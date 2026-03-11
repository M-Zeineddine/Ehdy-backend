'use strict';

const merchantPortalService = require('../services/merchantPortalService');
const redemptionService = require('../services/redemptionService');
const { successResponse, paginatedResponse } = require('../utils/formatters');

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

const confirmRedemption = async (req, res, next) => {
  try {
    const { redemption_code, amount_to_redeem, notes } = req.body;
    const result = await redemptionService.confirmRedemption(
      redemption_code.toUpperCase(),
      req.merchantId,
      { amount_to_redeem, notes }
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

module.exports = { login, getDashboard, validateRedemption, confirmRedemption, getRedemptions };
