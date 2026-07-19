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
    const dashboard = await merchantPortalService.getMerchantDashboard(req.merchantId, req.branchIds);
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
    const { redemption_code, amount_to_redeem, notes, branch_id } = req.body;
    const result = await redemptionService.confirmRedemption(
      redemption_code.toUpperCase(),
      req.merchantId,
      {
        amount_to_redeem,
        notes,
        merchant_user_id: req.merchantUserId,
        branch_id: branch_id || req.branchId || null,
        scoped_branch_ids: req.branchIds,
      }
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
      branchIds: req.branchIds,
    });
    return paginatedResponse(res, result.redemptions, result.pagination);
  } catch (err) {
    return next(err);
  }
};

// ─── Branches ─────────────────────────────────────────────────────────────────

const listBranches = async (req, res, next) => {
  try {
    const branches = await merchantPortalService.listBranches(req.merchantId);
    return successResponse(res, { branches });
  } catch (err) { return next(err); }
};

const createBranch = async (req, res, next) => {
  try {
    const branch = await merchantPortalService.createBranch(req.merchantId, req.body);
    return successResponse(res, { branch }, 'Branch created.', 201);
  } catch (err) { return next(err); }
};

const updateBranch = async (req, res, next) => {
  try {
    const branch = await merchantPortalService.updateBranch(req.merchantId, req.params.id, req.body);
    return successResponse(res, { branch }, 'Branch updated.');
  } catch (err) { return next(err); }
};

// ─── Items ────────────────────────────────────────────────────────────────────

const listItems = async (req, res, next) => {
  try {
    const items = await merchantPortalService.listItems(req.merchantId);
    return successResponse(res, { items });
  } catch (err) { return next(err); }
};

const createItem = async (req, res, next) => {
  try {
    const item = await merchantPortalService.createItem(req.merchantId, req.body);
    return successResponse(res, { item }, 'Item created.', 201);
  } catch (err) { return next(err); }
};

const updateItem = async (req, res, next) => {
  try {
    const item = await merchantPortalService.updateItem(req.merchantId, req.params.id, req.body);
    return successResponse(res, { item }, 'Item updated.');
  } catch (err) { return next(err); }
};

// ─── Staff ────────────────────────────────────────────────────────────────────

const listStaff = async (req, res, next) => {
  try {
    const staff = await merchantPortalService.listStaff(req.merchantId);
    return successResponse(res, { staff });
  } catch (err) { return next(err); }
};

const createStaff = async (req, res, next) => {
  try {
    const staff = await merchantPortalService.createStaff(req.merchantId, req.body);
    return successResponse(res, { staff }, 'Staff account created.', 201);
  } catch (err) { return next(err); }
};

const updateStaff = async (req, res, next) => {
  try {
    const staff = await merchantPortalService.updateStaff(req.merchantId, req.params.id, req.body);
    return successResponse(res, { staff }, 'Staff account updated.');
  } catch (err) { return next(err); }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

const getProfile = async (req, res, next) => {
  try {
    const profile = await merchantPortalService.getProfile(req.merchantId);
    return successResponse(res, { profile });
  } catch (err) { return next(err); }
};

const updateProfile = async (req, res, next) => {
  try {
    const profile = await merchantPortalService.updateProfile(req.merchantId, req.body);
    return successResponse(res, { profile }, 'Profile updated.');
  } catch (err) { return next(err); }
};

module.exports = {
  login, getDashboard, validateRedemption, sendRedemptionOtp, verifyRedemptionOtp,
  confirmRedemption, getRedemptions,
  listBranches, createBranch, updateBranch,
  listItems, createItem, updateItem,
  listStaff, createStaff, updateStaff,
  getProfile, updateProfile,
};
