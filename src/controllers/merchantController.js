'use strict';

const merchantService = require('../services/merchantService');
const { successResponse, paginatedResponse, sanitizeMerchant } = require('../utils/formatters');

const listMerchants = async (req, res, next) => {
  try {
    const { category_id, search, country_code, page, limit, featured } = req.query;
    const result = await merchantService.listMerchants({
      category_id,
      search,
      country_code,
      page,
      limit,
      is_featured: featured === 'true',
    });
    return paginatedResponse(
      res,
      result.merchants.map(sanitizeMerchant),
      result.pagination
    );
  } catch (err) {
    return next(err);
  }
};

const getMerchant = async (req, res, next) => {
  try {
    const merchant = await merchantService.getMerchantById(req.params.id);
    // Record visit inline — no extra round-trip needed from the client.
    // Truly fire-and-forget: DB errors must NOT fail this request.
    if (req.user) {
      merchantService.recordVisit(req.params.id, req.user.id).catch(() => {});
    }
    return successResponse(res, { merchant: sanitizeMerchant(merchant) });
  } catch (err) {
    return next(err);
  }
};

const listCategories = async (req, res, next) => {
  try {
    const categories = await merchantService.listCategories();
    return successResponse(res, { categories });
  } catch (err) {
    return next(err);
  }
};

const listMerchantItems = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const items = await merchantService.listMerchantItems({ limit: limit ? parseInt(limit) : 6 });
    return successResponse(res, { items });
  } catch (err) {
    return next(err);
  }
};

const getRecentlyViewed = async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const merchants = await merchantService.getRecentlyViewed(req.user.id, limit);
    return successResponse(res, { recently_viewed: merchants });
  } catch (err) {
    return next(err);
  }
};

module.exports = { listMerchants, getMerchant, listCategories, listMerchantItems, getRecentlyViewed };
