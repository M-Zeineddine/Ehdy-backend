'use strict';

const router = require('express').Router();
const purchaseController = require('../controllers/purchaseController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { createPurchaseValidation, paginationValidation } = require('../utils/validators');

router.use(authenticate);

/**
 * @swagger
 * /purchases:
 *   post:
 *     tags: [Purchases]
 *     summary: Buy gift cards — creates a Stripe PaymentIntent
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePurchaseRequest'
 *     responses:
 *       200:
 *         description: Returns client_secret to confirm payment on frontend
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         purchase_id:
 *                           type: string
 *                           format: uuid
 *                         stripe_payment_intent_id:
 *                           type: string
 *                         client_secret:
 *                           type: string
 *                         total_amount:
 *                           type: number
 *   get:
 *     tags: [Purchases]
 *     summary: Get purchase history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated purchase history
 *
 * /purchases/{id}:
 *   get:
 *     tags: [Purchases]
 *     summary: Get a single purchase
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Purchase details
 *       404:
 *         description: Purchase not found
 */
router.post('/', createPurchaseValidation, validate, purchaseController.createPurchase);
router.get('/', paginationValidation, validate, purchaseController.getPurchaseHistory);
router.get('/:id', purchaseController.getPurchase);

module.exports = router;
