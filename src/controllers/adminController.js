'use strict';

const adminService = require('../services/adminService');
const { successResponse, paginatedResponse } = require('../utils/formatters');

const getSetupStatus = async (req, res, next) => {
  try {
    const status = await adminService.getSetupStatus();
    return successResponse(res, status);
  } catch (err) {
    return next(err);
  }
};

const setup = async (req, res, next) => {
  try {
    const result = await adminService.setupInitialAdmin(req.body);
    return successResponse(res, result, 'Admin owner created successfully.', 201);
  } catch (err) {
    return next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await adminService.login(req.body);
    return successResponse(res, result, 'Signed in successfully.');
  } catch (err) {
    return next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const adminUser = await adminService.getAdminById(req.adminUserId);
    return successResponse(res, { admin_user: adminUser });
  } catch (err) {
    return next(err);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const dashboard = await adminService.getDashboard();
    return successResponse(res, dashboard);
  } catch (err) {
    return next(err);
  }
};

const getReferenceData = async (req, res, next) => {
  try {
    const data = await adminService.getReferenceData();
    return successResponse(res, data);
  } catch (err) {
    return next(err);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const result = await adminService.listUsers(req.query);
    return paginatedResponse(res, result.users, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const user = await adminService.updateUserStatus(req.params.id, req.body);
    return successResponse(res, { user }, 'User status updated.');
  } catch (err) {
    return next(err);
  }
};

const listMerchants = async (req, res, next) => {
  try {
    const result = await adminService.listMerchants(req.query);
    return paginatedResponse(res, result.merchants, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const createMerchant = async (req, res, next) => {
  try {
    const merchant = await adminService.createMerchant(req.body);
    return successResponse(res, { merchant }, 'Merchant created.', 201);
  } catch (err) {
    return next(err);
  }
};

const updateMerchant = async (req, res, next) => {
  try {
    const merchant = await adminService.updateMerchant(req.params.id, req.body);
    return successResponse(res, { merchant }, 'Merchant updated.');
  } catch (err) {
    return next(err);
  }
};

const updateMerchantStatus = async (req, res, next) => {
  try {
    const merchant = await adminService.updateMerchantStatus(req.params.id, req.body);
    return successResponse(res, { merchant }, 'Merchant status updated.');
  } catch (err) {
    return next(err);
  }
};

const listItems = async (req, res, next) => {
  try {
    const result = await adminService.listItems(req.query);
    return paginatedResponse(res, result.items, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const createItem = async (req, res, next) => {
  try {
    const item = await adminService.createItem(req.body);
    return successResponse(res, { item }, 'Item created.', 201);
  } catch (err) {
    return next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const item = await adminService.updateItem(req.params.id, req.body);
    return successResponse(res, { item }, 'Item updated.');
  } catch (err) {
    return next(err);
  }
};

const updateItemStatus = async (req, res, next) => {
  try {
    const item = await adminService.updateItemStatus(req.params.id, req.body);
    return successResponse(res, { item }, 'Item status updated.');
  } catch (err) {
    return next(err);
  }
};

const listStoreCredits = async (req, res, next) => {
  try {
    const result = await adminService.listStoreCredits(req.query);
    return paginatedResponse(res, result.store_credits, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const createStoreCredit = async (req, res, next) => {
  try {
    const store_credit = await adminService.createStoreCredit(req.body);
    return successResponse(res, { store_credit }, 'Store credit preset created.', 201);
  } catch (err) {
    return next(err);
  }
};

const updateStoreCredit = async (req, res, next) => {
  try {
    const store_credit = await adminService.updateStoreCredit(req.params.id, req.body);
    return successResponse(res, { store_credit }, 'Store credit preset updated.');
  } catch (err) {
    return next(err);
  }
};

const updateStoreCreditStatus = async (req, res, next) => {
  try {
    const store_credit = await adminService.updateStoreCreditStatus(req.params.id, req.body);
    return successResponse(res, { store_credit }, 'Store credit status updated.');
  } catch (err) {
    return next(err);
  }
};

const listPurchases = async (req, res, next) => {
  try {
    const result = await adminService.listPurchases(req.query);
    return paginatedResponse(res, result.purchases, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const listGifts = async (req, res, next) => {
  try {
    const result = await adminService.listGifts(req.query);
    return paginatedResponse(res, result.gifts, result.pagination);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getSetupStatus,
  setup,
  login,
  me,
  getDashboard,
  getReferenceData,
  listUsers,
  updateUserStatus,
  listMerchants,
  createMerchant,
  updateMerchant,
  updateMerchantStatus,
  listItems,
  createItem,
  updateItem,
  updateItemStatus,
  listStoreCredits,
  createStoreCredit,
  updateStoreCredit,
  updateStoreCreditStatus,
  listPurchases,
  listGifts,
};
