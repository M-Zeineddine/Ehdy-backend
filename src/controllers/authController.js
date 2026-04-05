'use strict';

const authService = require('../services/authService');
const { successResponse } = require('../utils/formatters');
const logger = require('../utils/logger');

const signup = async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, phone, country_code } = req.body;
    const user = await authService.signup({ email, password, first_name, last_name, phone, country_code });
    return successResponse(res, { user }, 'Account created. Please verify your email.', 201);
  } catch (err) {
    return next(err);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    await authService.verifyEmail({ email, code });
    // Sign the user in automatically after verification
    const result = await authService.signin({ email, password: null, skipPasswordCheck: true });
    return successResponse(res, result, 'Email verified successfully.');
  } catch (err) {
    return next(err);
  }
};

const signin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.signin({ email, password });
    return successResponse(res, result, 'Signed in successfully.');
  } catch (err) {
    return next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return next(new (require('../middleware/errorHandler').AppError)('Refresh token is required', 400, 'TOKEN_REQUIRED'));
    }
    const result = await authService.refreshToken(refresh_token);
    return successResponse(res, result, 'Token refreshed.');
  } catch (err) {
    return next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);
    return successResponse(res, null, 'If an account with that email exists, a reset link has been sent.');
  } catch (err) {
    return next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, code, password } = req.body;
    await authService.resetPassword({ email, code, password });
    return successResponse(res, null, 'Password reset successfully.');
  } catch (err) {
    return next(err);
  }
};

const socialLogin = async (req, res, next) => {
  try {
    const { provider, id_token, email, first_name, last_name } = req.body;
    const result = await authService.socialLogin({ provider, id_token, email, first_name, last_name });
    return successResponse(res, result, 'Signed in successfully.');
  } catch (err) {
    return next(err);
  }
};

const sendPhoneOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return next(new (require('../middleware/errorHandler').AppError)('Phone is required', 400));
    await authService.sendPhoneOtp(phone);
    return successResponse(res, null, 'Verification code sent to WhatsApp.');
  } catch (err) {
    return next(err);
  }
};

const verifyPhoneOtp = async (req, res, next) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return next(new (require('../middleware/errorHandler').AppError)('Phone and code are required', 400));
    await authService.verifyPhoneOtp(phone, code);
    return successResponse(res, null, 'Phone verified successfully.');
  } catch (err) {
    return next(err);
  }
};

const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new (require('../middleware/errorHandler').AppError)('Email is required', 400));
    await authService.sendVerificationEmail(email);
    return successResponse(res, null, 'Verification code sent.');
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  signup,
  verifyEmail,
  resendVerification,
  signin,
  refreshToken,
  forgotPassword,
  resetPassword,
  socialLogin,
  sendPhoneOtp,
  verifyPhoneOtp,
};
