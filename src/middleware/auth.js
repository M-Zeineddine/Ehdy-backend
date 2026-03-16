'use strict';

const jwt = require('jsonwebtoken');
const { query } = require('../utils/database');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

/**
 * Verify a JWT and return the decoded payload.
 */
function verifyToken(token, secret) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1];
}

/**
 * Authenticate user JWT. Attaches req.user on success.
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return next(new AppError('Authentication token is required', 401, 'TOKEN_REQUIRED'));
    }

    const decoded = await verifyToken(token, process.env.JWT_SECRET);

    // Verify user still exists and is not deleted
    const result = await query(
      'SELECT id, email, first_name, last_name, is_email_verified, country_code, currency_code, language FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('User not found or account deleted', 401, 'USER_NOT_FOUND'));
    }

    req.user = result.rows[0];
    req.userId = decoded.userId;
    return next();
  } catch (err) {
    logger.warn('Authentication failed', { error: err.message });
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Authentication token has expired', 401, 'TOKEN_EXPIRED'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid authentication token', 401, 'INVALID_TOKEN'));
    }
    return next(err);
  }
};

/**
 * Optional authentication - tries JWT but does not fail if missing.
 * Attaches req.user if valid token found.
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return next();
    }

    const decoded = await verifyToken(token, process.env.JWT_SECRET);
    const result = await query(
      'SELECT id, email, first_name, last_name, is_email_verified, country_code, currency_code, language FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId]
    );

    if (result.rows.length > 0) {
      req.user = result.rows[0];
      req.userId = decoded.userId;
    }
    return next();
  } catch (_err) {
    // Silent fail for optional auth
    return next();
  }
};

/**
 * Authenticate merchant user JWT. Attaches req.merchant on success.
 */
const authenticateMerchant = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return next(new AppError('Authentication token is required', 401, 'TOKEN_REQUIRED'));
    }

    const decoded = await verifyToken(token, process.env.JWT_SECRET);

    if (decoded.type !== 'merchant') {
      return next(new AppError('Invalid merchant token', 401, 'INVALID_TOKEN'));
    }

    // Verify merchant user still exists and is active
    const result = await query(
      `SELECT mu.id, mu.merchant_id, mu.email, mu.first_name, mu.last_name,
              m.name as merchant_name, m.is_active as merchant_is_active
       FROM merchant_users mu
       JOIN merchants m ON m.id = mu.merchant_id
       WHERE mu.id = $1 AND mu.is_active = TRUE`,
      [decoded.merchantUserId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Merchant user not found or inactive', 401, 'USER_NOT_FOUND'));
    }

    const merchantUser = result.rows[0];
    if (!merchantUser.merchant_is_active) {
      return next(new AppError('Merchant account is not active', 403, 'MERCHANT_INACTIVE'));
    }

    req.merchant = merchantUser;
    req.merchantUserId = decoded.merchantUserId;
    req.merchantId = merchantUser.merchant_id;
    return next();
  } catch (err) {
    logger.warn('Merchant authentication failed', { error: err.message });
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Authentication token has expired', 401, 'TOKEN_EXPIRED'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid authentication token', 401, 'INVALID_TOKEN'));
    }
    return next(err);
  }
};

/**
 * Authenticate admin user JWT. Attaches req.admin on success.
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return next(new AppError('Authentication token is required', 401, 'TOKEN_REQUIRED'));
    }

    const decoded = await verifyToken(token, process.env.JWT_SECRET);

    if (decoded.type !== 'admin') {
      return next(new AppError('Invalid admin token', 401, 'INVALID_TOKEN'));
    }

    const result = await query(
      'SELECT id, email, first_name, last_name, role FROM admin_users WHERE id = $1 AND is_active = TRUE',
      [decoded.adminId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Admin user not found or inactive', 401, 'USER_NOT_FOUND'));
    }

    req.admin = result.rows[0];
    req.adminId = decoded.adminId;
    return next();
  } catch (err) {
    logger.warn('Admin authentication failed', { error: err.message });
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Authentication token has expired', 401, 'TOKEN_EXPIRED'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid authentication token', 401, 'INVALID_TOKEN'));
    }
    return next(err);
  }
};

module.exports = { authenticate, optionalAuthenticate, authenticateMerchant, authenticateAdmin };
