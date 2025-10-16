const mongoose = require('mongoose');

const CartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  optionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: false },
  quantity: { type: Number, default: 1, min: 1, max: 50}
}, { _id: false });

const CartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shippingFee: {type: Number, default: 50},
  items: [CartItemSchema],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', CartSchema);
