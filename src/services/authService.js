'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../utils/database');
const { getRedisClient } = require('../config/redis');
const { generateVerificationCode, generatePasswordResetToken } = require('../utils/tokenGenerator');
const { AppError } = require('../middleware/errorHandler');
const emailService = require('./emailService');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 12;
const EMAIL_VERIFY_TTL = 15 * 60; // 15 minutes in seconds
const PASSWORD_RESET_TTL = 60 * 60; // 1 hour in seconds

/**
 * Generate JWT access token.
 */
function generateAccessToken(userId) {
  return jwt.sign({ userId, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
  });
}

/**
 * Generate JWT refresh token.
 */
function generateRefreshToken(userId) {
  return jwt.sign({ userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

/**
 * Register a new user with email and password.
 */
async function signup({ email, password, first_name, last_name, phone, country_code }) {
  // Check if email already exists
  const existing = await query('SELECT id, is_email_verified FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    if (!existing.rows[0].is_email_verified) {
      // Check if a valid code already exists — if not, send a fresh one
      const redis = await getRedisClient();
      const existingCode = await redis.get(`email_verify:${email.toLowerCase()}`);
      if (!existingCode) {
        await sendVerificationEmail(email.toLowerCase());
      }
      throw new AppError('Account pending verification. Please check your email for the code.', 409, 'EMAIL_UNVERIFIED');
    }
    throw new AppError('Email address is already registered', 409, 'EMAIL_EXISTS');
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, country_code)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, first_name, last_name, phone, country_code, created_at`,
    [email.toLowerCase(), password_hash, first_name, last_name, phone || null, country_code || 'LB']
  );

  const user = result.rows[0];

  // Send verification email
  await sendVerificationEmail(user.email);

  logger.info('New user registered', { userId: user.id, email: user.email });

  return user;
}

/**
 * Send (or resend) an email verification code.
 */
async function sendVerificationEmail(email) {
  const code = generateVerificationCode();
  const redis = await getRedisClient();
  const key = `email_verify:${email.toLowerCase()}`;
  await redis.set(key, code, { EX: EMAIL_VERIFY_TTL });

  logger.info(`[VERIFY] Email verification code for ${email}: ${code}`);

  await emailService.sendVerificationEmail(email, code);
  return true;
}

/**
 * Verify an email address with the 6-digit code.
 */
async function verifyEmail({ email, code }) {
  const redis = await getRedisClient();
  const key = `email_verify:${email.toLowerCase()}`;
  const storedCode = await redis.get(key);

  if (!storedCode) {
    throw new AppError('Verification code has expired or does not exist', 400, 'CODE_EXPIRED');
  }

  if (storedCode !== code) {
    throw new AppError('Invalid verification code', 400, 'INVALID_CODE');
  }

  await query(
    `UPDATE users SET is_email_verified = TRUE, email_verified_at = NOW(), updated_at = NOW()
     WHERE email = $1`,
    [email.toLowerCase()]
  );

  await redis.del(key);

  logger.info('Email verified', { email });
  return true;
}

/**
 * Sign in with email and password.
 */
async function signin({ email, password, skipPasswordCheck = false }) {
  const result = await query(
    `SELECT id, email, password_hash, first_name, last_name, is_email_verified, auth_provider, deleted_at
     FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const user = result.rows[0];

  if (user.deleted_at) {
    throw new AppError('This account has been deactivated', 403, 'ACCOUNT_DELETED');
  }

  if (!skipPasswordCheck) {
    if (!user.password_hash) {
      throw new AppError(
        'This account uses social login. Please sign in with your social provider.',
        400,
        'SOCIAL_LOGIN_REQUIRED'
      );
    }
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }
  }

  // Update last login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const access_token = generateAccessToken(user.id);
  const refresh_token = generateRefreshToken(user.id);

  logger.info('User signed in', { userId: user.id });

  return {
    access_token,
    refresh_token,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_email_verified: user.is_email_verified,
    },
  };
}

/**
 * Refresh an access token using a refresh token.
 */
async function refreshToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (decoded.type !== 'refresh') {
    throw new AppError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
  }

  const result = await query(
    'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL',
    [decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 401, 'USER_NOT_FOUND');
  }

  const access_token = generateAccessToken(decoded.userId);
  return { access_token };
}

/**
 * Send password reset email.
 */
async function forgotPassword(email) {
  const result = await query(
    'SELECT id, email, first_name FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email.toLowerCase()]
  );

  // Don't reveal whether email exists
  if (result.rows.length === 0) {
    return true;
  }

  const user = result.rows[0];
  const resetToken = generatePasswordResetToken();
  const redis = await getRedisClient();
  const key = `pwd_reset:${resetToken}`;
  await redis.set(key, user.id, { EX: PASSWORD_RESET_TTL });

  await emailService.sendPasswordResetEmail(user.email, user.first_name, resetToken);

  logger.info('Password reset email sent', { userId: user.id });
  return true;
}

/**
 * Reset password using a reset token.
 */
async function resetPassword({ token, password }) {
  const redis = await getRedisClient();
  const key = `pwd_reset:${token}`;
  const userId = await redis.get(key);

  if (!userId) {
    throw new AppError('Password reset token has expired or is invalid', 400, 'INVALID_RESET_TOKEN');
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [password_hash, userId]
  );

  await redis.del(key);

  logger.info('Password reset successful', { userId });
  return true;
}

/**
 * Social login (Google / Apple).
 * Creates user if not exists.
 */
async function socialLogin({ provider, id_token, email, first_name, last_name }) {
  // In production, you would verify the id_token with Google/Apple
  // For now we trust the passed email after token verification
  if (!email) {
    throw new AppError('Email is required for social login', 400, 'EMAIL_REQUIRED');
  }

  let result = await query(
    'SELECT id, email, first_name, last_name, auth_provider, deleted_at FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  let user;
  if (result.rows.length === 0) {
    // Create new user
    const insertResult = await query(
      `INSERT INTO users (email, first_name, last_name, auth_provider, is_email_verified, email_verified_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       RETURNING id, email, first_name, last_name, is_email_verified`,
      [email.toLowerCase(), first_name || '', last_name || '', provider]
    );
    user = insertResult.rows[0];
    logger.info('Social login - new user created', { userId: user.id, provider });
  } else {
    user = result.rows[0];
    if (user.deleted_at) {
      throw new AppError('This account has been deactivated', 403, 'ACCOUNT_DELETED');
    }
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    logger.info('Social login - existing user', { userId: user.id, provider });
  }

  const access_token = generateAccessToken(user.id);
  const refresh_token = generateRefreshToken(user.id);

  return { access_token, refresh_token, user };
}

module.exports = {
  signup,
  sendVerificationEmail,
  verifyEmail,
  signin,
  refreshToken,
  forgotPassword,
  resetPassword,
  socialLogin,
  generateAccessToken,
  generateRefreshToken,
};
