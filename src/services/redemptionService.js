'use strict';

const { query, withTransaction } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');
const { getRedisClient } = require('../config/redis');
const { getPeriodBounds } = require('../utils/period');

const REDEMPTION_OTP_TTL = 5 * 60; // 5 minutes

// gift_instances has no custom_credit_amount column — use initial_balance for display
const GIFT_INSTANCE_SELECT = `
  SELECT gi.id, gi.redemption_code, gi.current_balance, gi.initial_balance,
         gi.is_redeemed, gi.redeemed_at, gi.expiration_date, gi.item_claimed,
         gi.currency_code, gi.merchant_item_id, gi.custom_credit_merchant_id,
         CASE WHEN gi.merchant_item_id IS NOT NULL THEN 'gift_item' ELSE 'store_credit' END AS type,
         CASE
           WHEN gi.merchant_item_id IS NOT NULL THEN mi.name
           ELSE CONCAT(gi.initial_balance::text, ' ', gi.currency_code, ' Store Credit')
         END AS gift_card_name,
         mi.name AS item_name,
         COALESCE(mi.merchant_id, gi.custom_credit_merchant_id) AS merchant_id,
         COALESCE(m_mi.name, m_custom.name) AS merchant_name,
         wi.user_id AS wallet_owner_id,
         u.first_name AS owner_first_name,
         u.last_name  AS owner_last_name
  FROM gift_instances gi
  LEFT JOIN merchant_items mi       ON mi.id       = gi.merchant_item_id
  LEFT JOIN merchants      m_mi     ON m_mi.id     = mi.merchant_id
  LEFT JOIN merchants      m_custom ON m_custom.id = gi.custom_credit_merchant_id
  LEFT JOIN wallet_items   wi       ON wi.gift_instance_id = gi.id
  LEFT JOIN users          u        ON u.id = wi.user_id
`;

/**
 * Validate a redemption code without consuming it.
 */
async function validateRedemptionCode(redemptionCode, merchantId) {
  const result = await query(
    `${GIFT_INSTANCE_SELECT} WHERE gi.redemption_code = $1`,
    [redemptionCode]
  );

  if (result.rows.length === 0) {
    throw new AppError('Redemption code not found', 404, 'CODE_NOT_FOUND');
  }

  const instance = result.rows[0];

  if (instance.merchant_id !== merchantId) {
    throw new AppError('This code is not valid for your store', 403, 'WRONG_MERCHANT');
  }

  if (instance.is_redeemed) {
    throw new AppError('This code has already been fully redeemed', 400, 'ALREADY_REDEEMED');
  }

  if (instance.item_claimed) {
    throw new AppError('This item has already been claimed', 400, 'ITEM_ALREADY_CLAIMED');
  }

  if (instance.expiration_date && new Date(instance.expiration_date) < new Date()) {
    throw new AppError('This code has expired', 400, 'CODE_EXPIRED');
  }

  // Branch availability for gift items: null = redeemable at any branch
  let redeemableBranches = null;
  if (instance.merchant_item_id) {
    const avail = await query(
      `SELECT mb.id, mb.name
       FROM merchant_item_branches mib
       JOIN merchant_branches mb ON mb.id = mib.branch_id
       WHERE mib.merchant_item_id = $1
       ORDER BY mb.name`,
      [instance.merchant_item_id]
    );
    if (avail.rows.length > 0) {
      redeemableBranches = avail.rows;
    }
  }

  logger.info('Redemption code validated', { redemptionCode, merchantId });

  return {
    is_valid: true,
    gift: {
      type: instance.type,
      value: instance.current_balance ?? instance.initial_balance,
      currency: instance.currency_code,
      item_name: instance.item_name ?? null,
      merchant_name: instance.merchant_name,
      recipient_name: instance.owner_first_name
        ? `${instance.owner_first_name} ${instance.owner_last_name}`.trim()
        : null,
      current_balance: instance.current_balance,
      redeemable_branches: redeemableBranches,
    },
  };
}

/**
 * Confirm and process a redemption.
 */
/**
 * Resolve and validate the branch a redemption is attributed to.
 * - A requested/default branch must belong to the merchant, be active, and
 *   fall within the user's branch scope (when scoped).
 * - If the merchant has active branches, a branch is required so sales
 *   history stays attributable; merchants without branches redeem unattributed.
 */
async function resolveRedemptionBranch(merchantId, { branch_id, scoped_branch_ids }) {
  if (branch_id) {
    const branch = await query(
      'SELECT id FROM merchant_branches WHERE id = $1 AND merchant_id = $2 AND is_active = TRUE',
      [branch_id, merchantId]
    );
    if (branch.rows.length === 0) {
      throw new AppError('Branch not found for this merchant', 400, 'INVALID_BRANCH');
    }
    if (scoped_branch_ids && !scoped_branch_ids.includes(branch_id)) {
      throw new AppError('You are not assigned to this branch', 403, 'BRANCH_FORBIDDEN');
    }
    return branch_id;
  }

  const branches = await query(
    'SELECT COUNT(*) FROM merchant_branches WHERE merchant_id = $1 AND is_active = TRUE',
    [merchantId]
  );
  if (parseInt(branches.rows[0].count, 10) > 0) {
    throw new AppError('branch_id is required: this merchant has branches', 400, 'BRANCH_REQUIRED');
  }
  return null;
}

/**
 * Best-effort log of a failed redemption attempt — never lets a logging
 * failure mask the real error the caller is about to see.
 */
async function logRedemptionAttempt({ merchantId, merchantUserId, branchId, attemptedCode, errorCode, errorMessage }) {
  try {
    await query(
      `INSERT INTO redemption_attempts
         (merchant_id, merchant_user_id, branch_id, attempted_code, error_code, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [merchantId, merchantUserId || null, branchId || null, attemptedCode, errorCode, errorMessage]
    );
  } catch (logErr) {
    logger.error('Failed to log redemption attempt', { error: logErr.message });
  }
}

async function confirmRedemption(redemptionCode, merchantId, { amount_to_redeem, notes, merchant_user_id, branch_id, scoped_branch_ids }) {
  // Best-effort "where" for the failure log — resolveRedemptionBranch below
  // may replace this with the properly resolved branch, or may itself throw
  // before that happens, in which case this raw value is what we log.
  let effectiveBranchId = branch_id || null;
  try {
    effectiveBranchId = await resolveRedemptionBranch(merchantId, { branch_id, scoped_branch_ids });
    return await performRedemption(redemptionCode, merchantId, { amount_to_redeem, notes, merchant_user_id }, effectiveBranchId);
  } catch (err) {
    logRedemptionAttempt({
      merchantId,
      merchantUserId: merchant_user_id,
      branchId: effectiveBranchId,
      attemptedCode: redemptionCode,
      errorCode: err.code || 'UNKNOWN_ERROR',
      errorMessage: err.message,
    });
    throw err;
  }
}

async function performRedemption(redemptionCode, merchantId, { amount_to_redeem, notes, merchant_user_id }, effectiveBranchId) {
  // OTP_VERIFICATION_ENABLED: set to true to re-enable recipient OTP check
  const OTP_VERIFICATION_ENABLED = false;
  if (OTP_VERIFICATION_ENABLED) {
    const redis = await getRedisClient();
    const verified = await redis.get(`redemption_verified:${redemptionCode}`);
    if (!verified) {
      throw new AppError('Recipient OTP verification required before redemption.', 403, 'OTP_REQUIRED');
    }
    await redis.del(`redemption_verified:${redemptionCode}`);
  }

  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT gi.id, gi.current_balance, gi.is_redeemed, gi.expiration_date,
              gi.item_claimed, gi.currency_code, gi.merchant_item_id, gi.custom_credit_merchant_id,
              CASE WHEN gi.merchant_item_id IS NOT NULL THEN 'gift_item' ELSE 'store_credit' END AS type,
              CASE
                WHEN gi.merchant_item_id IS NOT NULL THEN mi.name
                ELSE CONCAT(gi.initial_balance::text, ' ', gi.currency_code, ' Store Credit')
              END AS gift_card_name,
              COALESCE(mi.merchant_id, gi.custom_credit_merchant_id) AS merchant_id,
              wi.user_id AS wallet_owner_id
       FROM gift_instances gi
       LEFT JOIN merchant_items mi ON mi.id = gi.merchant_item_id
       LEFT JOIN wallet_items   wi ON wi.gift_instance_id = gi.id
       WHERE gi.redemption_code = $1
       FOR UPDATE OF gi`,
      [redemptionCode]
    );

    if (result.rows.length === 0) {
      throw new AppError('Redemption code not found', 404, 'CODE_NOT_FOUND');
    }

    const instance = result.rows[0];

    if (instance.merchant_id !== merchantId) {
      throw new AppError('This code is not valid for your store', 403, 'WRONG_MERCHANT');
    }

    if (instance.is_redeemed) {
      throw new AppError('This code has already been fully redeemed', 400, 'ALREADY_REDEEMED');
    }

    if (instance.expiration_date && new Date(instance.expiration_date) < new Date()) {
      throw new AppError('This code has expired', 400, 'CODE_EXPIRED');
    }

    // Enforce branch availability for branch-scoped items
    if (instance.merchant_item_id) {
      const avail = await client.query(
        'SELECT branch_id FROM merchant_item_branches WHERE merchant_item_id = $1',
        [instance.merchant_item_id]
      );
      if (avail.rows.length > 0) {
        const allowed = avail.rows.map((r) => r.branch_id);
        if (!effectiveBranchId || !allowed.includes(effectiveBranchId)) {
          throw new AppError(
            'This item is not redeemable at this branch',
            403,
            'ITEM_NOT_AVAILABLE_AT_BRANCH'
          );
        }
      }
    }

    let newBalance = instance.current_balance;
    let isFullyRedeemed = false;

    if (instance.type === 'store_credit') {
      if (!amount_to_redeem || amount_to_redeem <= 0) {
        throw new AppError('Amount to redeem is required for store credit', 400, 'AMOUNT_REQUIRED');
      }

      const redeemAmt = parseFloat(amount_to_redeem);
      const currentBal = parseFloat(instance.current_balance) || 0;

      if (redeemAmt > currentBal) {
        throw new AppError(
          `Insufficient balance. Available: ${currentBal} ${instance.currency_code}`,
          400,
          'INSUFFICIENT_BALANCE'
        );
      }

      newBalance = currentBal - redeemAmt;
      isFullyRedeemed = newBalance <= 0;

      await client.query(
        `UPDATE gift_instances
         SET current_balance     = $1,
             is_redeemed         = $2,
             redeemed_at         = CASE WHEN $2 THEN NOW() ELSE redeemed_at END,
             redeemed_amount     = COALESCE(redeemed_amount, 0) + $3,
             redeemed_by_merchant_id = $4,
             qr_scanned_at       = COALESCE(qr_scanned_at, NOW()),
             redemption_method   = 'qr_code',
             updated_at          = NOW()
         WHERE id = $5`,
        [newBalance, isFullyRedeemed, redeemAmt, merchantId, instance.id]
      );
    } else {
      // Gift item — mark fully claimed
      isFullyRedeemed = true;
      await client.query(
        `UPDATE gift_instances
         SET item_claimed        = TRUE,
             is_redeemed         = TRUE,
             redeemed_at         = NOW(),
             redeemed_by_merchant_id = $1,
             qr_scanned_at       = COALESCE(qr_scanned_at, NOW()),
             redemption_method   = 'qr_code',
             updated_at          = NOW()
         WHERE id = $2`,
        [merchantId, instance.id]
      );
    }

    // Always log the redemption event for audit trail
    await client.query(
      `INSERT INTO redemption_events
         (gift_instance_id, merchant_id, merchant_user_id, branch_id, amount, currency_code, balance_after, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        instance.id,
        merchantId,
        merchant_user_id || null,
        effectiveBranchId,
        instance.type === 'store_credit' ? parseFloat(amount_to_redeem) : null,
        instance.currency_code,
        instance.type === 'store_credit' ? newBalance : null,
        notes || null,
      ]
    );

    // Notify the wallet owner
    if (instance.wallet_owner_id) {
      await notificationService.createNotification(client, {
        userId: instance.wallet_owner_id,
        type: 'gift_redeemed',
        title: 'Gift Redeemed',
        message: isFullyRedeemed
          ? `Your ${instance.gift_card_name} has been fully redeemed.`
          : `${amount_to_redeem} ${instance.currency_code} was deducted from your gift. Remaining: ${newBalance}.`,
        relatedEntityType: 'gift_instance',
        relatedEntityId: instance.id,
      });
    }

    logger.info('Redemption confirmed', {
      redemptionCode,
      merchantId,
      type: instance.type,
      amountRedeemed: amount_to_redeem,
      newBalance,
      isFullyRedeemed,
    });

    return {
      success: true,
      redemption_code: redemptionCode,
      type: instance.type,
      amount_redeemed: amount_to_redeem || null,
      remaining_balance: newBalance,
      is_fully_redeemed: isFullyRedeemed,
      currency_code: instance.currency_code,
    };
  });
}

/**
 * Get redemption history for a merchant — a merged feed of two sources:
 *   - redemption_events: one row per actual successful transaction. Never
 *     read gift_instances.redeemed_at/redeemed_amount for this — those only
 *     update once a card becomes FULLY redeemed, silently hiding partials.
 *   - redemption_attempts: failed attempts (invalid code, already redeemed,
 *     insufficient balance, wrong branch, ...). These never touched a gift
 *     instance, so they carry no type/amount/customer info by construction —
 *     showing that data would either be wrong or, for WRONG_MERCHANT, leak
 *     another merchant's gift details.
 *
 * status filter selects which source(s) run: 'partial'/'completed' only
 * query events; 'failed' only queries attempts; 'all' unions both. The type
 * filter (store_credit/gift_item) only ever applies to the events side —
 * attempts have no type, so they pass through regardless of that filter.
 */
async function getMerchantRedemptions(merchantId, { page, limit, period, type, status, branchIds = null }) {
  const { buildPagination } = require('../utils/database');
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const { date_from, date_to } = getPeriodBounds(period);

  // status is undefined/omitted for "All" (not the literal string 'all') —
  // only 'partial'/'completed' should ever exclude one side of the union.
  const includeEvents = status !== 'failed';
  const includeAttempts = status !== 'partial' && status !== 'completed';

  const params = [merchantId];
  let idx = 2;
  const branches = [];

  if (includeEvents) {
    const conditions = ['re.merchant_id = $1'];
    if (date_from) { conditions.push(`re.redeemed_at >= $${idx}`); params.push(date_from); idx++; }
    if (date_to)   { conditions.push(`re.redeemed_at <= $${idx}`); params.push(date_to); idx++; }
    if (branchIds) { conditions.push(`re.branch_id = ANY($${idx})`); params.push(branchIds); idx++; }
    if (type === 'gift_item')    conditions.push('gi.merchant_item_id IS NOT NULL');
    if (type === 'store_credit') conditions.push('gi.merchant_item_id IS NULL');
    // Items are always one-shot (no balance) — only a store-credit event
    // whose balance_after hit 0 counts as "completed"; anything else with
    // money left is "partial". Derived from data already on the row.
    if (status === 'completed') conditions.push('(gi.merchant_item_id IS NOT NULL OR re.balance_after <= 0)');
    if (status === 'partial')   conditions.push('(gi.merchant_item_id IS NULL AND re.balance_after > 0)');

    branches.push(`
      SELECT re.id, gi.redemption_code, re.redeemed_at, re.amount AS redeemed_amount,
             re.currency_code, b.name AS branch_name, re.notes,
             CASE WHEN gi.merchant_item_id IS NOT NULL THEN 'gift_item' ELSE 'store_credit' END AS type,
             CASE
               WHEN gi.merchant_item_id IS NOT NULL THEN 'completed'
               WHEN re.balance_after <= 0 THEN 'completed'
               ELSE 'partial'
             END AS status,
             CASE
               WHEN gi.merchant_item_id IS NOT NULL THEN mi.name
               ELSE CONCAT(gi.initial_balance::text, ' ', gi.currency_code, ' Store Credit')
             END AS gift_card_name,
             mi.description AS item_description, mi.image_url AS item_image,
             gs.sender_name, gs.recipient_name, gs.recipient_phone,
             NULL::text AS error_code, NULL::text AS error_message
      FROM redemption_events re
      JOIN gift_instances gi        ON gi.id = re.gift_instance_id
      LEFT JOIN merchant_items mi   ON mi.id = gi.merchant_item_id
      LEFT JOIN merchant_branches b ON b.id = re.branch_id
      LEFT JOIN gifts_sent gs       ON gs.id = gi.gift_sent_id
      WHERE ${conditions.join(' AND ')}
    `);
  }

  if (includeAttempts) {
    const conditions = ['ra.merchant_id = $1'];
    if (date_from) { conditions.push(`ra.attempted_at >= $${idx}`); params.push(date_from); idx++; }
    if (date_to)   { conditions.push(`ra.attempted_at <= $${idx}`); params.push(date_to); idx++; }
    if (branchIds) { conditions.push(`ra.branch_id = ANY($${idx})`); params.push(branchIds); idx++; }

    branches.push(`
      SELECT ra.id, ra.attempted_code AS redemption_code, ra.attempted_at AS redeemed_at,
             NULL::numeric AS redeemed_amount, NULL::text AS currency_code, b.name AS branch_name,
             NULL::text AS notes, NULL::text AS type, 'failed' AS status, NULL::text AS gift_card_name,
             NULL::text AS item_description, NULL::text AS item_image,
             NULL::text AS sender_name, NULL::text AS recipient_name, NULL::text AS recipient_phone,
             ra.error_code, ra.error_message
      FROM redemption_attempts ra
      LEFT JOIN merchant_branches b ON b.id = ra.branch_id
      WHERE ${conditions.join(' AND ')}
    `);
  }

  const combinedSql = branches.join(' UNION ALL ');

  const countResult = await query(`SELECT COUNT(*) FROM (${combinedSql}) combined`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  const pageParams = [...params, lim, offset];
  const result = await query(
    `SELECT * FROM (${combinedSql}) combined ORDER BY redeemed_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    pageParams
  );

  return {
    redemptions: result.rows,
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

/**
 * Send a WhatsApp OTP to the recipient of a gift instance for redemption confirmation.
 */
async function sendRedemptionOtp(redemptionCode) {
  const result = await query(
    `SELECT gs.recipient_phone
     FROM gift_instances gi
     LEFT JOIN gifts_sent gs ON gs.id = gi.gift_sent_id
     WHERE gi.redemption_code = $1`,
    [redemptionCode]
  );

  if (result.rows.length === 0) {
    throw new AppError('Redemption code not found', 404, 'CODE_NOT_FOUND');
  }

  const phone = result.rows[0].recipient_phone;
  if (!phone) {
    throw new AppError('No phone number on file for this gift recipient', 400, 'NO_PHONE');
  }

  // OTP_VERIFICATION_ENABLED: set to true to re-enable VerifyWay OTP sending
  const OTP_VERIFICATION_ENABLED = false;
  if (!OTP_VERIFICATION_ENABLED) {
    logger.info(`Redemption OTP skipped (disabled) for code ${redemptionCode}`);
    return;
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const redis = await getRedisClient();
  await redis.set(`redemption_otp:${redemptionCode}`, code, { EX: REDEMPTION_OTP_TTL });

  const res = await fetch('https://api.verifyway.com/api/v1/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VERIFYWAY_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      recipient: phone,
      type: 'otp',
      channel: 'whatsapp',
      fallback: 'no',
      code,
      lang: 'en',
    }),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    logger.error('VerifyWay redemption OTP error', data);
    throw new AppError('Failed to send verification code', 500, 'OTP_SEND_FAILED');
  }

  logger.info(`Redemption OTP sent for code ${redemptionCode} to ${phone}`);
}

/**
 * Verify the redemption OTP and store a short-lived verified flag.
 */
async function verifyRedemptionOtp(redemptionCode, code) {
  // OTP_VERIFICATION_ENABLED: set to true to re-enable OTP verification
  const OTP_VERIFICATION_ENABLED = false;
  if (!OTP_VERIFICATION_ENABLED) {
    logger.info(`Redemption OTP verification skipped (disabled) for code ${redemptionCode}`);
    return;
  }

  const redis = await getRedisClient();
  const stored = await redis.get(`redemption_otp:${redemptionCode}`);

  if (!stored) throw new AppError('Code expired. Request a new one.', 400, 'OTP_EXPIRED');
  if (stored !== code) throw new AppError('Invalid verification code.', 400, 'INVALID_CODE');

  await redis.del(`redemption_otp:${redemptionCode}`);
  await redis.set(`redemption_verified:${redemptionCode}`, '1', { EX: REDEMPTION_OTP_TTL });

  logger.info(`Redemption OTP verified for code ${redemptionCode}`);
}

module.exports = { validateRedemptionCode, sendRedemptionOtp, verifyRedemptionOtp, confirmRedemption, getMerchantRedemptions };
