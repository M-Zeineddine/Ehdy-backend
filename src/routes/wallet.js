'use strict';

const router = require('express').Router();
const walletController = require('../controllers/walletController');
const { authenticate } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');

router.use(authenticate);

/**
 * @swagger
 * /wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get all received gifts in wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [all, active, redeemed, expired]
 *           default: all
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Wallet items with summary stats
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WalletItem'
 *
 * /wallet/{id}:
 *   get:
 *     tags: [Wallet]
 *     summary: Get a single wallet item (includes QR code)
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
 *         description: Wallet item with redemption QR code
 *       404:
 *         description: Item not found
 *
 * /wallet/{id}/favorite:
 *   put:
 *     tags: [Wallet]
 *     summary: Toggle favorite status
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
 *         description: Favorite toggled
 *
 * /wallet/{id}/notes:
 *   put:
 *     tags: [Wallet]
 *     summary: Update personal note on wallet item
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               custom_message:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Note updated
 */
router.get('/', walletController.getWallet);
router.get('/:id', walletController.getWalletItem);
router.put('/:id/favorite', walletController.toggleFavorite);
router.put(
  '/:id/notes',
  [body('custom_message').optional().isString().isLength({ max: 500 })],
  validate,
  walletController.updateNotes
);

module.exports = router;
