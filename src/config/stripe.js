const Stripe = require('stripe');
require('dotenv').config();

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV === 'production') {
  throw new Error('STRIPE_SECRET_KEY environment variable is required in production');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2023-10-16',
  maxNetworkRetries: 3,
  timeout: 10000,
});

module.exports = stripe;
