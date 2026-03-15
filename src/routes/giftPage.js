'use strict';

const router = require('express').Router();
const { query } = require('../utils/database');
const logger = require('../utils/logger');

// Mirrors GIFT_THEMES in Kado-app/src/constants/giftThemes.ts
const THEMES = {
  birthday: {
    gradient: ['#FF6B6B', '#FF8E53'],
    decorations: [
      { w: 140, h: 140, r: 70, top: -45, right: -35, bg: 'rgba(255,255,255,0.15)' },
      { w: 90, h: 90, r: 45, bottom: -25, left: -25, bg: 'rgba(255,200,100,0.22)' },
      { w: 40, h: 40, r: 20, top: 28, left: 48, bg: 'rgba(255,255,255,0.12)' },
      { w: 20, h: 20, r: 10, top: 60, right: 75, bg: 'rgba(255,255,255,0.2)' },
    ],
  },
  thankyou: {
    gradient: ['#11998e', '#38ef7d'],
    decorations: [
      { w: 160, h: 160, r: 80, top: -60, right: -50, bg: 'rgba(255,255,255,0.12)' },
      { w: 70, h: 70, r: 35, bottom: -20, right: 40, bg: 'rgba(100,255,200,0.2)' },
      { w: 30, h: 30, r: 15, top: 22, left: 30, bg: 'rgba(255,255,255,0.15)' },
    ],
  },
  love: {
    gradient: ['#FF758C', '#FF7EB3'],
    decorations: [
      { w: 120, h: 120, r: 60, top: -35, left: -35, bg: 'rgba(255,255,255,0.15)' },
      { w: 100, h: 100, r: 50, bottom: -30, right: -30, bg: 'rgba(255,160,190,0.22)' },
      { w: 50, h: 50, r: 25, top: 18, right: 58, bg: 'rgba(255,255,255,0.1)' },
    ],
  },
  thinking: {
    gradient: ['#8360C3', '#7EB8F7'],
    decorations: [
      { w: 150, h: 150, r: 75, top: -50, right: -50, bg: 'rgba(255,255,255,0.1)' },
      { w: 60, h: 60, r: 30, bottom: 10, left: 15, bg: 'rgba(200,180,255,0.25)' },
      { w: 35, h: 35, r: 18, top: 14, left: 62, bg: 'rgba(255,255,255,0.12)' },
    ],
  },
  congrats: {
    gradient: ['#F7971E', '#FFD200'],
    decorations: [
      { w: 130, h: 130, r: 65, top: -38, right: -38, bg: 'rgba(255,255,255,0.15)' },
      { w: 80, h: 80, r: 40, bottom: -20, left: -20, bg: 'rgba(255,220,100,0.2)' },
      { w: 40, h: 40, r: 20, top: 32, left: 80, bg: 'rgba(255,255,255,0.12)' },
      { w: 22, h: 22, r: 11, bottom: 28, right: 80, bg: 'rgba(255,255,255,0.18)' },
    ],
  },
  sorry: {
    gradient: ['#4568DC', '#B06AB3'],
    decorations: [
      { w: 160, h: 160, r: 80, top: -55, right: -55, bg: 'rgba(255,255,255,0.08)' },
      { w: 80, h: 80, r: 40, bottom: -15, left: 18, bg: 'rgba(180,150,255,0.2)' },
      { w: 45, h: 45, r: 23, top: 18, left: 40, bg: 'rgba(255,255,255,0.1)' },
    ],
  },
};

const DEFAULT_THEME = THEMES.birthday;

function getTheme(themeId) {
  return THEMES[themeId] || DEFAULT_THEME;
}

function renderDecorations(decorations) {
  return decorations.map(d => {
    const pos = [
      d.top != null ? `top:${d.top}px;` : '',
      d.bottom != null ? `bottom:${d.bottom}px;` : '',
      d.left != null ? `left:${d.left}px;` : '',
      d.right != null ? `right:${d.right}px;` : '',
    ].join('');
    return `<div style="position:absolute;width:${d.w}px;height:${d.h}px;border-radius:${d.r}px;background:${d.bg};${pos}"></div>`;
  }).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a single gift item card.
 * Accepts an array of items so bundle gifts are future-proof —
 * just pass multiple entries and they render as a stacked list.
 */
function renderItemCards(items) {
  return items.map(({ imageUrl, merchantName, itemName, details }) => `
    <div class="item-card">
      ${imageUrl ? `<img class="item-img" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(itemName)}" />` : `<div class="item-img-placeholder">🎁</div>`}
      <div class="item-info">
        ${merchantName ? `<p class="item-merchant">${escapeHtml(merchantName)}</p>` : ''}
        <p class="item-name">${escapeHtml(itemName)}</p>
        ${details ? `<p class="item-details">${escapeHtml(details)}</p>` : ''}
      </div>
    </div>
  `).join('');
}

function renderGiftPage({ gift, items, redemptionCode, recipientName }) {
  const theme = getTheme(gift.theme);
  const [c1, c2] = theme.gradient;
  const senderName = gift.sender_name || 'Someone';
  const message = gift.personal_message || '';
  const displayRecipient = recipientName || 'You';
  const merchantName = items[0]?.merchantName || '';
  const itemName = items[0]?.itemName || '';
  const qrUrl = redemptionCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(redemptionCode)}&margin=8`
    : null;

  // Card aspect ratio matches the app: height = width × 0.58
  // We use padding-bottom trick so it scales responsively
  const cardDecorations = renderDecorations(theme.decorations);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You have a gift from ${escapeHtml(senderName)}! 🎁</title>
  <meta property="og:title" content="You have a gift from ${escapeHtml(senderName)}!" />
  <meta property="og:description" content="${escapeHtml(senderName)} sent you a gift via Kado." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f9f6f2;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px 48px;
    }

    .page {
      max-width: 420px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* ── Header ── */
    .page-header {
      text-align: center;
      padding: 8px 0 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .page-header .icon-wrap {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #FFF0EC;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .page-header h1 {
      font-size: 26px;
      font-weight: 800;
      color: #1C1410;
      margin: 0;
    }
    .page-header p {
      font-size: 14px;
      color: #7A6A62;
      margin: 0;
    }

    /* ── Themed gift card (mirrors BaseCard in the app) ── */
    .gift-card-wrap {
      border-radius: 24px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.18);
      overflow: hidden;
      /* responsive 0.58 aspect ratio */
      position: relative;
      width: 100%;
      padding-bottom: 58%;
    }
    .gift-card {
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, ${c1} 0%, ${c2} 100%);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 16px;
    }
    .gift-card .card-top { display: flex; flex-direction: column; gap: 3px; }
    .gift-card .for-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.82);
    }
    .gift-card .recipient-name {
      font-size: 22px;
      font-weight: 800;
      color: #fff;
      line-height: 1.3;
    }
    .gift-card .card-message {
      font-size: 12px;
      font-style: italic;
      color: rgba(255,255,255,0.82);
      line-height: 1.5;
      margin-top: 2px;
    }
    .gift-card .card-bottom {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-end;
    }
    .gift-card .card-merchant {
      font-size: 12px;
      font-weight: 600;
      color: #fff;
    }
    .gift-card .card-price {
      font-size: 10px;
      font-weight: 500;
      color: rgba(255,255,255,0.82);
      margin-top: 1px;
    }
    .gift-card .card-from {
      font-size: 12px;
      font-weight: 500;
      color: rgba(255,255,255,0.82);
    }

    /* ── White section card ── */
    .section-card {
      background: #fff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    }

    /* ── Item card ── */
    .item-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px;
      border-bottom: 1px solid #F0EBE5;
    }
    .item-card:last-child { border-bottom: none; }
    .item-img {
      width: 72px;
      height: 72px;
      border-radius: 12px;
      object-fit: cover;
      flex-shrink: 0;
      background: #f9f6f2;
    }
    .item-img-placeholder {
      width: 72px;
      height: 72px;
      border-radius: 12px;
      background: #f9f6f2;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      flex-shrink: 0;
    }
    .item-merchant {
      font-size: 12px;
      font-weight: 700;
      color: #F07856;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 3px;
    }
    .item-name {
      font-size: 17px;
      font-weight: 700;
      color: #1C1410;
      margin-bottom: 2px;
    }
    .item-details {
      font-size: 13px;
      color: #7A6A62;
    }

    /* ── Voucher section ── */
    .voucher-section {
      padding: 20px 16px;
      border-top: 1px solid #F0EBE5;
    }
    .voucher-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #FAF5F0;
      border: 1.5px dashed #D4C5BB;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 16px;
    }
    .voucher-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #A89990;
      margin-bottom: 3px;
    }
    .voucher-code {
      font-size: 20px;
      font-weight: 800;
      color: #1C1410;
      letter-spacing: 2px;
    }
    .copy-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 20px;
      padding: 4px;
      opacity: 0.6;
      transition: opacity 0.15s;
    }
    .copy-btn:hover { opacity: 1; }
    .copy-btn.copied { color: #4CAF50; opacity: 1; }

    .qr-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .qr-wrap img {
      width: 160px;
      height: 160px;
      border-radius: 12px;
      background: #f9f6f2;
    }
    .qr-hint {
      font-size: 13px;
      color: #A89990;
    }

    /* ── How to redeem ── */
    .redeem-section {
      padding: 20px 16px;
    }
    .redeem-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      font-weight: 700;
      color: #1C1410;
      margin-bottom: 16px;
    }
    .redeem-title .circle-i {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid #F07856;
      color: #F07856;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .step {
      display: flex;
      gap: 12px;
      margin-bottom: 14px;
    }
    .step:last-child { margin-bottom: 0; }
    .step-num {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid #F07856;
      color: #F07856;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .step-body h4 {
      font-size: 14px;
      font-weight: 700;
      color: #1C1410;
      margin-bottom: 2px;
    }
    .step-body p {
      font-size: 13px;
      color: #7A6A62;
      line-height: 1.4;
    }

    /* ── CTA ── */
    .cta-btn {
      display: block;
      width: 100%;
      padding: 16px;
      border-radius: 14px;
      border: none;
      background: #F07856;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      transition: opacity 0.15s, transform 0.1s;
      box-shadow: 0 4px 16px rgba(240,120,86,0.35);
    }
    .cta-btn:active { opacity: 0.88; transform: scale(0.98); }

    /* ── Footer ── */
    .footer {
      text-align: center;
      font-size: 12px;
      color: #A89990;
      padding-top: 4px;
    }
    .footer a { color: #F07856; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="page">

    <!-- Header -->
    <div class="page-header">
      <div class="icon-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E8704A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5.8 11.3 2 22l10.7-3.79"/>
          <path d="M4 3h.01"/>
          <path d="M22 8h.01"/>
          <path d="M15 2h.01"/>
          <path d="M22 20h.01"/>
          <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/>
          <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/>
          <path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/>
          <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>
        </svg>
      </div>
      <h1>Mabrouk, ${escapeHtml(displayRecipient)}!</h1>
      <p>Someone wanted to brighten your day.</p>
    </div>

    <!-- Themed gift card (mirrors app's BaseCard) -->
    <div class="gift-card-wrap">
      <div class="gift-card">
        ${cardDecorations}
        <div class="card-top">
          <span class="for-label">A gift for</span>
          <span class="recipient-name">${escapeHtml(displayRecipient)}</span>
          ${message ? `<span class="card-message">"${escapeHtml(message)}"</span>` : ''}
        </div>
        <div class="card-bottom">
          <div>
            ${merchantName ? `<p class="card-merchant">${escapeHtml(merchantName)}</p>` : ''}
            ${itemName ? `<p class="card-price">${escapeHtml(itemName)}</p>` : ''}
          </div>
          ${senderName ? `<span class="card-from">From ${escapeHtml(senderName)}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- Item(s) + voucher -->
    <div class="section-card">
      ${renderItemCards(items)}

      ${redemptionCode ? `
      <div class="voucher-section">
        <div class="voucher-row">
          <div>
            <p class="voucher-label">Voucher Code</p>
            <p class="voucher-code" id="vcode">${escapeHtml(redemptionCode)}</p>
          </div>
          <button class="copy-btn" id="copyBtn" onclick="copyCode()" title="Copy code">⧉</button>
        </div>
        ${qrUrl ? `
        <div class="qr-wrap">
          <img src="${qrUrl}" alt="QR Code" />
          <p class="qr-hint">Scan at the counter to redeem</p>
        </div>` : ''}
      </div>` : ''}
    </div>

    <!-- How to redeem -->
    <div class="section-card">
      <div class="redeem-section">
        <div class="redeem-title">
          <div class="circle-i">i</div>
          How to redeem
        </div>
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-body">
            <h4>Visit any ${items[0]?.merchantName ? escapeHtml(items[0].merchantName) + ' branch' : 'participating branch'}</h4>
            <p>Show this page or open Kado at the counter.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-body">
            <h4>Tell the staff you have a Kado gift</h4>
            <p>Let them know what you'd like to redeem.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-body">
            <h4>Show your QR code or voucher code</h4>
            <p>The staff will scan it to apply your gift.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <a href="kadoapp://open-gift" class="cta-btn">Open in Kado App</a>

    <p class="footer">Powered by <a href="https://kado-backend.onrender.com">Kado</a></p>
  </div>

  <script>
    function copyCode() {
      const code = document.getElementById('vcode').textContent;
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = '✓';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '⧉'; btn.classList.remove('copied'); }, 2000);
      });
    }
  </script>
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
      align-items: center;
      justify-content: center;
      background: #f9f6f2;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 24px;
      padding: 40px 32px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .icon { font-size: 56px; margin-bottom: 20px; display: block; }
    h1 { font-size: 22px; font-weight: 700; color: #1C1410; margin-bottom: 10px; }
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

router.get('/:shareCode', async (req, res) => {
  const { shareCode } = req.params;

  try {
    const result = await query(
      `SELECT
         gs.sender_name, gs.recipient_name, gs.personal_message, gs.theme, gs.payment_status,
         gs.merchant_item_id, gs.store_credit_preset_id,
         mi.name          AS item_name,
         mi.price         AS item_price,
         mi.currency_code AS item_currency,
         mi.image_url     AS item_image,
         mi_m.name        AS item_merchant,
         scp.amount       AS credit_amount,
         scp.currency_code AS credit_currency,
         scp_m.name       AS credit_merchant,
         gi.redemption_code
       FROM gifts_sent gs
       LEFT JOIN merchant_items mi        ON mi.id    = gs.merchant_item_id
       LEFT JOIN merchants mi_m           ON mi_m.id  = mi.merchant_id
       LEFT JOIN store_credit_presets scp ON scp.id   = gs.store_credit_preset_id
       LEFT JOIN merchants scp_m          ON scp_m.id = scp.merchant_id
       LEFT JOIN gift_instances gi        ON gi.gift_sent_id = gs.id
       WHERE gs.unique_share_link = $1
       LIMIT 1`,
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
    const merchantName = isCredit ? row.credit_merchant : row.item_merchant;
    const itemName = isCredit
      ? `${row.credit_currency} ${row.credit_amount} Store Credit`
      : (row.item_name || 'Gift');
    const itemDetails = isCredit ? null : (row.item_currency && row.item_price ? `${row.item_currency} ${row.item_price}` : null);
    const imageUrl = isCredit ? null : (row.item_image || null);

    // items array — bundle gifts will pass multiple entries here
    const items = [{ imageUrl, merchantName, itemName, details: itemDetails }];

    res.send(renderGiftPage({
      gift: row,
      items,
      redemptionCode: row.redemption_code || null,
      recipientName: row.recipient_name || null,
    }));
  } catch (err) {
    logger.error('Gift page error', { shareCode, error: err.message });
    res.status(500).send(renderNotFound());
  }
});

module.exports = router;
