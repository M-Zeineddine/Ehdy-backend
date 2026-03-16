'use strict';

const router = require('express').Router();
const merchantController = require('../controllers/merchantController');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { paginationValidation } = require('../utils/validators');
const { validate } = require('../middleware/validation');

/**
 * @swagger
 * /merchants/categories:
 *   get:
 *     tags: [Merchants]
 *     summary: List all categories
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get('/categories', merchantController.listCategories);
router.get('/items', merchantController.listMerchantItems);
router.get('/recently-viewed', authenticate, merchantController.getRecentlyViewed);

/**
 * @swagger
 * /merchants:
 *   get:
 *     tags: [Merchants]
 *     summary: List merchants with filtering and search
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category slug (e.g. coffee-cafes)
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country code (e.g. LB)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Full-text search by name
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
 *         description: Paginated list of merchants
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
 *                         $ref: '#/components/schemas/Merchant'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 */
router.get('/', optionalAuthenticate, paginationValidation, validate, merchantController.listMerchants);

/**
 * @swagger
 * /merchants/{id}:
 *   get:
 *     tags: [Merchants]
 *     summary: Get merchant details with gift cards
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Merchant details including all active gift cards
 *       404:
 *         description: Merchant not found
 */
router.get('/:id', optionalAuthenticate, merchantController.getMerchant);
router.post('/:id/visit', authenticate, merchantController.recordVisit);

module.exports = router;
