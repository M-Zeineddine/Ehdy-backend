'use strict';

const router = require('express').Router();
const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { renderGiftPage, renderNotFound } = require('../views/giftPage');
const { formatMoney } = require('../views/giftPage/partials');

async function fetchGift(shareCode) {
  const result = await query(
    `SELECT
       gs.sender_name, gs.recipient_name, gs.personal_message, gs.theme, gs.payment_status,
       gs.merchant_item_id, gs.custom_credit_merchant_id,
       gs.custom_credit_amount, gs.custom_credit_currency,
       mi.name          AS item_name,
       mi.price         AS item_price,
       mi.currency_code AS item_currency,
       mi.image_url     AS item_image,
       mi_m.id          AS item_merchant_id,
       mi_m.name        AS item_merchant,
       mi_m.logo_url    AS item_merchant_logo,
       cc_m.id          AS credit_merchant_id,
       cc_m.name        AS credit_merchant,
       cc_m.logo_url    AS credit_merchant_logo,
       gi.id            AS gift_instance_id,
       gi.redemption_code, gi.redemption_qr_code,
       gi.initial_balance, gi.current_balance, gi.currency_code AS instance_currency,
       gi.is_redeemed, gi.redeemed_at
     FROM gifts_sent gs
     LEFT JOIN merchant_items mi  ON mi.id    = gs.merchant_item_id
     LEFT JOIN merchants mi_m     ON mi_m.id  = mi.merchant_id
     LEFT JOIN merchants cc_m     ON cc_m.id  = gs.custom_credit_merchant_id
     LEFT JOIN gift_instances gi  ON gi.gift_sent_id = gs.id
     WHERE gs.unique_share_link = $1
     LIMIT 1`,
    [shareCode]
  );
  return result.rows[0] || null;
}

async function fetchBranches(merchantId) {
  if (!merchantId) return [];
  const result = await query(
    `SELECT id, name, address, city, latitude, longitude
     FROM merchant_branches
     WHERE merchant_id = $1 AND is_active = true
     ORDER BY name`,
    [merchantId]
  );
  return result.rows;
}

/**
 * Redemption history for a store-credit gift, newest first — the only gift
 * type with partial redemption (merchant items are claimed once, in full).
 */
async function fetchRedemptionHistory(giftInstanceId) {
  const result = await query(
    `SELECT re.amount, re.currency_code, re.balance_after, re.redeemed_at,
            b.name AS branch_name
     FROM redemption_events re
     LEFT JOIN merchant_branches b ON b.id = re.branch_id
     WHERE re.gift_instance_id = $1
     ORDER BY re.redeemed_at DESC`,
    [giftInstanceId]
  );
  return result.rows;
}

/**
 * Most recent redemption event for a gift instance — used to enrich a
 * one-shot item claim with where it happened. Best-effort: older redemptions
 * may predate event logging, so gi.is_redeemed/redeemed_at stay the source
 * of truth for whether/when, and this only adds the branch if we have it.
 */
async function fetchLatestRedemptionEvent(giftInstanceId) {
  const result = await query(
    `SELECT re.redeemed_at, b.name AS branch_name
     FROM redemption_events re
     LEFT JOIN merchant_branches b ON b.id = re.branch_id
     WHERE re.gift_instance_id = $1
     ORDER BY re.redeemed_at DESC
     LIMIT 1`,
    [giftInstanceId]
  );
  return result.rows[0] || null;
}

/**
 * Branch-scoped items: only show (and advertise) the branches the item
 * can actually be redeemed at. Returns { branches, redeemableAt };
 * redeemableAt is null when the item is redeemable at any branch.
 */
async function scopeBranches(merchantItemId, branches) {
  if (!merchantItemId || branches.length === 0) return { branches, redeemableAt: null };

  const scopeResult = await query(
    'SELECT branch_id FROM merchant_item_branches WHERE merchant_item_id = $1',
    [merchantItemId]
  );
  if (scopeResult.rows.length === 0) return { branches, redeemableAt: null };

  const allowed = new Set(scopeResult.rows.map((r) => r.branch_id));
  const scoped = branches.filter((b) => allowed.has(b.id));
  if (scoped.length === 0) return { branches, redeemableAt: null };

  return { branches: scoped, redeemableAt: scoped.map((b) => b.name) };
}

function buildGiftItem(row) {
  const isCredit = !!row.custom_credit_merchant_id;

  const merchantName = isCredit ? row.credit_merchant : row.item_merchant;
  const itemName = isCredit
    ? `${formatMoney(row.custom_credit_amount, row.custom_credit_currency || 'USD')} Store Credit`
    : (row.item_name || 'Gift');
  const details = isCredit
    ? null
    : (row.item_currency && row.item_price ? formatMoney(row.item_price, row.item_currency) : null);

  // Item image, falling back to the merchant's profile picture
  const merchantLogo = isCredit ? row.credit_merchant_logo : row.item_merchant_logo;
  const imageUrl = (isCredit ? null : row.item_image) || merchantLogo || null;

  return { imageUrl, merchantName, itemName, details };
}

router.get('/:shareCode', async (req, res) => {
  const { shareCode } = req.params;

  try {
    const row = await fetchGift(shareCode);
    if (!row || row.payment_status !== 'paid') {
      return res.status(404).send(renderNotFound());
    }

    const isCredit = !!row.custom_credit_merchant_id;
    const merchantId = isCredit ? row.credit_merchant_id : row.item_merchant_id;

    const allBranches = await fetchBranches(merchantId);
    const { branches, redeemableAt } = await scopeBranches(row.merchant_item_id, allBranches);

    const balance = isCredit && row.gift_instance_id ? {
      currency: row.instance_currency,
      initial: row.initial_balance,
      current: row.current_balance,
      merchantName: row.credit_merchant,
      history: await fetchRedemptionHistory(row.gift_instance_id),
    } : null;

    const itemStatus = !isCredit && row.gift_instance_id && row.is_redeemed ? {
      redeemedAt: row.redeemed_at,
      merchantName: row.item_merchant,
      event: await fetchLatestRedemptionEvent(row.gift_instance_id),
    } : null;

    res.send(renderGiftPage({
      gift: row,
      // items array — bundle gifts will pass multiple entries here
      items: [buildGiftItem(row)],
      redemptionCode: row.redemption_code || null,
      redemptionQr: row.redemption_qr_code || null,
      recipientName: row.recipient_name || null,
      branches,
      redeemableAt,
      balance,
      itemStatus,
    }));
  } catch (err) {
    logger.error('Gift page error', { shareCode, error: err.message });
    res.status(500).send(renderNotFound());
  }
});

module.exports = router;
