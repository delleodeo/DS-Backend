const mongoose = require("mongoose");

/**
 * Payment Schema - Handles all payment transactions
 * Supports: Order Checkout, Refund, Withdraw (Vendor Payout), Cash-in (Wallet Top-up)
 */
const PaymentSchema = new mongoose.Schema(
  {
    // 🔗 Reference IDs
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true
    },
    
    // 💳 Payment Provider
    provider: {
      type: String,
      enum: ["paymongo", "gcash", "wallet", "cod", "bank_transfer"],
      required: true,
      default: "paymongo"
    },

    // 🎯 Payment Purpose/Type
    type: {
      type: String,
      enum: ["checkout", "refund", "withdraw", "cash_in"],
      required: true,
      index: true
    },

    // 🔐 Gateway References
    paymentIntentId: { 
      type: String,
      sparse: true 
    },
    paymentMethodId: { 
      type: String,
      sparse: true
    },
    chargeId: { 
      type: String,
      sparse: true
    },
    refundId: {
      type: String,
      sparse: true
    },

    // 💰 Transaction Amounts
    amount: { 
      type: Number, 
      required: true,
      min: [0, "Amount must be at least 0 centavos"],
      validate: {
        validator: Number.isInteger,
        message: "Amount must be an integer (in centavos)"
      }
    },
    fee: {
      type: Number,
      default: 0,
      min: 0
    },
    netAmount: {
      type: Number,
      required: true
    },
    currency: { 
      type: String, 
      default: "PHP",
      uppercase: true
    },

    // 📌 Payment State
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "awaiting_payment",
        "succeeded",
        "failed",
        "cancelled",
        "refunded",
        "partially_refunded",
        "expired"
      ],
      default: "pending",
      index: true
    },

    // 📝 Additional Details
    description: {
      type: String,
      maxlength: 500,
      trim: true
    },
    metadata: {
      type: Map,
      of: String
    },

    // 🔁 Idempotency & Error Tracking
    isFinal: { 
      type: Boolean, 
      default: false 
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true
    },
    failureReason: {
      type: String,
      maxlength: 1000
    },
    retryCount: {
      type: Number,
      default: 0
    },

    // 📥 Raw Gateway Data
    gatewayResponse: mongoose.Schema.Types.Mixed,

    // 🌐 Webhook Data
    webhookReceived: {
      type: Boolean,
      default: false
    },
    webhookData: mongoose.Schema.Types.Mixed,

    // 💼 For Withdrawals/Payouts
    bankAccount: {
      accountNumber: String,
      accountName: String,
      bankName: String
    },

    // Admin/Approval audit fields for withdrawals
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectionReason: String,
    adminProofUrl: String,
    payoutRef: String,

    // � Checkout Data for QRPH (stored for backend-driven order creation)
    // This allows webhook to create orders automatically when payment succeeds
    checkoutData: {
      items: [{
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Products" },
        optionId: { type: mongoose.Schema.Types.ObjectId },
        itemId: String,
        name: String,
        label: String,
        imgUrl: String,
        price: Number,
        quantity: { type: Number, default: 1 }
      }],
      shippingAddress: {
        street: String,
        barangay: String,
        city: String,
        province: String,
        zipCode: String
      },
      customerName: String,
      phone: String,
      shippingOption: String,
      shippingFee: { type: Number, default: 0 },
      agreementDetails: String
    },
    
    // 📦 Order IDs created from this payment (for multi-vendor orders)
    orderIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    }],
    
    // 🔄 Order creation status
    ordersCreated: {
      type: Boolean,
      default: false
    },
    orderCreationError: String,

    // �🕒 Timestamps
    paidAt: Date,
    refundedAt: Date,
    expiresAt: Date
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// 📊 Indexes for Performance
PaymentSchema.index({ userId: 1, type: 1, status: 1 });
PaymentSchema.index({ orderId: 1, status: 1 });
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ type: 1, status: 1, createdAt: -1 });
PaymentSchema.index({ paymentIntentId: 1 }, { sparse: true });

// 🔄 Pre-save Middleware - Calculate net amount
PaymentSchema.pre("save", function (next) {
  if (this.isModified("amount") || this.isModified("fee")) {
    this.netAmount = this.amount - this.fee;
  }
  next();
});

// 📝 Instance Methods
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
    this.status === "succeeded" &&
    this.type === "checkout" &&
    !this.isFinal
  );
};

PaymentSchema.methods.incrementRetry = function () {
  this.retryCount += 1;
  return this.save();
};

// 📊 Static Methods
PaymentSchema.statics.findByIntent = function (paymentIntentId) {
  return this.findOne({ paymentIntentId });
};

PaymentSchema.statics.findByOrder = function (orderId) {
  return this.find({ orderId }).sort({ createdAt: -1 });
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
        paidAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$netAmount" },
        totalTransactions: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model("Payment", PaymentSchema);

