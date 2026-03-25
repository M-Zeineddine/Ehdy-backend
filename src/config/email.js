const { Resend } = require('resend');
require('dotenv').config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const emailConfig = {
  fromEmail: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
  fromName: process.env.RESEND_FROM_NAME || 'Ehdy',
};

module.exports = { resend, emailConfig };
