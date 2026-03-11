'use strict';

const logger = require('../utils/logger');

/**
 * Custom application error class.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not found handler - called when no route matches.
 */
const notFoundHandler = (req, res, next) => {
  const err = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(err);
};

/**
 * Global error handler middleware.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let details = err.details || null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  }

  // PostgreSQL errors
  if (err.code === '23505') {
    // unique violation
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'A record with this value already exists';
  }

  if (err.code === '23503') {
    // foreign key violation
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Referenced record does not exist';
  }

  if (err.code === '23514') {
    // check violation
    statusCode = 400;
    code = 'CONSTRAINT_VIOLATION';
    message = 'Data violates database constraint';
  }

  // Stripe errors
  if (err.type && err.type.startsWith('Stripe')) {
    statusCode = 402;
    code = 'PAYMENT_ERROR';
    message = err.message;
  }

  // Log the error
  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      statusCode,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });
  } else {
    logger.warn('Operational error', {
      code,
      message,
      path: req.path,
      method: req.method,
      statusCode,
    });
  }

  const response = {
    success: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  };

  if (details) {
    response.error.details = details;
  }

  // In development, include stack trace
  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = { AppError, notFoundHandler, errorHandler };
