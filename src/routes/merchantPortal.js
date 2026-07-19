'use strict';

const router = require('express').Router();
const merchantPortalController = require('../controllers/merchantPortalController');
const { authenticateMerchant, requireMerchantRole, requireOwnerRole } = require('../middleware/auth');
const { authLimiter, redemptionLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validation');
const {
  merchantLoginValidation,
  validateRedemptionValidation,
  confirmRedemptionValidation,
  branchCreateValidation,
  itemCreateValidation,
  itemUpdateValidation,
  staffCreateValidation,
  staffUpdateValidation,
  paginationValidation,
  uuidParamValidation,
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
 * /merchant/me:
 *   get:
 *     tags: [Merchant Portal]
 *     summary: Get the authenticated merchant user (same shape as login)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current merchant user with role and branch scope
 */
router.get('/me', merchantPortalController.getMe);

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
router.get('/dashboard', requireMerchantRole('owner', 'manager'), merchantPortalController.getDashboard);
router.post(
  '/validate-redemption',
  redemptionLimiter,
  validateRedemptionValidation,
  validate,
  merchantPortalController.validateRedemption
);
router.post('/send-redemption-otp', redemptionLimiter, merchantPortalController.sendRedemptionOtp);
router.post('/verify-redemption-otp', redemptionLimiter, merchantPortalController.verifyRedemptionOtp);
router.post(
  '/confirm-redemption',
  redemptionLimiter,
  confirmRedemptionValidation,
  validate,
  merchantPortalController.confirmRedemption
);
router.get('/redemptions', requireMerchantRole('owner', 'manager'), paginationValidation, validate, merchantPortalController.getRedemptions);

// ─── Branches (list: any portal role — needed for the redemption branch picker) ─
router.get('/branches', merchantPortalController.listBranches);
router.post('/branches', requireOwnerRole, branchCreateValidation, validate, merchantPortalController.createBranch);
router.patch('/branches/:id', requireOwnerRole, uuidParamValidation(), validate, merchantPortalController.updateBranch);

// ─── Items ────────────────────────────────────────────────────────────────────
router.get('/items', requireMerchantRole('owner', 'manager'), merchantPortalController.listItems);
router.post('/items', requireOwnerRole, itemCreateValidation, validate, merchantPortalController.createItem);
router.patch('/items/:id', requireOwnerRole, uuidParamValidation(), itemUpdateValidation, validate, merchantPortalController.updateItem);

// ─── Staff (owner only) ───────────────────────────────────────────────────────
router.get('/staff', requireOwnerRole, merchantPortalController.listStaff);
router.post('/staff', requireOwnerRole, staffCreateValidation, validate, merchantPortalController.createStaff);
router.patch('/staff/:id', requireOwnerRole, uuidParamValidation(), staffUpdateValidation, validate, merchantPortalController.updateStaff);

// ─── Profile ──────────────────────────────────────────────────────────────────
router.get('/profile', requireMerchantRole('owner', 'manager'), merchantPortalController.getProfile);
router.patch('/profile', requireOwnerRole, merchantPortalController.updateProfile);

module.exports = router;
