const { Resend } = require('resend');
require('dotenv').config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const emailConfig = {
  fromEmail: process.env.SMTP_USER || 'hello@ehdy.app',
  fromName: process.env.SMTP_FROM_NAME || 'Ehdy',
};

module.exports = { resend, emailConfig };
