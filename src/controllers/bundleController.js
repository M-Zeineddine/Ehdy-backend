'use strict';

const bundleService = require('../services/bundleService');
const { successResponse, paginatedResponse } = require('../utils/formatters');

const createBundle = async (req, res, next) => {
  try {
    const { name, description, theme, items, is_template, image_url } = req.body;
    const bundle = await bundleService.createBundle(req.userId, {
      name,
      description,
      theme,
      items,
      is_template,
      image_url,
    });
    return successResponse(res, { bundle }, 'Bundle created.', 201);
  } catch (err) {
    return next(err);
  }
};

const getUserBundles = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await bundleService.getUserBundles(req.userId, { page, limit });
    return paginatedResponse(res, result.bundles, result.pagination);
  } catch (err) {
    return next(err);
  }
};

const getBundle = async (req, res, next) => {
  try {
    const bundle = await bundleService.getBundleById(req.params.id, req.userId);
    return successResponse(res, { bundle });
  } catch (err) {
    return next(err);
  }
};

const sendBundle = async (req, res, next) => {
  try {
    const {
      recipient_name,
      recipient_email,
      recipient_phone,
      delivery_channel,
      personal_message,
      theme,
      sender_name,
      stripe_payment_intent_id,
    } = req.body;

    const result = await bundleService.sendBundle(req.params.id, req.userId, {
      recipient_name,
      recipient_email,
      recipient_phone,
      delivery_channel,
      personal_message,
      theme,
      sender_name,
      stripe_payment_intent_id,
    });

    return successResponse(res, { gift_sent: result.giftSent, share_code: result.shareCode }, 'Bundle gift sent!');
  } catch (err) {
    return next(err);
  }
};

module.exports = { createBundle, getUserBundles, getBundle, sendBundle };
