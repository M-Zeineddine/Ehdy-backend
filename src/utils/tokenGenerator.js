'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a redemption code in XXXX-XXXX format (e.g., "A1B2-C3D4").
 * Uses crypto.randomBytes for security.
 */
function generateRedemptionCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
    if (i === 3) code += '-';
  }
  return code;
}

/**
 * Generate a cryptographically secure 12-character alphanumeric share code.
 */
function generateShareCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(12);
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * Generate a 6-digit numeric verification code.
 */
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a secure password reset token (UUID v4).
 */
function generatePasswordResetToken() {
  return uuidv4();
}

/**
 * Generate a cryptographically secure random token of given byte length.
 * Returns as hex string.
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a short numeric OTP of given length.
 */
function generateOTP(length = 6) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

module.exports = {
  generateRedemptionCode,
  generateShareCode,
  generateVerificationCode,
  generatePasswordResetToken,
  generateSecureToken,
  generateOTP,
};
