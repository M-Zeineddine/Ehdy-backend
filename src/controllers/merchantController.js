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

module.exports = { listMerchants, getMerchant, listCategories, listMerchantItems };
