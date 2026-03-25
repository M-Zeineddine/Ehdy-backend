'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ehdy API',
      version: '1.0.0',
      description:
        'Ehdy gifting platform API — send store credit and gift items to anyone, redeemable via QR code.',
      contact: {
        name: 'Ehdy Team',
        email: 'dev@ehdy.app',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/v1',
        description: 'Local development',
      },
      {
        url: 'https://api.ehdy.app/v1',
        description: 'Production',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
      schemas: {
        // ── Common ────────────────────────────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string', example: 'Success' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: { type: 'object', nullable: true },
              },
            },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },

        // ── Auth ──────────────────────────────────────────────────────────────
        SignupRequest: {
          type: 'object',
          required: ['email', 'password', 'first_name', 'last_name'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', minLength: 8, example: 'SecurePass123!' },
            first_name: { type: 'string', example: 'Rami' },
            last_name: { type: 'string', example: 'Khalil' },
            country_code: { type: 'string', example: 'LB' },
            phone: { type: 'string', example: '+9611234567' },
          },
        },
        SigninRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', example: 'SecurePass123!' },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            expires_in: { type: 'integer', example: 3600 },
          },
        },

        // ── User ──────────────────────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            country_code: { type: 'string', example: 'LB' },
            currency_code: { type: 'string', example: 'LBP' },
            is_email_verified: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },

        // ── Merchant ──────────────────────────────────────────────────────────
        Merchant: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Cafe Younes' },
            slug: { type: 'string', example: 'cafe-younes' },
            description: { type: 'string', nullable: true },
            logo_url: { type: 'string', nullable: true },
            category_name: { type: 'string', example: 'Coffee & Cafes' },
            country_code: { type: 'string', example: 'LB' },
            city: { type: 'string', example: 'Beirut' },
            rating: { type: 'number', example: 4.8 },
            review_count: { type: 'integer', example: 1240 },
          },
        },

        // ── Gift Card ─────────────────────────────────────────────────────────
        GiftCard: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            merchant_id: { type: 'string', format: 'uuid' },
            merchant_name: { type: 'string' },
            name: { type: 'string', example: '50,000 LBP Store Credit' },
            type: { type: 'string', enum: ['store_credit', 'gift_item'] },
            credit_amount: { type: 'number', nullable: true, example: 50000 },
            item_name: { type: 'string', nullable: true },
            item_price: { type: 'number', nullable: true },
            currency_code: { type: 'string', example: 'LBP' },
            is_active: { type: 'boolean' },
          },
        },

        // ── Gift Draft ────────────────────────────────────────────────────────
        CreateDraftRequest: {
          type: 'object',
          required: ['gift_card_id', 'delivery_channel'],
          properties: {
            gift_card_id: { type: 'string', format: 'uuid' },
            delivery_channel: { type: 'string', enum: ['email', 'sms', 'whatsapp'] },
            sender_name: { type: 'string', example: 'Rami' },
            recipient_name: { type: 'string', example: 'Mabrouk' },
            personal_message: { type: 'string', example: 'Enjoy your coffee!' },
            theme: {
              type: 'string',
              enum: ['birthday', 'thank_you', 'love', 'thinking_of_you', 'just_because', 'congratulations'],
            },
            recipient_phone: { type: 'string', example: '+9611234567' },
            recipient_email: { type: 'string', format: 'email' },
            scheduled_for: { type: 'string', format: 'date-time', nullable: true },
          },
        },

        // ── Purchase ──────────────────────────────────────────────────────────
        CreatePurchaseRequest: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['gift_card_id', 'quantity'],
                properties: {
                  gift_card_id: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1, example: 1 },
                },
              },
            },
            payment_method: { type: 'string', example: 'card' },
          },
        },

        // ── Wallet Item ───────────────────────────────────────────────────────
        WalletItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            gift_instance_id: { type: 'string', format: 'uuid' },
            redemption_code: { type: 'string', example: 'LT88-82AB' },
            redemption_qr_code: { type: 'string', description: 'Base64 PNG data URL', nullable: true },
            current_balance: { type: 'number', nullable: true, example: 50000 },
            initial_balance: { type: 'number', nullable: true },
            item_claimed: { type: 'boolean' },
            is_redeemed: { type: 'boolean' },
            expiration_date: { type: 'string', format: 'date', nullable: true },
            is_favorite: { type: 'boolean' },
            gift_card: { $ref: '#/components/schemas/GiftCard' },
            merchant_name: { type: 'string' },
            received_at: { type: 'string', format: 'date-time' },
          },
        },

        // ── Bundle ────────────────────────────────────────────────────────────
        CreateBundleRequest: {
          type: 'object',
          required: ['name', 'items'],
          properties: {
            name: { type: 'string', example: 'Adventure Day' },
            description: { type: 'string' },
            theme: { type: 'string', enum: ['birthday', 'thank_you', 'love', 'thinking_of_you', 'just_because', 'congratulations'] },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['gift_card_id', 'quantity'],
                properties: {
                  gift_card_id: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },

        // ── Merchant Portal ───────────────────────────────────────────────────
        ValidateRedemptionRequest: {
          type: 'object',
          required: ['redemption_code'],
          properties: {
            redemption_code: { type: 'string', example: 'LT88-82AB' },
          },
        },
        ConfirmRedemptionRequest: {
          type: 'object',
          required: ['redemption_code'],
          properties: {
            redemption_code: { type: 'string', example: 'LT88-82AB' },
            amount_paid: { type: 'number', example: 8500, description: 'For store credit only' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'User authentication & registration' },
      { name: 'Users', description: 'User profile management' },
      { name: 'Merchants', description: 'Browse merchants and categories' },
      { name: 'Gift Cards', description: 'Gift card catalog' },
      { name: 'Gifts', description: 'Send and receive gifts' },
      { name: 'Purchases', description: 'Buy gift cards via Stripe' },
      { name: 'Wallet', description: 'Manage received gifts' },
      { name: 'Bundles', description: 'Create and send gift bundles' },
      { name: 'Notifications', description: 'User notifications' },
      { name: 'Merchant Portal', description: 'Merchant login & redemption validation' },
      { name: 'Analytics', description: 'User analytics dashboard' },
      { name: 'Health', description: 'Server health check' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
