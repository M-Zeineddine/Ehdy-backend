'use strict';

const { query, withTransaction } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

/**
 * Resolve the effective merchant_id and display name for a gift_instance row.
 * A gift instance belongs to a merchant via one of three paths:
 *   1. merchant_item_id  → merchant_items.merchant_id
 *   2. store_credit_preset_id → store_credit_presets.merchant_id
 *   3. custom_credit_merchant_id (direct FK)
 */
const GIFT_INSTANCE_SELECT = `
  SELECT gi.id, gi.redemption_code, gi.current_balance, gi.initial_balance,
         gi.is_redeemed, gi.redeemed_at, gi.expiration_date, gi.item_claimed,
         gi.currency_code, gi.custom_credit_amount, gi.merchant_item_id,
         gi.store_credit_preset_id, gi.custom_credit_merchant_id,
         CASE WHEN gi.merchant_item_id IS NOT NULL THEN 'gift_item' ELSE 'store_credit' END AS type,
         CASE
           WHEN gi.merchant_item_id IS NOT NULL THEN mi.name
           WHEN gi.store_credit_preset_id IS NOT NULL
             THEN CONCAT(scp.amount::text, ' ', scp.currency_code, ' Store Credit')
           ELSE CONCAT(gi.custom_credit_amount::text, ' ', gi.currency_code, ' Store Credit')
         END AS gift_card_name,
         mi.name AS item_name,
         COALESCE(mi.merchant_id, scp.merchant_id, gi.custom_credit_merchant_id) AS merchant_id,
         COALESCE(m_mi.name, m_scp.name, m_custom.name) AS merchant_name,
         wi.user_id AS wallet_owner_id,
         u.first_name AS owner_first_name,
         u.last_name  AS owner_last_name
  FROM gift_instances gi
  LEFT JOIN merchant_items       mi     ON mi.id     = gi.merchant_item_id
  LEFT JOIN store_credit_presets scp    ON scp.id    = gi.store_credit_preset_id
  LEFT JOIN merchants            m_mi   ON m_mi.id   = mi.merchant_id
  LEFT JOIN merchants            m_scp  ON m_scp.id  = scp.merchant_id
  LEFT JOIN merchants            m_custom ON m_custom.id = gi.custom_credit_merchant_id
  LEFT JOIN wallet_items         wi     ON wi.gift_instance_id = gi.id
  LEFT JOIN users                u      ON u.id = wi.user_id
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

  logger.info('Redemption code validated', { redemptionCode, merchantId });

  return {
    is_valid: true,
    gift: {
      type: instance.type,
      value: instance.current_balance ?? instance.custom_credit_amount,
      currency: instance.currency_code,
      item_name: instance.item_name ?? null,
      merchant_name: instance.merchant_name,
      recipient_name: instance.owner_first_name
        ? `${instance.owner_first_name} ${instance.owner_last_name}`.trim()
        : null,
      current_balance: instance.current_balance,
    },
  };
}

/**
 * Confirm and process a redemption.
 */
async function confirmRedemption(redemptionCode, merchantId, { amount_to_redeem, notes }) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT gi.id, gi.current_balance, gi.is_redeemed, gi.expiration_date,
              gi.item_claimed, gi.currency_code, gi.merchant_item_id,
              gi.store_credit_preset_id, gi.custom_credit_merchant_id,
              CASE WHEN gi.merchant_item_id IS NOT NULL THEN 'gift_item' ELSE 'store_credit' END AS type,
              CASE
                WHEN gi.merchant_item_id IS NOT NULL THEN mi.name
                WHEN gi.store_credit_preset_id IS NOT NULL
                  THEN CONCAT(scp.amount::text, ' ', scp.currency_code, ' Store Credit')
                ELSE CONCAT(gi.custom_credit_amount::text, ' ', gi.currency_code, ' Store Credit')
              END AS gift_card_name,
              COALESCE(mi.merchant_id, scp.merchant_id, gi.custom_credit_merchant_id) AS merchant_id,
              wi.user_id AS wallet_owner_id
       FROM gift_instances gi
       LEFT JOIN merchant_items       mi  ON mi.id  = gi.merchant_item_id
       LEFT JOIN store_credit_presets scp ON scp.id = gi.store_credit_preset_id
       LEFT JOIN wallet_items         wi  ON wi.gift_instance_id = gi.id
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

    // Log transaction for the wallet owner
    if (instance.wallet_owner_id) {
      await client.query(
        `INSERT INTO transactions
           (user_id, transaction_type, related_entity_type, related_entity_id,
            amount, currency_code, status, description)
         VALUES ($1, 'gift_redeemed', 'gift_instance', $2, $3, $4, 'completed', $5)`,
        [
          instance.wallet_owner_id,
          instance.id,
          amount_to_redeem || null,
          instance.currency_code,
          `${instance.gift_card_name} redeemed at merchant`,
        ]
      );

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
 * Get redemption history for a merchant.
 */
async function getMerchantRedemptions(merchantId, { page, limit, date_from, date_to }) {
  const { buildPagination } = require('../utils/database');
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const conditions = ['gi.redeemed_by_merchant_id = $1'];
  const params = [merchantId];
  let idx = 2;

  if (date_from) { conditions.push(`gi.redeemed_at >= $${idx++}`); params.push(date_from); }
  if (date_to)   { conditions.push(`gi.redeemed_at <= $${idx++}`); params.push(date_to); }

  const whereClause = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) FROM gift_instances gi WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(lim, offset);

  const result = await query(
    `SELECT gi.id, gi.redemption_code, gi.redeemed_at, gi.redeemed_amount,
            gi.currency_code,
            CASE WHEN gi.merchant_item_id IS NOT NULL THEN 'gift_item' ELSE 'store_credit' END AS type,
            CASE
              WHEN gi.merchant_item_id IS NOT NULL THEN mi.name
              WHEN gi.store_credit_preset_id IS NOT NULL
                THEN CONCAT(scp.amount::text, ' ', scp.currency_code, ' Store Credit')
              ELSE CONCAT(gi.custom_credit_amount::text, ' ', gi.currency_code, ' Store Credit')
            END AS gift_card_name
     FROM gift_instances gi
     LEFT JOIN merchant_items       mi  ON mi.id  = gi.merchant_item_id
     LEFT JOIN store_credit_presets scp ON scp.id = gi.store_credit_preset_id
     WHERE ${whereClause}
     ORDER BY gi.redeemed_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return {
    redemptions: result.rows,
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

module.exports = { validateRedemptionCode, confirmRedemption, getMerchantRedemptions };
