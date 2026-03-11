'use strict';

const morgan = require('morgan');
const logger = require('../utils/logger');

// Create a Morgan stream that writes to Winston
const morganStream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Morgan format: combined in prod, dev in dev
const morganFormat =
  process.env.NODE_ENV === 'production'
    ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    : ':method :url :status :response-time ms - :res[content-length]';

const httpLogger = morgan(morganFormat, { stream: morganStream });

module.exports = httpLogger;
