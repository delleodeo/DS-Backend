const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../../auth/auth.controller");
const paymentController = require("./payments.controller");
const paymentValidator = require("../../validators/payment.validator");

/**
 * Payment Routes
 * All routes except webhook require authentication
 */

// ========================================
// PUBLIC ROUTES (Webhook only)
// ========================================

/**
 * @route   POST /api/payments/webhook
 * @desc    Handle PayMongo webhook events
 * @access  Public (with signature verification)
 */
router.post("/webhook", paymentController.handleWebhook);

// ========================================
// PROTECTED ROUTES (Require Authentication)
// ========================================

// Apply authentication middleware to all routes below
router.use(protect);

/**
 * @route   POST /api/payments/checkout
 * @desc    Create payment intent for order checkout  
 * @access  Private (All authenticated users can checkout)
 */
router.post(
  "/checkout",
  restrictTo("user", "vendor", "rider", "admin"),
  paymentValidator.validateCheckoutPayment,
  paymentController.createCheckoutPayment
);

/**
 * @route   POST /api/payments/attach-method
 * @desc    Attach payment method to payment intent
/**
 * @route   POST /api/payments/attach-method
 * @desc    Attach payment method to payment intent
 * @access  Private (All authenticated users can attach payment methods)
 */
router.post(
  "/attach-method",
  restrictTo("user", "vendor", "rider", "admin"),
  paymentValidator.validateAttachPaymentMethod,
  paymentController.attachPaymentMethod
);

/**
 * @route   GET /api/payments/status/:paymentIntentId
 * @desc    Check payment status by intent ID
 * @access  Private (All authenticated users can check payment status)
 */
router.get(
  "/status/:paymentIntentId",
  restrictTo("user", "vendor", "admin", "rider"),
  paymentValidator.validatePaymentIntentId,
  paymentController.checkPaymentStatus
);

/**
 * @route   POST /api/payments/refund
 * @desc    Create refund for a payment
 * @access  Private (Vendor, Admin)
 */
router.post(
  "/refund",
  restrictTo("vendor", "admin"),
  paymentValidator.validateRefund,
  paymentController.createRefund
);

/**
 * @route   POST /api/payments/cash-in
 * @desc    Create cash-in payment (wallet top-up)
 * @access  Private (User, Vendor, Admin)
 */
router.post(
  "/cash-in",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validateCashIn,
  paymentController.createCashIn
);

/**
 * @route   POST /api/payments/withdraw
 * @desc    Create withdrawal request (vendor payout)
 * @access  Private (Vendor only)
 */
router.post(
  "/withdraw",
  restrictTo("vendor"),
  paymentValidator.validateWithdrawal,
  paymentController.createWithdrawal
);

/**
 * @route   GET /api/payments/my-payments
 * @desc    Get user's payment history
 * @access  Private (User, Vendor, Admin)
 */
router.get(
  "/my-payments",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validateGetPayments,
  paymentController.getMyPayments
);

/**
 * @route   GET /api/payments/:id
 * @desc    Get payment details by ID
 * @access  Private (User - own payments only)
 */
router.get(
  "/:id",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validatePaymentId,
  paymentController.getPaymentById
);

/**
 * @route   POST /api/payments/cancel/:paymentIntentId
 * @desc    Cancel a pending payment
 * @access  Private (User, Vendor, Admin)
 */
router.post(
  "/cancel/:paymentIntentId",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validateCancelPayment,
  paymentController.cancelPayment
);

// ========================================
// ADMIN ROUTES (Order Recovery)
// ========================================

/**
 * @route   GET /api/payments/pending-orders
 * @desc    Get payments that succeeded but have no orders created
 * @access  Private (Admin only)
 */
router.get(
  "/pending-orders",
  restrictTo("admin"),
  paymentController.getPendingOrderPayments
);

/**
 * @route   POST /api/payments/:paymentId/recover-orders
 * @desc    Manually trigger order creation for a succeeded payment without orders
 * @access  Private (Admin only)
 */
router.post(
  "/:paymentId/recover-orders",
  restrictTo("admin"),
  paymentController.recoverOrdersForPayment
);

module.exports = router;
