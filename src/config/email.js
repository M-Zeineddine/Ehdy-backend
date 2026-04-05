const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = process.env.SMTP_USER
  ? nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    })
  : null;

const emailConfig = {
  fromEmail: process.env.SMTP_USER || 'hello@ehdy.app',
  fromName: process.env.SMTP_FROM_NAME || 'Ehdy',
};

module.exports = { transporter, emailConfig };
