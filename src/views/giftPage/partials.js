'use strict';

const { escapeHtml } = require('../../utils/html');

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

/**
 * Ambient particles drifting up behind the page. Server-rendered with
 * randomized position/speed per request; negative delays pre-populate
 * the field so it isn't empty on load.
 */
function renderParticles(theme) {
  const spans = [];
  for (let i = 0; i < 14; i++) {
    const emoji = theme.particles[i % theme.particles.length];
    const x = (Math.random() * 100).toFixed(1);
    const size = Math.round(14 + Math.random() * 12);
    const dur = (14 + Math.random() * 10).toFixed(1);
    const delay = (-Math.random() * 24).toFixed(1);
    const sway = Math.round(Math.random() * 60 - 30);
    const op = (0.14 + Math.random() * 0.18).toFixed(2);
    spans.push(`<span class="particle" style="--x:${x}%;--size:${size}px;--dur:${dur}s;--delay:${delay}s;--sway:${sway}px;--op:${op}">${emoji}</span>`);
  }
  return `<div class="particles" aria-hidden="true">${spans.join('')}</div>`;
}

function renderHeader({ theme, displayRecipient }) {
  return `
    <!-- Header -->
    <div class="page-header">
      <div class="icon-wrap">
        <span class="icon-emoji" id="iconEmoji">${theme.emoji}</span>
        <div class="lottie-icon" id="lottieIcon"></div>
      </div>
      <h1>Mabrouk, ${escapeHtml(displayRecipient)}!</h1>
      <p>Someone wanted to brighten your day.</p>
    </div>`;
}

// Mirrors the app's BaseCard; the unwrap overlay is only shown when JS is on.
function renderGiftCard({ theme, displayRecipient, message, merchantName, itemName, senderName }) {
  return `
    <div class="gift-card-wrap">
      <div class="gift-card">
        ${renderDecorations(theme.decorations)}
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
      <button class="unwrap-overlay" id="unwrapBtn" aria-label="Unwrap your gift">
        <span class="ribbon-v"></span>
        <span class="ribbon-h"></span>
        <span class="ribbon-bow">🎀</span>
        <span class="unwrap-hint">Tap to unwrap your gift</span>
      </button>
    </div>`;
}

/**
 * Renders the item cards. Accepts an array so bundle gifts are
 * future-proof — multiple entries render as a stacked list.
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

function renderItemsSection({ items, redemptionCode, qrUrl }) {
  return `
    <!-- Item(s) + voucher -->
    <div class="section-card" style="--i:0">
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
          <img src="${escapeHtml(qrUrl)}" alt="QR Code" />
          <p class="qr-hint">Scan at the counter to redeem</p>
        </div>` : ''}
      </div>` : ''}
    </div>`;
}

/**
 * Balance + redemption history for store-credit gifts — the only type with
 * partial redemption. One row per redemption: date, amount, and where.
 */
function renderBalanceSection({ balance, styleIndex }) {
  if (!balance) return '';
  const { currency, initial, current, history } = balance;
  const initialNum = parseFloat(initial) || 0;
  const currentNum = parseFloat(current) || 0;
  const pctLeft = initialNum > 0 ? Math.max(0, Math.min(100, (currentNum / initialNum) * 100)) : 100;

  const rows = history.map(h => {
    const date = new Date(h.redeemed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const where = h.branch_name || 'In-store';
    return `
        <div class="history-row">
          <span class="history-date">${escapeHtml(date)}</span>
          <span class="history-where">${escapeHtml(where)}</span>
          <span class="history-amount">-${escapeHtml(h.currency_code || currency)} ${parseFloat(h.amount).toFixed(2)}</span>
        </div>`;
  }).join('');

  return `
    <!-- Balance + redemption history -->
    <div class="section-card balance-section" style="--i:${styleIndex}">
      <div class="balance-summary">
        <div class="balance-stat">
          <p class="balance-label">Remaining</p>
          <p class="balance-value balance-value-main">${escapeHtml(currency)} ${currentNum.toFixed(2)}</p>
        </div>
        <div class="balance-stat balance-stat-right">
          <p class="balance-label">Original</p>
          <p class="balance-value">${escapeHtml(currency)} ${initialNum.toFixed(2)}</p>
        </div>
      </div>
      <div class="balance-bar-track"><div class="balance-bar-fill" style="width:${pctLeft.toFixed(1)}%"></div></div>

      ${history.length ? `
      <div class="history-list">
        <p class="history-title">Redemption history</p>
        ${rows}
      </div>` : `
      <p class="history-empty">No redemptions yet — the full balance is available.</p>`}
    </div>`;
}

function renderBranchPill({ branchCount, redeemableAt, merchantName, styleIndex }) {
  if (!branchCount && !redeemableAt) return '';
  return `
    <!-- Branch availability -->
    <div style="--i:${styleIndex};display:flex;align-items:center;gap:8px;justify-content:center;background:${redeemableAt ? '#FFF7ED' : '#F0FDF4'};border:1px solid ${redeemableAt ? '#FED7AA' : '#BBF7D0'};border-radius:999px;padding:8px 16px;align-self:center;">
      <span>📍</span>
      <span style="font-size:13px;font-weight:600;color:${redeemableAt ? '#9A3412' : '#166534'};">
        ${redeemableAt
          ? `Redeemable at ${escapeHtml(redeemableAt.join(', '))} branch only`
          : `Redeemable at any ${escapeHtml(merchantName)} branch`}
      </span>
    </div>`;
}

function renderRedeemSteps({ redeemableAt, merchantName, styleIndex }) {
  const steps = [
    {
      title: redeemableAt
        ? `Visit the ${escapeHtml(redeemableAt.join(', '))} branch`
        : `Visit any ${merchantName ? escapeHtml(merchantName) + ' branch' : 'participating branch'}`,
      body: 'Show this page or open Ehdy at the counter.',
    },
    {
      title: 'Tell the staff you have a Ehdy gift',
      body: "Let them know what you'd like to redeem.",
    },
    {
      title: 'Show your QR code or voucher code',
      body: 'The staff will scan it to apply your gift.',
    },
  ];

  return `
    <!-- How to redeem -->
    <div class="redeem-section" style="--i:${styleIndex}">
      <p class="redeem-title">How to redeem</p>
      <div class="steps">
        ${steps.map((step, i) => `
        <div class="step">
          <div class="step-left">
            <div class="step-num">${i + 1}</div>
            <div class="step-line"></div>
          </div>
          <div class="step-body">
            <h4>${step.title}</h4>
            <p>${step.body}</p>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
}

function renderCta({ styleIndex }) {
  return `
    <!-- CTA -->
    <div style="--i:${styleIndex}">
      <a href="ehdyapp://open-gift" class="cta-btn">Open in Ehdy App</a>

      <p class="footer">Powered by Ehdy</p>
    </div>`;
}

module.exports = {
  renderParticles,
  renderHeader,
  renderGiftCard,
  renderItemsSection,
  renderBalanceSection,
  renderBranchPill,
  renderRedeemSteps,
  renderCta,
};
