'use strict';

/**
 * Send a successful JSON response.
 */
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Send an error JSON response.
 */
const errorResponse = (res, code, message, statusCode = 400, details = null) => {
  const body = {
    success: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  };
  if (details !== null) {
    body.error.details = details;
  }
  return res.status(statusCode).json(body);
};

/**
 * Send a paginated success response.
 */
const paginatedResponse = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    data,
    pagination,
    message,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Strip sensitive fields from a user object.
 */
const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }
  const { password_hash, stripe_customer_id, ...safe } = user;
  return safe;
};

/**
 * Format a merchant object for public API responses.
 */
const sanitizeMerchant = (merchant) => {
  if (!merchant) {
    return null;
  }
  const { stripe_account_id, ...safe } = merchant;
  return safe;
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
  sanitizeUser,
  sanitizeMerchant,
};
