'use strict';

const router = require('express').Router();
const giftController = require('../controllers/giftController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { createDraftValidation, sendGiftValidation, paginationValidation } = require('../utils/validators');
const { body } = require('express-validator');

router.use(authenticate);

/**
 * @swagger
 * /gifts/create-draft:
 *   post:
 *     tags: [Gifts]
 *     summary: Step 1 — Create a gift draft
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDraftRequest'
 *     responses:
 *       201:
 *         description: Draft created, returns draft_id
 *
 * /gifts/sent:
 *   get:
 *     tags: [Gifts]
 *     summary: Get gifts sent by the current user
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
 *         description: List of sent gifts
 *
 * /gifts/received:
 *   get:
 *     tags: [Gifts]
 *     summary: Get gifts received by the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of received gifts
 *
 * /gifts/send:
 *   post:
 *     tags: [Gifts]
 *     summary: Send a gift directly (single step)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gift_card_id, delivery_channel]
 *             properties:
 *               gift_card_id:
 *                 type: string
 *                 format: uuid
 *               delivery_channel:
 *                 type: string
 *                 enum: [email, sms, whatsapp]
 *               recipient_phone:
 *                 type: string
 *               recipient_email:
 *                 type: string
 *               sender_name:
 *                 type: string
 *               recipient_name:
 *                 type: string
 *               personal_message:
 *                 type: string
 *               theme:
 *                 type: string
 *                 enum: [birthday, thank_you, love, thinking_of_you, just_because, congratulations]
 *               stripe_payment_intent_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Gift sent, returns share_link
 *
 * /gifts/claim/{share_code}:
 *   post:
 *     tags: [Gifts]
 *     summary: Claim a gift from a share link
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: share_code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Gift claimed and added to wallet
 *       404:
 *         description: Gift not found or already claimed
 *
 * /gifts/{draft_id}:
 *   put:
 *     tags: [Gifts]
 *     summary: Step 2 — Update draft with names, message, theme, channel
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: draft_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDraftRequest'
 *     responses:
 *       200:
 *         description: Draft updated
 *
 * /gifts/{draft_id}/preview:
 *   get:
 *     tags: [Gifts]
 *     summary: Step 3 — Preview gift before payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: draft_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Full gift preview with total price
 *
 * /gifts/{draft_id}/send:
 *   post:
 *     tags: [Gifts]
 *     summary: Step 4 — Finalize and send gift after Stripe payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: draft_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stripe_payment_intent_id]
 *             properties:
 *               stripe_payment_intent_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Gift sent, notification delivered to recipient
 */
router.post('/create-draft', createDraftValidation, validate, giftController.createDraft);
router.get('/sent', paginationValidation, validate, giftController.getSentGifts);
router.get('/received', paginationValidation, validate, giftController.getReceivedGifts);
router.post('/send', sendGiftValidation, validate, giftController.sendGift);
router.post('/claim/:share_code', giftController.claimGift);

router.put('/:draft_id', createDraftValidation, validate, giftController.updateDraft);
router.get('/:draft_id/preview', giftController.getDraftPreview);
router.post(
  '/:draft_id/send',
  [body('stripe_payment_intent_id').notEmpty().withMessage('Payment intent ID is required')],
  validate,
  giftController.sendFromDraft
);

module.exports = router;
