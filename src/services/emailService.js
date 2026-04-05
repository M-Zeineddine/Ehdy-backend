'use strict';

const { resend, emailConfig } = require('../config/email');
const logger = require('../utils/logger');

const FROM = `${emailConfig.fromName} <${emailConfig.fromEmail}>`;

/**
 * Send a raw email via Resend.
 */
async function sendEmail({ to, subject, html }) {
  if (!resend) {
    logger.warn('Resend not configured, skipping email', { to, subject });
    return;
  }

  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    logger.info('Email sent', { to, subject });
  } catch (err) {
    logger.error('Failed to send email', { to, subject, error: err.message });
  }
}

/**
 * Send email verification code.
 */
async function sendVerificationEmail(email, code) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333; text-align: center;">Welcome to Ehdy! 🎁</h1>
      <p style="color: #555; font-size: 16px;">Please verify your email address to get started.</p>
      <div style="background: #f4f4f4; border-radius: 8px; padding: 30px; text-align: center; margin: 20px 0;">
        <p style="color: #333; font-size: 14px; margin-bottom: 10px;">Your verification code is:</p>
        <h2 style="color: #6B46C1; font-size: 42px; letter-spacing: 8px; margin: 0;">${code}</h2>
        <p style="color: #888; font-size: 12px; margin-top: 10px;">This code expires in 15 minutes.</p>
      </div>
      <p style="color: #888; font-size: 14px; text-align: center;">
        If you did not create a Ehdy account, you can safely ignore this email.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Verify your Ehdy email address',
    html,
  });
}

/**
 * Send password reset email with code.
 */
async function sendPasswordResetEmail(email, firstName, code) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333; text-align: center;">Reset your password</h1>
      <p style="color: #555; font-size: 16px;">Hi ${firstName || 'there'},</p>
      <p style="color: #555; font-size: 16px;">Use the code below to reset your Ehdy password:</p>
      <div style="background: #f4f4f4; border-radius: 8px; padding: 30px; text-align: center; margin: 20px 0;">
        <p style="color: #333; font-size: 14px; margin-bottom: 10px;">Your reset code is:</p>
        <h2 style="color: #6B46C1; font-size: 42px; letter-spacing: 8px; margin: 0;">${code}</h2>
        <p style="color: #888; font-size: 12px; margin-top: 10px;">This code expires in 1 hour.</p>
      </div>
      <p style="color: #888; font-size: 14px; text-align: center;">
        If you did not request a password reset, you can safely ignore this email.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Reset your Ehdy password',
    html,
  });
}

/**
 * Send gift received notification email.
 */
async function sendGiftReceivedEmail({
  recipientEmail,
  recipientName,
  senderName,
  merchantName,
  personalMessage,
  shareLink,
  theme,
}) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://ehdy.app';
  const claimUrl = `${frontendUrl}/claim/${shareLink}`;

  const themeEmojis = {
    birthday: '🎂',
    thank_you: '🙏',
    love: '❤️',
    thinking_of_you: '💭',
    just_because: '🎉',
    congratulations: '🎊',
  };
  const emoji = themeEmojis[theme] || '🎁';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fafafa;">
      <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="color: #333; text-align: center; font-size: 28px;">${emoji} You Got a Gift!</h1>
        <p style="color: #555; font-size: 16px;">Hi ${recipientName || 'there'},</p>
        <p style="color: #555; font-size: 16px;">
          <strong>${senderName}</strong> sent you a gift from <strong>${merchantName}</strong> via Ehdy!
        </p>
        ${personalMessage ? `
        <div style="background: #f9f5ff; border-left: 4px solid #6B46C1; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="color: #555; font-style: italic; margin: 0;">"${personalMessage}"</p>
          <p style="color: #888; font-size: 14px; margin-top: 8px;">— ${senderName}</p>
        </div>
        ` : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${claimUrl}"
             style="background: #6B46C1; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block;">
            🎁 Claim Your Gift
          </a>
        </div>
        <p style="color: #888; font-size: 14px; text-align: center;">
          Or visit: ${claimUrl}
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to: recipientEmail,
    subject: `${senderName} sent you a gift on Ehdy! ${emoji}`,
    html,
  });
}

/**
 * Send purchase confirmation email.
 */
async function sendPurchaseConfirmationEmail({ email, firstName, purchase, items }) {
  const itemsHtml = items
    .map(
      item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${item.currency} ${item.amount}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Purchase Confirmation</h1>
      <p style="color: #555;">Hi ${firstName || 'there'},</p>
      <p style="color: #555;">Thank you for your purchase! Here are your order details:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f4f4f4;">
            <th style="padding: 10px; text-align: left;">Item</th>
            <th style="padding: 10px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding: 10px; font-weight: bold;">Total</td>
            <td style="padding: 10px; font-weight: bold; text-align: right;">${purchase.currency_code} ${purchase.total_amount}</td>
          </tr>
        </tfoot>
      </table>
      <p style="color: #888; font-size: 14px;">Your gift(s) have been added to your Ehdy wallet.</p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Your Ehdy purchase confirmation',
    html,
  });
}

/**
 * Send payment failed notification.
 */
async function sendPaymentFailedEmail({ email, firstName, amount, currency, reason }) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #e53e3e;">Payment Failed</h1>
      <p style="color: #555;">Hi ${firstName || 'there'},</p>
      <p style="color: #555;">Unfortunately, your payment of <strong>${currency} ${amount}</strong> could not be processed.</p>
      ${reason ? `<p style="color: #888;">Reason: ${reason}</p>` : ''}
      <p style="color: #555;">Please check your payment details and try again.</p>
      <a href="${process.env.FRONTEND_URL || 'https://ehdy.app'}"
         style="background: #6B46C1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 16px;">
        Try Again
      </a>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Payment failed on Ehdy',
    html,
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendGiftReceivedEmail,
  sendPurchaseConfirmationEmail,
  sendPaymentFailedEmail,
};
