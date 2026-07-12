'use strict';

const logger = require('../utils/logger');

/**
 * Known placeholder secret values that must never reach production.
 */
const KNOWN_PLACEHOLDERS = [
  'your-super-secret-jwt-key-change-in-production',
  'your-super-secret-refresh-key-change-in-production',
  'change-in-production',
  'changeme',
  'secret',
];

const MIN_SECRET_LENGTH = 32;

/**
 * Collect environment problems. Returns an array of human-readable messages.
 */
function collectProblems() {
  const problems = [];

  const checkSecret = (name) => {
    const val = process.env[name];
    if (!val) {
      problems.push(`${name} is missing`);
      return;
    }
    if (val.length < MIN_SECRET_LENGTH) {
      problems.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`);
    }
    if (KNOWN_PLACEHOLDERS.includes(val.trim().toLowerCase())) {
      problems.push(`${name} is a known placeholder value`);
    }
  };

  checkSecret('JWT_SECRET');
  checkSecret('JWT_REFRESH_SECRET');

  if (!process.env.TAP_SECRET_KEY) {
    problems.push('TAP_SECRET_KEY is missing or empty');
  }

  if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
    problems.push('DATABASE_URL or DB_PASSWORD must be set');
  }

  if ((process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).includes('*')) {
    problems.push('CORS_ORIGIN must not contain "*" (wildcard + credentials is unsafe)');
  }

  return problems;
}

/**
 * Validate required environment configuration.
 * In production, throws and refuses to boot on any problem.
 * In other environments, logs loud warnings but allows boot.
 */
function validateEnv() {
  const problems = collectProblems();
  if (problems.length === 0) return;

  const isProd = process.env.NODE_ENV === 'production';
  const header = `Environment validation found ${problems.length} problem(s):`;
  const body = problems.map((p) => `  - ${p}`).join('\n');

  if (isProd) {
    throw new Error(`${header}\n${body}\nRefusing to start in production.`);
  }

  logger.warn(`${header}\n${body}\n(allowed in ${process.env.NODE_ENV || 'development'} — would refuse to boot in production)`);
}

module.exports = { validateEnv };
