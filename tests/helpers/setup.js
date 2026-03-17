'use strict';

// Set test environment variables before any modules are loaded.
// This file runs via jest.config.js setupFiles.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-kado-2024-unit';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-kado-2024-unit';
process.env.JWT_ACCESS_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.BACKEND_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_kado';
