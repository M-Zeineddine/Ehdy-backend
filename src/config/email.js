const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = process.env.SMTP_USER
  ? nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const emailConfig = {
  fromEmail: process.env.SMTP_USER || 'hello@ehdy.app',
  fromName: process.env.SMTP_FROM_NAME || 'Ehdy',
};

module.exports = { transporter, emailConfig };
