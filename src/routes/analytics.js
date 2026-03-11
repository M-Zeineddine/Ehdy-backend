'use strict';

const router = require('express').Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

/**
 * @swagger
 * /analytics/dashboard:
 *   get:
 *     tags: [Analytics]
 *     summary: Get user analytics dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats — total_spent, gifts_sent, gifts_received, favorite_merchants
 */
router.get('/dashboard', analyticsController.getUserDashboard);

module.exports = router;
