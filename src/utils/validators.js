'use strict';

const { body, param, query } = require('express-validator');

// Auth validators
const signupValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
  body('first_name').trim().notEmpty().withMessage('First name is required').isLength({ max: 100 }),
  body('last_name').trim().notEmpty().withMessage('Last name is required').isLength({ max: 100 }),
  body('phone').optional().matches(/^\+?[0-9]{7,15}$/).withMessage('Invalid phone number'),
  body('country_code').optional().isLength({ min: 2, max: 2 }).withMessage('Invalid country code'),
];

const signinValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const verifyEmailValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Verification code must be 6 digits'),
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
];

const socialLoginValidation = [
  body('provider').isIn(['google', 'apple']).withMessage('Provider must be google or apple'),
  body('id_token').notEmpty().withMessage('ID token is required'),
];

// User validators
const updateUserValidation = [
  body('first_name').optional().trim().isLength({ max: 100 }),
  body('last_name').optional().trim().isLength({ max: 100 }),
  body('phone')
    .optional()
    .matches(/^\+?[0-9]{7,15}$/)
    .withMessage('Invalid phone number'),
  body('country_code').optional().isLength({ min: 2, max: 2 }),
  body('language').optional().isLength({ max: 10 }),
  body('date_of_birth').optional().isDate().withMessage('Invalid date of birth'),
];

const changePasswordValidation = [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
];

// Gift validators
const createDraftValidation = [
  body('gift_card_id').optional().isUUID().withMessage('Invalid gift card ID'),
  body('bundle_id').optional().isUUID().withMessage('Invalid bundle ID'),
  body('gift_type').optional().isIn(['store_credit', 'gift_item']),
  body('credit_amount').optional().isFloat({ min: 0.01 }).withMessage('Credit amount must be positive'),
  body('recipient_name').optional().trim().isLength({ max: 100 }),
  body('recipient_email').optional().isEmail().normalizeEmail(),
  body('recipient_phone')
    .optional()
    .matches(/^\+?[0-9]{7,15}$/)
    .withMessage('Invalid phone number'),
  body('personal_message').optional().trim().isLength({ max: 500 }),
  body('theme')
    .optional()
    .isIn(['birthday', 'thank_you', 'love', 'thinking_of_you', 'just_because', 'congratulations']),
  body('delivery_channel').optional().isIn(['email', 'sms', 'whatsapp']),
  body('scheduled_for').optional().isISO8601().withMessage('Invalid scheduled date'),
];

const sendGiftValidation = [
  body('gift_card_id').isUUID().withMessage('Invalid gift card ID'),
  body('recipient_name').trim().notEmpty().withMessage('Recipient name is required'),
  body('delivery_channel')
    .isIn(['email', 'sms', 'whatsapp'])
    .withMessage('Invalid delivery channel'),
  body('recipient_email')
    .if(body('delivery_channel').equals('email'))
    .isEmail()
    .withMessage('Recipient email required for email delivery'),
  body('recipient_phone')
    .if(body('delivery_channel').isIn(['sms', 'whatsapp']))
    .matches(/^\+?[0-9]{7,15}$/)
    .withMessage('Recipient phone required for SMS/WhatsApp delivery'),
  body('stripe_payment_intent_id').notEmpty().withMessage('Payment intent ID is required'),
  body('personal_message').optional().trim().isLength({ max: 500 }),
  body('theme')
    .optional()
    .isIn(['birthday', 'thank_you', 'love', 'thinking_of_you', 'just_because', 'congratulations']),
];

// Purchase validators
const createPurchaseValidation = [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.gift_card_id').isUUID().withMessage('Invalid gift card ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
  body('currency_code').optional().isLength({ min: 3, max: 3 }),
  body('payment_method').optional().isString(),
];

// Bundle validators
const createBundleValidation = [
  body('name').trim().notEmpty().withMessage('Bundle name is required').isLength({ max: 255 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('theme')
    .optional()
    .isIn(['birthday', 'thank_you', 'love', 'thinking_of_you', 'just_because', 'congratulations']),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.gift_card_id').isUUID().withMessage('Invalid gift card ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
  body('is_template').optional().isBoolean(),
];

// Merchant portal validators
const merchantLoginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const validateRedemptionValidation = [
  body('redemption_code')
    .trim()
    .notEmpty()
    .withMessage('Redemption code is required')
    .matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    .withMessage('Invalid redemption code format'),
];

const confirmRedemptionValidation = [
  body('redemption_code').trim().notEmpty().withMessage('Redemption code is required'),
  body('amount_to_redeem')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be positive'),
];

// Pagination validators
const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
];

// UUID param validator
const uuidParamValidation = (paramName = 'id') => [
  param(paramName).isUUID().withMessage(`Invalid ${paramName}`),
];

module.exports = {
  signupValidation,
  signinValidation,
  verifyEmailValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  socialLoginValidation,
  updateUserValidation,
  changePasswordValidation,
  createDraftValidation,
  sendGiftValidation,
  createPurchaseValidation,
  createBundleValidation,
  merchantLoginValidation,
  validateRedemptionValidation,
  confirmRedemptionValidation,
  paginationValidation,
  uuidParamValidation,
};
