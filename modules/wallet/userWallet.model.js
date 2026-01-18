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
  
  usdtBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  
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
  
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  
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

walletSchema.index({ user: 1, balance: 1 });
walletSchema.index({ isLocked: 1 });
walletSchema.index({ lastActivityAt: -1 });

walletSchema.methods.getAvailableBalance = function() {
  if (this.isLocked) return 0;
  return this.balance;
};

walletSchema.statics.getOrCreateForUser = async function(userId) {
  let wallet = await this.findOne({ user: userId });
  if (!wallet) {
    wallet = new this({ user: userId, balance: 0 });
    await wallet.save();
  }
  return wallet;
};

const Wallet = mongoose.model('userwallets', walletSchema);

module.exports = Wallet;
