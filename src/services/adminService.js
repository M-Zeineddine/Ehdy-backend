'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, buildPagination } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 12;

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeText(value) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeUpper(value) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function toBooleanOrNull(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return Boolean(value);
}

function toFloatOrNull(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  return parseFloat(value);
}

function paginate(total, page, limit) {
  return {
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

function signAdminToken(adminUser) {
  return jwt.sign(
    {
      adminUserId: adminUser.id,
      role: adminUser.role,
      type: 'admin',
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

async function getSetupStatus() {
  const result = await query('SELECT COUNT(*)::int AS total FROM admin_users');
  return {
    needs_setup: result.rows[0].total === 0,
    admin_count: result.rows[0].total,
  };
}

async function setupInitialAdmin({ email, password, first_name, last_name, bootstrap_secret }) {
  const status = await getSetupStatus();
  if (!status.needs_setup) {
    throw new AppError('Admin owner has already been configured', 409, 'ADMIN_ALREADY_EXISTS');
  }

  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_BOOTSTRAP_SECRET) {
    if (bootstrap_secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
      throw new AppError('Invalid bootstrap secret', 403, 'INVALID_BOOTSTRAP_SECRET');
    }
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await query(
    `INSERT INTO admin_users (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, 'owner')
     RETURNING id, email, first_name, last_name, role, is_active, created_at`,
    [email.toLowerCase(), password_hash, normalizeText(first_name), normalizeText(last_name)]
  );

  const adminUser = result.rows[0];
  logger.info('Initial admin owner created', { adminUserId: adminUser.id, email: adminUser.email });

  return {
    access_token: signAdminToken(adminUser),
    admin_user: adminUser,
  };
}

async function login({ email, password }) {
  const result = await query(
    `SELECT id, email, password_hash, first_name, last_name, role, is_active
     FROM admin_users
     WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (!result.rows.length) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const adminUser = result.rows[0];
  if (!adminUser.is_active) {
    throw new AppError('This admin account is inactive', 403, 'ACCOUNT_INACTIVE');
  }

  const matches = await bcrypt.compare(password, adminUser.password_hash);
  if (!matches) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  await query(
    'UPDATE admin_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
    [adminUser.id]
  );

  logger.info('Admin user logged in', { adminUserId: adminUser.id, role: adminUser.role });

  return {
    access_token: signAdminToken(adminUser),
    admin_user: {
      id: adminUser.id,
      email: adminUser.email,
      first_name: adminUser.first_name,
      last_name: adminUser.last_name,
      role: adminUser.role,
      is_active: adminUser.is_active,
    },
  };
}

async function getAdminById(adminUserId) {
  const result = await query(
    `SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at
     FROM admin_users
     WHERE id = $1`,
    [adminUserId]
  );

  if (!result.rows.length) {
    throw new AppError('Admin user not found', 404, 'ADMIN_NOT_FOUND');
  }

  return result.rows[0];
}

async function getDashboard() {
  const [totalsResult, purchaseResult, recentUsersResult, recentGiftsResult, leaderResult, trendResult] =
    await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM users) AS total_users,
           (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS active_users,
           (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NOT NULL) AS disabled_users,
           (SELECT COUNT(*)::int FROM users WHERE is_email_verified = TRUE AND deleted_at IS NULL) AS verified_users,
           (SELECT COUNT(*)::int FROM merchants WHERE deleted_at IS NULL) AS total_merchants,
           (SELECT COUNT(*)::int FROM merchants WHERE deleted_at IS NULL AND is_active = TRUE) AS active_merchants,
           (SELECT COUNT(*)::int FROM merchants WHERE deleted_at IS NULL AND is_featured = TRUE) AS featured_merchants,
           (SELECT COUNT(*)::int FROM merchant_items) AS total_items,
           (SELECT COUNT(*)::int FROM merchant_items WHERE is_active = TRUE) AS active_items,
           (SELECT COUNT(*)::int FROM store_credit_presets) AS total_store_credits,
           (SELECT COUNT(*)::int FROM store_credit_presets WHERE is_active = TRUE) AS active_store_credits,
           (SELECT COUNT(*)::int FROM gifts_sent) AS total_gifts,
           (SELECT COUNT(*)::int FROM gifts_sent WHERE payment_status = 'paid') AS paid_gifts,
           (SELECT COUNT(*)::int FROM gifts_sent WHERE payment_status = 'pending') AS pending_gifts,
           (SELECT COUNT(*)::int FROM gifts_sent WHERE payment_status = 'failed') AS failed_gifts,
           (SELECT COALESCE(SUM(gi.initial_balance), 0) FROM gift_instances gi JOIN gifts_sent gs ON gs.id = gi.gift_sent_id WHERE gs.payment_status = 'paid') AS total_volume`
      ),
      query(
        `SELECT
           COUNT(*)::int AS gift_count,
           COALESCE(SUM(gi.initial_balance), 0) AS gift_volume
         FROM gifts_sent gs
         JOIN gift_instances gi ON gi.gift_sent_id = gs.id
         WHERE gs.payment_status = 'paid'`
      ),
      query(
        `SELECT id, email, first_name, last_name, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT 6`
      ),
      query(
        `SELECT
           gs.id,
           gs.recipient_name,
           gs.payment_status,
           gs.sent_at,
           COALESCE(sender.first_name || ' ' || sender.last_name, sender.email) AS sender_label,
           COALESCE(m_item.name, m_credit.name) AS merchant_name,
           COALESCE(mi.name, CONCAT(scp.amount::text, ' ', scp.currency_code)) AS gift_label
         FROM gifts_sent gs
         LEFT JOIN users sender ON sender.id = gs.sender_user_id
         LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
         LEFT JOIN store_credit_presets scp ON scp.id = gs.store_credit_preset_id
         LEFT JOIN merchants m_item ON m_item.id = mi.merchant_id
         LEFT JOIN merchants m_credit ON m_credit.id = scp.merchant_id
         ORDER BY gs.sent_at DESC
         LIMIT 8`
      ),
      query(
        `SELECT
           COALESCE(m_item.id, m_credit.id) AS merchant_id,
           COALESCE(m_item.name, m_credit.name) AS merchant_name,
           COUNT(*)::int AS gift_count
         FROM gifts_sent gs
         LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
         LEFT JOIN store_credit_presets scp ON scp.id = gs.store_credit_preset_id
         LEFT JOIN merchants m_item ON m_item.id = mi.merchant_id
         LEFT JOIN merchants m_credit ON m_credit.id = scp.merchant_id
         WHERE gs.payment_status = 'paid'
         GROUP BY COALESCE(m_item.id, m_credit.id), COALESCE(m_item.name, m_credit.name)
         ORDER BY gift_count DESC, merchant_name ASC
         LIMIT 5`
      ),
      query(
        `SELECT
           TO_CHAR(day_bucket, 'YYYY-MM-DD') AS day,
           gift_count
         FROM (
           SELECT DATE_TRUNC('day', sent_at) AS day_bucket, COUNT(*)::int AS gift_count
           FROM gifts_sent
           WHERE sent_at >= NOW() - INTERVAL '6 days'
           GROUP BY DATE_TRUNC('day', sent_at)
         ) trend
         ORDER BY day_bucket ASC`
      ),
    ]);

  const totals = totalsResult.rows[0];
  const giftStats = purchaseResult.rows[0];

  return {
    totals: {
      total_users: totals.total_users,
      active_users: totals.active_users,
      disabled_users: totals.disabled_users,
      verified_users: totals.verified_users,
      total_merchants: totals.total_merchants,
      active_merchants: totals.active_merchants,
      featured_merchants: totals.featured_merchants,
      total_items: totals.total_items,
      active_items: totals.active_items,
      total_store_credits: totals.total_store_credits,
      active_store_credits: totals.active_store_credits,
      total_gifts: totals.total_gifts,
      paid_gifts: totals.paid_gifts,
      pending_gifts: totals.pending_gifts,
      failed_gifts: totals.failed_gifts,
      gift_count: giftStats.gift_count,
      gift_volume: parseFloat(giftStats.gift_volume) || 0,
    },
    recent_users: recentUsersResult.rows,
    recent_gifts: recentGiftsResult.rows,
    top_merchants: leaderResult.rows,
    gift_trend: trendResult.rows,
  };
}

async function getReferenceData() {
  const [categoriesResult, merchantsResult] = await Promise.all([
    query(
      `SELECT id, name, slug
       FROM categories
       WHERE is_active = TRUE
       ORDER BY display_order ASC, name ASC`
    ),
    query(
      `SELECT id, name, is_active
       FROM merchants
       WHERE deleted_at IS NULL
       ORDER BY name ASC`
    ),
  ]);

  return {
    categories: categoriesResult.rows,
    merchants: merchantsResult.rows,
  };
}

async function listUsers({ page, limit, search, status }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status === 'active') {
    conditions.push('u.deleted_at IS NULL');
  } else if (status === 'disabled') {
    conditions.push('u.deleted_at IS NOT NULL');
  }

  if (search) {
    conditions.push(`(
      u.email ILIKE $${idx}
      OR COALESCE(u.first_name, '') ILIKE $${idx}
      OR COALESCE(u.last_name, '') ILIKE $${idx}
      OR COALESCE(u.phone, '') ILIKE $${idx}
    )`);
    params.push(`%${search.trim()}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(`SELECT COUNT(*)::int AS total FROM users u ${whereClause}`, params);
  const total = countResult.rows[0].total;

  params.push(lim, offset);
  const rowsResult = await query(
    `SELECT
       u.id,
       u.email,
       u.phone,
       u.first_name,
       u.last_name,
       u.is_email_verified,
       u.auth_provider,
       u.country_code,
       u.currency_code,
       u.created_at,
       u.last_login_at,
       u.deleted_at,
       (SELECT COUNT(*)::int FROM gifts_sent gs WHERE gs.sender_user_id = u.id AND gs.payment_status = 'paid') AS purchase_count,
       (SELECT COALESCE(SUM(gi.initial_balance), 0) FROM gifts_sent gs JOIN gift_instances gi ON gi.gift_sent_id = gs.id WHERE gs.sender_user_id = u.id AND gs.payment_status = 'paid') AS total_spent,
       (SELECT COUNT(*)::int FROM wallet_items wi WHERE wi.user_id = u.id) AS wallet_count,
       (SELECT COUNT(*)::int FROM gifts_sent gs WHERE gs.sender_user_id = u.id AND gs.payment_status = 'paid') AS gifts_sent_count
     FROM users u
     ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return {
    users: rowsResult.rows.map(row => ({
      ...row,
      total_spent: parseFloat(row.total_spent) || 0,
    })),
    pagination: paginate(total, pg, lim),
  };
}

async function updateUserStatus(userId, { is_active }) {
  const result = await query(
    `UPDATE users
     SET deleted_at = CASE WHEN $1 THEN NULL ELSE NOW() END,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, deleted_at`,
    [is_active, userId]
  );

  if (!result.rows.length) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  logger.info('Admin updated user status', { userId, isActive: is_active });
  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    is_active: result.rows[0].deleted_at === null,
  };
}

async function listMerchants({ page, limit, search, status }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const conditions = ['m.deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  if (status === 'active') {
    conditions.push('m.is_active = TRUE');
  } else if (status === 'inactive') {
    conditions.push('m.is_active = FALSE');
  }

  if (search) {
    conditions.push(`(
      m.name ILIKE $${idx}
      OR COALESCE(m.slug, '') ILIKE $${idx}
      OR COALESCE(m.contact_email, '') ILIKE $${idx}
    )`);
    params.push(`%${search.trim()}%`);
    idx++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM merchants m
     ${whereClause}`,
    params
  );

  params.push(lim, offset);
  const rowsResult = await query(
    `SELECT
       m.id,
       m.name,
       m.slug,
       m.description,
       m.website_url,
       m.logo_url,
       m.banner_image_url,
       m.category_id,
       c.name AS category_name,
       m.country_code,
       m.contact_email,
       m.contact_phone,
       m.is_active,
       m.is_verified,
       m.is_featured,
       m.created_at,
       (SELECT COUNT(*)::int FROM merchant_items mi WHERE mi.merchant_id = m.id) AS item_count,
       (SELECT COUNT(*)::int FROM store_credit_presets scp WHERE scp.merchant_id = m.id) AS store_credit_count,
       (
         SELECT COUNT(*)::int
         FROM gifts_sent gs
         LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
         LEFT JOIN store_credit_presets scp ON scp.id = gs.store_credit_preset_id
         WHERE gs.payment_status = 'paid'
           AND COALESCE(mi.merchant_id, scp.merchant_id) = m.id
       ) AS paid_gift_count
     FROM merchants m
     JOIN categories c ON c.id = m.category_id
     ${whereClause}
     ORDER BY m.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return {
    merchants: rowsResult.rows,
    pagination: paginate(countResult.rows[0].total, pg, lim),
  };
}

async function createMerchant(data) {
  const result = await query(
    `INSERT INTO merchants (
       name,
       slug,
       description,
       website_url,
       logo_url,
       banner_image_url,
       category_id,
       country_code,
       contact_email,
       contact_phone,
       is_active,
       is_verified,
       is_featured
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, TRUE), COALESCE($12, FALSE), COALESCE($13, FALSE))
     RETURNING id, name, slug, is_active, is_verified, is_featured, created_at`,
    [
      normalizeText(data.name),
      normalizeText(data.slug) || slugify(data.name),
      normalizeText(data.description),
      normalizeText(data.website_url),
      normalizeText(data.logo_url),
      normalizeText(data.banner_image_url),
      data.category_id,
      normalizeUpper(data.country_code) || 'LB',
      normalizeText(data.contact_email),
      normalizeText(data.contact_phone),
      toBooleanOrNull(data.is_active),
      toBooleanOrNull(data.is_verified),
      toBooleanOrNull(data.is_featured),
    ]
  );

  logger.info('Admin created merchant', { merchantId: result.rows[0].id });
  return result.rows[0];
}

async function updateMerchant(merchantId, data) {
  const fields = [];
  const params = [];
  let idx = 1;

  const mapping = {
    name: normalizeText(data.name),
    slug: normalizeText(data.slug),
    description: normalizeText(data.description),
    website_url: normalizeText(data.website_url),
    logo_url: normalizeText(data.logo_url),
    banner_image_url: normalizeText(data.banner_image_url),
    category_id: data.category_id,
    country_code: normalizeUpper(data.country_code),
    contact_email: normalizeText(data.contact_email),
    contact_phone: normalizeText(data.contact_phone),
    is_active: toBooleanOrNull(data.is_active),
    is_verified: toBooleanOrNull(data.is_verified),
    is_featured: toBooleanOrNull(data.is_featured),
  };

  for (const [key, value] of Object.entries(mapping)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      params.push(value);
    }
  }

  if (!fields.length) {
    throw new AppError('No valid merchant fields to update', 400, 'NO_UPDATES');
  }

  fields.push('updated_at = NOW()');
  params.push(merchantId);
  const result = await query(
    `UPDATE merchants
     SET ${fields.join(', ')}
     WHERE id = $${idx}
     RETURNING id, name, slug, is_active, is_verified, is_featured, updated_at`,
    params
  );

  if (!result.rows.length) {
    throw new AppError('Merchant not found', 404, 'MERCHANT_NOT_FOUND');
  }

  logger.info('Admin updated merchant', { merchantId });
  return result.rows[0];
}

async function updateMerchantStatus(merchantId, data) {
  return updateMerchant(merchantId, data);
}

async function listItems({ page, limit, search, status, merchant_id }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status === 'active') {
    conditions.push('mi.is_active = TRUE');
  } else if (status === 'inactive') {
    conditions.push('mi.is_active = FALSE');
  }

  if (merchant_id) {
    conditions.push(`mi.merchant_id = $${idx++}`);
    params.push(merchant_id);
  }

  if (search) {
    conditions.push(`(
      mi.name ILIKE $${idx}
      OR COALESCE(mi.item_sku, '') ILIKE $${idx}
      OR m.name ILIKE $${idx}
    )`);
    params.push(`%${search.trim()}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM merchant_items mi
     JOIN merchants m ON m.id = mi.merchant_id
     ${whereClause}`,
    params
  );

  params.push(lim, offset);
  const rowsResult = await query(
    `SELECT
       mi.id,
       mi.merchant_id,
       mi.name,
       mi.description,
       mi.image_url,
       mi.price,
       mi.currency_code,
       mi.item_sku,
       mi.is_active,
       mi.created_at,
       m.name AS merchant_name,
       (
         SELECT COUNT(*)::int
         FROM gifts_sent gs
         WHERE gs.payment_status = 'paid' AND gs.merchant_item_id = mi.id
       ) AS paid_gift_count
     FROM merchant_items mi
     JOIN merchants m ON m.id = mi.merchant_id
     ${whereClause}
     ORDER BY mi.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return {
    items: rowsResult.rows.map(row => ({
      ...row,
      price: parseFloat(row.price) || 0,
    })),
    pagination: paginate(countResult.rows[0].total, pg, lim),
  };
}

async function createItem(data) {
  const result = await query(
    `INSERT INTO merchant_items (
       merchant_id,
       name,
       description,
       image_url,
       price,
       currency_code,
       item_sku,
       is_active,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE), NOW())
     RETURNING id, merchant_id, name, price, currency_code, is_active, created_at`,
    [
      data.merchant_id,
      normalizeText(data.name),
      normalizeText(data.description),
      normalizeText(data.image_url),
      parseFloat(data.price),
      normalizeUpper(data.currency_code) || 'USD',
      normalizeText(data.item_sku),
      toBooleanOrNull(data.is_active),
    ]
  );

  logger.info('Admin created merchant item', { itemId: result.rows[0].id, merchantId: data.merchant_id });
  return result.rows[0];
}

async function updateItem(itemId, data) {
  const fields = [];
  const params = [];
  let idx = 1;
  const mapping = {
    merchant_id: data.merchant_id,
    name: normalizeText(data.name),
    description: normalizeText(data.description),
    image_url: normalizeText(data.image_url),
    price: toFloatOrNull(data.price),
    currency_code: normalizeUpper(data.currency_code),
    item_sku: normalizeText(data.item_sku),
    is_active: toBooleanOrNull(data.is_active),
  };

  for (const [key, value] of Object.entries(mapping)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      params.push(value);
    }
  }

  if (!fields.length) {
    throw new AppError('No valid item fields to update', 400, 'NO_UPDATES');
  }

  fields.push('updated_at = NOW()');
  params.push(itemId);
  const result = await query(
    `UPDATE merchant_items
     SET ${fields.join(', ')}
     WHERE id = $${idx}
     RETURNING id, merchant_id, name, price, currency_code, is_active, updated_at`,
    params
  );

  if (!result.rows.length) {
    throw new AppError('Item not found', 404, 'ITEM_NOT_FOUND');
  }

  logger.info('Admin updated merchant item', { itemId });
  return {
    ...result.rows[0],
    price: parseFloat(result.rows[0].price) || 0,
  };
}

async function updateItemStatus(itemId, data) {
  return updateItem(itemId, data);
}

async function listStoreCredits({ page, limit, search, status, merchant_id }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status === 'active') {
    conditions.push('scp.is_active = TRUE');
  } else if (status === 'inactive') {
    conditions.push('scp.is_active = FALSE');
  }

  if (merchant_id) {
    conditions.push(`scp.merchant_id = $${idx++}`);
    params.push(merchant_id);
  }

  if (search) {
    conditions.push(`m.name ILIKE $${idx}`);
    params.push(`%${search.trim()}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM store_credit_presets scp
     JOIN merchants m ON m.id = scp.merchant_id
     ${whereClause}`,
    params
  );

  params.push(lim, offset);
  const rowsResult = await query(
    `SELECT
       scp.id,
       scp.merchant_id,
       scp.amount,
       scp.currency_code,
       scp.is_active,
       scp.created_at,
       m.name AS merchant_name,
       (
         SELECT COUNT(*)::int
         FROM gifts_sent gs
         WHERE gs.payment_status = 'paid' AND gs.store_credit_preset_id = scp.id
       ) AS paid_gift_count
     FROM store_credit_presets scp
     JOIN merchants m ON m.id = scp.merchant_id
     ${whereClause}
     ORDER BY scp.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return {
    store_credits: rowsResult.rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount) || 0,
    })),
    pagination: paginate(countResult.rows[0].total, pg, lim),
  };
}

async function createStoreCredit(data) {
  const result = await query(
    `INSERT INTO store_credit_presets (
       merchant_id,
       amount,
       currency_code,
       is_active
     )
     VALUES ($1, $2, $3, COALESCE($4, TRUE))
     RETURNING id, merchant_id, amount, currency_code, is_active, created_at`,
    [
      data.merchant_id,
      parseFloat(data.amount),
      normalizeUpper(data.currency_code) || 'USD',
      toBooleanOrNull(data.is_active),
    ]
  );

  logger.info('Admin created store credit preset', { presetId: result.rows[0].id, merchantId: data.merchant_id });
  return {
    ...result.rows[0],
    amount: parseFloat(result.rows[0].amount) || 0,
  };
}

async function updateStoreCredit(storeCreditId, data) {
  const fields = [];
  const params = [];
  let idx = 1;
  const mapping = {
    merchant_id: data.merchant_id,
    amount: toFloatOrNull(data.amount),
    currency_code: normalizeUpper(data.currency_code),
    is_active: toBooleanOrNull(data.is_active),
  };

  for (const [key, value] of Object.entries(mapping)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      params.push(value);
    }
  }

  if (!fields.length) {
    throw new AppError('No valid store credit fields to update', 400, 'NO_UPDATES');
  }

  params.push(storeCreditId);
  const result = await query(
    `UPDATE store_credit_presets
     SET ${fields.join(', ')}
     WHERE id = $${idx}
     RETURNING id, merchant_id, amount, currency_code, is_active, created_at`,
    params
  );

  if (!result.rows.length) {
    throw new AppError('Store credit preset not found', 404, 'STORE_CREDIT_NOT_FOUND');
  }

  logger.info('Admin updated store credit preset', { storeCreditId });
  return {
    ...result.rows[0],
    amount: parseFloat(result.rows[0].amount) || 0,
  };
}

async function updateStoreCreditStatus(storeCreditId, data) {
  return updateStoreCredit(storeCreditId, data);
}

async function listPurchases({ page, limit }) {
  // Renamed conceptually: now returns redemption events, not Stripe purchases
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM redemption_events`);
  const rowsResult = await query(
    `SELECT re.id, re.amount, re.currency_code, re.balance_after, re.redeemed_at,
            gi.redemption_code, gi.type as gift_type,
            m.name as merchant_name,
            gs.sender_name, gs.recipient_name, gs.recipient_phone
     FROM redemption_events re
     JOIN gift_instances gi ON gi.id = re.gift_instance_id
     JOIN gifts_sent gs ON gs.id = gi.gift_sent_id
     LEFT JOIN merchants m ON m.id = re.merchant_id
     ORDER BY re.redeemed_at DESC
     LIMIT $1 OFFSET $2`,
    [lim, offset]
  );

  return {
    purchases: rowsResult.rows,
    pagination: paginate(countResult.rows[0].total, pg, lim),
  };
}

async function listGifts({ page, limit, search, payment_status }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const conditions = [];
  const params = [];
  let idx = 1;

  if (payment_status) {
    conditions.push(`gs.payment_status = $${idx++}`);
    params.push(payment_status);
  }

  if (search) {
    conditions.push(`(
      COALESCE(gs.recipient_name, '') ILIKE $${idx}
      OR COALESCE(gs.recipient_phone, '') ILIKE $${idx}
      OR COALESCE(gs.sender_name, '') ILIKE $${idx}
      OR COALESCE(sender.email, '') ILIKE $${idx}
      OR COALESCE(m_item.name, m_credit.name, '') ILIKE $${idx}
    )`);
    params.push(`%${search.trim()}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM gifts_sent gs
     LEFT JOIN users sender ON sender.id = gs.sender_user_id
     LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
     LEFT JOIN store_credit_presets scp ON scp.id = gs.store_credit_preset_id
     LEFT JOIN merchants m_item ON m_item.id = mi.merchant_id
     LEFT JOIN merchants m_credit ON m_credit.id = scp.merchant_id
     ${whereClause}`,
    params
  );

  params.push(lim, offset);
  const rowsResult = await query(
    `SELECT
       gs.id,
       gs.sender_user_id,
       gs.recipient_user_id,
       gs.recipient_name,
       gs.recipient_email,
       gs.recipient_phone,
       gs.sender_name,
       gs.personal_message,
       gs.theme,
       gs.payment_status,
       gs.unique_share_link,
       gs.sent_at,
       gs.tap_charge_id,
       COALESCE(sender.first_name || ' ' || sender.last_name, sender.email) AS sender_label,
       COALESCE(recipient.first_name || ' ' || recipient.last_name, recipient.email) AS recipient_label,
       COALESCE(m_item.name, m_credit.name) AS merchant_name,
       COALESCE(mi.name, CONCAT(scp.amount::text, ' ', scp.currency_code)) AS gift_label,
       gi.redemption_code,
       gi.current_balance,
       gi.is_redeemed
     FROM gifts_sent gs
     LEFT JOIN users sender ON sender.id = gs.sender_user_id
     LEFT JOIN users recipient ON recipient.id = gs.recipient_user_id
     LEFT JOIN merchant_items mi ON mi.id = gs.merchant_item_id
     LEFT JOIN store_credit_presets scp ON scp.id = gs.store_credit_preset_id
     LEFT JOIN merchants m_item ON m_item.id = mi.merchant_id
     LEFT JOIN merchants m_credit ON m_credit.id = scp.merchant_id
     LEFT JOIN gift_instances gi ON gi.gift_sent_id = gs.id
     ${whereClause}
     ORDER BY gs.sent_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return {
    gifts: rowsResult.rows.map(row => ({
      ...row,
      current_balance: row.current_balance === null ? null : parseFloat(row.current_balance),
    })),
    pagination: paginate(countResult.rows[0].total, pg, lim),
  };
}

module.exports = {
  getSetupStatus,
  setupInitialAdmin,
  login,
  getAdminById,
  getDashboard,
  getReferenceData,
  listUsers,
  updateUserStatus,
  listMerchants,
  createMerchant,
  updateMerchant,
  updateMerchantStatus,
  listItems,
  createItem,
  updateItem,
  updateItemStatus,
  listStoreCredits,
  createStoreCredit,
  updateStoreCredit,
  updateStoreCreditStatus,
  listPurchases,
  listGifts,
};
