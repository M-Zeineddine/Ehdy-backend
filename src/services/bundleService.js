'use strict';

const { query, withTransaction, buildPagination } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const { getGiftCardsByIds, getEffectivePrice } = require('./giftCardService');
const logger = require('../utils/logger');

/**
 * Create a bundle of gift cards.
 */
async function createBundle(userId, { name, description, theme, items, is_template, image_url }) {
  return withTransaction(async (client) => {
    // Fetch and validate all gift cards
    const giftCardIds = items.map(i => i.gift_card_id);
    const giftCards = await getGiftCardsByIds(giftCardIds);

    if (giftCards.length !== giftCardIds.length) {
      throw new AppError('One or more gift cards not found', 400, 'GIFT_CARDS_NOT_FOUND');
    }

    const giftCardMap = {};
    for (const gc of giftCards) {
      giftCardMap[gc.id] = gc;
    }

    // Calculate total value
    let totalValue = 0;
    for (const item of items) {
      const gc = giftCardMap[item.gift_card_id];
      totalValue += getEffectivePrice(gc) * item.quantity;
    }

    // Get currency from first item
    const firstGc = giftCards[0];
    const currencyCode = firstGc.currency_code;

    // Create bundle
    const bundleResult = await client.query(
      `INSERT INTO bundles (creator_user_id, name, description, theme, total_value, currency_code, is_template, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [userId, name, description || null, theme || null, totalValue, currencyCode, is_template || false, image_url || null]
    );

    const bundle = bundleResult.rows[0];

    // Create bundle items
    for (const item of items) {
      await client.query(
        `INSERT INTO bundle_items (bundle_id, gift_card_id, quantity)
         VALUES ($1,$2,$3)`,
        [bundle.id, item.gift_card_id, item.quantity]
      );
    }

    logger.info('Bundle created', { bundleId: bundle.id, userId, totalValue });
    return bundle;
  });
}

/**
 * Get user's bundles.
 */
async function getUserBundles(userId, { page, limit }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const countResult = await query(
    'SELECT COUNT(*) FROM bundles WHERE creator_user_id = $1 AND is_active = TRUE',
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT b.id, b.name, b.description, b.theme, b.total_value, b.currency_code,
            b.is_template, b.image_url, b.created_at,
            COUNT(bi.id) as item_count
     FROM bundles b
     LEFT JOIN bundle_items bi ON bi.bundle_id = b.id
     WHERE b.creator_user_id = $1 AND b.is_active = TRUE
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, lim, offset]
  );

  return {
    bundles: result.rows,
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

/**
 * Get a single bundle with its items.
 */
async function getBundleById(bundleId, userId) {
  const result = await query(
    `SELECT b.* FROM bundles b WHERE b.id = $1 AND b.is_active = TRUE AND (b.creator_user_id = $2 OR b.is_template = TRUE)`,
    [bundleId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Bundle not found', 404, 'BUNDLE_NOT_FOUND');
  }

  const bundle = result.rows[0];

  // Get bundle items with gift card details
  const itemsResult = await query(
    `SELECT bi.id, bi.quantity,
            gc.id as gift_card_id, gc.name as gift_card_name, gc.type, gc.image_url,
            gc.credit_amount, gc.item_name, gc.item_price, gc.currency_code,
            m.id as merchant_id, m.name as merchant_name, m.logo_url as merchant_logo_url
     FROM bundle_items bi
     JOIN gift_cards gc ON gc.id = bi.gift_card_id
     JOIN merchants m ON m.id = gc.merchant_id
     WHERE bi.bundle_id = $1`,
    [bundleId]
  );

  bundle.items = itemsResult.rows;
  return bundle;
}

/**
 * Send a bundle as a gift.
 */
async function sendBundle(bundleId, userId, {
  recipient_name,
  recipient_email,
  recipient_phone,
  delivery_channel,
  personal_message,
  theme,
  sender_name,
  stripe_payment_intent_id,
}) {
  return withTransaction(async (client) => {
    const bundle = await getBundleById(bundleId, userId);

    // Verify payment
    const paymentService = require('./paymentService');
    await paymentService.verifyPaymentSuccess(stripe_payment_intent_id);

    const { generateShareCode } = require('../utils/tokenGenerator');
    const shareCode = generateShareCode();

    // Create gifts_sent record for the bundle
    const sentResult = await client.query(
      `INSERT INTO gifts_sent
         (sender_user_id, bundle_id, recipient_email, recipient_phone, recipient_name,
          theme, sender_name, personal_message, delivery_channel, unique_share_link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        userId,
        bundleId,
        recipient_email || null,
        recipient_phone || null,
        recipient_name || null,
        theme || bundle.theme || null,
        sender_name || null,
        personal_message || null,
        delivery_channel,
        shareCode,
      ]
    );

    const giftSent = sentResult.rows[0];

    // Create gift instances for each item in the bundle
    const { generateRedemptionCode } = require('../utils/tokenGenerator');
    const { generateQRCode } = require('../utils/qrCode');
    const { calculateExpirationDate } = require('./giftCardService');

    for (const item of bundle.items) {
      for (let q = 0; q < item.quantity; q++) {
        const redemptionCode = generateRedemptionCode();
        const qrCode = await generateQRCode(redemptionCode);
        const expirationDate = calculateExpirationDate({ valid_until_days: 365 });
        const initialBalance =
          item.type === 'store_credit' ? parseFloat(item.credit_amount) : null;

        await client.query(
          `INSERT INTO gift_instances
             (gift_card_id, redemption_code, redemption_qr_code, current_balance,
              initial_balance, currency_code, expiration_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            item.gift_card_id,
            redemptionCode,
            qrCode,
            initialBalance,
            initialBalance,
            item.currency_code,
            expirationDate,
          ]
        );
      }
    }

    // Send notification
    const notificationService = require('./notificationService');
    const emailService = require('./emailService');
    const smsService = require('./smsService');

    const senderResult = await client.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    const senderDisplayName = senderResult.rows[0]
      ? `${senderResult.rows[0].first_name} ${senderResult.rows[0].last_name}`.trim()
      : sender_name || 'Someone';

    setImmediate(async () => {
      try {
        if (delivery_channel === 'email' && recipient_email) {
          await emailService.sendGiftReceivedEmail({
            recipientEmail: recipient_email,
            recipientName: recipient_name,
            senderName: senderDisplayName,
            merchantName: 'Multiple Merchants',
            personalMessage: personal_message,
            shareLink: shareCode,
            theme,
          });
        } else if (['sms', 'whatsapp'].includes(delivery_channel) && recipient_phone) {
          await smsService.sendGiftNotification({
            recipientPhone: recipient_phone,
            recipientName: recipient_name,
            senderName: senderDisplayName,
            shareLink: shareCode,
            channel: delivery_channel,
          });
        }
      } catch (err) {
        logger.error('Failed to send bundle gift notification', { error: err.message });
      }
    });

    logger.info('Bundle sent as gift', { bundleId, userId, shareCode });
    return { giftSent, shareCode };
  });
}

module.exports = {
  createBundle,
  getUserBundles,
  getBundleById,
  sendBundle,
};
