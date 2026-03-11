'use strict';

const { query, buildPagination } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create an in-app notification.
 * Can be called with a pg client (inside transaction) or without.
 */
async function createNotification(clientOrData, data) {
  // Overloaded: createNotification(data) or createNotification(client, data)
  let client = null;
  let notifData = data;

  if (!data) {
    notifData = clientOrData;
    client = null;
  } else {
    client = clientOrData;
  }

  const {
    userId,
    type,
    title,
    message,
    relatedEntityType,
    relatedEntityId,
    metadata,
  } = notifData;

  const sql = `
    INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`;

  const params = [
    userId,
    type,
    title || null,
    message || null,
    relatedEntityType || null,
    relatedEntityId || null,
    metadata ? JSON.stringify(metadata) : null,
  ];

  const result = client ? await client.query(sql, params) : await query(sql, params);
  return result.rows[0];
}

/**
 * Get notifications for a user.
 */
async function getUserNotifications(userId, { page, limit, unread_only = false }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const conditions = ['user_id = $1'];
  const params = [userId];
  let idx = 2;

  if (unread_only) {
    conditions.push('is_read = FALSE');
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) FROM notifications WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(lim, offset);

  const result = await query(
    `SELECT id, type, title, message, related_entity_type, related_entity_id,
            is_read, read_at, metadata, created_at
     FROM notifications
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  // Unread count
  const unreadResult = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );

  return {
    notifications: result.rows,
    unread_count: parseInt(unreadResult.rows[0].count, 10),
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

/**
 * Mark a notification as read.
 */
async function markAsRead(notificationId, userId) {
  const result = await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Mark all notifications as read for a user.
 */
async function markAllAsRead(userId) {
  const result = await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE
     RETURNING COUNT(*) as updated_count`,
    [userId]
  );

  return result.rowCount;
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
};
