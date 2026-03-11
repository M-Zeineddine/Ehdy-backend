'use strict';

const { twilioClient, smsConfig } = require('../config/sms');
const logger = require('../utils/logger');

/**
 * Send an SMS message via Twilio.
 */
async function sendSMS(to, body) {
  if (!twilioClient) {
    logger.warn('Twilio not configured, skipping SMS', { to });
    return;
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: smsConfig.phoneNumber,
      to,
    });
    logger.info('SMS sent', { to, messageSid: message.sid });
    return message;
  } catch (err) {
    logger.error('Failed to send SMS', { to, error: err.message });
    throw err;
  }
}

/**
 * Send a WhatsApp message via Twilio WhatsApp.
 */
async function sendWhatsApp(to, body) {
  if (!twilioClient) {
    logger.warn('Twilio not configured, skipping WhatsApp', { to });
    return;
  }

  // Format the number for WhatsApp
  const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  try {
    const message = await twilioClient.messages.create({
      body,
      from: smsConfig.whatsappNumber,
      to: whatsappTo,
    });
    logger.info('WhatsApp message sent', { to, messageSid: message.sid });
    return message;
  } catch (err) {
    logger.error('Failed to send WhatsApp message', { to, error: err.message });
    throw err;
  }
}

/**
 * Send a gift notification via SMS or WhatsApp.
 */
async function sendGiftNotification({
  recipientPhone,
  recipientName,
  senderName,
  shareLink,
  channel = 'sms',
}) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://kado.app';
  const claimUrl = `${frontendUrl}/claim/${shareLink}`;
  const body = `Hi ${recipientName || 'there'}! ${senderName} sent you a gift on Kado! 🎁 Open: ${claimUrl}`;

  if (channel === 'whatsapp') {
    return sendWhatsApp(recipientPhone, body);
  } else {
    return sendSMS(recipientPhone, body);
  }
}

/**
 * Send an OTP via SMS.
 */
async function sendOTPSMS(phone, otp) {
  const body = `Your Kado verification code is: ${otp}. Valid for 15 minutes.`;
  return sendSMS(phone, body);
}

module.exports = {
  sendSMS,
  sendWhatsApp,
  sendGiftNotification,
  sendOTPSMS,
};
