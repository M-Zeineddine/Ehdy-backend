'use strict';

const { query, withTransaction, buildPagination } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const { generateRedemptionCode, generateShareCode } = require('../utils/tokenGenerator');

/**
 * Generate a share code that is guaranteed unique in the gifts_sent table.
 */
async function generateUniqueShareCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShareCode();
    const existing = await query('SELECT 1 FROM gifts_sent WHERE unique_share_link = $1', [code]);
    if (!existing.rows.length) return code;
  }
  throw new AppError('Failed to generate unique share code', 500, 'SHARE_CODE_COLLISION');
}
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
  } = draftData;

  const result = await query(
    `INSERT INTO gift_drafts
       (user_id, gift_card_id, bundle_id, gift_type, credit_amount, sender_name,
        recipient_name, personal_message, theme, delivery_channel,
        recipient_phone, recipient_email, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
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
    'delivery_channel', 'recipient_phone', 'recipient_email',
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
async function sendFromDraft(draftId, userId) {
  return withTransaction(async (client) => {
    const draftResult = await client.query(
      'SELECT * FROM gift_drafts WHERE id = $1 AND user_id = $2 AND status = $3',
      [draftId, userId, 'draft']
    );

    if (draftResult.rows.length === 0) {
      throw new AppError('Draft not found or already sent', 404, 'DRAFT_NOT_FOUND');
    }

    const draft = draftResult.rows[0];
    const gc = await getGiftCardById(draft.gift_card_id);

    const { giftInstance, shareCode } = await _createGiftInstanceAndSend(client, {
      userId,
      giftCard: gc,
      draft,
    });

    await client.query(
      `UPDATE gift_drafts SET status = 'sent', updated_at = NOW() WHERE id = $1`,
      [draftId]
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
}) {
  return withTransaction(async (client) => {
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
    });

    return { giftInstance, shareCode };
  });
}

/**
 * Internal helper: create gift instance, wallet item, and send notification.
 */
async function _createGiftInstanceAndSend(client, { userId, giftCard, draft }) {
  const redemptionCode = generateRedemptionCode();
  const qrCode = await generateQRCode(redemptionCode);
  const shareCode = await generateUniqueShareCode();
  const expirationDate = calculateExpirationDate(giftCard);

  const initialBalance =
    giftCard.type === 'store_credit' ? parseFloat(giftCard.credit_amount) : null;

  const instanceResult = await client.query(
    `INSERT INTO gift_instances
       (gift_card_id, redemption_code, redemption_qr_code,
        current_balance, initial_balance, currency_code, expiration_date,
        type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      giftCard.id,
      redemptionCode,
      qrCode,
      initialBalance,
      initialBalance,
      giftCard.currency_code,
      expirationDate,
      giftCard.type,
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
    if (recipResult.rows.length > 0) recipientUserId = recipResult.rows[0].id;
  }

  // Create gifts_sent record
  const sentResult = await client.query(
    `INSERT INTO gifts_sent
       (sender_user_id, gift_card_id, recipient_user_id, recipient_email,
        recipient_phone, recipient_name, theme, sender_name, personal_message,
        delivery_channel, unique_share_link)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
    ]
  );

  const giftSent = sentResult.rows[0];

  // Link gift_instance to gifts_sent
  await client.query(
    `UPDATE gift_instances SET gift_sent_id = $1 WHERE id = $2`,
    [giftSent.id, giftInstance.id]
  );

  // Get sender name for notifications
  const senderResult = await client.query(
    'SELECT first_name, last_name FROM users WHERE id = $1',
    [userId]
  );
  const senderName = senderResult.rows[0]
    ? `${senderResult.rows[0].first_name} ${senderResult.rows[0].last_name}`.trim()
    : draft.sender_name || 'Someone';

  // If recipient has an Ehdy account, add to their wallet
  if (recipientUserId) {
    await client.query(
      `INSERT INTO wallet_items (user_id, gift_instance_id, sender_user_id, gift_sent_id)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [recipientUserId, giftInstance.id, userId, giftSent.id]
    );

    await notificationService.createNotification(client, {
      userId: recipientUserId,
      type: 'gift_received',
      title: 'You received a gift!',
      message: `${senderName} sent you a gift on Ehdy!`,
      relatedEntityType: 'gift_sent',
      relatedEntityId: giftSent.id,
    });
  }

  // Send external notification asynchronously and log the attempt
  setImmediate(async () => {
    let status = 'failed';
    let errorMessage = null;
    let providerRef = null;

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
        status = 'sent';
      } else if (['sms', 'whatsapp'].includes(draft.delivery_channel) && draft.recipient_phone) {
        const result = await smsService.sendGiftNotification({
          recipientPhone: draft.recipient_phone,
          recipientName: draft.recipient_name,
          senderName,
          shareLink: shareCode,
          channel: draft.delivery_channel,
        });
        providerRef = result?.messageId || null;
        status = 'sent';
      } else {
        return; // No channel configured — skip logging
      }
    } catch (notifyErr) {
      errorMessage = notifyErr.message;
      logger.error('Failed to send gift notification', { error: notifyErr.message, shareCode });
    }

    try {
      await query(
        `INSERT INTO notification_attempts
           (gift_sent_id, channel, recipient, status, provider, provider_ref, error_message)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          giftSent.id,
          draft.delivery_channel,
          draft.recipient_email || draft.recipient_phone,
          status,
          draft.delivery_channel === 'email' ? 'zoho' : 'verifyway',
          providerRef,
          errorMessage,
        ]
      );
    } catch (logErr) {
      logger.error('Failed to log notification attempt', { error: logErr.message });
    }
  });

  return { giftInstance, giftSent, shareCode };
}


/**
 * Get sent gifts for a user.
 */
async function getSentGifts(userId, { page, limit, sort_order = 'desc' }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const order = sort_order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await query(
    `SELECT COUNT(*) FROM gifts_sent WHERE sender_user_id = $1 AND payment_status = 'paid'`,
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT
       gs.id, gs.sender_name, gs.recipient_name, gs.personal_message, gs.theme,
       gs.payment_status, gs.unique_share_link, gs.sent_at,
       gs.merchant_item_id, gs.store_credit_preset_id,
       mi.name           AS item_name,
       mi.image_url      AS item_image,
       mi.price          AS item_price,
       mi.currency_code  AS item_currency,
       mi_m.name         AS merchant_name,
       mi_m.logo_url     AS merchant_logo,
       scp.amount        AS credit_amount,
       scp.currency_code AS credit_currency,
       scp_m.name        AS credit_merchant_name
     FROM gifts_sent gs
     LEFT JOIN merchant_items mi        ON mi.id    = gs.merchant_item_id
     LEFT JOIN merchants mi_m           ON mi_m.id  = mi.merchant_id
     LEFT JOIN store_credit_presets scp ON scp.id   = gs.store_credit_preset_id
     LEFT JOIN merchants scp_m          ON scp_m.id = scp.merchant_id
     WHERE gs.sender_user_id = $1 AND gs.payment_status = 'paid'
     ORDER BY gs.sent_at ${order}
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
async function getReceivedGifts(userId, { page, limit, sort_order = 'desc', redemption_status }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);
  const order = sort_order === 'asc' ? 'ASC' : 'DESC';
  const statusParam = redemption_status || null;

  // Inline CASE repeated in WHERE so we can filter on the computed status column
  const statusCase = `CASE
         WHEN gi.is_redeemed = TRUE THEN 'redeemed'
         WHEN gi.current_balance IS NOT NULL
          AND gi.initial_balance  IS NOT NULL
          AND gi.current_balance < gi.initial_balance THEN 'partially_redeemed'
         ELSE 'active'
       END`;
  const statusFilter = `AND ($2::text IS NULL OR (${statusCase}) = $2)`;

  const countResult = await query(
    `SELECT COUNT(*) FROM gifts_sent gs
     LEFT JOIN gift_instances gi ON gi.gift_sent_id = gs.id
     WHERE gs.recipient_user_id = $1 AND gs.payment_status = 'paid'
     ${statusFilter}`,
    [userId, statusParam]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT
       gs.id, gs.sender_name, gs.recipient_name, gs.personal_message, gs.theme,
       gs.payment_status, gs.unique_share_link, gs.sent_at,
       gs.merchant_item_id, gs.store_credit_preset_id,
       mi.name           AS item_name,
       mi.image_url      AS item_image,
       mi.price          AS item_price,
       mi.currency_code  AS item_currency,
       mi_m.name         AS merchant_name,
       mi_m.logo_url     AS merchant_logo,
       scp.amount        AS credit_amount,
       scp.currency_code AS credit_currency,
       scp_m.name        AS credit_merchant_name,
       u.first_name      AS sender_first_name,
       u.last_name       AS sender_last_name,
       ${statusCase} AS redemption_status
     FROM gifts_sent gs
     LEFT JOIN merchant_items mi        ON mi.id    = gs.merchant_item_id
     LEFT JOIN merchants mi_m           ON mi_m.id  = mi.merchant_id
     LEFT JOIN store_credit_presets scp ON scp.id   = gs.store_credit_preset_id
     LEFT JOIN merchants scp_m          ON scp_m.id = scp.merchant_id
     LEFT JOIN users u                  ON u.id     = gs.sender_user_id
     LEFT JOIN gift_instances gi        ON gi.gift_sent_id = gs.id
     WHERE gs.recipient_user_id = $1 AND gs.payment_status = 'paid'
     ${statusFilter}
     ORDER BY gs.sent_at ${order}
     LIMIT $3 OFFSET $4`,
    [userId, statusParam, lim, offset]
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
  // In-app claim flow is deferred until post-launch.
  // Recipients receive gifts via phone sync (fulfillGiftFromTap auto-adds to wallet).
  throw new AppError('In-app gift claiming is not yet available', 501, 'NOT_IMPLEMENTED');
}

// ── Tap Payments flow ────────────────────────────────────────────────────────

/**
 * Create a pending gifts_sent record and a Tap charge.
 * Returns the Tap hosted payment URL for the app to open.
 */
async function initiateGiftPayment(userId, {
  merchant_item_id,
  store_credit_preset_id,
  custom_credit_amount,
  custom_credit_currency,
  custom_credit_merchant_id,
  sender_name,
  recipient_name,
  recipient_phone,
  personal_message,
  theme,
}) {
  const { createTapCharge } = require('./paymentService');

  // Resolve item and price
  let amount, currency;
  if (merchant_item_id) {
    const r = await query(
      'SELECT id, price, currency_code FROM merchant_items WHERE id = $1 AND is_active = TRUE',
      [merchant_item_id]
    );
    if (!r.rows.length) throw new AppError('Item not found', 404, 'ITEM_NOT_FOUND');
    amount = parseFloat(r.rows[0].price);
    currency = r.rows[0].currency_code;
  } else if (store_credit_preset_id) {
    const r = await query(
      'SELECT id, amount, currency_code FROM store_credit_presets WHERE id = $1 AND is_active = TRUE',
      [store_credit_preset_id]
    );
    if (!r.rows.length) throw new AppError('Store credit preset not found', 404, 'ITEM_NOT_FOUND');
    amount = parseFloat(r.rows[0].amount);
    currency = r.rows[0].currency_code;
  } else if (custom_credit_amount != null && custom_credit_merchant_id) {
    amount = parseFloat(custom_credit_amount);
    if (isNaN(amount) || amount <= 0) throw new AppError('Invalid custom credit amount', 400, 'INVALID_AMOUNT');
    if (amount > 10000) throw new AppError('Custom credit amount exceeds maximum of 10,000', 400, 'AMOUNT_TOO_LARGE');
    const r = await query(
      'SELECT id FROM merchants WHERE id = $1 AND deleted_at IS NULL',
      [custom_credit_merchant_id]
    );
    if (!r.rows.length) throw new AppError('Merchant not found', 404, 'MERCHANT_NOT_FOUND');
    currency = custom_credit_currency || 'USD';
  } else {
    throw new AppError('merchant_item_id, store_credit_preset_id, or custom_credit_amount+merchant_id is required', 400, 'MISSING_ITEM');
  }

  currency = currency || 'USD';

  // Get sender info for Tap customer object
  const userResult = await query(
    'SELECT email, first_name, phone FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0] || {};

  // Prevent sending a gift to yourself
  if (recipient_phone && user.phone && user.phone === recipient_phone) {
    throw new AppError('You cannot send a gift to yourself', 400, 'SELF_SEND_NOT_ALLOWED');
  }

  // Generate share link now so it's ready when the recipient gets the link
  const shareCode = await generateUniqueShareCode();

  // Create pending gifts_sent record
  const sentResult = await query(
    `INSERT INTO gifts_sent
       (sender_user_id, merchant_item_id, store_credit_preset_id,
        custom_credit_amount, custom_credit_currency, custom_credit_merchant_id,
        sender_name, recipient_name, recipient_phone,
        personal_message, theme, unique_share_link, payment_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')
     RETURNING id`,
    [
      userId,
      merchant_item_id || null,
      store_credit_preset_id || null,
      custom_credit_amount ? parseFloat(custom_credit_amount) : null,
      custom_credit_amount ? (custom_credit_currency || 'USD') : null,
      custom_credit_merchant_id || null,
      sender_name || null,
      recipient_name || null,
      recipient_phone || null,
      personal_message || null,
      theme || null,
      shareCode,
    ]
  );

  const giftSentId = sentResult.rows[0].id;

  // Build webhook + redirect URLs
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
  const postUrl = `${backendUrl}/v1/webhooks/tap`;
  const redirectUrl = `ehdy://payment/callback`;

  // Create Tap charge
  const charge = await createTapCharge({
    amount,
    currency,
    metadata: { gift_sent_id: giftSentId, ehdy_user_id: userId },
    customer: { first_name: user.first_name || sender_name || 'Customer', email: user.email },
    redirectUrl,
    postUrl,
  });

  // Store tap_charge_id on the gifts_sent row
  await query(
    'UPDATE gifts_sent SET tap_charge_id = $1 WHERE id = $2',
    [charge.id, giftSentId]
  );

  logger.info('Gift payment initiated', { giftSentId, chargeId: charge.id, amount, currency });

  return {
    gift_sent_id: giftSentId,
    tap_transaction_url: charge.transaction_url,
    unique_share_link: shareCode,
    amount,
    currency,
  };
}

/**
 * Called from the Tap webhook when a charge is CAPTURED.
 * Creates the gift_instance, marks gifts_sent as paid, adds to wallet if recipient has account.
 */
async function fulfillGiftFromTap(tapChargeId) {
  return withTransaction(async (client) => {
    // Find the pending gift
    const giftResult = await client.query(
      `SELECT * FROM gifts_sent WHERE tap_charge_id = $1 AND payment_status = 'pending'`,
      [tapChargeId]
    );

    if (!giftResult.rows.length) {
      logger.warn('Gift not found or already fulfilled', { tapChargeId });
      return null;
    }

    const gift = giftResult.rows[0];

    // Resolve item details
    let initialBalance = null;
    let currencyCode = 'USD';
    let expirationDate = null;

    if (gift.merchant_item_id) {
      const r = await client.query(
        'SELECT currency_code FROM merchant_items WHERE id = $1',
        [gift.merchant_item_id]
      );
      if (r.rows.length) currencyCode = r.rows[0].currency_code;
    } else if (gift.store_credit_preset_id) {
      const r = await client.query(
        'SELECT amount, currency_code FROM store_credit_presets WHERE id = $1',
        [gift.store_credit_preset_id]
      );
      if (r.rows.length) {
        initialBalance = parseFloat(r.rows[0].amount);
        currencyCode = r.rows[0].currency_code;
      }
    } else if (gift.custom_credit_amount) {
      initialBalance = parseFloat(gift.custom_credit_amount);
      currencyCode = gift.custom_credit_currency || 'USD';
    }

    // Determine gift type
    const giftType = gift.merchant_item_id ? 'gift_item' : 'store_credit';

    // Generate redemption code + QR
    const redemptionCode = generateRedemptionCode();
    const qrCode = await generateQRCode(redemptionCode);

    // Create gift_instance with type
    const instanceResult = await client.query(
      `INSERT INTO gift_instances
         (merchant_item_id, store_credit_preset_id, custom_credit_merchant_id,
          redemption_code, redemption_qr_code,
          current_balance, initial_balance, currency_code, expiration_date, gift_sent_id, type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        gift.merchant_item_id || null,
        gift.store_credit_preset_id || null,
        gift.custom_credit_merchant_id || null,
        redemptionCode,
        qrCode,
        initialBalance,
        initialBalance,
        currencyCode,
        expirationDate,
        gift.id,
        giftType,
      ]
    );

    const instance = instanceResult.rows[0];

    // Mark gift as paid and set delivery_channel (whatsapp since recipient_phone is always used)
    await client.query(
      `UPDATE gifts_sent
       SET payment_status = 'paid', delivery_channel = 'whatsapp', updated_at = NOW()
       WHERE id = $1`,
      [gift.id]
    );

    // Auto-add to wallet if recipient has an account (matched by phone)
    if (gift.recipient_phone) {
      const recipResult = await client.query(
        `SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL`,
        [gift.recipient_phone]
      );
      if (recipResult.rows.length) {
        const recipUserId = recipResult.rows[0].id;
        await client.query(
          `UPDATE gifts_sent SET recipient_user_id = $1 WHERE id = $2`,
          [recipUserId, gift.id]
        );
        await client.query(
          `INSERT INTO wallet_items (user_id, gift_instance_id, sender_user_id, gift_sent_id)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [recipUserId, instance.id, gift.sender_user_id, gift.id]
        );
      }
    }

    logger.info('Gift fulfilled from Tap payment', { giftSentId: gift.id, tapChargeId });
    return gift;
  });
}

/**
 * Mark a gift as failed (called from Tap webhook on FAILED/CANCELLED).
 */
async function failGiftFromTap(tapChargeId) {
  const result = await query(
    `UPDATE gifts_sent SET payment_status = 'failed', updated_at = NOW()
     WHERE tap_charge_id = $1 AND payment_status = 'pending'
     RETURNING id`,
    [tapChargeId]
  );
  if (result.rows.length) {
    logger.info('Gift payment failed', { tapChargeId, giftSentId: result.rows[0].id });
  }
  return result.rows[0] || null;
}

/**
 * Save a payment-retry draft — lightweight insert of form state before initiating payment.
 * Returns the new draft id.
 */
async function saveRetryDraft(userId, data) {
  const {
    merchant_item_id,
    store_credit_preset_id,
    custom_credit_amount,
    custom_credit_currency,
    custom_credit_merchant_id,
    sender_name,
    recipient_name,
    personal_message,
    theme,
    recipient_phone,
  } = data;

  const result = await query(
    `INSERT INTO gift_drafts
       (user_id, merchant_item_id, store_credit_preset_id,
        custom_credit_amount, custom_credit_currency, custom_credit_merchant_id,
        sender_name, recipient_name, personal_message, theme, recipient_phone, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
     RETURNING id`,
    [
      userId,
      merchant_item_id || null,
      store_credit_preset_id || null,
      custom_credit_amount ? parseFloat(custom_credit_amount) : null,
      custom_credit_amount ? (custom_credit_currency || 'USD') : null,
      custom_credit_merchant_id || null,
      sender_name || null,
      recipient_name || null,
      personal_message || null,
      theme || null,
      recipient_phone || null,
    ]
  );

  return result.rows[0];
}

/**
 * Get a draft with joined item/merchant details for restoring the gift form.
 */
async function getRetryDraft(draftId, userId) {
  const result = await query(
    `SELECT
       gd.id,
       gd.merchant_item_id,
       gd.store_credit_preset_id,
       gd.custom_credit_amount,
       gd.custom_credit_currency,
       gd.custom_credit_merchant_id,
       gd.sender_name,
       gd.recipient_name,
       gd.personal_message,
       gd.theme,
       gd.recipient_phone,
       COALESCE(mi.name, (scp.amount::text || ' ' || scp.currency_code), 'Store Credit') AS item_name,
       mi.description                                                                      AS item_description,
       COALESCE(mi.price, scp.amount, gd.custom_credit_amount)                           AS item_price,
       COALESCE(mi.currency_code, scp.currency_code, gd.custom_credit_currency)          AS item_currency,
       mi.image_url                                                                        AS item_image,
       m.id                                                                                AS merchant_id,
       m.name                                                                              AS merchant_name,
       m.logo_url                                                                          AS merchant_logo,
       (gd.store_credit_preset_id IS NOT NULL OR gd.custom_credit_amount IS NOT NULL)    AS is_credit
     FROM gift_drafts gd
     LEFT JOIN merchant_items mi ON mi.id = gd.merchant_item_id
     LEFT JOIN store_credit_presets scp ON scp.id = gd.store_credit_preset_id
     LEFT JOIN merchants m ON m.id = COALESCE(mi.merchant_id, scp.merchant_id, gd.custom_credit_merchant_id)
     WHERE gd.id = $1 AND gd.user_id = $2`,
    [draftId, userId]
  );

  if (!result.rows.length) throw new AppError('Draft not found', 404, 'DRAFT_NOT_FOUND');
  return result.rows[0];
}

/**
 * Delete a retry draft (called after payment succeeds).
 */
async function deleteRetryDraft(draftId, userId) {
  await query('DELETE FROM gift_drafts WHERE id = $1 AND user_id = $2', [draftId, userId]);
}

module.exports = {
  createDraft,
  updateDraft,
  getDraftPreview,
  sendFromDraft,
  sendGiftDirect,
  getSentGifts,
  getReceivedGifts,
  claimGift,
  initiateGiftPayment,
  fulfillGiftFromTap,
  failGiftFromTap,
  saveRetryDraft,
  getRetryDraft,
  deleteRetryDraft,
};
