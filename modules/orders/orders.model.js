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

  // 🕒 Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Order", OrderSchema);
