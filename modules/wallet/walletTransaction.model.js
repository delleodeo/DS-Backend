/**
 * Wallet Transaction Model
 * Detailed transaction records for audit trail
 */
const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  // Reference to wallet
  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  
  // User who owns the wallet
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Transaction type
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true,
    index: true
  },
  
  // Transaction amount (always positive)
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  
  // Transaction description
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  
  // External reference ID
  reference: {
    type: String,
    index: true
  },
  
  // Reference type for linking to other documents
  referenceType: {
    type: String,
    enum: ['order', 'refund', 'commission', 'withdrawal', 'topup', 'transfer', 'payout', 'adjustment', 'other'],
    default: 'other'
  },
  
  // Reference to the actual document
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'completed',
    index: true
  },
  
  // Balance before transaction
  balanceBefore: {
    type: Number,
    required: true
  },
  
  // Balance after transaction
  balanceAfter: {
    type: Number,
    required: true
  },
  
  // Idempotency key to prevent duplicate transactions
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // IP address for audit
  ipAddress: {
    type: String,
    default: null
  },
  
  // User agent for audit
  userAgent: {
    type: String,
    default: null
  },
  
  // For reversed transactions
  reversedAt: {
    type: Date,
    default: null
  },
  
  reversedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  reversalReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ wallet: 1, type: 1, createdAt: -1 });
walletTransactionSchema.index({ referenceType: 1, referenceId: 1 });
walletTransactionSchema.index({ createdAt: -1 });
walletTransactionSchema.index({ status: 1, createdAt: -1 });

// Static: Get transactions for user
walletTransactionSchema.statics.getForUser = async function(userId, options = {}) {
  const { page = 1, limit = 20, type, status, startDate, endDate } = options;
  const skip = (page - 1) * limit;
  
  const query = { user: userId };
  if (type) query.type = type;
  if (status) query.status = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const [transactions, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);
  
  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Calculate balance from transactions (for verification)
walletTransactionSchema.statics.calculateBalance = async function(userId) {
  const result = await this.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), status: 'completed' } },
    {
      $group: {
        _id: null,
        credits: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
        debits: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } }
      }
    }
  ]);
  
  if (result.length === 0) return 0;
  return result[0].credits - result[0].debits;
};

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

module.exports = WalletTransaction;
