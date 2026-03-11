'use strict';

const router = require('express').Router();
const bundleController = require('../controllers/bundleController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { createBundleValidation, paginationValidation } = require('../utils/validators');

router.use(authenticate);

/**
 * @swagger
 * /bundles:
 *   post:
 *     tags: [Bundles]
 *     summary: Create a gift bundle
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBundleRequest'
 *     responses:
 *       201:
 *         description: Bundle created
 *   get:
 *     tags: [Bundles]
 *     summary: Get user's bundles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bundles
 *
 * /bundles/{id}:
 *   get:
 *     tags: [Bundles]
 *     summary: Get bundle details
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
 *         description: Bundle with all items
 *
 * /bundles/{id}/send:
 *   post:
 *     tags: [Bundles]
 *     summary: Send a bundle as a gift
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [delivery_channel]
 *             properties:
 *               delivery_channel:
 *                 type: string
 *                 enum: [email, sms, whatsapp]
 *               recipient_phone:
 *                 type: string
 *               recipient_email:
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
 *         description: Bundle sent, returns share_link
 */
router.post('/', createBundleValidation, validate, bundleController.createBundle);
router.get('/', paginationValidation, validate, bundleController.getUserBundles);
router.get('/:id', bundleController.getBundle);
router.post('/:id/send', bundleController.sendBundle);

module.exports = router;
