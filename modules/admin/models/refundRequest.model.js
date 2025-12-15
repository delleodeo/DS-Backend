const mongoose = require('mongoose');

const RefundRequestSchema = new mongoose.Schema({
  // Order reference
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  
  // Customer who requested
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Vendor
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  
  // Items being refunded (can be partial refund)
  items: [{
    orderItemId: mongoose.Schema.Types.ObjectId,
    productId: mongoose.Schema.Types.ObjectId,
    productName: String,
    optionId: mongoose.Schema.Types.ObjectId,
    optionLabel: String,
    quantity: Number,
    price: Number,
    refundAmount: Number
  }],
  
  // Amounts
  totalRefundAmount: {
    type: Number,
    required: true
  },
  commissionRefund: {
    type: Number,
    default: 0 // Amount of commission to be refunded
  },
  sellerDeduction: {
    type: Number,
    default: 0 // Amount deducted from seller
  },
  
  // Reason & Evidence
  reason: {
    type: String,
    required: true,
    enum: [
      'defective_product',
      'wrong_item_received',
      'item_not_received',
      'item_damaged',
      'not_as_described',
      'changed_mind',
      'duplicate_order',
      'other'
    ]
  },
  reasonDetails: String,
  evidenceUrls: [String],
  evidencePublicIds: [String],
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'processed', 'cancelled'],
    default: 'pending'
  },
  
  // Admin review
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,
  rejectionReason: String,
  
  // Processing details
  processedAt: Date,
  refundMethod: {
    type: String,
    enum: ['wallet', 'original_payment', 'manual'],
    default: 'wallet'
  },
  refundTransactionId: String,
  
  // Vendor response
  vendorResponse: String,
  vendorRespondedAt: Date,
  
  // Timeline for tracking
  timeline: [{
    status: String,
    message: String,
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }]
}, {
  timestamps: true
});

// Indexes
RefundRequestSchema.index({ orderId: 1 });
RefundRequestSchema.index({ customerId: 1 });
RefundRequestSchema.index({ vendorId: 1 });
RefundRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('RefundRequest', RefundRequestSchema);
