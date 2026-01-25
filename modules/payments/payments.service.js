const Payment = require("./payments.model");
const Order = require("../orders/orders.model");
const Vendor = require("../vendors/vendors.model");
const Admin = require("../admin/admin.model");
const VendorWallet = require("../wallet/vendorWallet.model");
const walletService = require("../wallet/wallet.service");
const sanitizeMongoInput = require("../../utils/sanitizeMongoInput");
const paymongoClient = require("../../utils/paymongoClient");
const mongoose = require("mongoose");
const logger = require("../../utils/logger");
const {
  safeDel,
  isRedisAvailable,
  getRedisClient,
  safeDelPattern,
} = require("../../config/redis");
const {
  clearCartService,
  removeItemsFromCartService,
} = require("../cart/cart.service");
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  DatabaseError,
} = require("../../utils/errorHandler");
const crypto = require("crypto");

const redisClient = getRedisClient();

const cacheKeyVendorWithdrawal = (sanitizeVendorId, page, limit, status) =>
  `vendorWithdrawals:${sanitizeVendorId}:page${page}:limit${limit}:status${status || "all"}`;
const getUserOrdersKey = (userId) => `orders:user:${userId}`;
const getVendorOrdersKey = (vendorId) => `orders:vendor:${vendorId}`;
const getProductOrdersKey = (productId) => `orders:product:${productId}`;
const getOrderKey = (id) => `orders:${id}`;

function generateTrackingNumber() {
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `DSTRK${timestamp}${randomHex}`;
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function updateVendorRevenue(vendorId) {
  logger.info(
    `[REVENUE TRACKING] Skipping revenue update during payment creation for vendor ${vendorId}`,
  );
}

function flattenMetadataForPayMongo(metadata = {}) {
  const flattened = {};

  try {
    for (const [key, value] of Object.entries(metadata)) {
      if (value === null || value === undefined || value === "") continue;

      const sanitizedKey = String(key)
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .substring(0, 50);

      if (typeof value === "object" && !Array.isArray(value)) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (
            nestedValue === null ||
            nestedValue === undefined ||
            nestedValue === ""
          )
            continue;

          const sanitizedNestedKey = String(nestedKey)
            .replace(/[^a-zA-Z0-9_]/g, "_")
            .substring(0, 30);
          const combinedKey = `${sanitizedKey}_${sanitizedNestedKey}`.substring(
            0,
            50,
          );
          flattened[combinedKey] = String(nestedValue).substring(0, 500);
        }
      } else if (Array.isArray(value)) {
        flattened[sanitizedKey] = value.join(",").substring(0, 500);
      } else {
        flattened[sanitizedKey] = String(value).substring(0, 500);
      }
    }

    const keys = Object.keys(flattened);
    if (keys.length > 50) {
      logger.warn("Metadata has too many keys, truncating to first 50 keys");
      const truncated = {};
      keys.slice(0, 50).forEach((key) => {
        truncated[key] = flattened[key];
      });
      return truncated;
    }

    return flattened;
  } catch (error) {
    logger.error("Error flattening metadata for PayMongo:", error);
    return { error: "metadata_processing_failed" };
  }
}

class PaymentService {
  async createCheckoutPayment(
    userId,
    orderId,
    amount,
    description,
    metadata = {},
  ) {
    try {
      const sanitizedAmount = sanitizeMongoInput(amount);
      const sanitizedDescription = sanitizeMongoInput(description);

      if (
        sanitizedAmount === undefined ||
        sanitizedAmount === null ||
        sanitizedAmount < 0
      ) {
        throw new ValidationError("Amount must be at least 0 PHP (0 centavos)");
      }

      let order = null;
      if (sanitizedAmount > 0) {
        order = await Order.findById(orderId);
        if (!order) throw new NotFoundError("Order");

        if (order.customerId.toString() !== userId.toString()) {
          throw new ValidationError("Order does not belong to this user");
        }
      }

      const existingPayment = await Payment.findOne({
        orderId,
        status: "succeeded",
      });
      if (existingPayment)
        throw new ConflictError("Order has already been paid");

      const idempotencyKey = crypto.randomBytes(16).toString("hex");

      const rawMetadata = {
        ...metadata,
        orderId: orderId.toString(),
        userId: userId.toString(),
        orderType: "checkout",
      };
      const flattenedMetadata = flattenMetadataForPayMongo(rawMetadata);

      // logger.info("Creating PayMongo payment intent with metadata:", {
      //   originalKeys: Object.keys(rawMetadata),
      //   flattenedKeys: Object.keys(flattenedMetadata),
      // });

      const paymentIntent = await paymongoClient.createPaymentIntent(
        sanitizedAmount,
        sanitizedDescription,
        flattenedMetadata,
      );

      const payment = new Payment({
        userId,
        orderId,
        type: "checkout",
        provider: "paymongo",
        amount: sanitizedAmount,
        fee: 0,
        netAmount: sanitizedAmount,
        currency: "PHP",
        description: sanitizedDescription,
        status: "awaiting_payment",
        paymentIntentId: paymentIntent.data.id,
        idempotencyKey,
        gatewayResponse: paymentIntent,
        metadata: new Map(Object.entries(metadata)),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await payment.save();

      logger.info("Checkout payment created:", {
        paymentId: payment._id,
        orderId,
        amount: sanitizedAmount,
      });

      return {
        payment,
        clientKey: paymentIntent.data.attributes.client_key,
        paymentIntentId: paymentIntent.data.id,
      };
    } catch (error) {
      logger.error("Error creating checkout payment:", error);
      throw error;
    }
  }

  async createQRPHPayment(
    userId,
    amount,
    description,
    metadata = {},
    checkoutData = null,
  ) {
    try {
      const sanitizedAmount = sanitizeMongoInput(amount);
      const sanitizedDescription = sanitizeMongoInput(description);

      if (
        sanitizedAmount === undefined ||
        sanitizedAmount === null ||
        sanitizedAmount < 0
      ) {
        throw new ValidationError("Amount must be at least 0 PHP (0 centavos)");
      }

      if (
        !checkoutData ||
        !checkoutData.items ||
        checkoutData.items.length === 0
      ) {
        throw new ValidationError(
          "Checkout data with items is required for QRPH payment",
        );
      }

      if (!checkoutData.customerName)
        throw new ValidationError("Customer name is required");
      if (!checkoutData.phone)
        throw new ValidationError("Phone number is required");
      if (!checkoutData.shippingAddress)
        throw new ValidationError("Shipping address is required");

      for (const item of checkoutData.items) {
        if (!item.vendorId)
          throw new ValidationError("Each item must have a vendorId");
        if (!item.productId)
          throw new ValidationError("Each item must have a productId");
        if (!item.price || item.price <= 0)
          throw new ValidationError("Each item must have a valid price");
        if (!item.quantity || item.quantity <= 0)
          throw new ValidationError("Each item must have a valid quantity");
      }

      const idempotencyKey = crypto.randomBytes(16).toString("hex");

      const rawMetadata = {
        ...metadata,
        userId: userId.toString(),
        paymentMethod: "qrph",
        orderType: "preorder",
        itemCount: checkoutData.items.length.toString(),
      };
      const flattenedMetadata = flattenMetadataForPayMongo(rawMetadata);

      logger.info("Creating QRPH PayMongo payment intent with metadata:", {
        originalKeys: Object.keys(rawMetadata),
        flattenedKeys: Object.keys(flattenedMetadata),
        itemCount: checkoutData.items.length,
      });

      const paymentIntent = await paymongoClient.createPaymentIntent(
        sanitizedAmount,
        sanitizedDescription,
        flattenedMetadata,
      );

      logger.info("PayMongo payment intent created:", {
        paymentIntentId: paymentIntent.data.id,
      });

      const paymentMethod = await paymongoClient.createPaymentMethod(
        "qrph",
        {},
      );
      logger.info("QRPH payment method created:", {
        paymentMethodId: paymentMethod.data.id,
      });

      const attachedIntent = await paymongoClient.attachPaymentMethod(
        paymentIntent.data.id,
        paymentMethod.data.id,
        process.env.PAYMENT_RETURN_URL || "http://localhost:5173/orders",
      );

      logger.info("Payment method attached:", {
        paymentIntentId: attachedIntent.data.id,
        hasNextAction: !!attachedIntent.data.attributes.next_action,
        nextActionType: attachedIntent.data.attributes.next_action?.type,
      });

      let qrCodeUrl = null;

      if (
        attachedIntent.data.attributes.next_action &&
        attachedIntent.data.attributes.next_action.code &&
        attachedIntent.data.attributes.next_action.code.image_url
      ) {
        qrCodeUrl = attachedIntent.data.attributes.next_action.code.image_url;
        logger.info("QR code URL extracted from PayMongo:", qrCodeUrl);
      } else {
        logger.warn(
          "No QR code URL found in PayMongo response, next_action:",
          JSON.stringify(attachedIntent.data.attributes.next_action, null, 2),
        );
      }

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const payment = new Payment({
        userId,
        type: "checkout",
        provider: "paymongo",
        amount: sanitizedAmount,
        fee: Math.round(sanitizedAmount * 0.025),
        netAmount: sanitizedAmount - Math.round(sanitizedAmount * 0.025),
        currency: "PHP",
        description: sanitizedDescription,
        status: "awaiting_payment",
        paymentIntentId: paymentIntent.data.id,
        idempotencyKey,
        gatewayResponse: paymentIntent,
        metadata: new Map(
          Object.entries({ ...metadata, paymentMethod: "qrph" }),
        ),
        expiresAt,
        checkoutData: {
          items: checkoutData.items.map((item) => ({
            vendorId: item.vendorId,
            productId: item.productId,
            optionId: item.optionId || null,
            itemId: item.itemId || null,
            name: item.name || "",
            label: item.label || "",
            imgUrl: item.imgUrl || "",
            price: item.price,
            quantity: item.quantity || 1,
          })),
          shippingAddress: checkoutData.shippingAddress,
          customerName: checkoutData.customerName,
          phone: checkoutData.phone,
          shippingOption: checkoutData.shippingOption || "J&T",
          shippingFee: checkoutData.shippingFee || 0,
          agreementDetails: checkoutData.agreementDetails || "",
        },
        ordersCreated: false,
      });

      await payment.save();

      logger.info("QRPH payment created with checkout data:", {
        paymentId: payment._id,
        amount: sanitizedAmount,
        expiresAt,
        itemCount: checkoutData.items.length,
        hasCheckoutData: true,
      });

      return {
        payment,
        clientKey: paymentIntent.data.attributes.client_key,
        paymentIntentId: paymentIntent.data.id,
        qrCodeUrl,
      };
    } catch (error) {
      logger.error("Error creating QRPH payment:", error);
      throw error;
    }
  }

  async createSubscriptionQRPHPayment(userId, sellerId, planCode, amount, description = '', metadata = {}) {
    try {
      const sanitizedAmount = sanitizeMongoInput(amount);
      const sanitizedDescription = sanitizeMongoInput(description || `Subscription ${planCode}`);

      if (sanitizedAmount === undefined || sanitizedAmount === null || sanitizedAmount <= 0) {
        throw new ValidationError('Amount must be greater than 0 (in centavos)');
      }

      const idempotencyKey = crypto.randomBytes(16).toString('hex');

      const rawMetadata = {
        ...metadata,
        userId: userId.toString(),
        sellerId: sellerId.toString(),
        planCode: planCode,
        paymentMethod: 'qrph',
        orderType: 'subscription',
      };

      const flattenedMetadata = flattenMetadataForPayMongo(rawMetadata);

      const paymentIntent = await paymongoClient.createPaymentIntent(
        sanitizedAmount,
        sanitizedDescription,
        flattenedMetadata,
      );

      const paymentMethod = await paymongoClient.createPaymentMethod('qrph', {});

      const attachedIntent = await paymongoClient.attachPaymentMethod(
        paymentIntent.data.id,
        paymentMethod.data.id,
        process.env.PAYMENT_RETURN_URL || 'http://localhost:5173/sellers/subscription',
      );

      let qrCodeUrl = null;
      if (
        attachedIntent.data.attributes.next_action &&
        attachedIntent.data.attributes.next_action.code &&
        attachedIntent.data.attributes.next_action.code.image_url
      ) {
        qrCodeUrl = attachedIntent.data.attributes.next_action.code.image_url;
      }

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const payment = new Payment({
        userId,
        type: 'subscription',
        provider: 'paymongo',
        amount: sanitizedAmount,
        fee: Math.round(sanitizedAmount * 0.025),
        netAmount: sanitizedAmount - Math.round(sanitizedAmount * 0.025),
        currency: 'PHP',
        description: sanitizedDescription,
        status: 'awaiting_payment',
        paymentIntentId: paymentIntent.data.id,
        idempotencyKey,
        gatewayResponse: paymentIntent,
        metadata: new Map(Object.entries({ ...rawMetadata })),
        expiresAt,
      });

      await payment.save();

      logger.info('Subscription QRPH payment created:', { paymentId: payment._id, paymentIntentId: paymentIntent.data.id, amount: sanitizedAmount });

      return {
        payment,
        clientKey: paymentIntent.data.attributes.client_key,
        paymentIntentId: paymentIntent.data.id,
        qrCodeUrl,
      };
    } catch (error) {
      logger.error('Error creating subscription QRPH payment:', error);
      throw error;
    }
  }

  generateQRCodeUrl(paymentIntentId, clientKey) {
    const paymentUrl = `https://pm.link/${paymentIntentId}`;
    const encodedUrl = encodeURIComponent(paymentUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedUrl}`;
  }

  async attachPaymentMethod(
    userId,
    paymentIntentId,
    paymentMethodId,
    returnUrl,
  ) {
    try {
      const payment = await Payment.findOne({ paymentIntentId });
      if (!payment) throw new NotFoundError("Payment");

      if (payment.userId.toString() !== userId.toString()) {
        throw new ValidationError("Payment does not belong to this user");
      }

    } catch (error) {
      logger.error("Error creating QRPH payment:", error);
      throw error;
    }
  }

  generateQRCodeUrl(paymentIntentId, clientKey) {
    const paymentUrl = `https://pm.link/${paymentIntentId}`;
    const encodedUrl = encodeURIComponent(paymentUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedUrl}`;
  }

  async attachPaymentMethod(
    userId,
    paymentIntentId,
    paymentMethodId,
    returnUrl,
  ) {
    try {
      const payment = await Payment.findOne({ paymentIntentId });
      if (!payment) throw new NotFoundError("Payment");

      if (payment.userId.toString() !== userId.toString()) {
        throw new ValidationError("Payment does not belong to this user");
      }

      if (payment.status === "succeeded") {
        throw new ConflictError("Payment has already been completed");
      }

      const result = await paymongoClient.attachPaymentMethod(
        paymentIntentId,
        paymentMethodId,
        returnUrl,
      );

      payment.paymentMethodId = paymentMethodId;
      payment.status = "processing";
      payment.gatewayResponse = result;
      await payment.save();

      logger.info("Payment method attached:", {
        paymentId: payment._id,
        paymentIntentId,
      });

      return { payment, nextAction: result.data.attributes.next_action };
    } catch (error) {
      logger.error("Error attaching payment method:", error);
      throw error;
    }
  }

  async checkPaymentStatus(identifier) {
    try {
      let payment;
      let paymentIntentId;

      if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
        payment = await Payment.findById(identifier);
        if (!payment) throw new NotFoundError("Payment record not found");
        paymentIntentId = payment.paymentIntentId;

        if (!paymentIntentId) {
          throw new ValidationError(
            "Payment record does not have a valid PayMongo payment intent ID",
          );
        }
      } else if (identifier.startsWith("pi_")) {
        paymentIntentId = identifier;
        payment = await Payment.findOne({ paymentIntentId });
        if (!payment)
          throw new NotFoundError(
            "Payment record not found for this payment intent",
          );
      } else {
        throw new ValidationError(
          "Invalid payment identifier. Must be a MongoDB ObjectId or PayMongo payment intent ID (starting with 'pi_')",
        );
      }

      logger.info("Checking payment status:", {
        identifier,
        paymentIntentId,
        paymentRecordId: payment._id,
      });

      const paymentIntent =
        await paymongoClient.retrievePaymentIntent(paymentIntentId);
      const gatewayStatus = paymentIntent.data.attributes.status;

      const statusMap = {
        awaiting_payment_method: "awaiting_payment",
        awaiting_next_action: "processing",
        processing: "processing",
        succeeded: "succeeded",
        failed: "failed",
      };

      const newStatus = statusMap[gatewayStatus] || payment.status;
      const previousStatus = payment.status;

      if (newStatus !== previousStatus) {
        payment.status = newStatus;
        payment.gatewayResponse = paymentIntent;

        if (newStatus === "succeeded") {
          payment.paidAt = new Date();
          payment.isFinal = true;

          if (
            payment.type === "checkout" &&
            payment.checkoutData &&
            !payment.ordersCreated
          ) {
            logger.info(
              "Creating orders from payment status check (webhook fallback):",
              {
                paymentId: payment._id,
                hasCheckoutData: !!payment.checkoutData,
                itemCount: payment.checkoutData?.items?.length || 0,
              },
            );

            try {
              const orderIds = await this.createOrdersFromPayment(payment);
              logger.info(
                "Orders created successfully via status check fallback:",
                { paymentId: payment._id, orderIds },
              );
            } catch (orderError) {
              logger.error("Failed to create orders from status check:", {
                paymentId: payment._id,
                error: orderError.message,
              });
            }
          } else if (payment.orderId) {
            await Order.findByIdAndUpdate(payment.orderId, {
              paymentStatus: "Paid",
              paidAt: new Date(),
              paymentId: payment._id,
            });
          }

          // Credit vendor wallet for cash-in payments if not already credited
          if (payment.type === "cash_in" && !payment.walletCredited) {
            try {
              await this.processCashInSuccess(payment);
            } catch (err) {
              logger.error("Failed to credit wallet on status check:", err);
            }
          }
        } else if (newStatus === "failed") {
          payment.isFinal = true;
          payment.failureReason =
            paymentIntent.data.attributes.last_payment_error?.message ||
            "Payment failed";
        }

        await payment.save();

        logger.info("Payment status updated:", {
          paymentId: payment._id,
          paymentIntentId,
          oldStatus: previousStatus,
          newStatus,
        });
      } else if (
        payment.status === "succeeded" &&
        payment.checkoutData &&
        !payment.ordersCreated
      ) {
        logger.info(
          "Attempting order creation for already-succeeded payment:",
          { paymentId: payment._id },
        );

        try {
          const orderIds = await this.createOrdersFromPayment(payment);
          logger.info("Orders created for already-succeeded payment:", {
            paymentId: payment._id,
            orderIds,
          });
        } catch (orderError) {
          logger.error(
            "Failed to create orders for already-succeeded payment:",
            {
              paymentId: payment._id,
              error: orderError.message,
            },
          );
        }
      }

      return payment;
    } catch (error) {
      logger.error("Error checking payment status:", error);
      throw error;
    }
  }

  async createRefund(userId, paymentId, amount, reason, metadata = {}) {
    try {
      const originalPayment = await Payment.findById(paymentId);
      if (!originalPayment) throw new NotFoundError("Payment");

      if (originalPayment.status !== "succeeded") {
        throw new ValidationError("Only succeeded payments can be refunded");
      }

      if (originalPayment.type !== "checkout") {
        throw new ValidationError("Only checkout payments can be refunded");
      }

      const refundAmount = amount || originalPayment.amount;
      if (refundAmount > originalPayment.amount) {
        throw new ValidationError(
          "Refund amount cannot exceed original payment amount",
        );
      }

      const existingRefunds = await Payment.find({
        orderId: originalPayment.orderId,
        type: "refund",
        status: { $in: ["succeeded", "processing"] },
      });

      const totalRefunded = existingRefunds.reduce(
        (sum, refund) => sum + refund.amount,
        0,
      );
      if (totalRefunded + refundAmount > originalPayment.amount) {
        throw new ValidationError(
          "Total refund amount would exceed original payment",
        );
      }

      const paymongoPaymentId = originalPayment.gatewayResponse?.data?.id;
      if (!paymongoPaymentId) {
        throw new ValidationError(
          "Original payment does not have a valid gateway payment ID",
        );
      }

      const rawRefundMetadata = {
        ...metadata,
        originalPaymentId: paymentId,
        refundReason: reason,
        refundAmount: refundAmount.toString(),
      };
      const flattenedRefundMetadata =
        flattenMetadataForPayMongo(rawRefundMetadata);

      const refundResult = await paymongoClient.createRefund(
        paymongoPaymentId,
        refundAmount,
        reason,
        flattenedRefundMetadata,
      );

      const refundPayment = new Payment({
        userId: originalPayment.userId,
        orderId: originalPayment.orderId,
        type: "refund",
        provider: originalPayment.provider,
        amount: refundAmount,
        fee: 0,
        netAmount: refundAmount,
        currency: "PHP",
        description: `Refund for payment ${originalPayment._id}`,
        status: "processing",
        refundId: refundResult.data.id,
        gatewayResponse: refundResult,
        metadata: new Map(
          Object.entries({ ...metadata, originalPaymentId: paymentId }),
        ),
      });

      await refundPayment.save();

      if (totalRefunded + refundAmount >= originalPayment.amount) {
        originalPayment.status = "refunded";
      } else {
        originalPayment.status = "partially_refunded";
      }
      await originalPayment.save();

      logger.info("Refund created:", {
        refundId: refundPayment._id,
        originalPaymentId: paymentId,
        amount: refundAmount,
      });

      return refundPayment;
    } catch (error) {
      logger.error("Error creating refund:", error);
      throw error;
    }
  }

  async createCashIn(userId, amount, paymentMethod = "qrph", idempotencyKey) {
    const vendorWithdrawalsCacheKey = cacheKeyVendorWithdrawal(
      "*",
      "*",
      "*",
      "*",
    );

    const sanitizedAmount = sanitizeMongoInput(amount);
    const sanitizedIdempotencyKey = sanitizeMongoInput(idempotencyKey);

    try {
      if (!isValidObjectId(userId)) {
        throw new ValidationError("Invalid user ID");
      }

      if (
        sanitizedAmount === undefined ||
        sanitizedAmount === null ||
        sanitizedAmount < 100
      ) {
        throw new ValidationError(
          "Minimum cash-in amount is 1 PHP (100 centavos)",
        );
      }
      if (sanitizedAmount > 10000000) {
        throw new ValidationError("Maximum cash-in amount is 100,000 PHP");
      }

      const method = String(paymentMethod || "qrph")
        .toLowerCase()
        .trim();
      if (method !== "qrph") {
        throw new ValidationError("Vendor cash-in is only available via QRPH");
      }

      const key = String(
        sanitizedIdempotencyKey ||
          (crypto.randomUUID
            ? crypto.randomUUID()
            : crypto.randomBytes(16).toString("hex")),
      ).trim();

      if (!key) throw new ValidationError("Idempotency key is required");

      const existing = await Payment.findOne({
        userId,
        type: "cash_in",
        idempotencyKey: key,
      });

      if (existing) {
        const qrFromMeta =
          existing.metadata?.get?.("qrCodeUrl") ||
          existing.metadata?.qrCodeUrl ||
          null;

        return {
          payment: existing,
          clientKey:
            existing.gatewayResponse?.data?.attributes?.client_key || null,
          paymentIntentId: existing.paymentIntentId || null,
          qrCodeUrl: qrFromMeta,
        };
      }

      const fee = Math.round(sanitizedAmount * 0.015);
      const netAmount = sanitizedAmount - fee;

      const basePayment = new Payment({
        userId,
        type: "cash_in",
        provider: "paymongo",
        amount: sanitizedAmount,
        fee,
        netAmount,
        currency: "PHP",
        description: "Wallet Top-up",
        status: "processing",
        idempotencyKey: key,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: new Map(
          Object.entries({
            paymentMethod: "qrph",
          }),
        ),
      });

      try {
        await basePayment.save();
      } catch (e) {
        if (e?.code === 11000) {
          const dup = await Payment.findOne({
            userId,
            type: "cash_in",
            idempotencyKey: key,
          });
          if (dup) {
            const qrFromMeta =
              dup.metadata?.get?.("qrCodeUrl") ||
              dup.metadata?.qrCodeUrl ||
              null;

            return {
              payment: dup,
              clientKey:
                dup.gatewayResponse?.data?.attributes?.client_key || null,
              paymentIntentId: dup.paymentIntentId || null,
              qrCodeUrl: qrFromMeta,
            };
          }
        }
        throw e;
      }

      const rawMetadata = {
        userId: userId.toString(),
        type: "cash_in",
        paymentMethod: "qrph",
        idempotencyKey: key,
      };
      const flattenedMetadata = flattenMetadataForPayMongo(rawMetadata);

      const paymentIntent = await paymongoClient.createPaymentIntent(
        sanitizedAmount,
        "Wallet Top-up",
        flattenedMetadata,
      );

      const pm = await paymongoClient.createPaymentMethod("qrph", {});

      const attachedIntent = await paymongoClient.attachPaymentMethod(
        paymentIntent.data.id,
        pm.data.id,
        process.env.PAYMENT_RETURN_URL || "http://localhost:5173/orders",
      );

      const qrCodeUrl =
        attachedIntent?.data?.attributes?.next_action?.code?.image_url || null;

      basePayment.paymentIntentId = paymentIntent.data.id;
      basePayment.paymentMethodId = pm.data.id;
      basePayment.gatewayResponse = attachedIntent;
      basePayment.status = "awaiting_payment";

      const metaObj = {
        paymentMethod: "qrph",
        qrCodeUrl: qrCodeUrl || "",
      };
      basePayment.metadata = new Map(Object.entries(metaObj));

      await basePayment.save();

      logger.info("Cash-in payment created:", {
        paymentId: basePayment._id,
        userId,
        amount: sanitizedAmount,
        paymentIntentId: basePayment.paymentIntentId,
      });

      if (isRedisAvailable()) {
        try {
          await safeDel(`vendor:${userId}`);
          await safeDelPattern(vendorWithdrawalsCacheKey);
        } catch (e) {
          logger.warn(
            "Failed to clear wallet cache after cash-in creation:",
            e.message || e,
          );
        }
      }

      return {
        payment: basePayment,
        clientKey: paymentIntent.data.attributes.client_key,
        paymentIntentId: paymentIntent.data.id,
        qrCodeUrl,
      };
    } catch (error) {
      logger.error("Error creating cash-in:", error);
      throw error;
    }
  }

  /**
   * Process a succeeded cash-in payment by crediting vendor wallet.
   * Runs inside a MongoDB session/transaction to ensure idempotency.
   */
  async processCashInSuccess(payment) {
    if (!payment || payment.type !== "cash_in") return payment;
    if (payment.walletCredited) return payment;

    let session = null;
    try {
      session = await Payment.startSession();
      session.startTransaction();
      const WalletTransaction = require("../wallet/walletTransaction.model");

      // Ensure wallet exists
      const wallet = await VendorWallet.getOrCreateForUser(payment.userId);
      if (!wallet) throw new Error("Vendor wallet not found");

      const amountPhp = Number(payment.netAmount) / 100;
      const balanceBefore = Number(wallet.balance || 0);
      const balanceAfter = balanceBefore + amountPhp;

      logger.info("[processCashInSuccess] starting", {
        paymentId: payment._id,
        userId: payment.userId,
        netAmount: payment.netAmount,
        amountPhp,
      });
      logger.info("[processCashInSuccess] start", {
        paymentId: payment._id.toString(),
        userId: payment.userId.toString(),
        netAmount: payment.netAmount,
        amountPhp,
      });

      let walletTransaction;
      try {
        [walletTransaction] = await WalletTransaction.create(
          [
            {
              wallet: wallet._id,
              user: payment.userId,
              type: "credit",
              amount: amountPhp,
              description: "Wallet top-up (Cash-in)",
              reference: `CASHIN-${payment._id}`,
              referenceType: "topup",
              referenceId: payment._id,
              status: "completed",
              balanceBefore,
              balanceAfter,
              metadata: {
                paymentId: payment._id,
                paymentIntentId: payment.paymentIntentId,
              },
            },
          ],
          { session },
        );
      } catch (err) {
        console.error(
          "[processCashInSuccess] WalletTransaction.create failed",
          err,
        );
        throw err;
      }

      logger.info("[processCashInSuccess] created wallet transaction", {
        id: walletTransaction._id,
      });
      logger.info("[processCashInSuccess] created wallet transaction", {
        id: walletTransaction._id.toString(),
      });

      const updatedWallet = await VendorWallet.findOneAndUpdate(
        { _id: wallet._id },
        {
          $inc: { balance: amountPhp },
          $push: {
            transactions: {
              type: "credit",
              amount: amountPhp,
              description: "Wallet top-up (Cash-in)",
              date: new Date(),
              reference: walletTransaction._id,
            },
          },
        },
        { new: true, session },
      );

      logger.info("[processCashInSuccess] updated wallet", {
        balance: updatedWallet?.balance,
      });
      logger.info("[processCashInSuccess] updated wallet", {
        balance: updatedWallet?.balance,
      });

      if (!updatedWallet) throw new Error("Failed to update wallet");

      payment.walletCredited = true;
      payment.walletCreditedAt = new Date();
      await payment.save({ session });

      await session.commitTransaction();

      // Invalidate cache keys if redis available
      if (isRedisAvailable()) {
        try {
          await safeDel(`vendor:${payment.userId}`);
          await safeDel(`wallet:${payment.userId}`);
          await safeDel(`wallet:balance:${payment.userId}`);
        } catch (e) {
          logger.warn(
            "Failed to clear wallet cache after cash-in:",
            e.message || e,
          );
        }
      }

      return payment;
    } catch (error) {
      if (session) {
        try {
          await session.abortTransaction();
        } catch (e) {}
      }
      logger.error("Error processing cash-in success:", error);
      throw error;
    } finally {
      if (session) session.endSession();
    }
  }

  async createWithdrawal(
    vendorId,
    amount,
    bankAccount,
    payoutMethod = "gcash",
    idempotencyKey,
  ) {
    const vendorWithdrawalsCacheKey = cacheKeyVendorWithdrawal(
      "*",
      "*",
      "*",
      "*",
    );

    const session = await Payment.startSession();
    const idempotencyKeySanitized = sanitizeMongoInput(idempotencyKey);
    try {
      const sanitizedAmount = sanitizeMongoInput(amount);

      if (!isValidObjectId(vendorId)) {
        throw new ValidationError("Invalid vendor ID");
      }

      if (!sanitizedAmount || sanitizedAmount < 10000) {
        throw new ValidationError("Minimum withdrawal amount is 100 PHP");
      }

      if (
        !bankAccount?.accountNumber ||
        !bankAccount?.accountName ||
        !bankAccount?.bankName
      ) {
        throw new ValidationError("Complete bank account details are required");
      }

      const method = String(
        sanitizeMongoInput(payoutMethod) || "",
      ).toLowerCase();

      if (!["gcash", "paymaya"].includes(method)) {
        throw new ValidationError("Withdrawal method must be GCash or PayMaya");
      }

      const key =
        (typeof idempotencyKeySanitized === "string" &&
          idempotencyKeySanitized.trim()) ||
        `withdraw:${vendorId}:${crypto
          .createHash("sha256")
          .update(
            JSON.stringify({
              amount: sanitizedAmount,
              method,
              accountNumber: String(bankAccount.accountNumber || "").trim(),
              accountName: String(bankAccount.accountName || "").trim(),
              bankName: String(bankAccount.bankName || "").trim(),
            }),
          )
          .digest("hex")}`;

      const existing = await Payment.findOne(
        { userId: vendorId, idempotencyKeySanitized: key, type: "withdraw" },
        null,
        { session },
      );
      if (existing) return existing;

      session.startTransaction();

      const vendor = await VendorWallet.getOrCreateForUser(vendorId);

      if (!vendor) {
        throw new ValidationError("Vendor not found");
      }

      const vendorBalance = vendor.balance || 0;
      const amountPhp = Number(sanitizedAmount) / 100;

      const fee = Math.round(sanitizedAmount * 0.01);
      const netAmount = Math.max(0, sanitizedAmount - fee);

      if (vendorBalance < amountPhp) {
        throw new ValidationError("Insufficient wallet balance for withdrawal");
      }

      const newBalance = vendorBalance - amountPhp; // potential balance after approval (used for logs)

      const payment = await Payment.create(
        [
          {
            userId: vendorId,
            type: "withdraw",
            provider: method,
            amount: sanitizedAmount,
            fee,
            netAmount,
            currency: "PHP",
            description: "Vendor Withdrawal",
            status: "pending",
            bankAccount: {
              accountNumber: sanitizeMongoInput(bankAccount.accountNumber),
              accountName: sanitizeMongoInput(bankAccount.accountName),
              bankName:
                sanitizeMongoInput(bankAccount.bankName) ||
                (method === "gcash" ? "GCash" : "PayMaya"),
            },
            walletTransactionId: null,
            idempotencyKey: key,
          },
        ],
        { session },
      );

      await session.commitTransaction();

      const saved = payment[0];

      const now = new Date();

      const wallet = await VendorWallet.findOneAndUpdate(
        { user: vendorId, balance: { $gte: amountPhp } },
        {
          $inc: { balance: -amountPhp },
          $set: { updatedAt: now },
          $push: {
            transactions: {
              type: "debit",
              amount: amountPhp,
              description: "Vendor Withdrawal",
              date: now,
              reference: `WITHDRAWAL-${payment._id}`,
            },
          },
        },
        { session, new: true },
      );

      if (!wallet) {
        throw new Error("Insufficient balance or wallet not found");
      }
      logger.info("Withdrawal created (idempotent):", {
        paymentId: saved._id,
        vendorId,
        amount: sanitizedAmount,
        oldBalance: vendorBalance,
        newBalance,
        idempotencyKey: key,
      });

      if (isRedisAvailable()) {
        await safeDel(`vendor:${vendorId}`);
        await safeDelPattern(vendorWithdrawalsCacheKey);
      }

      return saved;
    } catch (error) {
      try {
        await session.abortTransaction();
      } catch (_) {}

      if (error?.code === 11000) {
        const key = idempotencyKey;
        const existing = await Payment.findOne({
          userId: vendorId,
          idempotencyKey: key,
          type: "withdraw",
        });
        if (existing) return existing;
        throw new ConflictError("Duplicate withdrawal request");
      }

      logger.error("Error creating withdrawal:", error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async cancelWithdrawal(vendorId, paymentId, reason = "", idempotencyKey) {
    const vendorWithdrawalsCacheKey = cacheKeyVendorWithdrawal(
      "*",
      "*",
      "*",
      "*",
    );
    try {
      if (!isValidObjectId(vendorId))
        throw new ValidationError("Invalid vendor ID");

      if (!isValidObjectId(paymentId))
        throw new ValidationError("Invalid payment ID");

      const payment = await Payment.findById(paymentId);

      if (!payment) {
        throw new NotFoundError("Payment not found");
      }

      if (payment.type !== "withdraw") {
        throw new ValidationError("Payment is not a withdrawal");
      }

      if (payment.userId.toString() !== vendorId.toString()) {
        throw new ValidationError("Access denied");
      }

      console.log("pasdpksadjsadjasdasdasdsadasd", payment);

      if (payment.status !== "pending" && payment.status !== "processing") {
        throw new ValidationError("Only pending withdrawals can be cancelled");
      }

      const Vendor = require("../vendors/vendors.model");
      const amountPhp = Number(payment.amount) / 100;

      await Vendor.findOneAndUpdate(
        { userId: vendorId },
        {
          $inc: { "accountBalance.cash": amountPhp },
          $set: { updatedAt: new Date() },
        },
      );

      payment.status = "cancelled";
      payment.isFinal = true;
      payment.cancelledAt = new Date();
      payment.failureReason = reason || "Cancelled by vendor";
      payment.idempotencyKey = idempotencyKey || payment.idempotencyKey;
      await payment.save();

      if (payment.status !== "cancelled")
        throw new Error("Failed to cancel withdrawal");

      await VendorWallet.findOneAndUpdate(
        { user: vendorId },
        { $inc: { balance: amountPhp } },
        {
          $push: {
            transactions: {
              type: "credit",
              amount: amountPhp,
              description: "Withdrawal Cancellation Refund",
              date: new Date(),
              reference: `WITHDRAWAL-CANCELLED-${payment._id}`,
            },
          },
        },
      ).catch((err) => {
        logger.error(
          "Failed to refund wallet after withdrawal cancellation:",
          err,
        );
      });

      if (isRedisAvailable()) {
        const { safeDel } = require("../../config/redis");
        await safeDel(`vendor:${vendorId}`);
        await safeDelPattern(vendorWithdrawalsCacheKey);
      }

      return payment;
    } catch (error) {
      logger.error("Error cancelling withdrawal:", error);
      throw error;
    }
  }

  async approveWithdrawal(adminId, paymentId, options = {}) {
    const { adminProofUrl = null, payoutRef = null } = options;

    if (!isValidObjectId(adminId))
      throw new ValidationError("Invalid admin ID");
    if (!isValidObjectId(paymentId))
      throw new ValidationError("Invalid payment ID");

    const vendorWithdrawalsCacheKey = cacheKeyVendorWithdrawal(
      "*",
      "*",
      "*",
      "*",
    );

    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new NotFoundError("Payment not found");
      }
      if (payment.type !== "withdraw") {
        throw new ValidationError("Payment is not a withdrawal");
      }
      if (payment.status !== "pending") {
        throw new ValidationError("Only pending withdrawals can be approved");
      }

      payment.status = "succeeded";
      payment.isFinal = true;
      payment.approvedBy = adminId;
      payment.approvedAt = new Date();
      payment.adminProofUrl = adminProofUrl;
      payment.payoutRef = payoutRef;

      await payment.save();

      if (payment.status !== "succeeded")
        throw new Error("Failed to approve withdrawal");

      // const withdrawAmountPhp = Number(payment.amount) / 100;
      // const vendorId = payment.userId;

      if (isRedisAvailable()) {
        await safeDelPattern(vendorWithdrawalsCacheKey);
        await safeDel(`vendor:${payment.userId}`);
      }
      return payment;
    } catch (error) {
      logger.error("Error approving withdrawal:", error);
      throw error;
    }
  }

  async rejectWithdrawal(adminId, paymentId, reason = "") {
    const vendorWithdrawalsCacheKey = cacheKeyVendorWithdrawal(
      "*",
      "*",
      "*",
      "*",
    );

    if (!isValidObjectId(adminId))
      throw new ValidationError("Invalid admin ID");
    if (!isValidObjectId(paymentId))
      throw new ValidationError("Invalid payment ID");

    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new NotFoundError("Payment not found");
      }
      if (payment.type !== "withdraw") {
        throw new ValidationError("Payment is not a withdrawal");
      }
      if (payment.status !== "pending") {
        throw new ValidationError("Only pending withdrawals can be rejected");
      }

      const amountPhp = Number(payment.amount) / 100;

      payment.status = "rejected";
      payment.isFinal = true;
      payment.rejectedBy = adminId;
      payment.rejectedAt = new Date();
      payment.rejectionReason = reason || "Rejected by admin";
      await payment.save();

      if (payment.status !== "rejected")
        throw new Error("Failed to reject withdrawal");

      const vendorId = payment.userId;

      await VendorWallet.findOneAndUpdate(
        { user: vendorId },
        { $inc: { balance: amountPhp } },
        {
          $push: {
            transactions: {
              type: "credit",
              amount: amountPhp,
              description: "Withdrawal Rejection Refund",
              date: new Date(),
              reference: `WITHDRAWAL-REJECTED-${payment._id}`,
            },
          },
        },
      ).catch((err) => {
        logger.error(
          "Failed to refund wallet after withdrawal rejection:",
          err,
        );
      });

      if (isRedisAvailable()) {
        await safeDelPattern(vendorWithdrawalsCacheKey);
        await safeDel(`vendor:${payment.userId}`);
      }

      logger.info("Withdrawal rejected with refund:", {
        paymentId: payment._id,
        adminId,
        refundAmount: amountPhp,
      });

      return payment;
    } catch (error) {
      logger.error("Error rejecting withdrawal:", error);
      throw error;
    }
  }

  async updateWithdrawalStatus(adminId, paymentId, status, options = {}) {
    const { adminProofUrl = null, payoutRef = null, reason = null } = options;

    if (!isValidObjectId(adminId))
      throw new ValidationError("Invalid admin ID");
    if (!isValidObjectId(paymentId))
      throw new ValidationError("Invalid payment ID");

    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new NotFoundError("Payment not found");
      }
      if (payment.type !== "withdraw") {
        throw new ValidationError("Payment is not a withdrawal");
      }

      if (status === "succeeded") {
        return await this.approveWithdrawal(adminId, paymentId, {
          adminProofUrl,
          payoutRef,
        });
      }

      if (status === "failed" || status === "rejected") {
        return await this.rejectWithdrawal(
          adminId,
          paymentId,
          reason || "Rejected by admin",
        );
      }

      payment.status = status;
      if (adminProofUrl) payment.adminProofUrl = adminProofUrl;
      if (payoutRef) payment.payoutRef = payoutRef;
      if (status === "cancelled") {
        payment.isFinal = true;
        payment.failureReason = reason || "Cancelled by admin";
      }

      await payment.save();

      logger.info("Withdrawal status updated:", {
        paymentId: payment._id,
        adminId,
        status,
      });
      return payment;
    } catch (error) {
      logger.error("Error updating withdrawal status:", error);
      throw error;
    }
  }

  async getUserPayments(userId, type = null, limit = 50) {
    try {
      const query = { userId };
      if (type) query.type = type;

      const payments = await Payment.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("orderId", "items subTotal status");

      return payments;
    } catch (error) {
      logger.error("Error fetching user payments:", error);
      throw new DatabaseError(error.message, "getUserPayments");
    }
  }

  async getWithdrawalsForAdmin(filters = {}) {
    try {
      const {
        status = null,
        vendorId = null,
        dateFrom = null,
        dateTo = null,
        q = null,
        page = 1,
        limit = 50,
      } = filters;

      const query = { type: "withdraw" };
      if (status) query.status = status;
      if (vendorId) query["userId"] = vendorId;

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [totalDocs, payments] = await Promise.all([
        Payment.countDocuments(query),
        Payment.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .select(
            "_id userId amount status bankAccount provider createdAt adminProofUrl payoutRef reason updatedAt",
          )
          .populate("userId", "name email"),
      ]);

      let populated = await Promise.all(
        payments.map(async (p) => {
          const obj = p.toObject ? p.toObject() : p;
          try {
            const vendor = await Vendor.findOne({
              userId: obj.userId?._id || obj.userId,
            }).select("storeName isApproved gcashNumber");
            obj.vendor = vendor
              ? {
                  storeName: vendor.storeName,
                  isApproved: vendor.isApproved,
                  gcashNumber: vendor.gcashNumber,
                }
              : null;
          } catch (e) {
            obj.vendor = null;
          }
          return obj;
        }),
      );

      if (q) {
        const qLower = String(q).toLowerCase();
        populated = populated.filter((p) => {
          const store = p.vendor?.storeName || "";
          const user = p.userId?.name || p.userId?.email || "";
          return (
            store.toLowerCase().includes(qLower) ||
            user.toLowerCase().includes(qLower) ||
            (p.payoutRef || "").toLowerCase().includes(qLower)
          );
        });
      }

      const totalPages = Math.max(1, Math.ceil(totalDocs / parseInt(limit)));

      return {
        docs: populated,
        page: parseInt(page),
        limit: parseInt(limit),
        totalDocs,
        totalPages,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
      };
    } catch (error) {
      logger.error("Error fetching withdrawals for admin:", error);
      throw new DatabaseError(error.message, "getWithdrawalsForAdmin");
    }
  }

  async createOrdersFromPayment(payment) {
    const createdOrderIds = [];

    try {
      const freshPayment = await Payment.findById(payment._id);
      if (!freshPayment) throw new NotFoundError("Payment not found");

      if (freshPayment.ordersCreated) {
        logger.info("Orders already created for this payment:", {
          paymentId: freshPayment._id,
          orderIds: freshPayment.orderIds,
        });
        return freshPayment.orderIds || [];
      }

      const staleLockCutoff = new Date(Date.now() - 10 * 60 * 1000);
      const lockResult = await Payment.updateOne(
        {
          _id: payment._id,
          ordersCreated: false,
          $or: [
            { orderCreationError: { $ne: "in_progress" } },
            { updatedAt: { $lt: staleLockCutoff } },
          ],
        },
        { $set: { orderCreationError: "in_progress" } },
      );

      const wasLocked =
        (lockResult.modifiedCount ?? lockResult.nModified ?? 0) > 0;
      if (!wasLocked) {
        const existing = await Payment.findById(
          payment._id,
          "orderIds ordersCreated orderCreationError updatedAt",
        );
        logger.warn(
          "Order creation skipped because another worker is handling it",
          {
            paymentId: payment._id,
            ordersCreated: existing?.ordersCreated,
            orderIds: existing?.orderIds,
            orderCreationError: existing?.orderCreationError,
            updatedAt: existing?.updatedAt,
          },
        );
        return existing?.orderIds || [];
      }

      const checkoutData = freshPayment.checkoutData;
      const userId = freshPayment.userId;
      const paymentId = freshPayment._id;

      if (!checkoutData) {
        logger.error("No checkout data in payment:", { paymentId });
        throw new ValidationError("No checkout data found in payment");
      }

      const checkoutDataObj = checkoutData.toObject
        ? checkoutData.toObject()
        : typeof checkoutData === "object"
          ? JSON.parse(JSON.stringify(checkoutData))
          : checkoutData;

      if (!checkoutDataObj.items || checkoutDataObj.items.length === 0) {
        logger.error("No items in checkout data:", {
          paymentId,
          checkoutData: checkoutDataObj,
        });
        throw new ValidationError("No items found in checkout data");
      }

      logger.info("Creating orders from payment:", {
        paymentId,
        itemCount: checkoutDataObj.items.length,
        customerName: checkoutDataObj.customerName,
        hasShippingAddress: !!checkoutDataObj.shippingAddress,
        shippingOption: checkoutDataObj.shippingOption,
      });

      const groupedItems = {};
      for (const item of checkoutDataObj.items) {
        let vendorId = null;
        if (item.vendorId) {
          if (typeof item.vendorId === "object" && item.vendorId._id) {
            vendorId = item.vendorId._id.toString();
          } else {
            vendorId = item.vendorId.toString();
          }
        }

        if (!vendorId) {
          logger.warn("Item missing vendorId, skipping:", {
            item: JSON.stringify(item),
          });
          continue;
        }
        if (!groupedItems[vendorId]) groupedItems[vendorId] = [];
        groupedItems[vendorId].push(item);
      }

      if (Object.keys(groupedItems).length === 0) {
        logger.error("No valid items with vendorId found:", { paymentId });
        throw new ValidationError("No valid items with vendorId found");
      }

      for (const [vendorId, items] of Object.entries(groupedItems)) {
        try {
          const subTotal = items.reduce((total, item) => {
            return total + Number(item.price || 0) * Number(item.quantity || 1);
          }, 0);

          const orderData = {
            customerId: userId,
            vendorId: vendorId,
            items: items.map((item) => ({
              imgUrl: item.imgUrl || "",
              label: item.label || "",
              quantity: item.quantity || 1,
              productId: item.productId,
              optionId: item.optionId || null,
              price: item.price,
              name: item.name || "",
            })),
            name: checkoutDataObj.customerName || "",
            shippingOption: checkoutDataObj.shippingOption || "J&T",
            shippingFee: checkoutDataObj.shippingFee || 0,
            agreementDetails: checkoutDataObj.agreementDetails || "",
            subTotal,
            paymentStatus: "Paid",
            shippingAddress: checkoutDataObj.shippingAddress || {},
            trackingNumber: generateTrackingNumber(),
            paymentMethod: "qrph",
            paymentId: paymentId,
            paidAt: new Date(),
            status: "paid",
            escrowStatus: "held",
          };

          logger.info("Creating order for vendor:", {
            vendorId,
            itemCount: items.length,
            subTotal,
            customerName: orderData.name,
          });

          const order = new Order(orderData);
          const savedOrder = await order.save();
          createdOrderIds.push(savedOrder._id);

          logger.info("Order created successfully:", {
            orderId: savedOrder._id,
            vendorId,
            itemCount: items.length,
            subTotal,
          });

          try {
            await updateVendorRevenue(vendorId, subTotal);
          } catch (revenueError) {
            logger.error("Failed to update vendor revenue (non-critical):", {
              vendorId,
              error: revenueError.message,
            });
          }
        } catch (orderError) {
          logger.error("Failed to create order for vendor:", {
            vendorId,
            error: orderError.message,
            stack: orderError.stack,
          });
        }
      }

      if (createdOrderIds.length > 0) {
        await Payment.findByIdAndUpdate(paymentId, {
          orderIds: createdOrderIds,
          ordersCreated: true,
          orderCreationError: null,
        });

        try {
          await Admin.updateOne(
            {},
            {
              $inc: {
                totalOrders: createdOrderIds.length,
                newOrdersCount: createdOrderIds.length,
              },
            },
          );
        } catch (adminError) {
          logger.error(
            "Failed to update admin stats (non-critical):",
            adminError.message,
          );
        }

        if (isRedisAvailable()) {
          try {
            const vendorIds = Object.keys(groupedItems);
            const orderKeys = createdOrderIds.map((id) =>
              getOrderKey(id.toString()),
            );
            await safeDel([
              getUserOrdersKey(userId),
              ...vendorIds.map(getVendorOrdersKey),
              ...orderKeys,
            ]);

            const productKeys = [];
            for (const items of Object.values(groupedItems)) {
              for (const item of items) {
                if (item.productId)
                  productKeys.push(
                    getProductOrdersKey(item.productId.toString()),
                  );
              }
            }
            if (productKeys.length) await safeDel(productKeys);

            await safeDel("adminDashboardStats");
          } catch (cacheErr) {
            logger.warn("Order cache invalidation failed:", cacheErr.message);
          }
        }

        try {
          const itemsToRemove = checkoutDataObj.items.map((item) => ({
            productId: item.productId,
            optionId: item.optionId || null,
          }));

          await removeItemsFromCartService(userId, itemsToRemove);
          logger.info("Checked out items removed from cart:", {
            userId,
            paymentId,
            removedItemCount: itemsToRemove.length,
          });
        } catch (cartError) {
          logger.error(
            "Failed to remove checked out items from cart (non-critical):",
            {
              userId,
              paymentId,
              error: cartError.message,
            },
          );
        }

        logger.info("Orders created successfully from payment:", {
          paymentId,
          orderIds: createdOrderIds,
          orderCount: createdOrderIds.length,
        });
      } else {
        const errorMsg = "Failed to create any orders from payment";
        await Payment.findByIdAndUpdate(paymentId, {
          orderCreationError: errorMsg,
        });
        throw new Error(errorMsg);
      }

      return createdOrderIds;
    } catch (error) {
      logger.error("Error creating orders from payment:", {
        paymentId: payment._id,
        error: error.message,
        stack: error.stack,
      });

      try {
        await Payment.findByIdAndUpdate(payment._id, {
          orderCreationError: error.message,
          ordersCreated: false,
        });
      } catch (updateError) {
        logger.error(
          "Failed to update payment with error:",
          updateError.message,
        );
      }

      throw error;
    }
  }

  async processWebhook(payload, signature) {
    try {
      const isValid = paymongoClient.verifyWebhookSignature(payload, signature);
      if (!isValid) {
        throw new ValidationError("Invalid webhook signature");
      }

      const eventType = payload?.data?.attributes?.type;
      const paymentData = payload?.data?.attributes?.data;
      const paymentResourceId = paymentData?.id;
      const paymentAttributes = paymentData?.attributes || {};
      const paymentIntentId =
        paymentAttributes.payment_intent_id ||
        paymentAttributes.payment_intent?.id;

      logger.info("Processing webhook:", {
        eventType,
        paymentIntentId,
        paymentResourceId,
      });

      let payment = null;
      if (paymentIntentId) payment = await Payment.findOne({ paymentIntentId });
      if (!payment && paymentResourceId)
        payment = await Payment.findOne({ chargeId: paymentResourceId });

      // Fallback: sometimes PayMongo sends the payment intent id in data.id directly
      if (
        !payment &&
        paymentResourceId &&
        typeof paymentResourceId === "string" &&
        paymentResourceId.startsWith("pi_")
      ) {
        payment = await Payment.findOne({ paymentIntentId: paymentResourceId });
      }

      if (!payment) {
        logger.warn("Payment not found for webhook", {
          paymentIntentId,
          paymentResourceId,
        });
        return;
      }

      if (!payment.paymentIntentId && paymentIntentId) {
        payment.paymentIntentId = paymentIntentId;
      }

      payment.webhookReceived = true;
      payment.webhookData = payload;

      switch (eventType) {
        case "payment.paid":
          await payment.markAsSucceeded(payload);

          if (
            payment.type === "checkout" &&
            payment.checkoutData &&
            !payment.ordersCreated
          ) {
            logger.info("Creating orders from QRPH payment webhook:", {
              paymentId: payment._id,
              hasCheckoutData: !!payment.checkoutData,
              itemCount: payment.checkoutData?.items?.length || 0,
            });

            try {
              const orderIds = await this.createOrdersFromPayment(payment);
              logger.info("Orders created successfully via webhook:", {
                paymentId: payment._id,
                orderIds,
              });
            } catch (orderError) {
              logger.error("Failed to create orders from webhook:", {
                paymentId: payment._id,
                error: orderError.message,
              });
            }
          } else if (payment.type === "checkout" && payment.orderId) {
            await Order.findByIdAndUpdate(payment.orderId, {
              paymentStatus: "Paid",
              paidAt: new Date(),
              paymentId: payment._id,
            });
          }

          // Credit vendor wallet for cash-in payments
          if (payment.type === "cash_in" && !payment.walletCredited) {
            try {
              await this.processCashInSuccess(payment);
            } catch (err) {
              logger.error("Failed to credit wallet on webhook event:", err);
            }
          }

          break;

        case "payment.failed":
          const failureReason =
            payload.data.attributes.data.attributes.last_payment_error?.message;
          await payment.markAsFailed(failureReason, payload);
          break;

        case "payment.refunded":
          await payment.markAsRefunded(payload);
          break;

        default:
          logger.info("Unhandled webhook event type:", eventType);
      }

      logger.info("Webhook processed successfully:", {
        paymentId: payment._id,
        eventType,
      });

      return payment;
    } catch (error) {
      logger.error("Error processing webhook:", error);
      throw error;
    }
  }

  async recoverOrdersForPayment(paymentId) {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) throw new NotFoundError("Payment");

      if (payment.status !== "succeeded") {
        throw new ValidationError("Payment has not succeeded yet");
      }

      if (payment.ordersCreated) {
        throw new ConflictError(
          "Orders have already been created for this payment",
        );
      }

      if (
        !payment.checkoutData ||
        !payment.checkoutData.items ||
        payment.checkoutData.items.length === 0
      ) {
        throw new ValidationError("No checkout data found in payment");
      }

      const orderIds = await this.createOrdersFromPayment(payment);

      return {
        success: true,
        orderIds,
        message: `${orderIds.length} order(s) created successfully`,
      };
    } catch (error) {
      logger.error("Error recovering orders for payment:", error);
      throw error;
    }
  }

  async getVendorWithdrawals(
    vendorId,
    { page = 1, limit = 10, status = null },
  ) {
    const sanitizeVendorId = sanitizeMongoInput(vendorId);
    const vendorWithdrawalsCacheKey = cacheKeyVendorWithdrawal(
      sanitizeVendorId,
      page,
      limit,
      status,
    );
    try {
      if (isRedisAvailable()) {
        const cachedData = await redisClient.get(vendorWithdrawalsCacheKey);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
      }
      const query = { userId: sanitizeVendorId, type: "withdraw" };
      if (status) query.status = status;

      const skip = (page - 1) * limit;

      const [withdrawals, totalWithdrawals] = await Promise.all([
        Payment.find(query)
          .populate("userId", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Payment.countDocuments(query),
      ]);

      const totalPages = Math.ceil(totalWithdrawals / limit);

      const withdrawalsData = {
        withdrawals: withdrawals.map((withdrawal) => ({
          _id: withdrawal._id,
          amount: withdrawal.amount,
          fee: withdrawal.fee,
          netAmount: withdrawal.netAmount,
          status: withdrawal.status,
          provider: withdrawal.provider,
          bankAccount: withdrawal.bankAccount,
          createdAt: withdrawal.createdAt,
          updatedAt: withdrawal.updatedAt,
          adminProofUrl: withdrawal.adminProofUrl,
          payoutRef: withdrawal.payoutRef,
          reason: withdrawal.reason,
          userId: withdrawal.userId,
        })),
        currentPage: page,
        totalPages,
        totalWithdrawals,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      };

      if (isRedisAvailable())
        await redisClient
          .set(vendorWithdrawalsCacheKey, JSON.stringify(withdrawalsData), {
            EX: 300,
          })
          .catch(() => {});

      return withdrawalsData;
    } catch (error) {
      logger.error("Error fetching vendor withdrawals:", error);
      throw error;
    }
  }
}

module.exports = new PaymentService();
