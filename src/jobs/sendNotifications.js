'use strict';

const Bull = require('bull');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');

// Create Bull queue
const notificationQueue = new Bull('notifications', {
  redis: {
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

/**
 * Add an email notification job to the queue.
 */
async function enqueueEmailNotification(data) {
  return notificationQueue.add('email', data);
}

/**
 * Add an SMS notification job to the queue.
 */
async function enqueueSMSNotification(data) {
  return notificationQueue.add('sms', data);
}

/**
 * Add a WhatsApp notification job to the queue.
 */
async function enqueueWhatsAppNotification(data) {
  return notificationQueue.add('whatsapp', data);
}

// Process email jobs
notificationQueue.process('email', async (job) => {
  const { to, subject, html, text } = job.data;
  logger.debug('Processing email notification job', { jobId: job.id, to });
  await emailService.sendEmail({ to, subject, html, text });
  return { sent: true };
});

// Process SMS jobs
notificationQueue.process('sms', async (job) => {
  const { to, body } = job.data;
  logger.debug('Processing SMS notification job', { jobId: job.id, to });
  await smsService.sendSMS(to, body);
  return { sent: true };
});

// Process WhatsApp jobs
notificationQueue.process('whatsapp', async (job) => {
  const { to, body } = job.data;
  logger.debug('Processing WhatsApp notification job', { jobId: job.id, to });
  await smsService.sendWhatsApp(to, body);
  return { sent: true };
});

// Event handlers
notificationQueue.on('completed', (job) => {
  logger.debug('Notification job completed', { jobId: job.id, type: job.name });
});

notificationQueue.on('failed', (job, err) => {
  logger.error('Notification job failed', {
    jobId: job.id,
    type: job.name,
    attempts: job.attemptsMade,
    error: err.message,
  });
});

notificationQueue.on('error', (err) => {
  logger.error('Notification queue error', { error: err.message });
});

module.exports = {
  notificationQueue,
  enqueueEmailNotification,
  enqueueSMSNotification,
  enqueueWhatsAppNotification,
};
