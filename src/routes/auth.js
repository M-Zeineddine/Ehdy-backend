'use strict';

const router = require('express').Router();
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validation');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  signupValidation,
  signinValidation,
  verifyEmailValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  socialLoginValidation,
} = require('../utils/validators');

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *     responses:
 *       201:
 *         description: User created, verification email sent
 *       400:
 *         description: Validation error or email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/signup', authLimiter, signupValidation, validate, authController.signup);
router.post('/resend-verification', authLimiter, authController.resendVerification);
/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email with 6-digit code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified, returns tokens
 *       400:
 *         description: Invalid or expired code
 */
router.post('/verify-email', authLimiter, verifyEmailValidation, validate, authController.verifyEmail);

/**
 * @swagger
 * /auth/signin:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SigninRequest'
 *     responses:
 *       200:
 *         description: Login successful, returns JWT tokens
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         description: Invalid credentials
 */
router.post('/signin', authLimiter, signinValidation, validate, authController.signin);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', authController.refreshToken);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent if account exists
 */
router.post('/forgot-password', authLimiter, forgotPasswordValidation, validate, authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using token from email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, new_password]
 *             properties:
 *               token:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password', authLimiter, resetPasswordValidation, validate, authController.resetPassword);

/**
 * @swagger
 * /auth/social-login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with Google or Apple
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, id_token]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [google, apple]
 *               id_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/social-login', authLimiter, socialLoginValidation, validate, authController.socialLogin);
router.post('/send-phone-otp', authLimiter, authController.sendPhoneOtp);
router.post('/verify-phone-otp', authLimiter, authController.verifyPhoneOtp);

module.exports = router;
