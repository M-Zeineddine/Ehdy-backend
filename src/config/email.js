const sgMail = require('@sendgrid/mail');
require('dotenv').config();


if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const emailConfig = {
  fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@kado.app',
  fromName: process.env.SENDGRID_FROM_NAME || 'Kado',
};

module.exports = { sgMail, emailConfig };
