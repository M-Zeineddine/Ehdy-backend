const pool = require('../config/database');
const logger = require('./logger');

/**
 * Execute a single query against the pool.
 * @param {string} text  - SQL query text
 * @param {Array}  params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Executed query', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    logger.error('Database query error', { text, params, error: err.message });
    throw err;
  }
}

/**
 * Get a client from the pool (for manual transaction management).
 * Caller is responsible for calling client.release().
 */
async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const start = Date.now();

  // Monkey-patch to log slow queries
  client.query = (...args) => {
    const duration = Date.now() - start;
    if (duration > 5000) {
      logger.warn('Slow query detected', { duration });
    }
    return originalQuery(...args);
  };

  return client;
}

/**
 * Run a function inside a transaction.
 * Automatically commits on success, rolls back on error.
 * @param {Function} fn - Async function that receives (client) as argument
 */
async function withTransaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Build a paginated query helper.
 */
function buildPagination(page = 1, limit = 20) {
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;
  return { page: pageNum, limit: limitNum, offset };
}

module.exports = { query, getClient, withTransaction, buildPagination };
