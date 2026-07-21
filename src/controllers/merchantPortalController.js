'use strict';

const multer = require('multer');
const crypto = require('crypto');
const { getStorage, MERCHANT_ASSETS_BUCKET } = require('../config/supabase');
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

// Same shape as login's merchant_user — clients re-fetch this at startup so a
// cached account never goes stale when roles/branch scope change server-side.
const getMe = async (req, res, next) => {
  try {
    const merchant_user = {
      id: req.merchant.id,
      email: req.merchant.email,
      first_name: req.merchant.first_name,
      last_name: req.merchant.last_name,
      merchant_id: req.merchant.merchant_id,
      merchant_name: req.merchant.merchant_name,
      role: req.merchant.role,
      branch_ids: req.branchIds,
    };
    return successResponse(res, { merchant_user });
  } catch (err) {
    return next(err);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const dashboard = await merchantPortalService.getMerchantDashboard(req.merchantId, req.branchIds, req.merchant.role);
    return successResponse(res, { dashboard });
  } catch (err) {
    return next(err);
  }
};

const getPurchases = async (req, res, next) => {
  try {
    const { page, limit, period } = req.query;
    const result = await merchantPortalService.getMerchantPurchases(req.merchantId, { page, limit, period });
    return paginatedResponse(res, result.purchases, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const getActiveCodes = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await merchantPortalService.listActiveCodes(req.merchantId, { page, limit });
    return paginatedResponse(res, result.codes, result.pagination);
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
    const { page, limit, period } = req.query;
    const result = await redemptionService.getMerchantRedemptions(req.merchantId, {
      page,
      limit,
      period,
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

// ─── Image upload (Supabase Storage, served from the public CDN URL) ─────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const uploadImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new AppError('Only JPEG, PNG or WebP images are allowed', 400, 'INVALID_IMAGE_TYPE'));
    }
    return cb(null, true);
  },
}).single('image');

const uploadImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('Image file is required (field name: image)', 400, 'IMAGE_REQUIRED'));
    }
    const key = `merchants/${req.merchantId}/${crypto.randomUUID()}.${IMAGE_EXT[req.file.mimetype]}`;
    const storage = getStorage();
    const { error } = await storage
      .from(MERCHANT_ASSETS_BUCKET)
      .upload(key, req.file.buffer, { contentType: req.file.mimetype });
    if (error) {
      return next(new AppError(`Image upload failed: ${error.message}`, 502, 'UPLOAD_FAILED'));
    }
    const { data } = storage.from(MERCHANT_ASSETS_BUCKET).getPublicUrl(key);
    return successResponse(res, { id: key, url: data.publicUrl }, 'Image uploaded.');
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  login, getMe, getDashboard, validateRedemption, sendRedemptionOtp, verifyRedemptionOtp,
  confirmRedemption, getRedemptions, getPurchases, getActiveCodes,
  listBranches, createBranch, updateBranch,
  listItems, createItem, updateItem,
  listStaff, createStaff, updateStaff,
  getProfile, updateProfile,
  uploadImageMiddleware, uploadImage,
};
