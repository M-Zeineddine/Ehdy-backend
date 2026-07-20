'use strict';

const { escapeHtml } = require('../../utils/html');
const { getTheme, lottieUrlFor } = require('./themes');
const { pageStyles } = require('./styles');
const {
  renderParticles,
  renderHeader,
  renderGiftCard,
  renderItemsSection,
  renderBalanceSection,
  renderBranchPill,
  renderRedeemSteps,
  renderCta,
} = require('./partials');
const { buildMapModel, renderMapCard, renderMapScripts } = require('./map');
const { renderPageScripts } = require('./scripts');
const { renderNotFound } = require('./notFound');

function renderGiftPage({ gift, items, redemptionCode, redemptionQr, recipientName, branches = [], redeemableAt = null, balance = null }) {
  const theme = getTheme(gift.theme);
  const senderName = gift.sender_name || 'Someone';
  const message = gift.personal_message || '';
  const displayRecipient = recipientName || 'You';
  const merchantName = items[0]?.merchantName || '';
  const itemName = items[0]?.itemName || '';

  const map = buildMapModel(branches, merchantName);

  // Sections stagger-animate in order via --i; balance is optional so the
  // indices for everything after it shift only when it's actually rendered.
  let i = 1;
  const balanceIndex = i++;
  const branchPillIndex = i++;
  const redeemStepsIndex = i++;
  const mapIndex = i++;
  const ctaIndex = i++;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script>document.documentElement.className += ' js';</script>
  <title>You have a gift from ${escapeHtml(senderName)}! 🎁</title>
  <meta property="og:title" content="You have a gift from ${escapeHtml(senderName)}!" />
  <meta property="og:description" content="${escapeHtml(senderName)} sent you a gift via Ehdy." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Caveat:wght@600;700&display=swap" rel="stylesheet" />
  ${map.hasMap ? '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />' : ''}
  <style>${pageStyles(theme.gradient)}</style>
</head>
<body>
${renderParticles(theme)}
  <div class="page">
${renderHeader({ theme, displayRecipient })}

    <!-- Themed gift card (mirrors app's BaseCard) -->
${renderGiftCard({ theme, displayRecipient, message, merchantName, itemName, senderName })}

    <div class="reveal-content">
${renderItemsSection({ items, redemptionCode, qrUrl: redemptionQr })}
${renderBalanceSection({ balance, styleIndex: balanceIndex })}
${renderBranchPill({ branchCount: branches.length, redeemableAt, merchantName, styleIndex: branchPillIndex })}
${renderRedeemSteps({ redeemableAt, merchantName, styleIndex: redeemStepsIndex })}
${map.hasMap ? renderMapCard(map, merchantName, mapIndex) : ''}
${renderCta({ styleIndex: ctaIndex })}
    </div><!-- /.reveal-content -->
  </div>
${renderPageScripts(lottieUrlFor(theme))}
${map.hasMap ? renderMapScripts(map) : ''}
</body>
</html>`;
}

module.exports = { renderGiftPage, renderNotFound };
