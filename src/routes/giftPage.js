'use strict';

const router = require('express').Router();
const { query } = require('../utils/database');
const logger = require('../utils/logger');

const THEME_GRADIENTS = {
  birthday:    ['#FF6B6B', '#FF8E53'],
  anniversary: ['#C86DD7', '#7B6CF6'],
  christmas:   ['#2E7D32', '#C62828'],
  eid:         ['#F9A825', '#F57F17'],
  graduation:  ['#1565C0', '#0D47A1'],
  wedding:     ['#E91E63', '#C2185B'],
  default:     ['#F07856', '#C8956C'],
};

function getGradient(theme) {
  const colors = THEME_GRADIENTS[theme] || THEME_GRADIENTS.default;
  return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
}

function renderGiftPage({ gift, itemName, merchantName, amount, currency }) {
  const gradient = getGradient(gift.theme);
  const senderName = gift.sender_name || 'Someone';
  const message = gift.personal_message || '';
  const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You have a gift from ${senderName}! 🎁</title>
  <meta property="og:title" content="You have a gift from ${senderName}!" />
  <meta property="og:description" content="${senderName} sent you ${itemName}${merchantName ? ` from ${merchantName}` : ''}." />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: ${gradient};
      padding: 24px;
    }

    .card {
      background: #fff;
      border-radius: 24px;
      padding: 40px 32px 36px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
    }

    .gift-icon {
      font-size: 64px;
      margin-bottom: 20px;
      display: block;
      animation: bounce 1.4s infinite;
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    .from {
      font-size: 14px;
      color: #999;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .sender {
      font-size: 26px;
      font-weight: 700;
      color: #1C1410;
      margin-bottom: 4px;
    }

    .sent-you {
      font-size: 15px;
      color: #7A6A62;
      margin-bottom: 28px;
    }

    .gift-details {
      background: #FAF5F0;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .gift-name {
      font-size: 20px;
      font-weight: 700;
      color: #1C1410;
      margin-bottom: 4px;
    }

    .merchant-name {
      font-size: 14px;
      color: #7A6A62;
      margin-bottom: 8px;
    }

    .amount {
      font-size: 28px;
      font-weight: 800;
      color: #F07856;
    }

    .message-box {
      background: #FFF8F5;
      border-left: 3px solid #F07856;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 28px;
      text-align: left;
    }

    .message-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #A89990;
      margin-bottom: 4px;
    }

    .message-text {
      font-size: 15px;
      color: #1C1410;
      line-height: 1.5;
      font-style: italic;
    }

    .btn {
      display: block;
      width: 100%;
      padding: 16px;
      border-radius: 12px;
      border: none;
      background: #F07856;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: opacity 0.2s, transform 0.1s;
    }

    .btn:active {
      opacity: 0.85;
      transform: scale(0.98);
    }

    .footer {
      margin-top: 24px;
      font-size: 13px;
      color: rgba(255,255,255,0.75);
      text-align: center;
    }

    .footer a {
      color: #fff;
      font-weight: 600;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="gift-icon">🎁</span>

    <p class="from">From</p>
    <h1 class="sender">${escapeHtml(senderName)}</h1>
    <p class="sent-you">sent you a gift!</p>

    <div class="gift-details">
      <p class="gift-name">${escapeHtml(itemName)}</p>
      ${merchantName ? `<p class="merchant-name">${escapeHtml(merchantName)}</p>` : ''}
      <p class="amount">${currencySymbol}${amount}</p>
    </div>

    ${message ? `
    <div class="message-box">
      <p class="message-label">Personal message</p>
      <p class="message-text">"${escapeHtml(message)}"</p>
    </div>
    ` : ''}

    <a href="kadoapp://open-gift" class="btn">Open in Kado App</a>
  </div>

  <p class="footer">
    Powered by <a href="https://kado-backend.onrender.com">Kado</a>
  </p>
</body>
</html>`;
}

function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gift not found — Kado</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #F07856, #C8956C);
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 24px;
      padding: 40px 32px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
    }
    .icon { font-size: 56px; margin-bottom: 20px; display: block; }
    h1 { font-size: 22px; color: #1C1410; margin-bottom: 10px; }
    p { font-size: 15px; color: #7A6A62; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <span class="icon">🔍</span>
    <h1>Gift not found</h1>
    <p>This link may have expired or already been claimed.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.get('/:shareCode', async (req, res) => {
  const { shareCode } = req.params;

  try {
    const result = await query(
      `SELECT
         gs.sender_name, gs.personal_message, gs.theme, gs.payment_status,
         gs.merchant_item_id, gs.store_credit_preset_id,
         mi.name          AS item_name,
         mi.price         AS item_price,
         mi.currency_code AS item_currency,
         scp.amount       AS credit_amount,
         scp.currency_code AS credit_currency,
         COALESCE(mi_m.name, scp_m.name) AS merchant_name
       FROM gifts_sent gs
       LEFT JOIN merchant_items mi        ON mi.id   = gs.merchant_item_id
       LEFT JOIN merchants mi_m           ON mi_m.id = mi.merchant_id
       LEFT JOIN store_credit_presets scp ON scp.id  = gs.store_credit_preset_id
       LEFT JOIN merchants scp_m          ON scp_m.id = scp.merchant_id
       WHERE gs.unique_share_link = $1`,
      [shareCode]
    );

    if (!result.rows.length) {
      return res.status(404).send(renderNotFound());
    }

    const row = result.rows[0];

    if (row.payment_status !== 'paid') {
      return res.status(404).send(renderNotFound());
    }

    const isCredit = !!row.store_credit_preset_id;
    const itemName    = isCredit ? `${row.credit_currency} ${row.credit_amount} Store Credit` : (row.item_name || 'Gift');
    const merchantName = row.merchant_name || null;
    const amount      = isCredit ? row.credit_amount : row.item_price;
    const currency    = isCredit ? row.credit_currency : row.item_currency;

    res.send(renderGiftPage({
      gift: row,
      itemName,
      merchantName,
      amount,
      currency,
    }));
  } catch (err) {
    logger.error('Gift page error', { shareCode, error: err.message });
    res.status(500).send(renderNotFound());
  }
});

module.exports = router;
