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
const PHONE_OTP_TTL = 10 * 60; // 10 minutes in seconds

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
  const normalizedEmail = email.toLowerCase();
  const normalizedPhone = phone || null;

  // Check if email already exists
  const existing = await query(
    'SELECT id, is_email_verified, is_phone_verified, phone FROM users WHERE email = $1',
    [normalizedEmail]
  );
  if (existing.rows.length > 0) {
    const existingUser = existing.rows[0];
    if (!existingUser.is_email_verified) {
      // Update their registration data in case they changed name/phone/password
      const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await query(
        `UPDATE users SET first_name = $1, last_name = $2, phone = $3, password_hash = $4,
         country_code = $5, updated_at = NOW() WHERE email = $6`,
        [first_name, last_name, normalizedPhone, password_hash, country_code || 'LB', normalizedEmail]
      );
      // Resend code only if the previous one expired
      const redis = await getRedisClient();
      const existingCode = await redis.get(`email_verify:${normalizedEmail}`);
      if (!existingCode) {
        await sendVerificationEmail(normalizedEmail);
      }
      throw new AppError('Account pending verification. Please check your email for the code.', 409, 'EMAIL_UNVERIFIED');
    }
    if (existingUser.phone && !existingUser.is_phone_verified) {
      throw new AppError('Phone verification pending. Please sign in to complete it.', 409, 'PHONE_UNVERIFIED');
    }
    throw new AppError('Email address is already registered', 409, 'EMAIL_EXISTS');
  }

  // Check if phone is already taken
  if (normalizedPhone) {
    const phoneCheck = await query(
      'SELECT id, is_email_verified FROM users WHERE phone = $1',
      [normalizedPhone]
    );
    if (phoneCheck.rows.length > 0) {
      if (phoneCheck.rows[0].is_email_verified) {
        throw new AppError('Phone number is already registered', 409, 'PHONE_EXISTS');
      } else {
        // Orphan unverified account (different email) — clean it up so this registration can proceed
        await query('DELETE FROM users WHERE id = $1', [phoneCheck.rows[0].id]);
      }
    }
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, country_code)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, first_name, last_name, phone, country_code, created_at`,
    [normalizedEmail, password_hash, first_name, last_name, normalizedPhone, country_code || 'LB']
  );

  const user = result.rows[0];

  // Send verification email
  await sendVerificationEmail(normalizedEmail);

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

  const userResult = await query(
    `UPDATE users SET is_email_verified = TRUE, email_verified_at = NOW(), updated_at = NOW()
     WHERE email = $1
     RETURNING id, phone`,
    [email.toLowerCase()]
  );

  await redis.del(key);

  logger.info('Email verified', { email });

  // Claim any pending gifts that were sent to this user's phone number
  const user = userResult.rows[0];
  if (user?.phone) {
    await claimPendingGiftsForPhone(user.id, user.phone);
  }

  return true;
}

/**
 * After a user registers and verifies their email, check if any paid gifts
 * were sent to their phone number before they had an account, and add them
 * to their wallet automatically.
 */
async function claimPendingGiftsForPhone(userId, phone) {
  const pending = await query(
    `SELECT gs.id, gi.id AS instance_id, gs.sender_user_id
     FROM gifts_sent gs
     JOIN gift_instances gi ON gi.gift_sent_id = gs.id
     WHERE gs.recipient_phone = $1
       AND gs.payment_status = 'paid'
       AND gs.recipient_user_id IS NULL
`,
    [phone]
  );

  if (!pending.rows.length) return;

  for (const row of pending.rows) {
    await query(
      `UPDATE gifts_sent SET recipient_user_id = $1, updated_at = NOW() WHERE id = $2`,
      [userId, row.id]
    );
    await query(
      `INSERT INTO wallet_items (user_id, gift_instance_id, sender_user_id, gift_sent_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [userId, row.instance_id, row.sender_user_id, row.id]
    );
  }

  logger.info('Claimed pending gifts on registration', { userId, phone, count: pending.rows.length });
}

/**
 * Sign in with email and password.
 */
async function signin({ email, password, skipPasswordCheck = false }) {
  const result = await query(
    `SELECT id, email, password_hash, first_name, last_name, phone, is_email_verified, is_phone_verified, auth_provider, deleted_at
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
      phone: user.phone,
      is_email_verified: user.is_email_verified,
      is_phone_verified: user.is_phone_verified,
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

/**
 * Send a WhatsApp OTP to the given phone number via VerifyWay.
 */
async function sendPhoneOtp(phone) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const redis = await getRedisClient();
  await redis.set(`phone_otp:${phone}`, code, { EX: PHONE_OTP_TTL });

  const res = await fetch('https://api.verifyway.com/api/v1/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VERIFYWAY_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      recipient: phone,
      type: 'otp',
      channel: 'whatsapp',
      fallback: 'no',
      code,
      lang: 'en',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    logger.error('VerifyWay error', data);
    throw new AppError('Failed to send verification code', 500, 'OTP_SEND_FAILED');
  }

  logger.info(`Phone OTP sent to ${phone}`);
}

/**
 * Verify phone OTP and mark the user's phone as verified.
 */
async function verifyPhoneOtp(phone, code) {
  const redis = await getRedisClient();
  const stored = await redis.get(`phone_otp:${phone}`);

  if (!stored) throw new AppError('Code expired. Request a new one.', 400, 'OTP_EXPIRED');
  if (stored !== code) throw new AppError('Invalid verification code.', 400, 'INVALID_CODE');

  await redis.del(`phone_otp:${phone}`);
  await query(
    `UPDATE users SET is_phone_verified = TRUE, phone_verified_at = NOW(), updated_at = NOW() WHERE phone = $1`,
    [phone]
  );

  logger.info('Phone verified', { phone });
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
  sendPhoneOtp,
  verifyPhoneOtp,
  generateAccessToken,
  generateRefreshToken,
};
