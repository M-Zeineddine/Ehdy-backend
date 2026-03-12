'use strict';

const router = require('express').Router();
const giftCardController = require('../controllers/giftCardController');
const { optionalAuthenticate } = require('../middleware/auth');

/**
 * @swagger
 * /gift-cards/{id}:
 *   get:
 *     tags: [Gift Cards]
 *     summary: Get gift card details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Gift card details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/GiftCard'
 *       404:
 *         description: Gift card not found
 */
router.get('/', optionalAuthenticate, giftCardController.listGiftCards);
router.get('/:id', optionalAuthenticate, giftCardController.getGiftCard);

module.exports = router;
