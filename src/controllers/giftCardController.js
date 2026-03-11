'use strict';

const giftCardService = require('../services/giftCardService');
const { successResponse } = require('../utils/formatters');

const getGiftCard = async (req, res, next) => {
  try {
    const giftCard = await giftCardService.getGiftCardById(req.params.id);
    return successResponse(res, { gift_card: giftCard });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getGiftCard };
