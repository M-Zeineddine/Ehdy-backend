'use strict';

/**
 * Integration tests for auth routes.
 * These tests require a running PostgreSQL instance and Redis.
 * Set TEST_DATABASE_URL and TEST_REDIS_URL env vars, or they use defaults.
 *
 * Run with: jest tests/integration/auth.test.js --runInBand
 */

const request = require('supertest');

// Mock external services before requiring app
jest.mock('../../src/config/email', () => ({
  sgMail: { send: jest.fn().mockResolvedValue([{ statusCode: 202 }]) },
  emailConfig: { fromEmail: 'test@ehdy.app', fromName: 'Ehdy Test' },
}));

jest.mock('../../src/config/sms', () => ({
  twilioClient: null,
  smsConfig: { phoneNumber: '+1234567890', whatsappNumber: 'whatsapp:+14155238886' },
}));

jest.mock('../../src/config/stripe', () => ({
  paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
  customers: { create: jest.fn() },
}));

// Mock Redis
jest.mock('../../src/config/redis', () => {
  const store = new Map();
  return {
    getRedisClient: jest.fn().mockResolvedValue({
      get: jest.fn().mockImplementation(key => Promise.resolve(store.get(key) || null)),
      set: jest.fn().mockImplementation((key, val) => { store.set(key, val); return Promise.resolve('OK'); }),
      del: jest.fn().mockImplementation(key => { store.delete(key); return Promise.resolve(1); }),
      isReady: true,
    }),
    disconnectRedis: jest.fn().mockResolvedValue(undefined),
  };
});

let app;
let pool;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
  process.env.JWT_ACCESS_EXPIRES_IN = '1h';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';

  // Use test database if available
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }

  // Prevent src/index.js from calling process.exit(1) when DB is unavailable
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

  try {
    app = require('../../src/index');
    pool = require('../../src/config/database');
    // Wait briefly for async server startup to complete (or fail)
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (err) {
    console.warn('Could not load app - integration tests require database:', err.message);
  } finally {
    exitSpy.mockRestore();
  }
}, 30000);

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
}, 10000);

const testUser = {
  email: `test_${Date.now()}@example.com`,
  password: 'Test123!',
  first_name: 'Test',
  last_name: 'User',
};

describe('POST /v1/auth/signup', () => {
  it('should create a new user and return 201', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app)
      .post('/v1/auth/signup')
      .send(testUser)
      .expect('Content-Type', /json/);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('should return 422 for missing required fields', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'incomplete@example.com' })
      .expect('Content-Type', /json/);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 422 for invalid email', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app)
      .post('/v1/auth/signup')
      .send({ ...testUser, email: 'not-an-email' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should return 409 for duplicate email', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    // Second signup with same email
    const res = await request(app)
      .post('/v1/auth/signup')
      .send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('should return 422 for weak password', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app)
      .post('/v1/auth/signup')
      .send({ ...testUser, email: `other_${Date.now()}@example.com`, password: 'weak' });

    expect(res.status).toBe(422);
  });
});

describe('POST /v1/auth/signin', () => {
  it('should return 401 for wrong password', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app)
      .post('/v1/auth/signin')
      .send({ email: testUser.email, password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return 401 for non-existent user', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app)
      .post('/v1/auth/signin')
      .send({ email: 'nobody@example.com', password: 'Test123!' });

    expect(res.status).toBe(401);
  });

  it('should sign in successfully with correct credentials', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app)
      .post('/v1/auth/signin')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeDefined();
    expect(res.body.data.refresh_token).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email);
  });
});

describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /v1/auth/forgot-password', () => {
  it('should return 200 regardless of whether email exists (no enumeration)', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app)
      .post('/v1/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown routes', async () => {
    if (!app) {
      return console.warn('Skipping - no database connection');
    }

    const res = await request(app).get('/v1/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
