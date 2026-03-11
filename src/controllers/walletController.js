'use strict';

const walletService = require('../services/walletService');
const { successResponse, paginatedResponse } = require('../utils/formatters');

const getWallet = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const result = await walletService.getWalletItems(req.userId, { page, limit, status });
    return res.status(200).json({
      success: true,
      data: result.items,
      summary: result.summary,
      pagination: result.pagination,
      message: 'Wallet retrieved.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
};

const getWalletItem = async (req, res, next) => {
  try {
    const item = await walletService.getWalletItem(req.params.id, req.userId);
    return successResponse(res, { item });
  } catch (err) {
    return next(err);
  }
};

const toggleFavorite = async (req, res, next) => {
  try {
    const result = await walletService.toggleFavorite(req.params.id, req.userId);
    return successResponse(res, result, result.is_favorite ? 'Added to favorites.' : 'Removed from favorites.');
  } catch (err) {
    return next(err);
  }
};

const updateNotes = async (req, res, next) => {
  try {
    const { custom_message } = req.body;
    const result = await walletService.updateNotes(req.params.id, req.userId, { custom_message });
    return successResponse(res, result, 'Notes updated.');
  } catch (err) {
    return next(err);
  }
};

module.exports = { getWallet, getWalletItem, toggleFavorite, updateNotes };
