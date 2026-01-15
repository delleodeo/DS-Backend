/**
 * Wallet Routes
 * API endpoints for wallet operations
 */
const express = require('express');
const router = express.Router();
const { param, query, body } = require('express-validator');
const walletController = require('./wallet.controller');
const { protect, restrictTo } = require('../../auth/auth.controller');
const rateLimiter = require('../../utils/rateLimiter');

// Standard rate limiter
const standardLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100
});

const financialLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5
});


// Validation rules
const userIdValidation = [
  param('userId').isMongoId().withMessage('Invalid user ID')
];

const lockValidation = [
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('reason')
    .notEmpty()
    .withMessage('Reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters')
];

const historyValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  query('type').optional().isIn(['credit', 'debit']).withMessage('Invalid type'),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'reversed']).withMessage('Invalid status'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date')
];

// ==================== USER ROUTES ====================

/**
 * @route GET /api/v1/wallet/balance
 * @desc Get wallet balance
 * @access Private
 */
router.get(
  '/balance',
  protect,
  standardLimiter,
  walletController.getBalance
);

/**
 * @route GET /api/v1/wallet
 * @desc Get wallet details
 * @access Private
 */
router.get(
  '/',
  protect,
  standardLimiter,
  walletController.getWalletDetails
);

/**
 * @route GET /api/v1/wallet/transactions
 * @desc Get transaction history
 * @access Private
 */
router.get(
  '/transactions',
  protect,
  standardLimiter,
  historyValidation,
  walletController.getTransactionHistory
);

/**
 * @route GET /api/v1/wallet/verify
 * @desc Verify wallet balance integrity
 * @access Private
 */
router.get(
  '/verify',
  protect,
  financialLimiter,
  walletController.verifyBalance
);

// ==================== ADMIN ROUTES ====================

/**
 * @route GET /api/v1/wallet/admin/:userId
 * @desc Get user wallet details (admin)
 * @access Private (Admin only)
 */
router.get(
  '/admin/:userId',
  protect,
  restrictTo('admin'),
  standardLimiter,
  userIdValidation,
  walletController.getAdminWalletDetails
);

/**
 * @route POST /api/v1/wallet/admin/:userId/lock
 * @desc Lock user wallet (admin)
 * @access Private (Admin only)
 */
router.post(
  '/admin/:userId/lock',
  protect,
  restrictTo('admin'),
  financialLimiter,
  lockValidation,
  walletController.lockWallet
);

/**
 * @route POST /api/v1/wallet/admin/:userId/unlock
 * @desc Unlock user wallet (admin)
 * @access Private (Admin only)
 */
router.post(
  '/admin/:userId/unlock',
  protect,
  restrictTo('admin'),
  financialLimiter,
  userIdValidation,
  walletController.unlockWallet
);

module.exports = router;
