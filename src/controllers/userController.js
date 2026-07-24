'use strict';

const multer = require('multer');
const crypto = require('crypto');
const userService = require('../services/userService');
const { getStorage, USER_ASSETS_BUCKET } = require('../config/supabase');
const { successResponse, sanitizeUser } = require('../utils/formatters');
const { AppError } = require('../middleware/errorHandler');

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

// ─── Avatar upload (Supabase Storage, served from the public CDN URL) ────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const uploadAvatarMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new AppError('Only JPEG, PNG or WebP images are allowed', 400, 'INVALID_IMAGE_TYPE'));
    }
    return cb(null, true);
  },
}).single('image');

const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('Image file is required (field name: image)', 400, 'IMAGE_REQUIRED'));
    }
    const key = `users/${req.userId}/${crypto.randomUUID()}.${IMAGE_EXT[req.file.mimetype]}`;
    const storage = getStorage();
    const { error } = await storage
      .from(USER_ASSETS_BUCKET)
      .upload(key, req.file.buffer, { contentType: req.file.mimetype });
    if (error) {
      return next(new AppError(`Image upload failed: ${error.message}`, 502, 'UPLOAD_FAILED'));
    }
    const { data } = storage.from(USER_ASSETS_BUCKET).getPublicUrl(key);
    const user = await userService.updateUser(req.userId, { profile_picture_url: data.publicUrl });
    return successResponse(res, { user: sanitizeUser(user) }, 'Profile picture updated.');
  } catch (err) {
    return next(err);
  }
};

module.exports = { getMe, updateMe, changePassword, deleteMe, uploadAvatarMiddleware, uploadAvatar };
