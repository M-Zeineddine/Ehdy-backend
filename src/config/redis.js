const { createClient } = require('redis');
require('dotenv').config();

let redisClient = null;
let useInMemory = false;

// In-memory fallback store for development without Redis
const memoryStore = new Map(); // key -> { value, expiresAt }

const inMemoryClient = {
  isReady: true,
  async set(key, value, options) {
    const ttlMs = options && options.EX ? options.EX * 1000 : null;
    memoryStore.set(key, { value: String(value), expiresAt: ttlMs ? Date.now() + ttlMs : null });
  },
  async get(key) {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  },
  async del(key) {
    memoryStore.delete(key);
  },
};

async function getRedisClient() {
  if (useInMemory) return inMemoryClient;
  if (redisClient && redisClient.isReady) return redisClient;

  const clientOptions = {
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries) => {
        if (retries >= 1) return false; // give up after first retry
        return 500;
      },
    },
  };

  if (process.env.REDIS_URL) {
    clientOptions.url = process.env.REDIS_URL;
  } else {
    clientOptions.socket = {
      ...clientOptions.socket,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    };
    if (process.env.REDIS_PASSWORD) {
      clientOptions.password = process.env.REDIS_PASSWORD;
    }
  }

  try {
    const client = createClient(clientOptions);
    client.on('error', () => {}); // suppress error events during probe
    await client.connect();
    redisClient = client;
    console.log('Redis connected');
    return redisClient;
  } catch {
    console.warn('Redis unavailable — using in-memory store (development only)');
    useInMemory = true;
    return inMemoryClient;
  }
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

module.exports = { getRedisClient, disconnectRedis };
