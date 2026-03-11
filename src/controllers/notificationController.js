'use strict';

const notificationService = require('../services/notificationService');
const { successResponse, paginatedResponse } = require('../utils/formatters');

const getNotifications = async (req, res, next) => {
  try {
    const { page, limit, unread_only } = req.query;
    const result = await notificationService.getUserNotifications(req.userId, {
      page,
      limit,
      unread_only: unread_only === 'true',
    });
    return res.status(200).json({
      success: true,
      data: result.notifications,
      unread_count: result.unread_count,
      pagination: result.pagination,
      message: 'Notifications retrieved.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.userId);
    return successResponse(res, { notification }, 'Notification marked as read.');
  } catch (err) {
    return next(err);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    const count = await notificationService.markAllAsRead(req.userId);
    return successResponse(res, { updated_count: count }, `${count} notification(s) marked as read.`);
  } catch (err) {
    return next(err);
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead };
