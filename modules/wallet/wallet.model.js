/**
 * Wallet Model
 * Stores wallet information with transaction history
 */
const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  
  currency: {
    type: String,
    default: 'PHP'
  },
  
  // For USDT or other currencies
  usdtBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Lock status for pending transactions
  isLocked: {
    type: Boolean,
    default: false
  },
  
  lockedAt: {
    type: Date,
    default: null
  },
  
  lockedReason: {
    type: String,
    default: null
  },
  
  // Last activity timestamp
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  
  // Embedded transaction history for quick access (last 10)
  recentTransactions: [{
    type: {
      type: String,
      enum: ['credit', 'debit']
    },
    amount: Number,
    description: String,
    date: { type: Date, default: Date.now },
    reference: mongoose.Schema.Types.ObjectId
  }]
}, {
  timestamps: true
});

// Index for efficient queries
walletSchema.index({ user: 1, balance: 1 });

// Method to safely get balance
walletSchema.methods.getAvailableBalance = function() {
  if (this.isLocked) return 0;
  return this.balance;
};

// Static: Get or create wallet for user
walletSchema.statics.getOrCreateForUser = async function(userId) {
  let wallet = await this.findOne({ user: userId });
  if (!wallet) {
    wallet = new this({ user: userId, balance: 0 });
    await wallet.save();
  }
  return wallet;
};

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
