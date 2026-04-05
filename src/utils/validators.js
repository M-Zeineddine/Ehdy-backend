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
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('code').notEmpty().withMessage('Reset code is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

const socialLoginValidation = [
  body('provider').isIn(['google', 'apple']).withMessage('Provider must be google or apple'),
  body('id_token').notEmpty().withMessage('ID token is required'),
];

// Admin validators
const adminLoginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const adminSetupValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
  body('first_name').optional().trim().isLength({ max: 100 }),
  body('last_name').optional().trim().isLength({ max: 100 }),
  body('bootstrap_secret').optional().isString(),
];

const adminUserStatusValidation = [
  body('is_active').isBoolean().withMessage('is_active must be a boolean'),
];

const adminMerchantUpdateValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Merchant name is required'),
  body('slug').optional().trim().isLength({ max: 255 }),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('website_url').optional({ values: 'falsy' }).isURL().withMessage('website_url must be a valid URL'),
  body('logo_url').optional({ values: 'falsy' }).isURL().withMessage('logo_url must be a valid URL'),
  body('banner_image_url').optional({ values: 'falsy' }).isURL().withMessage('banner_image_url must be a valid URL'),
  body('category_id').optional().isUUID().withMessage('category_id must be a valid UUID'),
  body('country_code').optional().isLength({ min: 2, max: 2 }).withMessage('country_code must be 2 letters'),
  body('contact_email').optional({ values: 'falsy' }).isEmail().withMessage('contact_email must be valid'),
  body('contact_phone').optional({ values: 'falsy' }).matches(/^\+?[0-9]{7,15}$/).withMessage('Invalid phone number'),
  body('is_active').optional().isBoolean(),
  body('is_verified').optional().isBoolean(),
  body('is_featured').optional().isBoolean(),
];

const adminCreateMerchantValidation = [
  body('name').trim().notEmpty().withMessage('Merchant name is required').isLength({ max: 255 }),
  body('category_id').isUUID().withMessage('category_id is required'),
  ...adminMerchantUpdateValidation,
];

const adminItemUpdateValidation = [
  body('merchant_id').optional().isUUID().withMessage('merchant_id must be a valid UUID'),
  body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Item name is required'),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('image_url').optional({ values: 'falsy' }).isURL().withMessage('image_url must be a valid URL'),
  body('price').optional().isFloat({ min: 0.01 }).withMessage('price must be a positive number'),
  body('currency_code').optional().isLength({ min: 3, max: 3 }).withMessage('currency_code must be 3 letters'),
  body('item_sku').optional().trim().isLength({ max: 100 }),
  body('is_active').optional().isBoolean(),
];

const adminCreateItemValidation = [
  body('merchant_id').isUUID().withMessage('merchant_id is required'),
  body('name').trim().notEmpty().withMessage('Item name is required').isLength({ max: 255 }),
  body('price').isFloat({ min: 0.01 }).withMessage('price must be a positive number'),
  ...adminItemUpdateValidation,
];

const adminStoreCreditUpdateValidation = [
  body('merchant_id').optional().isUUID().withMessage('merchant_id must be a valid UUID'),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('amount must be a positive number'),
  body('currency_code').optional().isLength({ min: 3, max: 3 }).withMessage('currency_code must be 3 letters'),
  body('is_active').optional().isBoolean(),
];

const adminCreateStoreCreditValidation = [
  body('merchant_id').isUUID().withMessage('merchant_id is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be a positive number'),
  ...adminStoreCreditUpdateValidation,
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
  adminLoginValidation,
  adminSetupValidation,
  adminUserStatusValidation,
  adminMerchantUpdateValidation,
  adminCreateMerchantValidation,
  adminItemUpdateValidation,
  adminCreateItemValidation,
  adminStoreCreditUpdateValidation,
  adminCreateStoreCreditValidation,
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
