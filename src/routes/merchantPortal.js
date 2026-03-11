'use strict';

const router = require('express').Router();
const merchantPortalController = require('../controllers/merchantPortalController');
const { authenticateMerchant } = require('../middleware/auth');
const { authLimiter, redemptionLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validation');
const {
  merchantLoginValidation,
  validateRedemptionValidation,
  confirmRedemptionValidation,
  paginationValidation,
} = require('../utils/validators');

/**
 * @swagger
 * /merchant/login:
 *   post:
 *     tags: [Merchant Portal]
 *     summary: Merchant user login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns merchant JWT
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authLimiter, merchantLoginValidation, validate, merchantPortalController.login);

// Protected
router.use(authenticateMerchant);

/**
 * @swagger
 * /merchant/dashboard:
 *   get:
 *     tags: [Merchant Portal]
 *     summary: Get today's redemption stats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard with today_revenue, today_redemptions, recent_redemptions
 *
 * /merchant/validate-redemption:
 *   post:
 *     tags: [Merchant Portal]
 *     summary: Validate a redemption code before confirming
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ValidateRedemptionRequest'
 *     responses:
 *       200:
 *         description: Returns gift details if valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 is_valid:
 *                   type: boolean
 *                 gift:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [store_credit, gift_item]
 *                     value:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     merchant_name:
 *                       type: string
 *                     recipient_name:
 *                       type: string
 *
 * /merchant/confirm-redemption:
 *   post:
 *     tags: [Merchant Portal]
 *     summary: Confirm and process a redemption
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfirmRedemptionRequest'
 *     responses:
 *       200:
 *         description: Redeemed — returns remaining balance for store credit
 *
 * /merchant/redemptions:
 *   get:
 *     tags: [Merchant Portal]
 *     summary: Get redemption history for this merchant
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Paginated redemption history
 */
router.get('/dashboard', merchantPortalController.getDashboard);
router.post(
  '/validate-redemption',
  redemptionLimiter,
  validateRedemptionValidation,
  validate,
  merchantPortalController.validateRedemption
);
router.post(
  '/confirm-redemption',
  redemptionLimiter,
  confirmRedemptionValidation,
  validate,
  merchantPortalController.confirmRedemption
);
router.get('/redemptions', paginationValidation, validate, merchantPortalController.getRedemptions);

module.exports = router;
