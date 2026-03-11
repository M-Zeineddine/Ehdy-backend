const Stripe = require('stripe');
require('dotenv').config();


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2023-10-16',
  maxNetworkRetries: 3,
  timeout: 10000,
});

module.exports = stripe;
