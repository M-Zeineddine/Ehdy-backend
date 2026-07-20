'use strict';

/**
 * Full page CSS. Only the gift-card gradient depends on the theme.
 */
function pageStyles([c1, c2]) {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(180deg, #FDECEA 0%, #ffffff 35%);
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
      gap: 40px;
      position: relative;
      z-index: 1;
    }

    /* ── Ambient floating particles ── */
    .particles {
      position: fixed;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 0;
    }
    .particle {
      position: absolute;
      top: 100%;
      left: var(--x);
      font-size: var(--size);
      opacity: 0;
      animation: floatUp var(--dur) linear var(--delay) infinite;
    }
    @keyframes floatUp {
      0%   { transform: translateY(0) translateX(0) rotate(-8deg); opacity: 0; }
      10%  { opacity: var(--op); }
      90%  { opacity: var(--op); }
      100% { transform: translateY(-108vh) translateX(var(--sway)) rotate(8deg); opacity: 0; }
    }

    /* ── Entrance animations ── */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: none; }
    }
    .page-header    { animation: fadeUp 0.6s ease both; }
    .gift-card-wrap { animation: fadeUp 0.6s ease 0.12s both; }

    /* Content hidden behind the unwrap interaction (JS only) */
    .reveal-content {
      display: flex;
      flex-direction: column;
      gap: 40px;
    }
    .js body:not(.opened) .reveal-content { display: none; }
    .opened .reveal-content > * {
      animation: fadeUp 0.55s ease both;
      animation-delay: calc(var(--i, 0) * 130ms);
    }

    @keyframes cardPop {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.03); }
      100% { transform: scale(1); }
    }
    .opened .gift-card-wrap { animation: cardPop 0.45s ease; }

    /* ── Unwrap overlay (ribbon + bow) ── */
    .unwrap-overlay {
      position: absolute;
      inset: 0;
      z-index: 2;
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      font-family: inherit;
      display: none;
    }
    .js body:not(.opened) .unwrap-overlay { display: block; }
    .ribbon-v, .ribbon-h {
      position: absolute;
      background: rgba(255,255,255,0.3);
      box-shadow: 0 0 12px rgba(0,0,0,0.06);
      transition: transform 0.5s ease, opacity 0.5s ease;
    }
    .ribbon-v { top: 0; bottom: 0; left: 50%; width: 34px; transform: translateX(-50%); }
    .ribbon-h { left: 0; right: 0; top: 50%; height: 34px; transform: translateY(-50%); }
    .ribbon-bow {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      font-size: 46px;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));
      transition: transform 0.5s ease, opacity 0.4s ease;
    }
    @keyframes hintPulse {
      0%, 100% { transform: translateX(-50%) scale(1); }
      50%      { transform: translateX(-50%) scale(1.06); }
    }
    .unwrap-hint {
      position: absolute;
      bottom: 12px; left: 50%;
      transform: translateX(-50%);
      background: rgba(255,255,255,0.92);
      color: #1C1410;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 14px;
      border-radius: 999px;
      white-space: nowrap;
      animation: hintPulse 1.6s ease-in-out infinite;
      transition: opacity 0.3s ease;
    }
    .unwrap-overlay.opening .ribbon-v  { transform: translateX(-50%) translateY(-110%); opacity: 0; }
    .unwrap-overlay.opening .ribbon-h  { transform: translateY(-50%) translateX(110%); opacity: 0; }
    .unwrap-overlay.opening .ribbon-bow { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
    .unwrap-overlay.opening .unwrap-hint { opacity: 0; }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .particles { display: none; }
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
      width: 76px;
      height: 76px;
      border-radius: 50%;
      background: #FFE3DD;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .icon-emoji { font-size: 36px; line-height: 1; }
    .lottie-icon { width: 60px; height: 60px; display: none; }
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
      background-size: 200% 200%;
      animation: gradientShift 8s ease-in-out infinite alternate;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 16px;
    }
    @keyframes gradientShift {
      from { background-position: 0% 0%; }
      to   { background-position: 100% 100%; }
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
      font-family: 'Caveat', cursive;
      font-size: 19px;
      font-weight: 600;
      color: rgba(255,255,255,0.92);
      line-height: 1.3;
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
      position: relative;
      overflow: hidden;
    }
    /* periodic light sweep to draw the eye to the code */
    .voucher-row::after {
      content: '';
      position: absolute;
      top: 0; bottom: 0;
      width: 60px;
      left: -80px;
      background: linear-gradient(105deg, transparent, rgba(255,255,255,0.75), transparent);
      transform: skewX(-15deg);
      animation: shimmer 4s ease-in-out infinite;
    }
    @keyframes shimmer {
      0%        { left: -80px; }
      35%, 100% { left: calc(100% + 40px); }
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
      /* stay above the shimmer sweep so taps always land */
      position: relative;
      z-index: 1;
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
    /* one soft pulse after the unwrap reveal */
    @keyframes qrPulse {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.06); }
      100% { transform: scale(1); }
    }
    .opened .qr-wrap img { animation: qrPulse 0.7s ease 0.9s; }
    .qr-hint {
      font-size: 13px;
      color: #A89990;
    }

    /* ── Balance + redemption history ── */
    .balance-section { padding: 20px 16px; }
    .balance-summary {
      margin-bottom: 10px;
    }
    .balance-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #A89990;
      margin-bottom: 3px;
    }
    .balance-value-main {
      font-size: 24px;
      font-weight: 700;
      color: #F07856;
    }
    .balance-bar-track {
      height: 6px;
      border-radius: 999px;
      background: #F0EBE5;
      overflow: hidden;
      margin-bottom: 10px;
    }
    .balance-bar-fill {
      height: 100%;
      border-radius: 999px;
      background: #F07856;
    }
    /* Original / Total Spent — de-emphasized; the user already knows these numbers */
    .balance-substats {
      display: flex;
      justify-content: space-between;
      margin-bottom: 26px;
    }
    .balance-stat-mini {
      display: flex;
      flex-direction: column;
    }
    .balance-stat-mini-right { align-items: flex-end; }
    .balance-mini-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #A89990;
      margin-bottom: 2px;
    }
    .balance-mini-value {
      font-size: 12px;
      font-weight: 600;
      color: #7A6A62;
    }
    .history-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #A89990;
      margin-bottom: 10px;
    }
    .history-list {
      display: flex;
      flex-direction: column;
    }
    .history-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 0;
      border-top: 1px solid #F0EBE5;
    }
    .history-info { min-width: 0; }
    .history-entry-title {
      font-size: 14px;
      font-weight: 600;
      color: #1C1410;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .history-entry-date {
      font-size: 12px;
      color: #A89990;
      margin-top: 1px;
    }
    .history-amount {
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .history-amount-spent { color: #7A6A62; font-weight: 600; }

    /* ── Redeemed status (gift items — one-shot claim, not a ledger) ── */
    .redeemed-card {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #F0FDF4;
      border: 1px solid #BBF7D0;
      border-radius: 16px;
      padding: 14px 16px;
    }
    .redeemed-icon-circle {
      width: 34px;
      height: 34px;
      border-radius: 17px;
      background: #166534;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
    }
    .redeemed-title {
      font-size: 14px;
      font-weight: 700;
      color: #166534;
    }
    .redeemed-detail {
      font-size: 12px;
      color: #166534;
      opacity: 0.85;
      margin-top: 1px;
    }

    /* ── How to redeem ── */
    .redeem-section { padding: 0; }
    .redeem-title {
      font-size: 17px;
      font-weight: 700;
      color: #1C1410;
      margin-bottom: 20px;
    }
    .steps {
      display: flex;
      flex-direction: column;
    }
    .step {
      display: flex;
      gap: 16px;
      position: relative;
    }
    .step-left {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }
    .step-num {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 2px solid #F07856;
      color: #F07856;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 700;
      flex-shrink: 0;
      background: #fff;
      position: relative;
      z-index: 1;
    }
    .step-line {
      width: 2px;
      flex: 1;
      background: #F0EBE5;
      margin: 4px 0;
    }
    .step:last-child .step-line { display: none; }
    .step-body {
      padding-top: 10px;
      padding-bottom: 28px;
    }
    .step:last-child .step-body { padding-bottom: 0; }
    .step-body h4 {
      font-size: 15px;
      font-weight: 700;
      color: #1C1410;
      margin-bottom: 3px;
    }
    .step-body p {
      font-size: 13px;
      color: #7A6A62;
      line-height: 1.4;
    }

    /* ── Map ── */
    .map-card {
      background: #fff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    }
    .map-img {
      width: 100%;
      height: 180px;
      object-fit: cover;
      display: block;
    }
    .map-embed {
      width: 100%;
      height: 180px;
      border: 0;
      display: block;
    }
    .map-canvas {
      width: 100%;
      height: 180px;
      cursor: pointer;
    }
    .leaflet-container {
      font-family: inherit;
    }
    .map-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
    }
    .map-merchant-name {
      font-size: 15px;
      font-weight: 700;
      color: #1C1410;
    }
    .map-open-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #FDECEA;
      color: #E8704A;
      border: none;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      flex-shrink: 0;
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
      margin-bottom: 10px;
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
  `;
}

module.exports = { pageStyles };
