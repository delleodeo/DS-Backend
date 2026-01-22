
const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const notificationController = require('./notification.controller');
const { protect } = require('../../auth/auth.controller');
const rateLimiter = require('../../utils/rateLimiter');

// Rate limiter
const standardLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50
});

// Validation rules
const notificationIdValidation = [
  param('notificationId')
    .isMongoId()
    .withMessage('Invalid notification ID')
];

const listValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('type')
    .optional()
    .isString()
    .withMessage('Type must be a string'),
  query('unreadOnly')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('unreadOnly must be true or false')
];


router.get(
  '/',
  protect,
  standardLimiter,
  listValidation,
  notificationController.getNotifications
);

/**
 * @route GET /api/v1/notifications/unread-count
 * @desc Get unread notification count
 * @access Private
 */
router.get(
  '/unread-count',
  protect,
  standardLimiter,
  notificationController.getUnreadCount
);

/**
 * @route PATCH /api/v1/notifications/:notificationId/read
 * @desc Mark notification as read
 * @access Private
 */
router.patch(
  '/:notificationId/read',
  protect,
  standardLimiter,
  notificationIdValidation,
  notificationController.markAsRead
);

/**
 * @route PATCH /api/v1/notifications/read-all
 * @desc Mark all notifications as read
 * @access Private
 */
router.patch(
  '/read-all',
  protect,
  standardLimiter,
  notificationController.markAllAsRead
);

/**
 * @route DELETE /api/v1/notifications/:notificationId
 * @desc Delete a notification
 * @access Private
 */
router.delete(
  '/:notificationId',
  protect,
  standardLimiter,
  notificationIdValidation,
  notificationController.deleteNotification
);

/**
 * @route DELETE /api/v1/notifications/read
 * @desc Delete all read notifications
 * @access Private
 */
router.delete(
  '/read',
  protect,
  standardLimiter,
  notificationController.deleteReadNotifications
);

module.exports = router;
