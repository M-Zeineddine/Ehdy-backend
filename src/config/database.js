const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'kado_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 5,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// If DATABASE_URL is provided, use it directly
if (process.env.DATABASE_URL) {
  delete poolConfig.host;
  delete poolConfig.port;
  delete poolConfig.database;
  delete poolConfig.user;
  delete poolConfig.password;
  poolConfig.connectionString = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === 'production') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  // Connection established
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Do not exit — let pg-pool recover the connection automatically
});

module.exports = pool;
