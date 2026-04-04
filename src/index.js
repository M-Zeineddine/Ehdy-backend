'use strict';

require('dotenv').config();

const path = require('path');
const fs   = require('fs');
const express = require('express');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const cors = require('cors');

const httpLogger = require('./middleware/logger');
const { generalLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const merchantRoutes = require('./routes/merchants');
const giftCardRoutes = require('./routes/giftCards');
const walletRoutes = require('./routes/wallet');
const bundleRoutes = require('./routes/bundles');
const giftRoutes = require('./routes/gifts');
const notificationRoutes = require('./routes/notifications');
const merchantPortalRoutes = require('./routes/merchantPortal');
const analyticsRoutes = require('./routes/analytics');
const webhookRoutes = require('./routes/webhooks');
const giftPageRoutes = require('./routes/giftPage');
const adminRoutes = require('./routes/admin');

const app = express();

// ─── Swagger Docs (dev only) ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Ehdy API Docs',
      customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
    })
  );
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:'],
        frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
  .split(',')
  .map(o => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
  })
);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── HTTP Logging ─────────────────────────────────────────────────────────────
app.use(httpLogger);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/v1/', generalLimiter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const pool = require('./config/database');
  let dbStatus = 'unknown';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch (_err) {
    dbStatus = 'disconnected';
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus,
  });
});

// ─── Email Test (remove before production launch) ─────────────────────────────
app.get('/test-email/:to', async (req, res) => {
  const { to } = req.params;
  try {
    const { sendEmail } = require('./services/emailService');
    await sendEmail({ to, subject: 'Ehdy email test', html: '<h1>It works!</h1><p>Email delivery is configured correctly.</p>' });
    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/v1/auth', authRoutes);
app.use('/v1/users', userRoutes);
app.use('/v1/merchants', merchantRoutes);
app.use('/v1/gift-cards', giftCardRoutes);
app.use('/v1/wallet', walletRoutes);
app.use('/v1/bundles', bundleRoutes);
app.use('/v1/gifts', giftRoutes);
app.use('/v1/notifications', notificationRoutes);
app.use('/v1/merchant', merchantPortalRoutes);
app.use('/v1/analytics', analyticsRoutes);
app.use('/v1/webhooks', webhookRoutes);
app.use('/gift', giftPageRoutes);
app.use('/v1/admin', adminRoutes);

// ─── CMS Static Files ─────────────────────────────────────────────────────────
const cmsOut = path.join(__dirname, '../cms/out');
if (fs.existsSync(cmsOut)) {
  app.use('/cms', express.static(cmsOut));
  // SPA fallback: serve the correct page HTML for any /cms/* path
  app.get('/cms/*', (req, res) => {
    // Strip /cms prefix and try to find a matching exported page
    const subPath = req.path.replace(/^\/cms/, '') || '/';
    const candidates = [
      path.join(cmsOut, subPath, 'index.html'),
      path.join(cmsOut, subPath.replace(/\/$/, ''), 'index.html'),
      path.join(cmsOut, '404.html'),
      path.join(cmsOut, 'index.html'),
    ];
    const file = candidates.find(f => fs.existsSync(f));
    if (file) res.sendFile(file);
    else res.status(404).send('CMS not built yet. Run: cd cms && npm run build');
  });
} else {
  app.get('/cms*', (_req, res) => {
    res.status(503).send('CMS not built yet. Run: cd cms && npm run build');
  });
}

// ─── 404 and Error Handlers ───────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Server Start ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    // Test database connection
    const pool = require('./config/database');
    await pool.query('SELECT 1');
    logger.info('Database connection established');

    // Connect to Redis
    try {
      const { getRedisClient } = require('./config/redis');
      await getRedisClient();
      logger.info('Redis connection established');
    } catch (redisErr) {
      logger.warn('Redis connection failed - some features may be unavailable', {
        error: redisErr.message,
      });
    }

    // Start background jobs
    if (process.env.NODE_ENV !== 'test') {
      try {
        const { scheduleCheckExpiringGifts } = require('./jobs/checkExpiringGifts');
        const { scheduleSyncMerchantBalances } = require('./jobs/syncMerchantBalances');
        scheduleCheckExpiringGifts();
        scheduleSyncMerchantBalances();
        logger.info('Background jobs scheduled');
      } catch (jobErr) {
        logger.warn('Failed to schedule background jobs', { error: jobErr.message });
      }
    }

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Ehdy API server started`, {
        port: PORT,
        host: HOST,
        environment: process.env.NODE_ENV || 'development',
        url: `http://${HOST}:${PORT}`,
      });
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received - shutting down gracefully`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          const pool = require('./config/database');
          await pool.end();
          logger.info('Database pool closed');
        } catch (_err) {
          // ignore
        }

        try {
          const { disconnectRedis } = require('./config/redis');
          await disconnectRedis();
          logger.info('Redis connection closed');
        } catch (_err) {
          // ignore
        }

        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

startServer();

module.exports = app; // Export for testing
