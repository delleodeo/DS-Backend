const mongoose = require('mongoose');

// Cart configuration constants
const CART_CONFIG = {
  MAX_QUANTITY: parseInt(process.env.CART_MAX_QUANTITY) || 50,
  DEFAULT_SHIPPING_FEE: parseInt(process.env.CART_SHIPPING_FEE) || 50,
};

const CartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  optionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: false },
  quantity: { type: Number, default: 1, min: 1, max: CART_CONFIG.MAX_QUANTITY}
}, { _id: false });

const CartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shippingFee: {type: Number, default: CART_CONFIG.DEFAULT_SHIPPING_FEE},
  items: [CartItemSchema],
  updatedAt: { type: Date, default: Date.now }
});

// Add index on userId for faster lookups
CartSchema.index({ userId: 1 });

module.exports = mongoose.model('Cart', CartSchema);
