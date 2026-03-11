'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a redemption code in XXXX-XXXX format (e.g., "A1B2-C3D4").
 */
function generateRedemptionCode() {
  const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${part1}-${part2}`;
}

/**
 * Generate a random 12-character alphanumeric share code.
 */
function generateShareCode() {
  // Pad with extra random chars in case substring is shorter than 12
  let code = '';
  while (code.length < 12) {
    code += Math.random().toString(36).substring(2);
  }
  return code.substring(0, 12);
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
