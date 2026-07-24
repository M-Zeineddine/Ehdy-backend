'use strict';

const userService = require('../services/userService');
const { successResponse, sanitizeUser } = require('../utils/formatters');

const getMe = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.userId);
    return successResponse(res, { user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
};

const updateMe = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.userId, req.body);
    return successResponse(res, { user: sanitizeUser(user) }, 'Profile updated.');
  } catch (err) {
    return next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    await userService.changePassword(req.userId, { current_password, new_password });
    return successResponse(res, null, 'Password changed successfully.');
  } catch (err) {
    return next(err);
  }
};

const deleteMe = async (req, res, next) => {
  try {
    await userService.deleteUser(req.userId);
    return successResponse(res, null, 'Account deactivated successfully.');
  } catch (err) {
    return next(err);
  }
};

module.exports = { getMe, updateMe, changePassword, deleteMe };
