'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const { getVisitAnalytics } = require('../services/merchantService');
const { authenticateAdmin } = require('../middleware/auth');

// ─── Admin Login ───────────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(new AppError('Email and password are required', 400, 'VALIDATION_ERROR'));
    }

    const result = await query(
      'SELECT id, email, password_hash, first_name, last_name, role, is_active FROM admin_users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS'));
    }

    const admin = result.rows[0];
    if (!admin.is_active) {
      return next(new AppError('Account is disabled', 403, 'ACCOUNT_DISABLED'));
    }

    const passwordValid = await bcrypt.compare(password, admin.password_hash);
    if (!passwordValid) {
      return next(new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS'));
    }

    await query(
      'UPDATE admin_users SET last_login_at = NOW() WHERE id = $1',
      [admin.id]
    );

    const token = jwt.sign(
      { adminId: admin.id, type: 'admin', role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          first_name: admin.first_name,
          last_name: admin.last_name,
          role: admin.role,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── All routes below require admin auth ──────────────────────────────────────
router.use(authenticateAdmin);

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      usersResult,
      merchantsResult,
      giftsTodayResult,
      revenueResult,
      redemptionsResult,
      pendingMerchantsResult,
      recentGiftsResult,
      giftsChartResult,
      revenueChartResult,
    ] = await Promise.all([
      query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
      query('SELECT COUNT(*) FROM merchants WHERE deleted_at IS NULL'),
      query("SELECT COUNT(*) FROM gifts_sent WHERE DATE(sent_at) = CURRENT_DATE AND payment_status = 'paid'"),
      query("SELECT COALESCE(SUM(gi.initial_balance), 0) as total FROM gift_instances gi JOIN gifts_sent gs ON gs.id = gi.gift_sent_id WHERE gs.payment_status = 'paid'"),
      query('SELECT COUNT(*) FROM gift_instances WHERE is_redeemed = TRUE'),
      query("SELECT COUNT(*) FROM merchants WHERE is_verified = FALSE AND deleted_at IS NULL AND is_active = TRUE"),
      query(`
        SELECT gs.id, gs.sender_name, gs.recipient_name, gs.recipient_email,
               gs.sent_at, gs.payment_status, gs.theme,
               u.email as sender_email
        FROM gifts_sent gs
        LEFT JOIN users u ON u.id = gs.sender_user_id
        ORDER BY gs.sent_at DESC
        LIMIT 8
      `),
      query(`
        SELECT DATE(sent_at) as date, COUNT(*) as count
        FROM gifts_sent
        WHERE sent_at >= NOW() - INTERVAL '30 days' AND payment_status = 'paid'
        GROUP BY DATE(sent_at)
        ORDER BY date ASC
      `),
      query(`
        SELECT DATE(gs.sent_at) as date, COALESCE(SUM(gi.initial_balance), 0) as revenue
        FROM gifts_sent gs
        JOIN gift_instances gi ON gi.gift_sent_id = gs.id
        WHERE gs.sent_at >= NOW() - INTERVAL '30 days' AND gs.payment_status = 'paid'
        GROUP BY DATE(gs.sent_at)
        ORDER BY date ASC
      `),
    ]);

    return res.json({
      success: true,
      data: {
        stats: {
          total_users: parseInt(usersResult.rows[0].count),
          total_merchants: parseInt(merchantsResult.rows[0].count),
          gifts_today: parseInt(giftsTodayResult.rows[0].count),
          total_revenue: parseFloat(revenueResult.rows[0].total),
          total_redemptions: parseInt(redemptionsResult.rows[0].count),
          pending_merchants: parseInt(pendingMerchantsResult.rows[0].count),
        },
        recent_gifts: recentGiftsResult.rows,
        charts: {
          gifts_by_day: giftsChartResult.rows,
          revenue_by_day: revenueChartResult.rows,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = '';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
    }

    if (status === 'active') {
      conditions.push('deleted_at IS NULL');
    } else if (status === 'deleted') {
      conditions.push('deleted_at IS NOT NULL');
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const countResult = await query(`SELECT COUNT(*) FROM users ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const usersResult = await query(`
      SELECT id, email, first_name, last_name, phone, country_code, currency_code,
             is_email_verified, is_phone_verified, auth_provider,
             last_login_at, created_at, deleted_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return res.json({
      success: true,
      data: {
        users: usersResult.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [userResult, giftsResult] = await Promise.all([
      query(`
        SELECT id, email, first_name, last_name, phone, country_code, currency_code,
               is_email_verified, is_phone_verified, auth_provider, profile_picture_url,
               last_login_at, created_at, updated_at, deleted_at
        FROM users WHERE id = $1
      `, [id]),
      query(`
        SELECT id, recipient_name, recipient_phone, theme, payment_status, sent_at
        FROM gifts_sent WHERE sender_user_id = $1
        ORDER BY sent_at DESC LIMIT 10
      `, [id]),
    ]);

    if (userResult.rows.length === 0) {
      return next(new AppError('User not found', 404, 'NOT_FOUND'));
    }

    return res.json({
      success: true,
      data: {
        user: userResult.rows[0],
        recent_gifts: giftsResult.rows,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (action === 'deactivate') {
      await query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [id]);
    } else if (action === 'reactivate') {
      await query('UPDATE users SET deleted_at = NULL WHERE id = $1', [id]);
    } else {
      return next(new AppError('Invalid action', 400, 'INVALID_ACTION'));
    }

    return res.json({ success: true, message: `User ${action}d successfully` });
  } catch (err) {
    return next(err);
  }
});

// ─── Merchants ────────────────────────────────────────────────────────────────
router.get('/merchants', async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20, status, verified } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['m.deleted_at IS NULL'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(m.name ILIKE $${params.length} OR m.slug ILIKE $${params.length} OR m.contact_email ILIKE $${params.length})`);
    }
    if (status === 'active') conditions.push('m.is_active = TRUE');
    if (status === 'inactive') conditions.push('m.is_active = FALSE');
    if (verified === 'true') conditions.push('m.is_verified = TRUE');
    if (verified === 'false') conditions.push('m.is_verified = FALSE');

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM merchants m ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const merchantsResult = await query(`
      SELECT m.id, m.name, m.slug, m.logo_url, m.is_active, m.is_verified, m.is_featured,
             m.contact_email, m.contact_phone, m.rating, m.review_count,
             m.created_at, c.name as category_name,
             COUNT(DISTINCT mb.id) as branch_count,
             COUNT(DISTINCT gi.id) as gift_instance_count
      FROM merchants m
      LEFT JOIN categories c ON c.id = m.category_id
      LEFT JOIN merchant_branches mb ON mb.merchant_id = m.id AND mb.is_active = TRUE
      LEFT JOIN gift_instances gi ON gi.redeemed_by_merchant_id = m.id
      ${whereClause}
      GROUP BY m.id, c.name
      ORDER BY m.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return res.json({
      success: true,
      data: {
        merchants: merchantsResult.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/merchants/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [merchantResult, branchesResult, itemsResult, staffResult, redemptionsResult] = await Promise.all([
      query(`
        SELECT m.*, c.name as category_name
        FROM merchants m
        LEFT JOIN categories c ON c.id = m.category_id
        WHERE m.id = $1
      `, [id]),
      query('SELECT * FROM merchant_branches WHERE merchant_id = $1 ORDER BY created_at', [id]),
      query('SELECT * FROM merchant_items WHERE merchant_id = $1 AND is_active = TRUE ORDER BY name', [id]),
      query('SELECT id, email, first_name, last_name, role, is_active, created_at FROM merchant_users WHERE merchant_id = $1', [id]),
      query(`
        SELECT gi.id, gi.redemption_code, gi.redeemed_amount, gi.currency_code,
               gi.redeemed_at, gi.redemption_method
        FROM gift_instances gi
        WHERE gi.redeemed_by_merchant_id = $1
        ORDER BY gi.redeemed_at DESC LIMIT 20
      `, [id]),
    ]);

    if (merchantResult.rows.length === 0) {
      return next(new AppError('Merchant not found', 404, 'NOT_FOUND'));
    }

    return res.json({
      success: true,
      data: {
        merchant: merchantResult.rows[0],
        branches: branchesResult.rows,
        items: itemsResult.rows,
        staff: staffResult.rows,
        recent_redemptions: redemptionsResult.rows,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/merchants/:id/analytics', async (req, res, next) => {
  try {
    const { id } = req.params;

    const merchantExists = await query(
      'SELECT id FROM merchants WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (merchantExists.rows.length === 0) {
      return next(new AppError('Merchant not found', 404, 'NOT_FOUND'));
    }

    const days = req.query.period ? parseInt(req.query.period, 10) : 30;
    const analytics = await getVisitAnalytics(id, days);
    return res.json({ success: true, data: { merchant_id: id, ...analytics } });
  } catch (err) {
    return next(err);
  }
});

router.post('/merchants', async (req, res, next) => {
  try {
    const {
      name, slug, description, website_url, logo_url, banner_image_url,
      category_id, contact_email, contact_phone,
    } = req.body;

    if (!name || !slug) {
      return next(new AppError('Name and slug are required', 400, 'VALIDATION_ERROR'));
    }

    const result = await query(`
      INSERT INTO merchants (name, slug, description, website_url, logo_url, banner_image_url,
                             category_id, contact_email, contact_phone, is_active, is_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, FALSE)
      RETURNING *
    `, [name, slug, description, website_url, logo_url, banner_image_url,
        category_id, contact_email, contact_phone]);

    return res.status(201).json({ success: true, data: { merchant: result.rows[0] } });
  } catch (err) {
    return next(err);
  }
});

router.patch('/merchants/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name, slug, description, website_url, logo_url, banner_image_url,
      category_id, contact_email, contact_phone, is_active, is_verified, action,
    } = req.body;

    if (action === 'verify') {
      await query(
        "UPDATE merchants SET is_verified = TRUE, verified_at = NOW(), updated_at = NOW() WHERE id = $1",
        [id]
      );
      return res.json({ success: true, message: 'Merchant verified' });
    }

    if (action === 'toggle_active') {
      await query(
        'UPDATE merchants SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1',
        [id]
      );
      return res.json({ success: true, message: 'Merchant status toggled' });
    }

    if (action === 'toggle_featured') {
      await query(
        'UPDATE merchants SET is_featured = NOT is_featured, updated_at = NOW() WHERE id = $1',
        [id]
      );
      return res.json({ success: true, message: 'Merchant featured status toggled' });
    }

    const updates = [];
    const params = [];

    const fields = { name, slug, description, website_url, logo_url, banner_image_url,
                     category_id, contact_email, contact_phone };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        params.push(val);
        updates.push(`${key} = $${params.length}`);
      }
    }
    if (is_active !== undefined) {
      params.push(is_active);
      updates.push(`is_active = $${params.length}`);
    }
    if (is_verified !== undefined) {
      params.push(is_verified);
      updates.push(`is_verified = $${params.length}`);
      if (is_verified) updates.push('verified_at = NOW()');
    }

    if (updates.length === 0) {
      return next(new AppError('No fields to update', 400, 'VALIDATION_ERROR'));
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const result = await query(
      `UPDATE merchants SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    return res.json({ success: true, data: { merchant: result.rows[0] } });
  } catch (err) {
    return next(err);
  }
});

router.delete('/merchants/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await query('UPDATE merchants SET deleted_at = NOW() WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Merchant deleted' });
  } catch (err) {
    return next(err);
  }
});

// ─── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT *, (SELECT COUNT(*) FROM merchants WHERE category_id = categories.id AND deleted_at IS NULL) as merchant_count FROM categories ORDER BY display_order ASC, name ASC'
    );
    return res.json({ success: true, data: { categories: result.rows } });
  } catch (err) {
    return next(err);
  }
});

router.post('/categories', async (req, res, next) => {
  try {
    const { name, slug, description, icon_url, display_order } = req.body;
    if (!name || !slug) {
      return next(new AppError('Name and slug are required', 400, 'VALIDATION_ERROR'));
    }

    const result = await query(`
      INSERT INTO categories (name, slug, description, icon_url, display_order, is_active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING *
    `, [name, slug, description, icon_url, display_order || 0]);

    return res.status(201).json({ success: true, data: { category: result.rows[0] } });
  } catch (err) {
    return next(err);
  }
});

router.patch('/categories/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, description, icon_url, display_order, is_active } = req.body;

    const updates = [];
    const params = [];

    const fields = { name, slug, description, icon_url };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        params.push(val);
        updates.push(`${key} = $${params.length}`);
      }
    }
    if (display_order !== undefined) {
      params.push(display_order);
      updates.push(`display_order = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active);
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      return next(new AppError('No fields to update', 400, 'VALIDATION_ERROR'));
    }

    params.push(id);
    const result = await query(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    return res.json({ success: true, data: { category: result.rows[0] } });
  } catch (err) {
    return next(err);
  }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM categories WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    return next(err);
  }
});

// ─── Gifts ────────────────────────────────────────────────────────────────────
router.get('/gifts', async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20, status, theme } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(gs.sender_name ILIKE $${params.length} OR gs.recipient_name ILIKE $${params.length} OR gs.recipient_email ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`gs.payment_status = $${params.length}`);
    }
    if (theme) {
      params.push(theme);
      conditions.push(`gs.theme = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await query(`SELECT COUNT(*) FROM gifts_sent gs ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const giftsResult = await query(`
      SELECT gs.id, gs.sender_name, gs.recipient_name, gs.recipient_email,
             gs.recipient_phone, gs.theme, gs.payment_status,
             gs.sent_at,
             gs.tap_charge_id, gs.unique_share_link AS share_code,
             u.email AS sender_user_email,
             CASE
               WHEN COUNT(gi.merchant_item_id) FILTER (WHERE gi.merchant_item_id IS NOT NULL) > 0
               THEN 'gift_item' ELSE 'store_credit'
             END AS gift_type,
             MAX(mi.name) AS item_name,
             SUM(gi.initial_balance) AS initial_balance,
             SUM(gi.current_balance) AS current_balance,
             SUM(COALESCE(gi.redeemed_amount, 0)) AS redeemed_amount,
             MAX(gi.currency_code) AS currency_code,
             COALESCE(MAX(m_mi.name), MAX(m_scp.name), MAX(m_cust.name)) AS merchant_name,
             string_agg(DISTINCT gi.redemption_code, E'\n' ORDER BY gi.redemption_code) AS redemption_codes,
             MAX(gi.qr_scanned_at) AS redeemed_at
      FROM gifts_sent gs
      LEFT JOIN users u ON u.id = gs.sender_user_id
      LEFT JOIN gift_instances gi ON gi.gift_sent_id = gs.id
      LEFT JOIN merchant_items mi ON mi.id = gi.merchant_item_id
      LEFT JOIN store_credit_presets scp ON scp.id = gi.store_credit_preset_id
      LEFT JOIN merchants m_mi   ON m_mi.id  = mi.merchant_id
      LEFT JOIN merchants m_scp  ON m_scp.id = scp.merchant_id
      LEFT JOIN merchants m_cust ON m_cust.id = gi.custom_credit_merchant_id
      ${whereClause}
      GROUP BY gs.id, u.email
      ORDER BY gs.sent_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return res.json({
      success: true,
      data: {
        gifts: giftsResult.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── Gift Redemption History ──────────────────────────────────────────────────
router.get('/gifts/:giftSentId/redemptions', async (req, res, next) => {
  try {
    const { giftSentId } = req.params;
    const result = await query(
      `SELECT re.id, re.amount, re.currency_code, re.balance_after, re.notes, re.redeemed_at,
              gi.redemption_code, gi.initial_balance, gi.type,
              m.name AS merchant_name
       FROM redemption_events re
       JOIN gift_instances gi ON gi.id = re.gift_instance_id
       LEFT JOIN merchants m ON m.id = re.merchant_id
       WHERE gi.gift_sent_id = $1
       ORDER BY re.redeemed_at ASC`,
      [giftSentId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return next(err);
  }
});

// ─── Redemption Events (replaces old Transactions) ────────────────────────────
router.get('/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query(`SELECT COUNT(*) FROM redemption_events`);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(`
      SELECT re.id, re.amount, re.currency_code, re.balance_after, re.notes, re.redeemed_at,
             gi.redemption_code, gi.type as gift_type,
             m.name as merchant_name,
             mu.first_name as staff_first_name, mu.last_name as staff_last_name,
             mb.name as branch_name,
             gs.sender_name, gs.recipient_name, gs.recipient_phone
      FROM redemption_events re
      JOIN gift_instances gi ON gi.id = re.gift_instance_id
      JOIN gifts_sent gs ON gs.id = gi.gift_sent_id
      LEFT JOIN merchants m ON m.id = re.merchant_id
      LEFT JOIN merchant_users mu ON mu.id = re.merchant_user_id
      LEFT JOIN merchant_branches mb ON mb.id = re.branch_id
      ORDER BY re.redeemed_at DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), offset]);

    return res.json({
      success: true,
      data: {
        transactions: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────
router.get('/analytics', async (req, res, next) => {
  try {
    const { range = '30' } = req.query;
    const days = parseInt(range);

    const [
      usersGrowth,
      giftsVolume,
      revenueData,
      topMerchants,
      themeBreakdown,
      deliveryChannels,
      redemptionRate,
    ] = await Promise.all([
      query(`
        SELECT DATE(created_at) as date, COUNT(*) as new_users
        FROM users
        WHERE created_at >= NOW() - INTERVAL '${days} days' AND deleted_at IS NULL
        GROUP BY DATE(created_at) ORDER BY date ASC
      `),
      query(`
        SELECT DATE(sent_at) as date, COUNT(*) as gifts_sent
        FROM gifts_sent
        WHERE sent_at >= NOW() - INTERVAL '${days} days' AND payment_status = 'paid'
        GROUP BY DATE(sent_at) ORDER BY date ASC
      `),
      query(`
        SELECT DATE(gs.sent_at) as date, COALESCE(SUM(gi.initial_balance), 0) as revenue
        FROM gifts_sent gs
        JOIN gift_instances gi ON gi.gift_sent_id = gs.id
        WHERE gs.sent_at >= NOW() - INTERVAL '${days} days' AND gs.payment_status = 'paid'
        GROUP BY DATE(gs.sent_at) ORDER BY date ASC
      `),
      query(`
        SELECT m.name, m.logo_url,
               COUNT(gi.id) as redemption_count,
               COALESCE(SUM(gi.redeemed_amount), 0) as total_redeemed
        FROM merchants m
        LEFT JOIN gift_instances gi ON gi.redeemed_by_merchant_id = m.id
          AND gi.redeemed_at >= NOW() - INTERVAL '${days} days'
        WHERE m.deleted_at IS NULL
        GROUP BY m.id, m.name, m.logo_url
        ORDER BY redemption_count DESC
        LIMIT 10
      `),
      query(`
        SELECT theme, COUNT(*) as count
        FROM gifts_sent
        WHERE sent_at >= NOW() - INTERVAL '${days} days' AND payment_status = 'paid'
        GROUP BY theme ORDER BY count DESC
      `),
      Promise.resolve({ rows: [] }),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE is_redeemed = TRUE) as redeemed,
          COUNT(*) as total
        FROM gift_instances
        WHERE created_at >= NOW() - INTERVAL '${days} days'
      `),
    ]);

    return res.json({
      success: true,
      data: {
        users_growth: usersGrowth.rows,
        gifts_volume: giftsVolume.rows,
        revenue: revenueData.rows,
        top_merchants: topMerchants.rows,
        theme_breakdown: themeBreakdown.rows,
        delivery_channels: deliveryChannels.rows,
        redemption_rate: redemptionRate.rows[0],
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', async (req, res, next) => {
  try {
    const { page = 1, limit = 30, action, resource_type } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = [];

    if (action) {
      params.push(`%${action}%`);
      conditions.push(`al.action ILIKE $${params.length}`);
    }
    if (resource_type) {
      params.push(resource_type);
      conditions.push(`al.resource_type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await query(`SELECT COUNT(*) FROM audit_logs al ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(`
      SELECT al.id, al.action, al.resource_type, al.resource_id,
             al.old_values, al.new_values, al.ip_address, al.created_at,
             u.email as user_email, u.first_name, u.last_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── Admin Users Management ───────────────────────────────────────────────────
router.get('/admins', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at FROM admin_users ORDER BY created_at'
    );
    return res.json({ success: true, data: { admins: result.rows } });
  } catch (err) {
    return next(err);
  }
});

router.post('/admins', async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, role = 'admin' } = req.body;

    if (req.admin.role !== 'superadmin') {
      return next(new AppError('Only superadmin can create admin users', 403, 'FORBIDDEN'));
    }

    if (!email || !password) {
      return next(new AppError('Email and password are required', 400, 'VALIDATION_ERROR'));
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await query(`
      INSERT INTO admin_users (email, password_hash, first_name, last_name, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, first_name, last_name, role, created_at
    `, [email.toLowerCase().trim(), password_hash, first_name, last_name, role]);

    return res.status(201).json({ success: true, data: { admin: result.rows[0] } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
