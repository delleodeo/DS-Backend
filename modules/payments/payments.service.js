const Payment = require("./payments.model");
const Order = require("../orders/orders.model");
const Vendor = require("../vendors/vendors.model");
const Admin = require("../admin/admin.model");
const sanitizeMongoInput = require("../../utils/sanitizeMongoInput");
const paymongoClient = require("../../utils/paymongoClient");
const logger = require("../../utils/logger");
const { safeDel, isRedisAvailable } = require("../../config/redis");
const mongoose = require("mongoose");
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  DatabaseError,
} = require("../../utils/errorHandler");
const crypto = require("crypto");

// Cache key helpers (mirrors orders.service)
const getUserOrdersKey = (userId) => `orders:user:${userId}`;
const getVendorOrdersKey = (vendorId) => `orders:vendor:${vendorId}`;
const getProductOrdersKey = (productId) => `orders:product:${productId}`;
const getOrderKey = (id) => `orders:${id}`;

/**
 * Helper function to generate tracking number
 */
function generateTrackingNumber() {
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DSTRK${timestamp}${randomHex}`;
}

/**
 * Helper function to update vendor revenue - pushes directly to monthlyRevenueComparison
 */
async function updateVendorRevenue(vendorId, orderAmount) {
  try {
    logger.info(`[REVENUE TRACKING] Starting update for vendor: ${vendorId}, amount: ${orderAmount}`);
    
    // Try finding vendor by _id first, then by userId
    let vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      vendor = await Vendor.findOne({ userId: vendorId });
    }
    
    if (!vendor) {
      logger.error(`[REVENUE TRACKING] Vendor not found with ID: ${vendorId}`);
      return;
    }

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const currentMonth = monthNames[currentDate.getMonth()];

    // Find if the current year exists in monthlyRevenueComparison
    const yearIndex = vendor.monthlyRevenueComparison.findIndex(
      (data) => data.year === currentYear
    );

    if (yearIndex !== -1) {
      const previousRevenue = vendor.monthlyRevenueComparison[yearIndex].revenues[currentMonth] || 0;
      vendor.monthlyRevenueComparison[yearIndex].revenues[currentMonth] = previousRevenue + orderAmount;
    } else {
      const newYearData = {
        year: currentYear,
        revenues: {
          January: 0, February: 0, March: 0, April: 0, May: 0, June: 0,
          July: 0, August: 0, September: 0, October: 0, November: 0, December: 0,
          [currentMonth]: orderAmount
        }
      };
      vendor.monthlyRevenueComparison.push(newYearData);
    }

    vendor.currentMonthlyRevenue = (vendor.currentMonthlyRevenue || 0) + orderAmount;
    vendor.totalRevenue = (vendor.totalRevenue || 0) + orderAmount;
    vendor.totalOrders = (vendor.totalOrders || 0) + 1;

    await vendor.save();
    logger.info(`[REVENUE TRACKING] Successfully updated vendor ${vendor.storeName}`);
  } catch (error) {
    logger.error(`[REVENUE TRACKING] Error updating vendor revenue:`, error);
    // Don't throw - revenue tracking shouldn't fail order creation
  }
}

/**
 * Helper function to flatten metadata for PayMongo API compatibility
 * PayMongo only accepts flat key-value pairs where all values must be strings
 * @param {Object} metadata - Original metadata object (can contain nested objects)
 * @returns {Object} - Flattened metadata with string values only
 */
function flattenMetadataForPayMongo(metadata = {}) {
  const flattened = {};
  
  try {
    for (const [key, value] of Object.entries(metadata)) {
      // Skip null, undefined, or empty values
      if (value === null || value === undefined || value === '') {
        continue;
      }
      
      // Sanitize key name (remove special characters, limit length)
      const sanitizedKey = String(key).replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 50);
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        // Flatten nested objects by prefixing keys with parent key
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (nestedValue !== null && nestedValue !== undefined && nestedValue !== '') {
            const sanitizedNestedKey = String(nestedKey).replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30);
            const combinedKey = `${sanitizedKey}_${sanitizedNestedKey}`.substring(0, 50);
            flattened[combinedKey] = String(nestedValue).substring(0, 500); // Limit value length
          }
        }
      } else if (Array.isArray(value)) {
        // Convert arrays to comma-separated strings
        flattened[sanitizedKey] = value.join(',').substring(0, 500);
      } else {
        // Convert all primitive values to strings with length limit
        flattened[sanitizedKey] = String(value).substring(0, 500);
      }
    }
    
    // Ensure we don't exceed PayMongo's metadata limits (typically 50 keys max)
    const keys = Object.keys(flattened);
    if (keys.length > 50) {
      logger.warn('Metadata has too many keys, truncating to first 50 keys');
      const truncated = {};
      keys.slice(0, 50).forEach(key => {
        truncated[key] = flattened[key];
      });
      return truncated;
    }
    
    return flattened;
  } catch (error) {
    logger.error('Error flattening metadata for PayMongo:', error);
    // Return safe fallback metadata
    return { error: 'metadata_processing_failed' };
  }
}

/**
 * Payment Service Layer
 * Handles all payment business logic with proper error handling and validation
 */
class PaymentService {
  /**
   * Create Payment Intent for Order Checkout
   * @param {ObjectId} userId - User making the payment
   * @param {ObjectId} orderId - Order to pay for
   * @param {Number} amount - Amount in centavos
   * @param {String} description - Payment description
   * @param {Object} metadata - Additional metadata
   */
  async createCheckoutPayment(userId, orderId, amount, description, metadata = {}) {
    try {
      // Validate inputs
      const sanitizedAmount = sanitizeMongoInput(amount);
      const sanitizedDescription = sanitizeMongoInput(description);

      if (!sanitizedAmount || sanitizedAmount < 0) {
        throw new ValidationError("Amount must be at least 0 PHP (0 centavos)");
      }

      // Verify order exists and belongs to user
      const order = await Order.findById(orderId);
      if (!order) {
        throw new NotFoundError("Order");
      }

      if (order.customerId.toString() !== userId.toString()) {
        throw new ValidationError("Order does not belong to this user");
      }

      // Check for existing successful payment
      const existingPayment = await Payment.findOne({
        orderId,
        status: "succeeded",
      });

      if (existingPayment) {
        throw new ConflictError("Order has already been paid");
      }

      // Generate idempotency key
      const idempotencyKey = crypto.randomBytes(16).toString("hex");

      // Prepare and flatten metadata for PayMongo API compatibility
      const rawMetadata = {
        ...metadata,
        orderId: orderId.toString(),
        userId: userId.toString(),
        orderType: 'checkout'
      };
      const flattenedMetadata = flattenMetadataForPayMongo(rawMetadata);

      logger.info("Creating PayMongo payment intent with metadata:", {
        originalKeys: Object.keys(rawMetadata),
        flattenedKeys: Object.keys(flattenedMetadata)
      });

      // Create payment intent with PayMongo
      const paymentIntent = await paymongoClient.createPaymentIntent(
        sanitizedAmount,
        sanitizedDescription,
        flattenedMetadata
      );

      // Create payment record in database
      const payment = new Payment({
        userId,
        orderId,
        type: "checkout",
        provider: "paymongo",
        amount: sanitizedAmount,
        fee: Math.round(sanitizedAmount * 0.035), // 3.5% fee estimate
        netAmount: sanitizedAmount,
        currency: "PHP",
        description: sanitizedDescription,
        status: "awaiting_payment",
        paymentIntentId: paymentIntent.data.id,
        idempotencyKey,
        gatewayResponse: paymentIntent,
        metadata: new Map(Object.entries(metadata)),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
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

  /**
   * Create QRPH Payment (pre-order payment with QR code)
   * This creates a payment that stores checkout data for backend-driven order creation
   * Orders will be created automatically when webhook confirms payment success
   * @param {ObjectId} userId - User making the payment
   * @param {Number} amount - Amount in centavos
   * @param {String} description - Payment description
   * @param {Object} metadata - Additional metadata
   * @param {Object} checkoutData - Cart items and shipping details for order creation
   */
  async createQRPHPayment(userId, amount, description, metadata = {}, checkoutData = null) {
    try {
      // Validate inputs
      const sanitizedAmount = sanitizeMongoInput(amount);
      const sanitizedDescription = sanitizeMongoInput(description);

      if (!sanitizedAmount || sanitizedAmount < 0) {
        throw new ValidationError("Amount must be at least 0 PHP (0 centavos)");
      }

      // Validate checkoutData is provided for QRPH payments
      if (!checkoutData || !checkoutData.items || checkoutData.items.length === 0) {
        throw new ValidationError("Checkout data with items is required for QRPH payment");
      }

      // Validate required checkout fields
      if (!checkoutData.customerName) {
        throw new ValidationError("Customer name is required");
      }
      if (!checkoutData.phone) {
        throw new ValidationError("Phone number is required");
      }
      if (!checkoutData.shippingAddress) {
        throw new ValidationError("Shipping address is required");
      }

      // Validate each item has required fields
      for (const item of checkoutData.items) {
        if (!item.vendorId) {
          throw new ValidationError("Each item must have a vendorId");
        }
        if (!item.productId) {
          throw new ValidationError("Each item must have a productId");
        }
        if (!item.price || item.price <= 0) {
          throw new ValidationError("Each item must have a valid price");
        }
        if (!item.quantity || item.quantity <= 0) {
          throw new ValidationError("Each item must have a valid quantity");
        }
      }

      // Generate idempotency key
      const idempotencyKey = crypto.randomBytes(16).toString("hex");

      // Prepare and flatten metadata for PayMongo API compatibility
      const rawMetadata = {
        ...metadata,
        userId: userId.toString(),
        paymentMethod: 'qrph',
        orderType: 'preorder',
        itemCount: checkoutData.items.length.toString()
      };
      const flattenedMetadata = flattenMetadataForPayMongo(rawMetadata);

      logger.info("Creating QRPH PayMongo payment intent with metadata:", {
        originalKeys: Object.keys(rawMetadata),
        flattenedKeys: Object.keys(flattenedMetadata),
        itemCount: checkoutData.items.length
      });

      // Create payment intent with PayMongo for QRPH
      const paymentIntent = await paymongoClient.createPaymentIntent(
        sanitizedAmount,
        sanitizedDescription,
        flattenedMetadata
      );

      logger.info("PayMongo payment intent created:", {
        paymentIntentId: paymentIntent.data.id
      });

      // Create QRPH payment method
      const paymentMethod = await paymongoClient.createPaymentMethod("qrph", {});
      
      logger.info("QRPH payment method created:", {
        paymentMethodId: paymentMethod.data.id
      });

      // Attach payment method to get QR code
      const attachedIntent = await paymongoClient.attachPaymentMethod(
        paymentIntent.data.id,
        paymentMethod.data.id,
        process.env.PAYMENT_RETURN_URL || "http://localhost:5173/orders"
      );

      logger.info("Payment method attached:", {
        paymentIntentId: attachedIntent.data.id,
        hasNextAction: !!attachedIntent.data.attributes.next_action,
        nextActionType: attachedIntent.data.attributes.next_action?.type
      });

      // Get the QR code from PayMongo's response
      let qrCodeUrl = null;
      
      // PayMongo provides the QR code after attaching the payment method
      if (attachedIntent.data.attributes.next_action && 
          attachedIntent.data.attributes.next_action.code && 
          attachedIntent.data.attributes.next_action.code.image_url) {
        qrCodeUrl = attachedIntent.data.attributes.next_action.code.image_url;
        logger.info("QR code URL extracted from PayMongo:", qrCodeUrl);
      } else {
        logger.warn("No QR code URL found in PayMongo response, next_action:", 
          JSON.stringify(attachedIntent.data.attributes.next_action, null, 2));
      }

      // Set expiration to 5 minutes for QRPH
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Create payment record in database
      const payment = new Payment({
        userId,
        type: "checkout",
        provider: "paymongo",
        amount: sanitizedAmount,
        fee: Math.round(sanitizedAmount * 0.025), // 2.5% fee for QRPH
        netAmount: sanitizedAmount - Math.round(sanitizedAmount * 0.025),
        currency: "PHP",
        description: sanitizedDescription,
        status: "awaiting_payment",
        paymentIntentId: paymentIntent.data.id,
        idempotencyKey,
        gatewayResponse: paymentIntent,
        metadata: new Map(Object.entries({ ...metadata, paymentMethod: 'qrph' })),
        expiresAt,
        // Store checkout data for backend-driven order creation
        checkoutData: {
          items: checkoutData.items.map(item => ({
            vendorId: item.vendorId,
            productId: item.productId,
            optionId: item.optionId || null,
            itemId: item.itemId || null,
            name: item.name || '',
            label: item.label || '',
            imgUrl: item.imgUrl || '',
            price: item.price,
            quantity: item.quantity || 1
          })),
          shippingAddress: checkoutData.shippingAddress,
          customerName: checkoutData.customerName,
          phone: checkoutData.phone,
          shippingOption: checkoutData.shippingOption || 'J&T',
          shippingFee: checkoutData.shippingFee || 0,
          agreementDetails: checkoutData.agreementDetails || ''
        },
        ordersCreated: false
      });

      await payment.save();

      logger.info("QRPH payment created with checkout data:", {
        paymentId: payment._id,
        amount: sanitizedAmount,
        expiresAt,
        itemCount: checkoutData.items.length,
        hasCheckoutData: true
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

  /**
   * Generate QR code URL for payment
   * Uses PayMongo's QR payment flow or external QR generator
   * @param {String} paymentIntentId - Payment Intent ID
   * @param {String} clientKey - Client key for the payment
   */
  generateQRCodeUrl(paymentIntentId, clientKey) {
    // PayMongo doesn't directly provide QR images, so we use a QR generator
    // In production, you might want to use PayMongo's checkout page or a proper QR service
    const paymentUrl = `https://pm.link/${paymentIntentId}`;
    
    // Using Google Charts API for QR generation (free, no API key needed)
    // Size 300x300, with the payment URL encoded
    const encodedUrl = encodeURIComponent(paymentUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedUrl}`;
  }

  /**
   * Attach Payment Method to Intent
   * @param {ObjectId} userId - User ID
   * @param {String} paymentIntentId - Payment Intent ID
   * @param {String} paymentMethodId - Payment Method ID
   * @param {String} returnUrl - Return URL after payment
   */
  async attachPaymentMethod(userId, paymentIntentId, paymentMethodId, returnUrl) {
    try {
      // Find payment record
      const payment = await Payment.findOne({ paymentIntentId });
      if (!payment) {
        throw new NotFoundError("Payment");
      }

      // Verify ownership
      if (payment.userId.toString() !== userId.toString()) {
        throw new ValidationError("Payment does not belong to this user");
      }

      // Check if already processed
      if (payment.status === "succeeded") {
        throw new ConflictError("Payment has already been completed");
      }

      // Attach payment method via PayMongo
      const result = await paymongoClient.attachPaymentMethod(
        paymentIntentId,
        paymentMethodId,
        returnUrl
      );

      // Update payment record
      payment.paymentMethodId = paymentMethodId;
      payment.status = "processing";
      payment.gatewayResponse = result;
      await payment.save();

      logger.info("Payment method attached:", {
        paymentId: payment._id,
        paymentIntentId,
      });

      return {
        payment,
        nextAction: result.data.attributes.next_action,
      };
    } catch (error) {
      logger.error("Error attaching payment method:", error);
      throw error;
    }
  }

  /**
   * Check Payment Status
   * @param {String} identifier - Payment Intent ID (pi_xxx) or Payment Record ID (MongoDB ObjectId)
   */
  async checkPaymentStatus(identifier) {
    try {
      let payment;
      let paymentIntentId;

      // Check if the identifier looks like a MongoDB ObjectId (24 hex chars)
      if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
        // It's a MongoDB ObjectId, find payment by _id
        payment = await Payment.findById(identifier);
        if (!payment) {
          throw new NotFoundError("Payment record not found");
        }
        paymentIntentId = payment.paymentIntentId;
        
        if (!paymentIntentId) {
          throw new ValidationError("Payment record does not have a valid PayMongo payment intent ID");
        }
      } else if (identifier.startsWith('pi_')) {
        // It's a PayMongo payment intent ID, find payment by paymentIntentId
        paymentIntentId = identifier;
        payment = await Payment.findOne({ paymentIntentId });
        if (!payment) {
          throw new NotFoundError("Payment record not found for this payment intent");
        }
      } else {
        throw new ValidationError("Invalid payment identifier. Must be a MongoDB ObjectId or PayMongo payment intent ID (starting with 'pi_')");
      }

      logger.info("Checking payment status:", {
        identifier,
        paymentIntentId,
        paymentRecordId: payment._id
      });

      // Retrieve from PayMongo using the payment intent ID
      const paymentIntent = await paymongoClient.retrievePaymentIntent(paymentIntentId);

      const gatewayStatus = paymentIntent.data.attributes.status;
      
      // Update local status based on gateway status
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
          
          // Check if this is a QRPH payment with checkout data that needs order creation
          // This is a fallback in case webhook didn't arrive or failed
          if (payment.type === "checkout" && payment.checkoutData && !payment.ordersCreated) {
            logger.info("Creating orders from payment status check (webhook fallback):", {
              paymentId: payment._id,
              hasCheckoutData: !!payment.checkoutData,
              itemCount: payment.checkoutData?.items?.length || 0
            });
            
            try {
              // Create orders from stored checkout data
              const orderIds = await this.createOrdersFromPayment(payment);
              
              logger.info("Orders created successfully via status check fallback:", {
                paymentId: payment._id,
                orderIds
              });
            } catch (orderError) {
              logger.error("Failed to create orders from status check:", {
                paymentId: payment._id,
                error: orderError.message
              });
              // Don't throw - status check should still return payment info
              // Orders can be recovered manually via admin
            }
          } else if (payment.orderId) {
            // Legacy flow - update existing order
            await Order.findByIdAndUpdate(payment.orderId, {
              paymentStatus: "Paid",
              paidAt: new Date(),
              paymentId: payment._id,
            });
          }
        } else if (newStatus === "failed") {
          payment.isFinal = true;
          payment.failureReason = paymentIntent.data.attributes.last_payment_error?.message || "Payment failed";
        }

        await payment.save();

        logger.info("Payment status updated:", {
          paymentId: payment._id,
          paymentIntentId,
          oldStatus: previousStatus,
          newStatus,
        });
      } else if (payment.status === "succeeded" && payment.checkoutData && !payment.ordersCreated) {
        // Payment was already marked succeeded but orders weren't created
        // This can happen if webhook and polling both detected success but order creation failed
        logger.info("Attempting order creation for already-succeeded payment:", {
          paymentId: payment._id
        });
        
        try {
          const orderIds = await this.createOrdersFromPayment(payment);
          logger.info("Orders created for already-succeeded payment:", {
            paymentId: payment._id,
            orderIds
          });
        } catch (orderError) {
          logger.error("Failed to create orders for already-succeeded payment:", {
            paymentId: payment._id,
            error: orderError.message
          });
        }
      }

      return payment;
    } catch (error) {
      logger.error("Error checking payment status:", error);
      throw error;
    }
  }

  /**
   * Create Refund for a Payment
   * @param {ObjectId} userId - User requesting refund (vendor/admin)
   * @param {String} paymentId - Original payment ID
   * @param {Number} amount - Amount to refund (optional for partial)
   * @param {String} reason - Refund reason
   * @param {Object} metadata - Additional metadata
   */
  async createRefund(userId, paymentId, amount, reason, metadata = {}) {
    try {
      // Find original payment
      const originalPayment = await Payment.findById(paymentId);
      if (!originalPayment) {
        throw new NotFoundError("Payment");
      }

      // Validate refund eligibility
      if (originalPayment.status !== "succeeded") {
        throw new ValidationError("Only succeeded payments can be refunded");
      }

      if (originalPayment.type !== "checkout") {
        throw new ValidationError("Only checkout payments can be refunded");
      }

      // Check refund amount
      const refundAmount = amount || originalPayment.amount;
      if (refundAmount > originalPayment.amount) {
        throw new ValidationError("Refund amount cannot exceed original payment amount");
      }

      // Check for existing refunds
      const existingRefunds = await Payment.find({
        orderId: originalPayment.orderId,
        type: "refund",
        status: { $in: ["succeeded", "processing"] },
      });

      const totalRefunded = existingRefunds.reduce((sum, refund) => sum + refund.amount, 0);
      if (totalRefunded + refundAmount > originalPayment.amount) {
        throw new ValidationError("Total refund amount would exceed original payment");
      }

      // Create refund with PayMongo
      const paymongoPaymentId = originalPayment.gatewayResponse?.data?.id;
      if (!paymongoPaymentId) {
        throw new ValidationError("Original payment does not have a valid gateway payment ID");
      }

      // Prepare and flatten metadata for PayMongo API compatibility
      const rawRefundMetadata = {
        ...metadata,
        originalPaymentId: paymentId,
        refundReason: reason,
        refundAmount: refundAmount.toString()
      };
      const flattenedRefundMetadata = flattenMetadataForPayMongo(rawRefundMetadata);

      const refundResult = await paymongoClient.createRefund(
        paymongoPaymentId,
        refundAmount,
        reason,
        flattenedRefundMetadata
      );

      // Create refund payment record
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
        metadata: new Map(Object.entries({ ...metadata, originalPaymentId: paymentId })),
      });

      await refundPayment.save();

      // Update original payment status
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

  /**
   * Create Cash-in Payment (Wallet Top-up)
   * @param {ObjectId} userId - User topping up wallet
   * @param {Number} amount - Amount in centavos
   * @param {String} paymentMethod - Payment method type
   */
  async createCashIn(userId, amount, paymentMethod = "gcash") {
    try {
      const sanitizedAmount = sanitizeMongoInput(amount);

      if (!sanitizedAmount || sanitizedAmount < 0) {
        throw new ValidationError("Minimum cash-in amount is 0 PHP (0 centavos)");
      }

      if (sanitizedAmount > 10000000) {
        throw new ValidationError("Maximum cash-in amount is 100,000 PHP");
      }

      // Prepare and flatten metadata for PayMongo API compatibility
      const rawMetadata = {
        userId: userId.toString(),
        type: "cash_in",
        paymentMethod: paymentMethod
      };
      const flattenedMetadata = flattenMetadataForPayMongo(rawMetadata);

      // Create payment intent
      const paymentIntent = await paymongoClient.createPaymentIntent(
        sanitizedAmount,
        "Wallet Top-up",
        flattenedMetadata
      );

      // Create cash-in payment record
      const payment = new Payment({
        userId,
        type: "cash_in",
        provider: "paymongo",
        amount: sanitizedAmount,
        fee: Math.round(sanitizedAmount * 0.025), // 2.5% fee for wallet top-ups
        netAmount: sanitizedAmount,
        currency: "PHP",
        description: "Wallet Top-up",
        status: "awaiting_payment",
        paymentIntentId: paymentIntent.data.id,
        gatewayResponse: paymentIntent,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await payment.save();

      logger.info("Cash-in payment created:", {
        paymentId: payment._id,
        userId,
        amount: sanitizedAmount,
      });

      return {
        payment,
        clientKey: paymentIntent.data.attributes.client_key,
        paymentIntentId: paymentIntent.data.id,
      };
    } catch (error) {
      logger.error("Error creating cash-in:", error);
      throw error;
    }
  }

  /**
   * Create Withdrawal (Vendor Payout)
   * @param {ObjectId} vendorId - Vendor requesting withdrawal
   * @param {Number} amount - Amount in centavos
   * @param {Object} bankAccount - Bank account details
   */
  async createWithdrawal(vendorId, amount, bankAccount) {
    try {
      const sanitizedAmount = sanitizeMongoInput(amount);

      if (!sanitizedAmount || sanitizedAmount < 100000) {
        throw new ValidationError("Minimum withdrawal amount is 1,000 PHP");
      }

      // Validate bank account details
      if (!bankAccount?.accountNumber || !bankAccount?.accountName || !bankAccount?.bankName) {
        throw new ValidationError("Complete bank account details are required");
      }

      // TODO: Check vendor balance and eligibility
      // This would integrate with a wallet/balance system

      // Create withdrawal payment record
      const payment = new Payment({
        userId: vendorId,
        type: "withdraw",
        provider: "bank_transfer",
        amount: sanitizedAmount,
        fee: Math.round(sanitizedAmount * 0.02) + 2500, // 2% + 25 PHP fixed fee
        netAmount: sanitizedAmount,
        currency: "PHP",
        description: "Vendor Withdrawal",
        status: "pending",
        bankAccount: {
          accountNumber: sanitizeMongoInput(bankAccount.accountNumber),
          accountName: sanitizeMongoInput(bankAccount.accountName),
          bankName: sanitizeMongoInput(bankAccount.bankName),
        },
      });

      await payment.save();

      logger.info("Withdrawal created:", {
        paymentId: payment._id,
        vendorId,
        amount: sanitizedAmount,
      });

      // TODO: Trigger manual review/approval workflow

      return payment;
    } catch (error) {
      logger.error("Error creating withdrawal:", error);
      throw error;
    }
  }

  /**
   * Get User Payments
   * @param {ObjectId} userId - User ID
   * @param {String} type - Payment type filter
   * @param {Number} limit - Results limit
   */
  async getUserPayments(userId, type = null, limit = 50) {
    try {
      const query = { userId };
      if (type) {
        query.type = type;
      }

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

  /**
   * Create orders from payment checkout data
   * Groups items by vendor and creates separate orders for each
   * Uses non-transactional approach for better reliability on single-node MongoDB
   * @param {Object} payment - Payment document with checkoutData
   * @returns {Array} Array of created order IDs
   */
  async createOrdersFromPayment(payment) {
    const createdOrderIds = [];
    
    try {
      // Re-fetch payment to ensure we have latest data with populated fields
      const freshPayment = await Payment.findById(payment._id);
      if (!freshPayment) {
        throw new NotFoundError("Payment not found");
      }

      // Check if orders already created (idempotency check)
      if (freshPayment.ordersCreated) {
        logger.info("Orders already created for this payment:", {
          paymentId: freshPayment._id,
          orderIds: freshPayment.orderIds
        });
        return freshPayment.orderIds || [];
      }

      // Lightweight lock to avoid duplicate order creation when webhook and polling race
      const staleLockCutoff = new Date(Date.now() - 10 * 60 * 1000); // allow retry after 10 minutes
      const lockResult = await Payment.updateOne(
        {
          _id: payment._id,
          ordersCreated: false,
          $or: [
            { orderCreationError: { $ne: "in_progress" } },
            { updatedAt: { $lt: staleLockCutoff } }
          ]
        },
        { $set: { orderCreationError: "in_progress" } }
      );

      const wasLocked = (lockResult.modifiedCount ?? lockResult.nModified ?? 0) > 0;
      if (!wasLocked) {
        const existing = await Payment.findById(payment._id, "orderIds ordersCreated orderCreationError updatedAt");
        logger.warn("Order creation skipped because another worker is handling it", {
          paymentId: payment._id,
          ordersCreated: existing?.ordersCreated,
          orderIds: existing?.orderIds,
          orderCreationError: existing?.orderCreationError,
          updatedAt: existing?.updatedAt
        });
        return existing?.orderIds || [];
      }

      const checkoutData = freshPayment.checkoutData;
      const userId = freshPayment.userId;
      const paymentId = freshPayment._id;
      
      // Validate checkout data exists
      if (!checkoutData) {
        logger.error("No checkout data in payment:", { paymentId });
        throw new ValidationError("No checkout data found in payment");
      }

      // Convert checkoutData to plain object if it's a Mongoose subdocument
      const checkoutDataObj = checkoutData.toObject ? checkoutData.toObject() : 
                              (typeof checkoutData === 'object' ? JSON.parse(JSON.stringify(checkoutData)) : checkoutData);
      
      if (!checkoutDataObj.items || checkoutDataObj.items.length === 0) {
        logger.error("No items in checkout data:", { paymentId, checkoutData: checkoutDataObj });
        throw new ValidationError("No items found in checkout data");
      }

      logger.info("Creating orders from payment:", {
        paymentId,
        itemCount: checkoutDataObj.items.length,
        customerName: checkoutDataObj.customerName,
        hasShippingAddress: !!checkoutDataObj.shippingAddress,
        shippingOption: checkoutDataObj.shippingOption
      });

      // Group items by vendor
      const groupedItems = {};
      for (const item of checkoutDataObj.items) {
        // Handle vendorId whether it's a string, ObjectId, or object with _id
        let vendorId = null;
        if (item.vendorId) {
          if (typeof item.vendorId === 'object' && item.vendorId._id) {
            vendorId = item.vendorId._id.toString();
          } else {
            vendorId = item.vendorId.toString();
          }
        }
        
        if (!vendorId) {
          logger.warn("Item missing vendorId, skipping:", { item: JSON.stringify(item) });
          continue;
        }
        if (!groupedItems[vendorId]) {
          groupedItems[vendorId] = [];
        }
        groupedItems[vendorId].push(item);
      }

      if (Object.keys(groupedItems).length === 0) {
        logger.error("No valid items with vendorId found:", { paymentId });
        throw new ValidationError("No valid items with vendorId found");
      }

      // Create orders WITHOUT transaction for better reliability
      for (const [vendorId, items] of Object.entries(groupedItems)) {
        try {
          // Calculate subtotal for this vendor's items
          const subTotal = items.reduce((total, item) => {
            return total + (Number(item.price || 0) * Number(item.quantity || 1));
          }, 0);

          // Create order data
          const orderData = {
            customerId: userId,
            vendorId: vendorId,
            items: items.map(item => ({
              imgUrl: item.imgUrl || '',
              label: item.label || '',
              quantity: item.quantity || 1,
              productId: item.productId,
              optionId: item.optionId || null,
              price: item.price,
              name: item.name || ''
            })),
            name: checkoutDataObj.customerName || '',
            shippingOption: checkoutDataObj.shippingOption || 'J&T',
            shippingFee: checkoutDataObj.shippingFee || 0,
            agreementDetails: checkoutDataObj.agreementDetails || '',
            subTotal,
            paymentStatus: 'Paid',
            shippingAddress: checkoutDataObj.shippingAddress || {},
            trackingNumber: generateTrackingNumber(),
            paymentMethod: 'qrph',
            paymentId: paymentId,
            paidAt: new Date(),
            status: 'paid',
            escrowStatus: 'held'
          };

          logger.info("Creating order for vendor:", {
            vendorId,
            itemCount: items.length,
            subTotal,
            customerName: orderData.name
          });

          // Create and save order
          const order = new Order(orderData);
          const savedOrder = await order.save();
          createdOrderIds.push(savedOrder._id);

          logger.info("Order created successfully:", {
            orderId: savedOrder._id,
            vendorId,
            itemCount: items.length,
            subTotal
          });

          // Update vendor revenue (non-critical, don't fail order creation)
          try {
            await updateVendorRevenue(vendorId, subTotal);
          } catch (revenueError) {
            logger.error("Failed to update vendor revenue (non-critical):", {
              vendorId,
              error: revenueError.message
            });
          }
        } catch (orderError) {
          logger.error("Failed to create order for vendor:", {
            vendorId,
            error: orderError.message,
            stack: orderError.stack
          });
          // Continue with other vendors even if one fails
        }
      }

      // Update payment with created order IDs
      if (createdOrderIds.length > 0) {
        await Payment.findByIdAndUpdate(paymentId, {
          orderIds: createdOrderIds,
          ordersCreated: true,
          orderCreationError: null
        });

        // Update admin stats (non-critical)
        try {
          await Admin.updateOne(
            {},
            { $inc: { totalOrders: createdOrderIds.length, newOrdersCount: createdOrderIds.length } }
          );
        } catch (adminError) {
          logger.error("Failed to update admin stats (non-critical):", adminError.message);
        }

        // Invalidate user/vendor/order caches so newly created orders show immediately
        if (isRedisAvailable()) {
          try {
            const vendorIds = Object.keys(groupedItems);
            const orderKeys = createdOrderIds.map(id => getOrderKey(id.toString()));
            await safeDel([
              getUserOrdersKey(userId),
              ...vendorIds.map(getVendorOrdersKey),
              ...orderKeys
            ]);

            // Optionally clear product order caches if productId present
            const productKeys = [];
            for (const items of Object.values(groupedItems)) {
              for (const item of items) {
                if (item.productId) {
                  productKeys.push(getProductOrdersKey(item.productId.toString())) ;
                }
              }
            }
            if (productKeys.length) {
              await safeDel(productKeys);
            }

            await safeDel("adminDashboardStats");
          } catch (cacheErr) {
            logger.warn("Order cache invalidation failed:", cacheErr.message);
          }
        }

        logger.info("Orders created successfully from payment:", {
          paymentId,
          orderIds: createdOrderIds,
          orderCount: createdOrderIds.length
        });
      } else {
        // No orders were created - this is a critical failure
        const errorMsg = "Failed to create any orders from payment";
        await Payment.findByIdAndUpdate(paymentId, {
          orderCreationError: errorMsg
        });
        throw new Error(errorMsg);
      }

      return createdOrderIds;
    } catch (error) {
      logger.error("Error creating orders from payment:", {
        paymentId: payment._id,
        error: error.message,
        stack: error.stack
      });
      
      // Store error in payment for debugging (and release lock)
      try {
        await Payment.findByIdAndUpdate(payment._id, {
          orderCreationError: error.message,
          ordersCreated: false
        });
      } catch (updateError) {
        logger.error("Failed to update payment with error:", updateError.message);
      }
      
      throw error;
    }
  }

  /**
   * Process Webhook Event
   * @param {Object} payload - Webhook payload
   * @param {String} signature - Webhook signature
   */
  async processWebhook(payload, signature) {
    try {
      // Verify signature
      const isValid = paymongoClient.verifyWebhookSignature(payload, signature);
      if (!isValid) {
        throw new ValidationError("Invalid webhook signature");
      }

      const eventType = payload?.data?.attributes?.type;
      const paymentData = payload?.data?.attributes?.data;
      const paymentResourceId = paymentData?.id; // pay_xxx
      const paymentAttributes = paymentData?.attributes || {};
      const paymentIntentId = paymentAttributes.payment_intent_id || paymentAttributes.payment_intent?.id;

      logger.info("Processing webhook:", { eventType, paymentIntentId, paymentResourceId });

      // Find payment by intent ID (preferred) then fall back to payment resource id
      let payment = null;
      if (paymentIntentId) {
        payment = await Payment.findOne({ paymentIntentId });
      }
      if (!payment && paymentResourceId) {
        payment = await Payment.findOne({ chargeId: paymentResourceId });
      }
      if (!payment) {
        logger.warn("Payment not found for webhook", { paymentIntentId, paymentResourceId });
        return;
      }

      // Backfill missing paymentIntentId if webhook carried it
      if (!payment.paymentIntentId && paymentIntentId) {
        payment.paymentIntentId = paymentIntentId;
      }

      // Mark webhook as received
      payment.webhookReceived = true;
      payment.webhookData = payload;

      // Handle different event types
      switch (eventType) {
        case "payment.paid":
          await payment.markAsSucceeded(payload);
          
          // Check if this is a QRPH payment with checkout data that needs order creation
          if (payment.type === "checkout" && payment.checkoutData && !payment.ordersCreated) {
            logger.info("Creating orders from QRPH payment webhook:", {
              paymentId: payment._id,
              hasCheckoutData: !!payment.checkoutData,
              itemCount: payment.checkoutData?.items?.length || 0
            });
            
            try {
              // Create orders from stored checkout data
              const orderIds = await this.createOrdersFromPayment(payment);
              
              logger.info("Orders created successfully via webhook:", {
                paymentId: payment._id,
                orderIds
              });
            } catch (orderError) {
              logger.error("Failed to create orders from webhook:", {
                paymentId: payment._id,
                error: orderError.message
              });
              // Don't throw - webhook should still acknowledge receipt
              // Orders can be recovered manually via admin
            }
          } else if (payment.type === "checkout" && payment.orderId) {
            // Legacy flow - update existing order
            await Order.findByIdAndUpdate(payment.orderId, {
              paymentStatus: "Paid",
              paidAt: new Date(),
              paymentId: payment._id,
            });
          }
          break;

        case "payment.failed":
          const failureReason = payload.data.attributes.data.attributes.last_payment_error?.message;
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

  /**
   * Manually trigger order creation for a payment
   * Used for recovery when webhook fails or for admin intervention
   * @param {String} paymentId - Payment ID
   */
  async recoverOrdersForPayment(paymentId) {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new NotFoundError("Payment");
      }

      if (payment.status !== "succeeded") {
        throw new ValidationError("Payment has not succeeded yet");
      }

      if (payment.ordersCreated) {
        throw new ConflictError("Orders have already been created for this payment");
      }

      if (!payment.checkoutData || !payment.checkoutData.items || payment.checkoutData.items.length === 0) {
        throw new ValidationError("No checkout data found in payment");
      }

      const orderIds = await this.createOrdersFromPayment(payment);
      
      return {
        success: true,
        orderIds,
        message: `${orderIds.length} order(s) created successfully`
      };
    } catch (error) {
      logger.error("Error recovering orders for payment:", error);
      throw error;
    }
  }
}

module.exports = new PaymentService();