'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 12;

/**
 * Get user profile by ID.
 */
async function getUserById(userId) {
  const result = await query(
    `SELECT id, email, phone, first_name, last_name, profile_picture_url,
            country_code, currency_code, date_of_birth, language,
            is_email_verified, is_phone_verified, auth_provider,
            last_login_at, created_at, updated_at
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Update user profile.
 */
async function updateUser(userId, updates) {
  const allowedFields = [
    'first_name',
    'last_name',
    'phone',
    'profile_picture_url',
    'country_code',
    'currency_code',
    'date_of_birth',
    'language',
  ];

  const fields = [];
  const values = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = $${idx}`);
      values.push(updates[field]);
      idx++;
    }
  }

  if (fields.length === 0) {
    throw new AppError('No valid fields to update', 400, 'NO_UPDATES');
  }

  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL
     RETURNING id, email, phone, first_name, last_name, profile_picture_url,
               country_code, currency_code, date_of_birth, language, is_email_verified, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  logger.info('User profile updated', { userId });
  return result.rows[0];
}

/**
 * Change user password.
 */
async function changePassword(userId, { current_password, new_password }) {
  const result = await query(
    'SELECT id, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const user = result.rows[0];

  if (!user.password_hash) {
    throw new AppError(
      'Cannot change password for social login accounts',
      400,
      'SOCIAL_ACCOUNT'
    );
  }

  const match = await bcrypt.compare(current_password, user.password_hash);
  if (!match) {
    throw new AppError('Current password is incorrect', 400, 'WRONG_PASSWORD');
  }

  const password_hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [password_hash, userId]
  );

  logger.info('User password changed', { userId });
  return true;
}

/**
 * Soft-delete a user account.
 */
async function deleteUser(userId) {
  const result = await query(
    `UPDATE users SET deleted_at = NOW(), email = email || '_deleted_' || id, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  logger.info('User account soft-deleted', { userId });
  return true;
}

module.exports = {
  getUserById,
  updateUser,
  changePassword,
  deleteUser,
};
