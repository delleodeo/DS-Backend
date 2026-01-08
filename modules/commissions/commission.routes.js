/**
 * Commission Routes
 * API endpoints for commission management
 */
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const commissionController = require('./commission.controller');
const { protect, restrictTo } = require('../../auth/auth.controller');
const rateLimiter = require('../../utils/rateLimiter');

// Rate limiters
const standardLimiter = rateLimiter({
  windowSec: 15 * 60, // 15 minutes
  maxRequests: 100,
  keyPrefix: 'commissions-standard',
  message: 'Too many requests, please try again later'
});

const remitLimiter = rateLimiter({
  windowSec: 60 * 60, // 1 hour
  maxRequests: 30, // 30 remittance attempts per hour
  keyPrefix: 'commissions-remit',
  message: 'Too many remittance attempts. Please try again later.'
});

// Validation rules
const remitValidation = [
  param('commissionId')
    .isMongoId()
    .withMessage('Invalid commission ID')
];

const bulkRemitValidation = [
  body('commissionIds')
    .isArray({ min: 1, max: 20 })
    .withMessage('Please provide 1-20 commission IDs'),
  body('commissionIds.*')
    .isMongoId()
    .withMessage('Invalid commission ID in array')
];

const statusUpdateValidation = [
  param('commissionId')
    .isMongoId()
    .withMessage('Invalid commission ID'),
  body('status')
    .isIn(['pending', 'remitted', 'overdue', 'waived', 'disputed'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters')
];

const listValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['pending', 'remitted', 'overdue', 'waived', 'disputed'])
    .withMessage('Invalid status filter')
];

// ==================== VENDOR ROUTES ====================

/**
 * @route GET /api/v1/commissions/pending
 * @desc Get pending commissions for logged-in vendor
 * @access Private (Vendor only)
 */
router.get(
  '/pending',
  protect,
  restrictTo('vendor'),
  standardLimiter,
  listValidation,
  commissionController.getPendingCommissions
);

/**
 * @route GET /api/v1/commissions/summary
 * @desc Get commission summary for vendor dashboard
 * @access Private (Vendor only)
 */
router.get(
  '/summary',
  protect,
  restrictTo('vendor'),
  standardLimiter,
  commissionController.getCommissionSummary
);

/**
 * @route GET /api/v1/commissions/remittance-history
 * @desc Get remittance history for vendor
 * @access Private (Vendor only)
 */
router.get(
  '/remittance-history',
  protect,
  restrictTo('vendor'),
  standardLimiter,
  commissionController.getRemittanceHistory
);

/**
 * @route POST /api/v1/commissions/:commissionId/remit
 * @desc Remit a single commission via wallet
 * @access Private (Vendor only)
 */
router.post(
  '/:commissionId/remit',
  protect,
  restrictTo('vendor'),
  remitLimiter,
  remitValidation,
  commissionController.remitCommission
);

/**
 * @route POST /api/v1/commissions/bulk-remit
 * @desc Bulk remit multiple commissions
 * @access Private (Vendor only)
 */
router.post(
  '/bulk-remit',
  protect,
  restrictTo('vendor'),
  remitLimiter,
  bulkRemitValidation,
  commissionController.bulkRemitCommissions
);

// ==================== ADMIN ROUTES ====================

/**
 * @route GET /api/v1/commissions/admin/all
 * @desc Get all commissions with filters (admin)
 * @access Private (Admin only)
 */
router.get(
  '/admin/all',
  protect,
  restrictTo('admin'),
  standardLimiter,
  [
    ...listValidation,
    query('vendorId').optional().isMongoId().withMessage('Invalid vendor ID'),
    query('shopId').optional().isMongoId().withMessage('Invalid shop ID'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('sortBy').optional().isIn(['createdAt', 'dueDate', 'commissionAmount', 'status']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ],
  commissionController.getAllCommissions
);

/**
 * @route GET /api/v1/commissions/admin/analytics
 * @desc Get commission analytics (admin)
 * @access Private (Admin only)
 */
router.get(
  '/admin/analytics',
  protect,
  restrictTo('admin'),
  standardLimiter,
  [
    query('period')
      .optional()
      .matches(/^\d+d$/)
      .withMessage('Period must be in format "30d"')
  ],
  commissionController.getCommissionAnalytics
);

/**
 * @route GET /api/v1/commissions/admin/:commissionId
 * @desc Get commission by ID (admin)
 * @access Private (Admin only)
 */
router.get(
  '/admin/:commissionId',
  protect,
  restrictTo('admin'),
  standardLimiter,
  [param('commissionId').isMongoId().withMessage('Invalid commission ID')],
  commissionController.getCommissionById
);

/**
 * @route PATCH /api/v1/commissions/admin/:commissionId/status
 * @desc Update commission status (admin)
 * @access Private (Admin only)
 */
router.patch(
  '/admin/:commissionId/status',
  protect,
  restrictTo('admin'),
  standardLimiter,
  statusUpdateValidation,
  commissionController.updateCommissionStatus
);

/**
 * @route GET /api/v1/commissions/admin/vendors-pending
 * @desc Get all vendors with pending commissions (admin)
 * @access Private (Admin only)
 */
router.get(
  '/admin/vendors-pending',
  protect,
  restrictTo('admin'),
  standardLimiter,
  commissionController.getVendorsWithPendingCommissions
);

/**
 * @route POST /api/v1/commissions/admin/send-reminder
 * @desc Send commission reminder to vendor (admin)
 * @access Private (Admin only)
 */
router.post(
  '/admin/send-reminder',
  protect,
  restrictTo('admin'),
  standardLimiter,
  [body('vendorId').isMongoId().withMessage('Invalid vendor ID')],
  commissionController.sendReminderToVendor
);

module.exports = router;
