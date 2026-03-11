const twilio = require('twilio');
require('dotenv').config();

if (
  (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) &&
  process.env.NODE_ENV === 'production'
) {
  throw new Error('Twilio credentials are required in production');
}

let twilioClient = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const smsConfig = {
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
};

module.exports = { twilioClient, smsConfig };
