const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    imgUrl: String,
    label: String,
    quantity: { type: Number, default: 1, min: 1 },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Products" },
    optionId: { type: mongoose.Schema.Types.ObjectId },
    price: { type: Number, default: 0 },
    name: String,
  },
  {
    _id: true,
  }
);

const AddressSchema = new mongoose.Schema(
  {
    street: String,
    barangay: String,
    city: String,
    province: String,
    zipCode: String,
  },
  { _id: false }
);

// 💬 Agreement Message Schema
const AgreementMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ["customer", "vendor"],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  items: [OrderItemSchema],
  name: String,

  // 🚚 Delivery Options
  shippingOption: { type: String, default: "J&T" }, // e.g., "J&T", "Pick Up", or "Customer Agreement"
  shippingFee: { type: Number, default: 0 },

  // 📝 Customer Agreement Section
  agreementDetails: { type: String, default: "" }, // customer's initial message
  agreementMessages: [AgreementMessageSchema], // thread of customer & vendor discussion

  // 💵 Order Details
  subTotal: Number,
  paymentStatus: { type: String, default: "Pending" },
  shippingAddress: AddressSchema,
  trackingNumber: String,
  paymentMethod: {
    type: String,
    enum: ["wallet", "gcash", "cod"],
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "paid", "shipped", "delivered", "cancelled"],
    default: "pending",
  },

  // � Commission Tracking
  commissionRate: { type: Number, default: 0.07 }, // 7% platform commission
  commissionAmount: { type: Number, default: 0 },
  sellerEarnings: { type: Number, default: 0 },
  commissionStatus: {
    type: String,
    enum: ["pending", "paid", "waived"],
    default: "pending",
  },
  commissionPaidAt: { type: Date },
  commissionCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  commissionNotes: { type: String },

  // 🕒 Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Pre-save middleware to calculate commission
OrderSchema.pre('save', function(next) {
  if (this.subTotal && this.commissionRate) {
    this.commissionAmount = parseFloat((this.subTotal * this.commissionRate).toFixed(2));
    this.sellerEarnings = parseFloat((this.subTotal - this.commissionAmount).toFixed(2));
    
    // For digital payments (wallet, gcash), mark commission as paid when order is delivered
    // For COD, commission remains pending until manually collected
    if (this.status === 'delivered') {
      if (this.paymentMethod !== 'cod' && this.commissionStatus === 'pending') {
        this.commissionStatus = 'paid';
        this.commissionPaidAt = new Date();
      }
    }
  }
  this.updatedAt = new Date();
  next();
});

// Indexes for commission queries
OrderSchema.index({ commissionStatus: 1, status: 1 });
OrderSchema.index({ vendorId: 1, commissionStatus: 1 });
OrderSchema.index({ paymentMethod: 1, commissionStatus: 1 });

module.exports = mongoose.model("Order", OrderSchema);
