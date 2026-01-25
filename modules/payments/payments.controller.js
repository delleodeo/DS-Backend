const paymentService = require("./payments.service");
const { asyncHandler, ValidationError } = require("../../utils/errorHandler");
const logger = require("../../utils/logger");
const axios = require("axios");

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
  const {
    orderId,
    amount,
    description,
    metadata,
    paymentMethod,
    checkoutData,
  } = req.body;
  const userId = req.user.id;



  // Check if this is a QRPH payment (pre-order payment)
  if (paymentMethod === "qrph" && !orderId) {
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
      checkoutData,
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
    metadata,
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
    returnUrl,
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

// New: create subscription payment (dedicated endpoint)
exports.createSubscriptionPayment = asyncHandler(async (req, res) => {
  const { planCode } = req.body.subscription || {};
  const { amount } = req.body;
  const userId = req.user.id;

  if (!planCode) throw new ValidationError('subscription.planCode is required');
  if (!amount || amount <= 0) throw new ValidationError('amount (in centavos) is required');

  const result = await paymentService.createSubscriptionQRPHPayment(
    userId,
    userId,
    planCode,
    amount,
    `Subscription: ${planCode}`,
    { planCode },
  );

  res.status(201).json({
    success: true,
    message: 'Subscription QRPH payment created successfully',
    payment: {
      _id: result.payment._id,
      paymentIntentId: result.paymentIntentId,
      status: result.payment.status,
      amount: result.payment.amount / 100,
      currency: result.payment.currency,
      qrCodeUrl: result.qrCodeUrl,
      expiresAt: result.payment.expiresAt,
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

  // Prevent caching of status checks to avoid 304 responses during polling
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  // Determine which identifier was used by the caller
  const identifierUsed = paymentIntentId && paymentIntentId.startsWith("pi_") ? "paymentIntentId" : "paymentId";

  res.status(200).json({
    success: true,
    data: {
      paymentId: payment._id,
      paymentIntentId: payment.paymentIntentId || null,
      identifierUsed,
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
    metadata,
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
  const idempotencyKey =
    req.get("Idempotency-Key") ||
    req.headers["idempotency-key"] ||
    req.headers["x-idempotency-key"];

  const result = await paymentService.createCashIn(
    userId,
    amount,
    paymentMethod,
    idempotencyKey,
  );

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
      qrCodeUrl: result.qrCodeUrl || null,
    },
  });
});

/**
 * @route   POST /api/payments/withdraw
 * @desc    Create withdrawal request (vendor payout)
 * @access  Private (Vendor)
 */
exports.createWithdrawal = asyncHandler(async (req, res) => {
  const { amount, bankAccount, payoutMethod } = req.body;
  const headerKey = req.get("Idempotency-Key");
  const idempotencyKey = headerKey;

  const vendorId = req.user.id;

  const payment = await paymentService.createWithdrawal(
    vendorId,
    amount,
    bankAccount,
    payoutMethod,
    idempotencyKey,
  );

  res.status(201).json({
    success: true,
    message: "Withdrawal request created successfully",
    data: {
      paymentId: payment._id,
      amount: payment.amount,
      fee: payment.fee,
      netAmount: payment.netAmount,
      status: payment.status,
      provider: payment.provider,
      bankAccount: {
        accountName: payment.bankAccount.accountName,
        bankName: payment.bankAccount.bankName,
        accountNumber: `****${payment.bankAccount.accountNumber.slice(-4)}`,
      },
    },
  });
});

/**
 * @route   POST /api/payments/:paymentId/cancel-withdrawal
 * @desc    Cancel a pending withdrawal (vendor only)
 * @access  Private (Vendor)
 */
exports.cancelWithdrawal = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const vendorId = req.user.id;
  const { reason } = req.body;
  const idemKey = req.get('Idempotency-Key') || req.header('Idempotency-Key')

  const payment = await paymentService.cancelWithdrawal(
    vendorId,
    paymentId,
    reason,
    idemKey
  );

  res.status(200).json({
    success: true,
    message: "Withdrawal cancelled successfully",
    data: {
      paymentId: payment._id,
      status: payment.status,
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
    parseInt(limit) || 50,
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
  const payment = await Payment.findById(id).populate(
    "orderId",
    "items subTotal status",
  );

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
    checkoutData: { $exists: true, $ne: null },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .select(
      "_id userId amount status createdAt checkoutData.customerName checkoutData.items",
    );

  res.status(200).json({
    success: true,
    count: payments.length,
    data: payments.map((p) => ({
      paymentId: p._id,
      userId: p.userId,
      amount: p.amount / 100,
      status: p.status,
      customerName: p.checkoutData?.customerName,
      itemCount: p.checkoutData?.items?.length || 0,
      createdAt: p.createdAt,
    })),
  });
});

/**
 * @route   GET /api/payments/admin/withdrawals
 * @desc    Get withdrawals for admin review
 * @access  Private (Admin)
 */
exports.getWithdrawalsForAdmin = asyncHandler(async (req, res) => {
  const { status, vendorId, dateFrom, dateTo, q, page, limit } = req.query;
  const result = await paymentService.getWithdrawalsForAdmin({
    status,
    vendorId,
    dateFrom,
    dateTo,
    q,
    page: page || 1,
    limit: parseInt(limit) || 50,
  });

  res.status(200).json({
    success: true,
    data: result.docs,
    pagination: {
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    },
  });
});

/**
 * @route   POST /api/payments/:paymentId/status
 * @desc    Update withdrawal status (admin only)
 * @access  Private (Admin)
 */
exports.updateWithdrawalStatus = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const adminId = req.user.id;
  const { status, adminProofUrl, payoutRef, reason } = req.body;

  const payment = await paymentService.updateWithdrawalStatus(
    adminId,
    paymentId,
    status,
    { adminProofUrl, payoutRef, reason },
  );

  res.status(200).json({
    success: true,
    message: "Withdrawal status updated",
    data: {
      paymentId: payment._id,
      status: payment.status,
    },
  });
});

/**
 * @route   POST /api/payments/:paymentId/approve
 * @desc    Approve withdrawal (admin only)
 * @access  Private (Admin)
 */
exports.approveWithdrawal = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const adminId = req.user.id;
  const { adminProofUrl, payoutRef } = req.body;

  const payment = await paymentService.approveWithdrawal(adminId, paymentId, {
    adminProofUrl,
    payoutRef,
  });

  res.status(200).json({
    success: true,
    message: "Withdrawal approved",
    data: {
      paymentId: payment._id,
      status: payment.status,
      approvedAt: payment.approvedAt,
    },
  });
});

/**
 * @route   POST /api/payments/:paymentId/reject
 * @desc    Reject withdrawal (admin only)
 * @access  Private (Admin)
 */
exports.rejectWithdrawal = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const adminId = req.user.id;
  const { reason } = req.body;

  const payment = await paymentService.rejectWithdrawal(
    adminId,
    paymentId,
    reason,
  );

  res.status(200).json({
    success: true,
    message: "Withdrawal rejected",
    data: {
      paymentId: payment._id,
      status: payment.status,
      rejectedAt: payment.rejectedAt,
    },
  });
});

/**
 * @route   GET /api/payments/:paymentId/qr/download
 * @desc    Download QR code for a payment
 * @access  Private (User - own payments only, Vendor, Admin)
 */
exports.downloadQRCode = asyncHandler(async (req, res) => {
  const { id: paymentId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Get payment details with ownership verification
    const Payment = require("./payments.model");
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check ownership (unless admin)
    if (
      userRole !== "admin" &&
      payment.userId.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if payment has QR code (QRPH payments only)
    if (payment.metadata?.get("paymentMethod") !== "qrph") {
      return res.status(400).json({
        success: false,
        message: "QR code download is only available for QRPH payments",
      });
    }

    // Check if payment is still valid for download (not expired or too old)
    const paymentAge = Date.now() - new Date(payment.createdAt).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (paymentAge > maxAge) {
      return res.status(410).json({
        success: false,
        message: "QR code is no longer available for download (expired)",
      });
    }

    // Get QR code URL from PayMongo or generate fallback
    let qrCodeUrl;

    if (
      payment.gatewayResponse?.data?.attributes?.next_action?.code?.image_url
    ) {
      qrCodeUrl =
        payment.gatewayResponse.data.attributes.next_action.code.image_url;
    } else {
      // Fallback: generate QR code using the payment intent ID
      qrCodeUrl = paymentService.generateQRCodeUrl(
        payment.paymentIntentId,
        payment.gatewayResponse?.data?.attributes?.client_key,
      );
    }

    if (!qrCodeUrl) {
      return res.status(404).json({
        success: false,
        message: "QR code not available for this payment",
      });
    }

    // Fetch QR code image
    const response = await axios.get(qrCodeUrl, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent": "DShop-QR-Downloader/1.0",
      },
    });

    // Determine file extension from content type
    const contentType = response.headers["content-type"] || "image/png";
    let fileExtension = ".png";

    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      fileExtension = ".jpg";
    } else if (contentType.includes("svg")) {
      fileExtension = ".svg";
    }

    // Generate filename with payment info
    const paymentDate = new Date(payment.createdAt).toISOString().split("T")[0];
    const filename = `QRPH-Payment-${payment._id.toString().slice(-8)}-${paymentDate}${fileExtension}`;

    // Set download headers
    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": response.data.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

    // Send the image data
    res.send(response.data);

    logger.info("QR code downloaded successfully:", {
      paymentId: payment._id,
      userId,
      filename,
      contentType,
      size: response.data.length,
    });
  } catch (error) {
    logger.error("Error downloading QR code:", {
      paymentId,
      userId,
      error: error.message,
      stack: error.stack,
    });

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return res.status(503).json({
        success: false,
        message: "QR code service temporarily unavailable",
      });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: "QR code image not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to download QR code",
    });
  }
});

/**
 * @route   GET /api/payments/:paymentIntentId/qr
 * @desc    Return QR code URL for a payment intent (useful for frontend fallback)
 * @access  Private (User/Vendor/Admin)
 */
exports.getQRCode = asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const Payment = require("./payments.model");

  const payment = await Payment.findOne({ paymentIntentId });
  if (!payment) {
    return res
      .status(404)
      .json({ success: false, message: "Payment not found" });
  }

  // Ownership check
  if (userRole !== "admin" && payment.userId.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  // Try to read QR URL from gateway response
  let qrCodeUrl =
    payment.gatewayResponse?.data?.attributes?.next_action?.code?.image_url ||
    null;

  // Fallback: generate a QR using the payment intent id
  if (!qrCodeUrl) {
    qrCodeUrl = paymentService.generateQRCodeUrl(
      paymentIntentId,
      payment.gatewayResponse?.data?.attributes?.client_key,
    );
  }

  if (!qrCodeUrl) {
    return res
      .status(404)
      .json({ success: false, message: "QR code URL not available" });
  }

  res.status(200).json({ success: true, qrCodeUrl });
});

exports.getVendorWithdrawals = asyncHandler(async (req, res) => {
  const vendorId = req.user.id;
  const { page = 1, limit = 10, status } = req.query;

  const result = await paymentService.getVendorWithdrawals(
    vendorId,
    {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    },
  );

  res.status(200).json({
    success: true,
    data: result.withdrawals,
    pagination: {
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      totalWithdrawals: result.totalWithdrawals,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    },
  });
});
