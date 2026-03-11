'use strict';

const { query, withTransaction, buildPagination } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const { generateRedemptionCode, generateShareCode } = require('../utils/tokenGenerator');
const { generateQRCode } = require('../utils/qrCode');
const { calculateExpirationDate, getGiftCardById } = require('./giftCardService');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const smsService = require('./smsService');
const logger = require('../utils/logger');

/**
 * Create a gift draft for the multi-step flow.
 */
async function createDraft(userId, draftData) {
  const {
    gift_card_id,
    bundle_id,
    gift_type,
    credit_amount,
    sender_name,
    recipient_name,
    personal_message,
    theme,
    delivery_channel,
    recipient_phone,
    recipient_email,
    scheduled_for,
  } = draftData;

  const result = await query(
    `INSERT INTO gift_drafts
       (user_id, gift_card_id, bundle_id, gift_type, credit_amount, sender_name,
        recipient_name, personal_message, theme, delivery_channel,
        recipient_phone, recipient_email, scheduled_for, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
     RETURNING *`,
    [
      userId,
      gift_card_id || null,
      bundle_id || null,
      gift_type || null,
      credit_amount || null,
      sender_name || null,
      recipient_name || null,
      personal_message || null,
      theme || null,
      delivery_channel || null,
      recipient_phone || null,
      recipient_email || null,
      scheduled_for || null,
    ]
  );

  return result.rows[0];
}

/**
 * Update a gift draft.
 */
async function updateDraft(draftId, userId, updates) {
  const allowedFields = [
    'gift_card_id', 'bundle_id', 'gift_type', 'credit_amount',
    'sender_name', 'recipient_name', 'personal_message', 'theme',
    'delivery_channel', 'recipient_phone', 'recipient_email', 'scheduled_for',
    'stripe_payment_intent_id',
  ];

  const fields = [];
  const values = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = $${idx++}`);
      values.push(updates[field]);
    }
  }

  if (fields.length === 0) {
    throw new AppError('No valid fields to update', 400, 'NO_UPDATES');
  }

  fields.push('updated_at = NOW()');
  values.push(draftId, userId);

  const result = await query(
    `UPDATE gift_drafts SET ${fields.join(', ')}
     WHERE id = $${idx++} AND user_id = $${idx++} AND status = 'draft'
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Draft not found or already sent', 404, 'DRAFT_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Get draft preview details.
 */
async function getDraftPreview(draftId, userId) {
  const result = await query(
    'SELECT * FROM gift_drafts WHERE id = $1 AND user_id = $2',
    [draftId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Draft not found', 404, 'DRAFT_NOT_FOUND');
  }

  const draft = result.rows[0];

  // Fetch gift card details if provided
  if (draft.gift_card_id) {
    const gc = await getGiftCardById(draft.gift_card_id);
    draft.gift_card = gc;
  }

  return draft;
}

/**
 * Finalize a draft and send the gift after payment.
 */
async function sendFromDraft(draftId, userId, { stripe_payment_intent_id }) {
  return withTransaction(async (client) => {
    const draftResult = await client.query(
      'SELECT * FROM gift_drafts WHERE id = $1 AND user_id = $2 AND status = $3',
      [draftId, userId, 'draft']
    );

    if (draftResult.rows.length === 0) {
      throw new AppError('Draft not found or already sent', 404, 'DRAFT_NOT_FOUND');
    }

    const draft = draftResult.rows[0];

    // Verify payment
    const paymentService = require('./paymentService');
    await paymentService.verifyPaymentSuccess(stripe_payment_intent_id);

    // Get gift card
    const gc = await getGiftCardById(draft.gift_card_id);

    // Create gift instance
    const { giftInstance, shareCode } = await _createGiftInstanceAndSend(client, {
      userId,
      giftCard: gc,
      draft,
      stripePaymentIntentId: stripe_payment_intent_id,
    });

    // Mark draft as sent
    await client.query(
      `UPDATE gift_drafts SET status = 'sent', stripe_payment_intent_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [stripe_payment_intent_id, draftId]
    );

    return { giftInstance, shareCode };
  });
}

/**
 * Send a gift directly (Mode 1 - no draft).
 */
async function sendGiftDirect(userId, {
  gift_card_id,
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
    // Verify payment
    const paymentService = require('./paymentService');
    await paymentService.verifyPaymentSuccess(stripe_payment_intent_id);

    const gc = await getGiftCardById(gift_card_id);

    const draft = {
      gift_card_id,
      recipient_name,
      recipient_email: recipient_email || null,
      recipient_phone: recipient_phone || null,
      delivery_channel,
      personal_message: personal_message || null,
      theme: theme || null,
      sender_name: sender_name || null,
    };

    const { giftInstance, shareCode } = await _createGiftInstanceAndSend(client, {
      userId,
      giftCard: gc,
      draft,
      stripePaymentIntentId: stripe_payment_intent_id,
    });

    return { giftInstance, shareCode };
  });
}

/**
 * Internal helper: create gift instance, wallet item, and send notification.
 */
async function _createGiftInstanceAndSend(client, { userId, giftCard, draft, stripePaymentIntentId }) {
  // Find or create purchase for this payment intent
  let purchaseResult = await client.query(
    'SELECT id FROM purchases WHERE stripe_payment_intent_id = $1',
    [stripePaymentIntentId]
  );

  let purchaseId = null;
  if (purchaseResult.rows.length > 0) {
    purchaseId = purchaseResult.rows[0].id;
  }

  // Generate codes
  const redemptionCode = generateRedemptionCode();
  const qrCode = await generateQRCode(redemptionCode);
  const shareCode = generateShareCode();
  const expirationDate = calculateExpirationDate(giftCard);

  const initialBalance =
    giftCard.type === 'store_credit' ? parseFloat(giftCard.credit_amount) : null;

  // Create gift instance
  const instanceResult = await client.query(
    `INSERT INTO gift_instances
       (purchase_id, gift_card_id, redemption_code, redemption_qr_code,
        current_balance, initial_balance, currency_code, expiration_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      purchaseId,
      giftCard.id,
      redemptionCode,
      qrCode,
      initialBalance,
      initialBalance,
      giftCard.currency_code,
      expirationDate,
    ]
  );

  const giftInstance = instanceResult.rows[0];

  // Resolve recipient user if email/phone matches an account
  let recipientUserId = null;
  if (draft.recipient_email) {
    const recipResult = await client.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [draft.recipient_email]
    );
    if (recipResult.rows.length > 0) {
      recipientUserId = recipResult.rows[0].id;
    }
  }

  // Create gifts_sent record
  const sentResult = await client.query(
    `INSERT INTO gifts_sent
       (sender_user_id, gift_card_id, recipient_user_id, recipient_email,
        recipient_phone, recipient_name, theme, sender_name, personal_message,
        delivery_channel, unique_share_link, expiration_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      userId,
      giftCard.id,
      recipientUserId,
      draft.recipient_email || null,
      draft.recipient_phone || null,
      draft.recipient_name || null,
      draft.theme || null,
      draft.sender_name || null,
      draft.personal_message || null,
      draft.delivery_channel,
      shareCode,
      expirationDate,
    ]
  );

  const giftSent = sentResult.rows[0];

  // If recipient is a known user, add to their wallet immediately
  if (recipientUserId) {
    // Get sender info for notification
    const senderResult = await client.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    const senderName = senderResult.rows[0]
      ? `${senderResult.rows[0].first_name} ${senderResult.rows[0].last_name}`.trim()
      : draft.sender_name || 'Someone';

    await client.query(
      `INSERT INTO wallet_items (user_id, gift_instance_id, sender_user_id, gift_sent_id, custom_message)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING`,
      [recipientUserId, giftInstance.id, userId, giftSent.id, draft.personal_message || null]
    );

    // Create in-app notification
    await notificationService.createNotification(client, {
      userId: recipientUserId,
      type: 'gift_received',
      title: 'You received a gift!',
      message: `${senderName} sent you a gift on Kado!`,
      relatedEntityType: 'gift_sent',
      relatedEntityId: giftSent.id,
    });
  }

  // Send external notification (email/SMS/WhatsApp)
  const senderResult = await client.query(
    'SELECT first_name, last_name, email FROM users WHERE id = $1',
    [userId]
  );
  const sender = senderResult.rows[0];
  const senderName = sender
    ? `${sender.first_name} ${sender.last_name}`.trim()
    : draft.sender_name || 'Someone';

  // Send asynchronously (don't block the response)
  setImmediate(async () => {
    try {
      if (draft.delivery_channel === 'email' && draft.recipient_email) {
        await emailService.sendGiftReceivedEmail({
          recipientEmail: draft.recipient_email,
          recipientName: draft.recipient_name,
          senderName,
          merchantName: giftCard.merchant_name,
          personalMessage: draft.personal_message,
          shareLink: shareCode,
          theme: draft.theme,
        });
      } else if (['sms', 'whatsapp'].includes(draft.delivery_channel) && draft.recipient_phone) {
        await smsService.sendGiftNotification({
          recipientPhone: draft.recipient_phone,
          recipientName: draft.recipient_name,
          senderName,
          shareLink: shareCode,
          channel: draft.delivery_channel,
        });
      }
    } catch (notifyErr) {
      logger.error('Failed to send gift notification', { error: notifyErr.message, shareCode });
    }
  });

  return { giftInstance, giftSent, shareCode };
}

/**
 * Create gift instances from a fulfilled purchase (called from webhook handler).
 */
async function createGiftInstancesFromPurchase(client, purchase) {
  const items = typeof purchase.items === 'string' ? JSON.parse(purchase.items) : purchase.items;

  for (const item of items) {
    for (let q = 0; q < item.quantity; q++) {
      const redemptionCode = generateRedemptionCode();
      const qrCode = await generateQRCode(redemptionCode);

      const gcResult = await client.query(
        'SELECT * FROM gift_cards WHERE id = $1',
        [item.gift_card_id]
      );

      if (gcResult.rows.length === 0) {
        continue;
      }
      const gc = gcResult.rows[0];
      const expirationDate = calculateExpirationDate(gc);
      const initialBalance = gc.type === 'store_credit' ? parseFloat(gc.credit_amount) : null;

      await client.query(
        `INSERT INTO gift_instances
           (purchase_id, gift_card_id, redemption_code, redemption_qr_code,
            current_balance, initial_balance, currency_code, expiration_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          purchase.id,
          gc.id,
          redemptionCode,
          qrCode,
          initialBalance,
          initialBalance,
          gc.currency_code,
          expirationDate,
        ]
      );
    }
  }

  // Add to sender's wallet
  const instancesResult = await client.query(
    'SELECT id FROM gift_instances WHERE purchase_id = $1',
    [purchase.id]
  );

  for (const inst of instancesResult.rows) {
    await client.query(
      `INSERT INTO wallet_items (user_id, gift_instance_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [purchase.user_id, inst.id]
    );
  }

  // Log transaction
  await client.query(
    `INSERT INTO transactions (user_id, transaction_type, related_entity_type, related_entity_id, amount, currency_code, status, description)
     VALUES ($1, 'purchase_completed', 'purchase', $2, $3, $4, 'completed', 'Purchase fulfilled - gift instances created')`,
    [purchase.user_id, purchase.id, purchase.total_amount, purchase.currency_code]
  );
}

/**
 * Get sent gifts for a user.
 */
async function getSentGifts(userId, { page, limit }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const countResult = await query(
    'SELECT COUNT(*) FROM gifts_sent WHERE sender_user_id = $1',
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT gs.*, gc.name as gift_card_name, gc.image_url as gift_card_image,
            m.name as merchant_name, m.logo_url as merchant_logo_url
     FROM gifts_sent gs
     LEFT JOIN gift_cards gc ON gc.id = gs.gift_card_id
     LEFT JOIN merchants m ON m.id = gc.merchant_id
     WHERE gs.sender_user_id = $1
     ORDER BY gs.sent_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, lim, offset]
  );

  return {
    gifts: result.rows,
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

/**
 * Get received gifts for a user.
 */
async function getReceivedGifts(userId, { page, limit }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const countResult = await query(
    `SELECT COUNT(*) FROM gifts_sent gs
     WHERE gs.recipient_user_id = $1 OR gs.claimed_by_user_id = $1`,
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT gs.*, gc.name as gift_card_name, gc.image_url as gift_card_image,
            m.name as merchant_name, m.logo_url as merchant_logo_url,
            u.first_name as sender_first_name, u.last_name as sender_last_name
     FROM gifts_sent gs
     LEFT JOIN gift_cards gc ON gc.id = gs.gift_card_id
     LEFT JOIN merchants m ON m.id = gc.merchant_id
     LEFT JOIN users u ON u.id = gs.sender_user_id
     WHERE gs.recipient_user_id = $1 OR gs.claimed_by_user_id = $1
     ORDER BY gs.sent_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, lim, offset]
  );

  return {
    gifts: result.rows,
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

/**
 * Claim a gift via share code. Adds to the claiming user's wallet.
 */
async function claimGift(shareCode, userId) {
  return withTransaction(async (client) => {
    // Get the gift
    const giftResult = await client.query(
      'SELECT * FROM gifts_sent WHERE unique_share_link = $1',
      [shareCode]
    );

    if (giftResult.rows.length === 0) {
      throw new AppError('Gift not found', 404, 'GIFT_NOT_FOUND');
    }

    const giftSent = giftResult.rows[0];

    if (giftSent.is_claimed) {
      throw new AppError('This gift has already been claimed', 400, 'GIFT_ALREADY_CLAIMED');
    }

    if (giftSent.sender_user_id === userId) {
      throw new AppError('You cannot claim your own gift', 400, 'CANNOT_CLAIM_OWN_GIFT');
    }

    // Check expiration
    if (giftSent.expiration_date && new Date(giftSent.expiration_date) < new Date()) {
      throw new AppError('This gift has expired', 400, 'GIFT_EXPIRED');
    }

    // Find the gift instance from the purchase linked to this gift
    // The gift instance was created when the purchase was fulfilled
    // We need to find an unclaimed instance for this gift_card
    const instanceResult = await client.query(
      `SELECT gi.* FROM gift_instances gi
       LEFT JOIN wallet_items wi ON wi.gift_instance_id = gi.id
       WHERE gi.gift_card_id = $1
         AND gi.is_redeemed = FALSE
         AND wi.id IS NULL
       LIMIT 1`,
      [giftSent.gift_card_id]
    );

    if (instanceResult.rows.length === 0) {
      throw new AppError('No available gift instance found', 400, 'NO_INSTANCE_AVAILABLE');
    }

    const instance = instanceResult.rows[0];

    // Add to claimer's wallet
    await client.query(
      `INSERT INTO wallet_items (user_id, gift_instance_id, sender_user_id, gift_sent_id, custom_message)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, gift_instance_id) DO NOTHING`,
      [userId, instance.id, giftSent.sender_user_id, giftSent.id, giftSent.personal_message]
    );

    // Mark as claimed
    await client.query(
      `UPDATE gifts_sent SET is_claimed = TRUE, claimed_by_user_id = $1, claimed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [userId, giftSent.id]
    );

    // Notify sender
    await notificationService.createNotification(client, {
      userId: giftSent.sender_user_id,
      type: 'gift_claimed',
      title: 'Your gift was claimed!',
      message: `${giftSent.recipient_name || 'Your recipient'} has claimed your gift.`,
      relatedEntityType: 'gift_sent',
      relatedEntityId: giftSent.id,
    });

    logger.info('Gift claimed', { shareCode, userId, giftSentId: giftSent.id });
    return { giftSent, instance };
  });
}

module.exports = {
  createDraft,
  updateDraft,
  getDraftPreview,
  sendFromDraft,
  sendGiftDirect,
  createGiftInstancesFromPurchase,
  getSentGifts,
  getReceivedGifts,
  claimGift,
};
