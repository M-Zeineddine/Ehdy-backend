'use strict';

const purchaseService = require('../services/purchaseService');
const { successResponse, paginatedResponse } = require('../utils/formatters');

const createPurchase = async (req, res, next) => {
  try {
    const { items, currency_code, payment_method } = req.body;
    const result = await purchaseService.createPurchase(req.userId, {
      items,
      currency_code,
      payment_method,
    });
    return successResponse(
      res,
      {
        purchase_id: result.purchase.id,
        client_secret: result.client_secret,
        payment_intent_id: result.payment_intent_id,
        total_amount: result.purchase.total_amount,
        currency_code: result.purchase.currency_code,
      },
      'Purchase initiated. Complete payment to receive your gift cards.',
      201
    );
  } catch (err) {
    return next(err);
  }
};

const getPurchaseHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await purchaseService.getUserPurchases(req.userId, { page, limit });
    return paginatedResponse(res, result.purchases, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const getPurchase = async (req, res, next) => {
  try {
    const purchase = await purchaseService.getPurchaseById(req.params.id, req.userId);
    return successResponse(res, { purchase });
  } catch (err) {
    return next(err);
  }
};

module.exports = { createPurchase, getPurchaseHistory, getPurchase };
