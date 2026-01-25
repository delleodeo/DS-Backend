const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../../auth/auth.controller");
const paymentController = require("./payments.controller");
const paymentValidator = require("../../validators/payment.validator");

router.post("/webhook", paymentController.handleWebhook);

router.use(protect);

router.post(
  "/checkout",
  restrictTo("user", "vendor", "rider", "admin"),
  paymentValidator.validateCheckoutPayment,
  paymentController.createCheckoutPayment
);

// Create subscription payment (QRPH)
router.post(
  "/subscription",
  restrictTo("vendor"),
  paymentController.createSubscriptionPayment
);

router.post(
  "/attach-method",
  restrictTo("user", "vendor", "rider", "admin"),
  paymentValidator.validateAttachPaymentMethod,
  paymentController.attachPaymentMethod
);

router.get(
  "/status/:paymentIntentId",
  restrictTo("user", "vendor", "admin", "rider"),
  paymentValidator.validatePaymentIntentId,
  paymentController.checkPaymentStatus
);

router.post(
  "/refund",
  restrictTo("vendor", "admin"),
  paymentValidator.validateRefund,
  paymentController.createRefund
);

router.post(
  "/cash-in",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validateCashIn,
  paymentController.createCashIn
);

router.post(
  "/withdraw",
  restrictTo("vendor"),
  paymentValidator.validateWithdrawal,
  paymentController.createWithdrawal
);

router.post(
  "/:paymentId/cancel-withdrawal",
  restrictTo("vendor"),
  paymentValidator.validatePaymentId,
  paymentController.cancelWithdrawal
);

router.get(
  "/my-payments",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validateGetPayments,
  paymentController.getMyPayments
);

router.get(
  "/:paymentIntentId/qr",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validatePaymentIntentId,
  paymentController.getQRCode
);

router.get(
  "/:id",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validatePaymentId,
  paymentController.getPaymentById
);

router.post(
  "/cancel/:paymentIntentId",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validateCancelPayment,
  paymentController.cancelPayment
);

router.get(
  "/:id/qr/download",
  restrictTo("user", "vendor", "admin"),
  paymentValidator.validatePaymentId,
  paymentController.downloadQRCode
);

router.get(
  "/pending-orders",
  restrictTo("admin"),
  paymentController.getPendingOrderPayments
);

router.post(
  "/:paymentId/approve",
  restrictTo("admin"),
  paymentValidator.validatePaymentId,
  paymentController.approveWithdrawal
);

router.post(
  "/:paymentId/reject",
  restrictTo("admin"),
  paymentValidator.validatePaymentId,
  paymentController.rejectWithdrawal
);

router.get(
  "/vendor/withdrawals",
  restrictTo("vendor"),
  paymentController.getVendorWithdrawals
);

router.get(
  "/admin/withdrawals",
  restrictTo("admin"),
  paymentController.getWithdrawalsForAdmin
);

router.post(
  "/:paymentId/status",
  restrictTo("admin"),
  paymentValidator.validatePaymentId,
  paymentController.updateWithdrawalStatus
);

router.post(
  "/:paymentId/recover-orders",
  restrictTo("admin"),
  paymentController.recoverOrdersForPayment
);

module.exports = router;
