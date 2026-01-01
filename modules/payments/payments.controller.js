const paymentService = require("./payments.service");
const { asyncHandler, ValidationError } = require("../../utils/errorHandler");
const logger = require("../../utils/logger");

/**
 * Payment Controller
 * Handles HTTP requests and delegates to service layer
 */

/**
 * @route   POST /api/payments/checkout
 * @desc    Create payment intent for order checkout
 * @access  Private (User)
 */
exports.createCheckoutPayment = asyncHandler(async (req, res) => {
  const { orderId, amount, description, metadata, paymentMethod, checkoutData } = req.body;
  const userId = req.user.id;

  // Check if this is a QRPH payment (pre-order payment)
  if (paymentMethod === 'qrph' && !orderId) {
    // Validate checkoutData is provided for QRPH payments
    if (!checkoutData) {
      throw new ValidationError("Checkout data is required for QRPH payments");
    }
    if (!checkoutData.items || checkoutData.items.length === 0) {
      throw new ValidationError("Cart items are required for QRPH payments");
    }

    const result = await paymentService.createQRPHPayment(
      userId,
      amount,
      description,
      metadata,
      checkoutData
    );

    return res.status(201).json({
      success: true,
      message: "QRPH payment created successfully",
      payment: {
        _id: result.payment._id,
        paymentIntentId: result.paymentIntentId,
        status: result.payment.status,
        amount: result.payment.amount / 100, // Convert back to PHP for frontend
        currency: result.payment.currency,
        qrCodeUrl: result.qrCodeUrl,
        expiresAt: result.payment.expiresAt,
      },
    });
  }

  const result = await paymentService.createCheckoutPayment(
    userId,
    orderId,
    amount,
    description,
    metadata
  );

  res.status(201).json({
    success: true,
    message: "Payment intent created successfully",
    data: {
      paymentId: result.payment._id,
      paymentIntentId: result.paymentIntentId,
      clientKey: result.clientKey,
      amount: result.payment.amount,
      currency: result.payment.currency,
      status: result.payment.status,
    },
  });
});

/**
 * @route   POST /api/payments/attach-method
 * @desc    Attach payment method to payment intent
 * @access  Private (User)
 */
exports.attachPaymentMethod = asyncHandler(async (req, res) => {
  const { paymentIntentId, paymentMethodId, returnUrl } = req.body;
  const userId = req.user.id;

  const result = await paymentService.attachPaymentMethod(
    userId,
    paymentIntentId,
    paymentMethodId,
    returnUrl
  );

  res.status(200).json({
    success: true,
    message: "Payment method attached successfully",
    data: {
      paymentId: result.payment._id,
      status: result.payment.status,
      nextAction: result.nextAction,
    },
  });
});

/**
 * @route   GET /api/payments/status/:paymentIntentId
 * @desc    Check payment status by intent ID
 * @access  Private (User)
 */
exports.checkPaymentStatus = asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.params;

  const payment = await paymentService.checkPaymentStatus(paymentIntentId);

  res.status(200).json({
    success: true,
    data: {
      paymentId: payment._id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      type: payment.type,
      paidAt: payment.paidAt,
      isFinal: payment.isFinal,
      // Include order creation status for QRPH payments
      ordersCreated: payment.ordersCreated || false,
      orderIds: payment.orderIds || [],
      orderCreationError: payment.orderCreationError || null,
    },
  });
});

/**
 * @route   POST /api/payments/refund
 * @desc    Create refund for a payment
 * @access  Private (Vendor/Admin)
 */
exports.createRefund = asyncHandler(async (req, res) => {
  const { paymentId, amount, reason, metadata } = req.body;
  const userId = req.user.id;

  const refund = await paymentService.createRefund(
    userId,
    paymentId,
    amount,
    reason,
    metadata
  );

  res.status(201).json({
    success: true,
    message: "Refund initiated successfully",
    data: {
      refundId: refund._id,
      amount: refund.amount,
      status: refund.status,
      originalPaymentId: paymentId,
    },
  });
});

/**
 * @route   POST /api/payments/cash-in
 * @desc    Create cash-in payment (wallet top-up)
 * @access  Private (User)
 */
exports.createCashIn = asyncHandler(async (req, res) => {
  const { amount, paymentMethod } = req.body;
  const userId = req.user.id;

  const result = await paymentService.createCashIn(userId, amount, paymentMethod);

  res.status(201).json({
    success: true,
    message: "Cash-in payment created successfully",
    data: {
      paymentId: result.payment._id,
      paymentIntentId: result.paymentIntentId,
      clientKey: result.clientKey,
      amount: result.payment.amount,
      fee: result.payment.fee,
      netAmount: result.payment.netAmount,
      status: result.payment.status,
    },
  });
});

/**
 * @route   POST /api/payments/withdraw
 * @desc    Create withdrawal request (vendor payout)
 * @access  Private (Vendor)
 */
exports.createWithdrawal = asyncHandler(async (req, res) => {
  const { amount, bankAccount } = req.body;
  const vendorId = req.user.id;

  const payment = await paymentService.createWithdrawal(vendorId, amount, bankAccount);

  res.status(201).json({
    success: true,
    message: "Withdrawal request created successfully",
    data: {
      paymentId: payment._id,
      amount: payment.amount,
      fee: payment.fee,
      netAmount: payment.netAmount,
      status: payment.status,
      bankAccount: {
        accountName: payment.bankAccount.accountName,
        bankName: payment.bankAccount.bankName,
        // Don't expose full account number
        accountNumber: `****${payment.bankAccount.accountNumber.slice(-4)}`,
      },
    },
  });
});

/**
 * @route   GET /api/payments/my-payments
 * @desc    Get user's payment history
 * @access  Private (User)
 */
exports.getMyPayments = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { type, limit } = req.query;

  const payments = await paymentService.getUserPayments(
    userId,
    type,
    parseInt(limit) || 50
  );

  res.status(200).json({
    success: true,
    count: payments.length,
    data: payments,
  });
});

/**
 * @route   POST /api/payments/webhook
 * @desc    Handle PayMongo webhook events
 * @access  Public (with signature verification)
 */
exports.handleWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers["paymongo-signature"];
  const payload = req.body;

  await paymentService.processWebhook(payload, signature);

  // Always return 200 to acknowledge receipt
  res.status(200).json({ received: true });
});

/**
 * @route   GET /api/payments/:id
 * @desc    Get payment details by ID
 * @access  Private (User - own payments only)
 */
exports.getPaymentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const Payment = require("./payments.model");
  const payment = await Payment.findById(id).populate("orderId", "items subTotal status");

  if (!payment) {
    return res.status(404).json({
      success: false,
      error: { message: "Payment not found" },
    });
  }

  // Check ownership
  if (payment.userId.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      error: { message: "Access denied" },
    });
  }

  res.status(200).json({
    success: true,
    data: payment,
  });
});

/**
 * @route   POST /api/payments/cancel/:paymentIntentId
 * @desc    Cancel a pending payment
 * @access  Private (User)
 */
exports.cancelPayment = asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.params;
  const userId = req.user.id;
  const { reason } = req.body;

  const Payment = require("./payments.model");
  const payment = await Payment.findOne({ paymentIntentId });

  if (!payment) {
    return res.status(404).json({
      success: false,
      error: { message: "Payment not found" },
    });
  }

  // Check ownership
  if (payment.userId.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      error: { message: "Access denied" },
    });
  }

  // Check if cancellable
  if (!["pending", "awaiting_payment", "processing"].includes(payment.status)) {
    return res.status(400).json({
      success: false,
      error: { message: "Payment cannot be cancelled in current status" },
    });
  }

  // Cancel via PayMongo if applicable
  if (payment.paymentIntentId) {
    const paymongoClient = require("../../utils/paymongoClient");
    await paymongoClient.cancelPaymentIntent(payment.paymentIntentId, reason);
  }

  payment.status = "cancelled";
  payment.isFinal = true;
  payment.failureReason = reason || "Cancelled by user";
  await payment.save();

  logger.info("Payment cancelled:", { paymentId: payment._id, userId });

  res.status(200).json({
    success: true,
    message: "Payment cancelled successfully",
    data: {
      paymentId: payment._id,
      status: payment.status,
    },
  });
});
/**
 * @route   POST /api/payments/:paymentId/recover-orders
 * @desc    Manually trigger order creation for a succeeded payment without orders
 * @access  Private (Admin)
 */
exports.recoverOrdersForPayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;

  const result = await paymentService.recoverOrdersForPayment(paymentId);

  res.status(200).json({
    success: true,
    message: result.message,
    data: {
      orderIds: result.orderIds,
    },
  });
});

/**
 * @route   GET /api/payments/pending-orders
 * @desc    Get payments that succeeded but have no orders created
 * @access  Private (Admin)
 */
exports.getPendingOrderPayments = asyncHandler(async (req, res) => {
  const Payment = require("./payments.model");
  
  const payments = await Payment.find({
    type: "checkout",
    status: "succeeded",
    ordersCreated: false,
    checkoutData: { $exists: true, $ne: null }
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("_id userId amount status createdAt checkoutData.customerName checkoutData.items");

  res.status(200).json({
    success: true,
    count: payments.length,
    data: payments.map(p => ({
      paymentId: p._id,
      userId: p.userId,
      amount: p.amount / 100,
      status: p.status,
      customerName: p.checkoutData?.customerName,
      itemCount: p.checkoutData?.items?.length || 0,
      createdAt: p.createdAt
    })),
  });
});