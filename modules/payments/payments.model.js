const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ✅ IMPORTANT: add orderId (missing before)
    // For "pay first" flows (QRPH/GCash/PayMaya), this can be undefined until orders are created.
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: undefined, // ✅ do NOT store null
      index: true,
    },

    provider: {
      type: String,
      enum: [
        "paymongo",
        "paymaya",
        "gcash",
        "wallet",
        "cod",
        "bank_transfer",
        "qrph",
        "card",
        "grab_pay",
        "maya",
      ],
      required: true,
      default: "paymongo",
    },

    type: {
      type: String,
      enum: ["checkout", "refund", "withdraw", "cash_in", "subscription"],
      required: true,
      index: true,
    },

    paymentIntentId: { type: String, default: undefined, index: true },
    paymentMethodId: { type: String, default: undefined },
    chargeId: { type: String, default: undefined, index: true },
    refundId: { type: String, default: undefined, index: true },

    amount: {
      type: Number,
      required: true,
      min: [0, "Amount must be at least 0 centavos"],
      validate: {
        validator: Number.isInteger,
        message: "Amount must be an integer (in centavos)",
      },
    },
    fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "PHP",
      uppercase: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "awaiting_payment",
        "succeeded",
        "failed",
        "rejected",
        "cancelled",
        "refunded",
        "partially_refunded",
        "expired",
      ],
      default: "pending",
      index: true,
    },

    description: {
      type: String,
      maxlength: 500,
      trim: true,
    },

    metadata: {
      type: Map,
      of: String,
    },

    isFinal: {
      type: Boolean,
      default: false,
    },

    idempotencyKey: {
      type: String,
      default: undefined,
      index: true,
    },

    failureReason: {
      type: String,
      maxlength: 1000,
    },

    retryCount: {
      type: Number,
      default: 0,
    },

    gatewayResponse: mongoose.Schema.Types.Mixed,

    webhookReceived: {
      type: Boolean,
      default: false,
    },
    webhookData: mongoose.Schema.Types.Mixed,

    bankAccount: {
      accountNumber: String,
      accountName: String,
      bankName: String,
    },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: Date,
    rejectionReason: String,
    adminProofUrl: String,
    payoutRef: String,

    checkoutData: {
      items: [
        {
          vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          productId: { type: mongoose.Schema.Types.ObjectId, ref: "Products" },
          optionId: { type: mongoose.Schema.Types.ObjectId },
          itemId: String,
          name: String,
          label: String,
          imgUrl: String,
          price: Number,
          quantity: { type: Number, default: 1 },
        },
      ],
      shippingAddress: {
        street: String,
        barangay: String,
        city: String,
        province: String,
        zipCode: String,
      },
      customerName: String,
      phone: String,
      shippingOption: String,
      shippingFee: { type: Number, default: 0 },
      agreementDetails: String,
    },

    ordersCreated: {
      type: Boolean,
      default: false,
    },
    orderCreationError: String,

    orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],

    paidAt: Date,

    walletCredited: {
      type: Boolean,
      default: false,
    },
    walletCreditedAt: Date,

    refundedAt: Date,
    expiresAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/**
 * =========================
 * Indexes
 * =========================
 */

PaymentSchema.index({ userId: 1, type: 1, status: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ type: 1, status: 1, createdAt: -1 });

/**
 * ✅ IMPORTANT FIX:
 * Unique (orderId, type) ONLY when orderId exists (not null)
 * This prevents E11000 for { orderId: null, type: "checkout" }
 */
PaymentSchema.index(
  { orderId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { orderId: { $exists: true, $ne: null } },
  },
);

/**
 * Optional but recommended: avoid duplicates if PayMongo sends same IDs again
 */
PaymentSchema.index(
  { paymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentIntentId: { $type: "string" } },
  },
);

PaymentSchema.index(
  { chargeId: 1 },
  {
    unique: true,
    partialFilterExpression: { chargeId: { $type: "string" } },
  },
);

PaymentSchema.index({ userId: 1, type: 1, status: 1, createdAt: -1 });
PaymentSchema.index({ userId: 1, type: 1, createdAt: -1 })


/**
 * Your idempotency index (unique per userId)
 */
PaymentSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

/**
 * Keep netAmount consistent
 */
PaymentSchema.pre("save", function (next) {
  if (this.isModified("amount") || this.isModified("fee")) {
    this.netAmount = this.amount - this.fee;
  }
  next();
});

PaymentSchema.methods.markAsSucceeded = function (gatewayData = {}) {
  this.status = "succeeded";
  this.isFinal = true;
  this.paidAt = new Date();
  this.gatewayResponse = gatewayData;
  return this.save();
};

PaymentSchema.methods.markAsFailed = function (reason, gatewayData = {}) {
  this.status = "failed";
  this.isFinal = true;
  this.failureReason = reason;
  this.gatewayResponse = gatewayData;
  return this.save();
};

PaymentSchema.methods.markAsRefunded = function (refundData = {}) {
  this.status = "refunded";
  this.isFinal = true;
  this.refundedAt = new Date();
  this.gatewayResponse = refundData;
  return this.save();
};

PaymentSchema.methods.canBeRefunded = function () {
  return (
    this.status === "succeeded" && this.type === "checkout" && !this.isFinal
  );
};

PaymentSchema.methods.incrementRetry = function () {
  this.retryCount += 1;
  return this.save();
};

PaymentSchema.statics.findByIntent = function (paymentIntentId) {
  return this.findOne({ paymentIntentId });
};

PaymentSchema.statics.findUserPayments = function (userId, type = null) {
  const query = { userId };
  if (type) query.type = type;
  return this.find(query).sort({ createdAt: -1 });
};

PaymentSchema.statics.getTotalRevenue = async function (startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        type: "checkout",
        status: "succeeded",
        paidAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$netAmount" },
        totalTransactions: { $sum: 1 },
      },
    },
  ]);
};

module.exports = mongoose.model("Payment", PaymentSchema);
