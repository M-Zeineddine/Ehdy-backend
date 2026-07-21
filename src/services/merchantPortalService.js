'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { getPeriodBounds } = require('../utils/period');

/**
 * Merchant portal login.
 */
async function merchantLogin({ email, password }) {
  const result = await query(
    `SELECT mu.id, mu.merchant_id, mu.email, mu.password_hash,
            mu.first_name, mu.last_name, mu.is_active, mu.role,
            m.name as merchant_name, m.is_active as merchant_is_active
     FROM merchant_users mu
     JOIN merchants m ON m.id = mu.merchant_id
     WHERE mu.email = $1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const merchantUser = result.rows[0];

  if (!merchantUser.is_active) {
    throw new AppError('Your account is not active', 403, 'ACCOUNT_INACTIVE');
  }

  if (!merchantUser.merchant_is_active) {
    throw new AppError('The merchant account is not active', 403, 'MERCHANT_INACTIVE');
  }

  const passwordMatch = await bcrypt.compare(password, merchantUser.password_hash);
  if (!passwordMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // Branch scope for the portal UI: null = all branches
  let branchIds = null;
  if (merchantUser.role !== 'owner') {
    const branchRows = await query(
      'SELECT branch_id FROM merchant_user_branches WHERE merchant_user_id = $1',
      [merchantUser.id]
    );
    if (branchRows.rows.length > 0) {
      branchIds = branchRows.rows.map((r) => r.branch_id);
    }
  }

  const token = jwt.sign(
    {
      merchantUserId: merchantUser.id,
      merchantId: merchantUser.merchant_id,
      role: merchantUser.role,
      type: 'merchant',
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  logger.info('Merchant user logged in', {
    merchantUserId: merchantUser.id,
    merchantId: merchantUser.merchant_id,
    role: merchantUser.role,
  });

  return {
    token,
    merchant_user: {
      id: merchantUser.id,
      email: merchantUser.email,
      first_name: merchantUser.first_name,
      last_name: merchantUser.last_name,
      merchant_id: merchantUser.merchant_id,
      merchant_name: merchantUser.merchant_name,
      role: merchantUser.role,
      branch_ids: branchIds,
    },
  };
}

/**
 * Get dashboard stats for the merchant portal.
 *
 * Redemption stats always read from redemption_events (one row per actual
 * transaction) — never from gift_instances.redeemed_at/redeemed_amount,
 * which only update when a card becomes FULLY redeemed and otherwise hide
 * every partial redemption from these numbers entirely.
 *
 * branchIds: null = merchant-wide (owners, or managers with no branch
 * assignment); an array limits redemption stats to that branch. active_codes,
 * outstanding_balance, and lifetime stats stay merchant-wide — none of those
 * are bound to a branch.
 *
 * Sales (purchase) stats, best_seller, branch_breakdown, and lifetime are
 * only included for owners — company-wide financials a branch manager has
 * no operational reason to see (and, for branch_breakdown, would otherwise
 * reveal other branches' performance to a manager scoped to just one).
 */
async function getMerchantDashboard(merchantId, branchIds = null, role = 'owner') {
  const today = getPeriodBounds('today');
  const yesterday = getPeriodBounds('yesterday');
  const month = getPeriodBounds('month');
  const lastMonth = getPeriodBounds('last_month');

  const redemptionParams = [
    today.date_from, today.date_to,
    yesterday.date_from, yesterday.date_to,
    month.date_from, month.date_to,
    lastMonth.date_from, lastMonth.date_to,
    merchantId,
  ];
  let branchFilter = '';
  if (branchIds) {
    branchFilter = `AND re.branch_id = ANY($${redemptionParams.length + 1})`;
    redemptionParams.push(branchIds);
  }

  const redemptionStats = await query(
    `SELECT
       COUNT(*) FILTER (WHERE re.redeemed_at BETWEEN $1 AND $2) AS today_redemptions,
       SUM(re.amount) FILTER (WHERE re.redeemed_at BETWEEN $1 AND $2) AS today_revenue,
       COUNT(*) FILTER (WHERE re.redeemed_at BETWEEN $3 AND $4) AS yesterday_redemptions,
       SUM(re.amount) FILTER (WHERE re.redeemed_at BETWEEN $3 AND $4) AS yesterday_revenue,
       COUNT(*) FILTER (WHERE re.redeemed_at BETWEEN $5 AND $6) AS month_redemptions,
       SUM(re.amount) FILTER (WHERE re.redeemed_at BETWEEN $5 AND $6) AS month_revenue,
       COUNT(*) FILTER (WHERE re.redeemed_at BETWEEN $7 AND $8) AS last_month_redemptions,
       SUM(re.amount) FILTER (WHERE re.redeemed_at BETWEEN $7 AND $8) AS last_month_revenue
     FROM redemption_events re
     WHERE re.merchant_id = $9 ${branchFilter}`,
    redemptionParams
  );

  const activeCodes = await query(
    `SELECT COUNT(*) AS active_codes
     FROM gift_instances gi
     LEFT JOIN merchant_items mi ON mi.id = gi.merchant_item_id
     WHERE COALESCE(mi.merchant_id, gi.custom_credit_merchant_id) = $1
       AND gi.is_redeemed = FALSE
       AND (gi.expiration_date IS NULL OR gi.expiration_date >= CURRENT_DATE)`,
    [merchantId]
  );

  // Outstanding balance: unredeemed store credit still in circulation — a
  // liability figure, not tied to any branch (a customer can redeem it
  // anywhere the merchant allows).
  const outstanding = await query(
    `SELECT COALESCE(SUM(gi.current_balance), 0) AS outstanding
     FROM gift_instances gi
     WHERE gi.custom_credit_merchant_id = $1 AND gi.is_redeemed = FALSE`,
    [merchantId]
  );

  const failedToday = await query(
    `SELECT COUNT(*) AS failed_today
     FROM redemption_attempts ra
     WHERE ra.merchant_id = $1 AND ra.attempted_at BETWEEN $2 AND $3`,
    [merchantId, today.date_from, today.date_to]
  );

  const r = redemptionStats.rows[0];
  const result = {
    today: {
      redemptions: parseInt(r.today_redemptions, 10) || 0,
      revenue: parseFloat(r.today_revenue) || 0,
    },
    yesterday: {
      redemptions: parseInt(r.yesterday_redemptions, 10) || 0,
      revenue: parseFloat(r.yesterday_revenue) || 0,
    },
    month: {
      redemptions: parseInt(r.month_redemptions, 10) || 0,
      revenue: parseFloat(r.month_revenue) || 0,
    },
    last_month: {
      redemptions: parseInt(r.last_month_redemptions, 10) || 0,
      revenue: parseFloat(r.last_month_revenue) || 0,
    },
    active_codes: parseInt(activeCodes.rows[0].active_codes, 10) || 0,
    outstanding_balance: parseFloat(outstanding.rows[0].outstanding) || 0,
    failed_attempts_today: parseInt(failedToday.rows[0].failed_today, 10) || 0,
    sales: null,
    best_seller: null,
    branch_breakdown: null,
    lifetime: null,
  };

  if (role === 'owner') {
    const saleParams = [
      today.date_from, today.date_to,
      yesterday.date_from, yesterday.date_to,
      month.date_from, month.date_to,
      lastMonth.date_from, lastMonth.date_to,
      merchantId,
    ];
    const saleStats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE gs.sent_at BETWEEN $1 AND $2) AS today_sold,
         SUM(COALESCE(mi.price, gs.custom_credit_amount)) FILTER (WHERE gs.sent_at BETWEEN $1 AND $2) AS today_revenue,
         COUNT(*) FILTER (WHERE gs.sent_at BETWEEN $3 AND $4) AS yesterday_sold,
         SUM(COALESCE(mi.price, gs.custom_credit_amount)) FILTER (WHERE gs.sent_at BETWEEN $3 AND $4) AS yesterday_revenue,
         COUNT(*) FILTER (WHERE gs.sent_at BETWEEN $5 AND $6) AS month_sold,
         SUM(COALESCE(mi.price, gs.custom_credit_amount)) FILTER (WHERE gs.sent_at BETWEEN $5 AND $6) AS month_revenue,
         COUNT(*) FILTER (WHERE gs.sent_at BETWEEN $7 AND $8) AS last_month_sold,
         SUM(COALESCE(mi.price, gs.custom_credit_amount)) FILTER (WHERE gs.sent_at BETWEEN $7 AND $8) AS last_month_revenue
       FROM gifts_sent gs
       LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
       WHERE gs.payment_status = 'paid'
         AND COALESCE(mi.merchant_id, gs.custom_credit_merchant_id) = $9`,
      saleParams
    );
    const s = saleStats.rows[0];
    result.sales = {
      today: { sold: parseInt(s.today_sold, 10) || 0, revenue: parseFloat(s.today_revenue) || 0 },
      yesterday: { sold: parseInt(s.yesterday_sold, 10) || 0, revenue: parseFloat(s.yesterday_revenue) || 0 },
      month: { sold: parseInt(s.month_sold, 10) || 0, revenue: parseFloat(s.month_revenue) || 0 },
      last_month: { sold: parseInt(s.last_month_sold, 10) || 0, revenue: parseFloat(s.last_month_revenue) || 0 },
    };

    const bestSeller = await query(
      `SELECT mi.name, COUNT(*) AS times_sold
       FROM gifts_sent gs
       JOIN merchant_items mi ON mi.id = gs.merchant_item_id
       WHERE gs.payment_status = 'paid' AND mi.merchant_id = $1
       GROUP BY mi.id, mi.name
       ORDER BY times_sold DESC
       LIMIT 1`,
      [merchantId]
    );
    if (bestSeller.rows.length) {
      result.best_seller = {
        name: bestSeller.rows[0].name,
        count: parseInt(bestSeller.rows[0].times_sold, 10),
      };
    }

    const branches = await query(
      `SELECT b.id, b.name, COUNT(re.id) AS redemptions
       FROM merchant_branches b
       LEFT JOIN redemption_events re
         ON re.branch_id = b.id AND re.redeemed_at BETWEEN $2 AND $3
       WHERE b.merchant_id = $1 AND b.is_active = TRUE
       GROUP BY b.id, b.name
       ORDER BY redemptions DESC`,
      [merchantId, today.date_from, today.date_to]
    );
    if (branches.rows.length > 1) {
      result.branch_breakdown = branches.rows.map((row) => ({
        branch_id: row.id,
        branch_name: row.name,
        redemptions: parseInt(row.redemptions, 10),
      }));
    }

    const lifetimeSales = await query(
      `SELECT COALESCE(SUM(COALESCE(mi.price, gs.custom_credit_amount)), 0) AS revenue
       FROM gifts_sent gs
       LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
       WHERE gs.payment_status = 'paid' AND COALESCE(mi.merchant_id, gs.custom_credit_merchant_id) = $1`,
      [merchantId]
    );
    const lifetimeCodes = await query(
      `SELECT
         COUNT(*) AS codes_issued,
         COUNT(*) FILTER (WHERE gi.is_redeemed = FALSE) AS unredeemed_codes
       FROM gift_instances gi
       LEFT JOIN merchant_items mi ON mi.id = gi.merchant_item_id
       WHERE COALESCE(mi.merchant_id, gi.custom_credit_merchant_id) = $1`,
      [merchantId]
    );
    result.lifetime = {
      sales_revenue: parseFloat(lifetimeSales.rows[0].revenue) || 0,
      codes_issued: parseInt(lifetimeCodes.rows[0].codes_issued, 10) || 0,
      unredeemed_codes: parseInt(lifetimeCodes.rows[0].unredeemed_codes, 10) || 0,
    };
  }

  return result;
}

/**
 * Shared filter-clause builder for gifts_sent purchases — used by both the
 * paginated list and the filter-scoped summary so they can never disagree
 * about what a given set of filters means.
 */
function buildPurchasesClause({ date_from, date_to, type }) {
  const conditions = [
    `gs.payment_status = 'paid'`,
    `COALESCE(mi.merchant_id, gs.custom_credit_merchant_id) = $1`,
  ];
  const params = [];
  let idx = 2;
  if (date_from) { conditions.push(`gs.sent_at >= $${idx++}`); params.push(date_from); }
  if (date_to)   { conditions.push(`gs.sent_at <= $${idx++}`); params.push(date_to); }
  if (type === 'gift_item')    conditions.push('gs.merchant_item_id IS NOT NULL');
  if (type === 'store_credit') conditions.push('gs.merchant_item_id IS NULL');
  return { where: conditions.join(' AND '), extraParams: params };
}

/**
 * Purchase history for a merchant — one row per gift card sold (paid),
 * whether or not it's been redeemed yet. Not branch-scoped: a purchase
 * happens online, never at a specific branch.
 */
async function getMerchantPurchases(merchantId, { page, limit, period, type } = {}) {
  const { buildPagination } = require('../utils/database');
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const { date_from, date_to } = getPeriodBounds(period);

  const { where: whereClause, extraParams } = buildPurchasesClause({ date_from, date_to, type });
  const params = [merchantId, ...extraParams];
  let idx = params.length + 1;
  const joins = `LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
                 LEFT JOIN gift_instances gi ON gi.gift_sent_id = gs.id`;

  const countResult = await query(
    `SELECT COUNT(*) FROM gifts_sent gs ${joins} WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(lim, offset);

  const result = await query(
    `SELECT gs.id, gs.sent_at, gs.sender_name, gs.recipient_name, gs.recipient_phone, gs.personal_message,
            COALESCE(mi.price, gs.custom_credit_amount)          AS amount,
            COALESCE(mi.currency_code, gs.custom_credit_currency) AS currency_code,
            CASE WHEN gs.merchant_item_id IS NOT NULL THEN 'gift_item' ELSE 'store_credit' END AS type,
            CASE
              WHEN gs.merchant_item_id IS NOT NULL THEN mi.name
              ELSE CONCAT(gs.custom_credit_amount::text, ' ', gs.custom_credit_currency, ' Store Credit')
            END AS gift_card_name,
            mi.description AS item_description, mi.image_url AS item_image,
            gi.is_redeemed, gi.current_balance, gi.initial_balance,
            CASE
              WHEN gi.is_redeemed = TRUE THEN 'redeemed'
              WHEN gi.current_balance IS NOT NULL AND gi.initial_balance IS NOT NULL
                   AND gi.current_balance < gi.initial_balance THEN 'partially_redeemed'
              ELSE 'active'
            END AS redemption_status
     FROM gifts_sent gs
     ${joins}
     WHERE ${whereClause}
     ORDER BY gs.sent_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return {
    purchases: result.rows,
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

/**
 * Aggregate stats for the exact same filter set getMerchantPurchases accepts
 * — reuses the same clause builder so the summary bar shown above a filtered
 * list can never disagree with what's actually in that list.
 */
async function getMerchantPurchasesSummary(merchantId, { period, type } = {}) {
  const { date_from, date_to } = getPeriodBounds(period);
  const { where: whereClause, extraParams } = buildPurchasesClause({ date_from, date_to, type });
  const params = [merchantId, ...extraParams];

  const r = await query(
    `SELECT
       COUNT(*) AS count,
       COALESCE(SUM(COALESCE(mi.price, gs.custom_credit_amount)), 0) AS revenue
     FROM gifts_sent gs
     LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
     WHERE ${whereClause}`,
    params
  );
  return {
    count: parseInt(r.rows[0].count, 10) || 0,
    revenue: parseFloat(r.rows[0].revenue) || 0,
  };
}

/**
 * Currently active (unredeemed, unexpired) gift codes for a merchant —
 * merchant-wide, since a code isn't tied to any branch until redeemed.
 */
async function listActiveCodes(merchantId, { page, limit, type } = {}) {
  const { buildPagination } = require('../utils/database');
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const conditions = [
    `COALESCE(mi.merchant_id, gi.custom_credit_merchant_id) = $1`,
    'gi.is_redeemed = FALSE',
    '(gi.expiration_date IS NULL OR gi.expiration_date >= CURRENT_DATE)',
  ];
  if (type === 'gift_item')    conditions.push('gi.merchant_item_id IS NOT NULL');
  if (type === 'store_credit') conditions.push('gi.merchant_item_id IS NULL');
  const whereClause = conditions.join(' AND ');
  const joins = 'LEFT JOIN merchant_items mi ON mi.id = gi.merchant_item_id';

  const countResult = await query(
    `SELECT COUNT(*) FROM gift_instances gi ${joins} WHERE ${whereClause}`,
    [merchantId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT gi.id, gi.redemption_code, gi.current_balance, gi.initial_balance,
            gi.currency_code, gi.expiration_date, gi.created_at,
            CASE WHEN gi.merchant_item_id IS NOT NULL THEN 'gift_item' ELSE 'store_credit' END AS type,
            CASE
              WHEN gi.merchant_item_id IS NOT NULL THEN mi.name
              ELSE CONCAT(gi.initial_balance::text, ' ', gi.currency_code, ' Store Credit')
            END AS gift_card_name
     FROM gift_instances gi
     ${joins}
     WHERE ${whereClause}
     ORDER BY gi.created_at DESC
     LIMIT $2 OFFSET $3`,
    [merchantId, lim, offset]
  );

  return {
    codes: result.rows,
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

// ─── Branches ─────────────────────────────────────────────────────────────────

async function listBranches(merchantId) {
  const result = await query(
    `SELECT id, name, address, city, latitude, longitude, contact_phone, is_active, created_at
     FROM merchant_branches WHERE merchant_id = $1 ORDER BY name`,
    [merchantId]
  );
  return result.rows;
}

async function createBranch(merchantId, { name, address, city, latitude, longitude, contact_phone }) {
  const result = await query(
    `INSERT INTO merchant_branches (merchant_id, name, address, city, latitude, longitude, contact_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, address, city, latitude, longitude, contact_phone, is_active, created_at`,
    [merchantId, name, address || null, city || null, latitude || null, longitude || null, contact_phone || null]
  );
  return result.rows[0];
}

const BRANCH_FIELDS = ['name', 'address', 'city', 'latitude', 'longitude', 'contact_phone', 'is_active'];

async function updateBranch(merchantId, branchId, data) {
  const sets = [];
  const params = [];
  let idx = 1;
  for (const field of BRANCH_FIELDS) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${idx++}`);
      params.push(data[field]);
    }
  }
  if (sets.length === 0) {
    throw new AppError('No updatable fields provided', 400, 'NO_FIELDS');
  }
  params.push(branchId, merchantId);
  const result = await query(
    `UPDATE merchant_branches SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${idx++} AND merchant_id = $${idx}
     RETURNING id, name, address, city, latitude, longitude, contact_phone, is_active, created_at`,
    params
  );
  if (result.rows.length === 0) {
    throw new AppError('Branch not found', 404, 'BRANCH_NOT_FOUND');
  }
  return result.rows[0];
}

// ─── Items ────────────────────────────────────────────────────────────────────

async function listItems(merchantId) {
  const result = await query(
    `SELECT mi.id, mi.name, mi.description, mi.image_url, mi.price, mi.currency_code,
            mi.item_sku, mi.is_active, mi.created_at,
            COALESCE(json_agg(json_build_object('id', mb.id, 'name', mb.name))
              FILTER (WHERE mb.id IS NOT NULL), '[]') AS available_branches
     FROM merchant_items mi
     LEFT JOIN merchant_item_branches mib ON mib.merchant_item_id = mi.id
     LEFT JOIN merchant_branches mb ON mb.id = mib.branch_id
     WHERE mi.merchant_id = $1
     GROUP BY mi.id
     ORDER BY mi.name`,
    [merchantId]
  );
  return result.rows;
}

async function createItem(merchantId, { name, description, image_url, price, currency_code, item_sku, branch_ids }) {
  return withTransaction(async (client) => {
    await assertBranchesBelongToMerchant(client, merchantId, branch_ids);
    const result = await client.query(
      `INSERT INTO merchant_items (merchant_id, name, description, image_url, price, currency_code, item_sku)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, image_url, price, currency_code, item_sku, is_active, created_at`,
      [merchantId, name, description || null, image_url || null, price, currency_code || 'USD', item_sku || null]
    );
    const item = result.rows[0];
    for (const branchId of branch_ids || []) {
      await client.query(
        'INSERT INTO merchant_item_branches (merchant_item_id, branch_id) VALUES ($1, $2)',
        [item.id, branchId]
      );
    }
    return { ...item, branch_ids: branch_ids || [] };
  });
}

const ITEM_FIELDS = ['name', 'description', 'image_url', 'price', 'currency_code', 'item_sku', 'is_active'];

async function updateItem(merchantId, itemId, data) {
  return withTransaction(async (client) => {
    const sets = [];
    const params = [];
    let idx = 1;
    for (const field of ITEM_FIELDS) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(data[field]);
      }
    }
    if (sets.length === 0 && data.branch_ids === undefined) {
      throw new AppError('No updatable fields provided', 400, 'NO_FIELDS');
    }

    let item;
    if (sets.length > 0) {
      params.push(itemId, merchantId);
      const result = await client.query(
        `UPDATE merchant_items SET ${sets.join(', ')}
         WHERE id = $${idx++} AND merchant_id = $${idx}
         RETURNING id, name, description, image_url, price, currency_code, item_sku, is_active, created_at`,
        params
      );
      if (result.rows.length === 0) {
        throw new AppError('Item not found', 404, 'ITEM_NOT_FOUND');
      }
      item = result.rows[0];
    } else {
      const result = await client.query(
        `SELECT id, name, description, image_url, price, currency_code, item_sku, is_active, created_at
         FROM merchant_items WHERE id = $1 AND merchant_id = $2`,
        [itemId, merchantId]
      );
      if (result.rows.length === 0) {
        throw new AppError('Item not found', 404, 'ITEM_NOT_FOUND');
      }
      item = result.rows[0];
    }

    // branch_ids replaces the availability set; [] restores "all branches"
    if (data.branch_ids !== undefined) {
      await assertBranchesBelongToMerchant(client, merchantId, data.branch_ids);
      await client.query('DELETE FROM merchant_item_branches WHERE merchant_item_id = $1', [itemId]);
      for (const branchId of data.branch_ids || []) {
        await client.query(
          'INSERT INTO merchant_item_branches (merchant_item_id, branch_id) VALUES ($1, $2)',
          [itemId, branchId]
        );
      }
    }

    const branches = await client.query(
      'SELECT branch_id FROM merchant_item_branches WHERE merchant_item_id = $1',
      [itemId]
    );
    return { ...item, branch_ids: branches.rows.map((r) => r.branch_id) };
  });
}

// ─── Staff ────────────────────────────────────────────────────────────────────

async function assertBranchesBelongToMerchant(client, merchantId, branchIds) {
  if (!branchIds || branchIds.length === 0) return;
  const check = await client.query(
    'SELECT COUNT(*) FROM merchant_branches WHERE merchant_id = $1 AND id = ANY($2)',
    [merchantId, branchIds]
  );
  if (parseInt(check.rows[0].count, 10) !== branchIds.length) {
    throw new AppError('One or more branches do not belong to this merchant', 400, 'INVALID_BRANCH');
  }
}

async function listStaff(merchantId) {
  const result = await query(
    `SELECT mu.id, mu.email, mu.first_name, mu.last_name, mu.role, mu.is_active, mu.created_at,
            COALESCE(json_agg(json_build_object('id', mb.id, 'name', mb.name))
              FILTER (WHERE mb.id IS NOT NULL), '[]') AS branches
     FROM merchant_users mu
     LEFT JOIN merchant_user_branches mub ON mub.merchant_user_id = mu.id
     LEFT JOIN merchant_branches mb ON mb.id = mub.branch_id
     WHERE mu.merchant_id = $1
     GROUP BY mu.id
     ORDER BY mu.role DESC, mu.email`,
    [merchantId]
  );
  return result.rows;
}

async function createStaff(merchantId, { email, password, first_name, last_name, role, branch_ids }) {
  return withTransaction(async (client) => {
    await assertBranchesBelongToMerchant(client, merchantId, branch_ids);
    const hash = await bcrypt.hash(password, 10);
    let user;
    try {
      const result = await client.query(
        `INSERT INTO merchant_users (merchant_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, first_name, last_name, role, is_active, created_at`,
        [merchantId, email.toLowerCase(), hash, first_name || null, last_name || null, role]
      );
      user = result.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('An account with this email already exists', 409, 'EMAIL_EXISTS');
      }
      throw err;
    }
    if (branch_ids && branch_ids.length > 0) {
      for (const branchId of branch_ids) {
        await client.query(
          'INSERT INTO merchant_user_branches (merchant_user_id, branch_id) VALUES ($1, $2)',
          [user.id, branchId]
        );
      }
    }
    return { ...user, branch_ids: branch_ids || [] };
  });
}

async function updateStaff(merchantId, staffId, { first_name, last_name, role, is_active, password, branch_ids }) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT id, role FROM merchant_users WHERE id = $1 AND merchant_id = $2',
      [staffId, merchantId]
    );
    if (existing.rows.length === 0) {
      throw new AppError('Staff account not found', 404, 'STAFF_NOT_FOUND');
    }
    if (existing.rows[0].role === 'owner') {
      throw new AppError('Owner accounts cannot be modified here', 403, 'OWNER_IMMUTABLE');
    }

    const sets = [];
    const params = [];
    let idx = 1;
    if (first_name !== undefined) { sets.push(`first_name = $${idx++}`); params.push(first_name); }
    if (last_name !== undefined) { sets.push(`last_name = $${idx++}`); params.push(last_name); }
    if (role !== undefined) { sets.push(`role = $${idx++}`); params.push(role); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(is_active); }
    if (password !== undefined) { sets.push(`password_hash = $${idx++}`); params.push(await bcrypt.hash(password, 10)); }
    if (sets.length > 0) {
      params.push(staffId);
      await client.query(
        `UPDATE merchant_users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
        params
      );
    }

    if (branch_ids !== undefined) {
      await assertBranchesBelongToMerchant(client, merchantId, branch_ids);
      await client.query('DELETE FROM merchant_user_branches WHERE merchant_user_id = $1', [staffId]);
      for (const branchId of branch_ids || []) {
        await client.query(
          'INSERT INTO merchant_user_branches (merchant_user_id, branch_id) VALUES ($1, $2)',
          [staffId, branchId]
        );
      }
    }

    const result = await client.query(
      `SELECT mu.id, mu.email, mu.first_name, mu.last_name, mu.role, mu.is_active,
              COALESCE(json_agg(mub.branch_id) FILTER (WHERE mub.branch_id IS NOT NULL), '[]') AS branch_ids
       FROM merchant_users mu
       LEFT JOIN merchant_user_branches mub ON mub.merchant_user_id = mu.id
       WHERE mu.id = $1
       GROUP BY mu.id`,
      [staffId]
    );
    return result.rows[0];
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

async function getProfile(merchantId) {
  const result = await query(
    `SELECT id, name, slug, description, website_url, logo_url, banner_image_url,
            contact_email, contact_phone, is_active, is_verified, rating, review_count
     FROM merchants WHERE id = $1`,
    [merchantId]
  );
  return result.rows[0];
}

const PROFILE_FIELDS = [
  'description', 'website_url', 'logo_url', 'banner_image_url',
  'contact_email', 'contact_phone',
];

async function updateProfile(merchantId, data) {
  const sets = [];
  const params = [];
  let idx = 1;
  for (const field of PROFILE_FIELDS) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${idx++}`);
      params.push(data[field]);
    }
  }
  if (sets.length === 0) {
    throw new AppError('No updatable fields provided', 400, 'NO_FIELDS');
  }
  params.push(merchantId);
  const result = await query(
    `UPDATE merchants SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}
     RETURNING id, name, slug, description, website_url, logo_url, banner_image_url,
               contact_email, contact_phone`,
    params
  );
  return result.rows[0];
}

module.exports = {
  merchantLogin,
  getMerchantDashboard,
  getMerchantPurchases,
  getMerchantPurchasesSummary,
  listActiveCodes,
  listBranches,
  createBranch,
  updateBranch,
  listItems,
  createItem,
  updateItem,
  listStaff,
  createStaff,
  updateStaff,
  getProfile,
  updateProfile,
};
