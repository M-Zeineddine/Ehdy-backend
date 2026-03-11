'use strict';

const { validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

/**
 * Middleware to check express-validator results and throw on errors.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));
    return next(new AppError('Validation failed', 422, 'VALIDATION_ERROR', details));
  }
  return next();
};

module.exports = { validate };
