
const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  // Reference to the order
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  
  // The vendor/seller who owes the commission
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // The shop associated with this commission
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  
  // Commission amounts
  orderAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  commissionRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 7 // 7% default commission rate
  },
  
  commissionAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Payment method that triggered this commission
  paymentMethod: {
    type: String,
    enum: ['cod', 'cash_on_delivery'],
    required: true,
    default: 'cod'
  },
  
  // Commission status
  status: {
    type: String,
    enum: ['pending', 'remitted', 'overdue', 'waived', 'disputed'],
    default: 'pending',
    index: true
  },
  
  // Due date for remittance (typically order delivery date + grace period)
  dueDate: {
    type: Date,
    required: true,
    index: true
  },
  
  // Remittance details
  remittedAt: {
    type: Date,
    default: null
  },
  
  remittanceMethod: {
    type: String,
    enum: ['wallet', 'bank_transfer', 'manual', null],
    default: null
  },
  
  // Transaction reference for wallet deduction
  walletTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction',
    default: null
  },
  
  // For idempotency - prevent duplicate remittances
  remittanceIdempotencyKey: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Remittance history
  remittanceHistory: [{
    remittedAt: {
      type: Date,
      default: Date.now
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    method: {
      type: String,
      enum: ['wallet', 'bank_transfer', 'manual'],
      required: true
    },
    walletTransactionId: mongoose.Schema.Types.ObjectId,
    referenceNumber: String,
    notes: String,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled'],
      default: 'completed'
    }
  }],
  
  // Reminder tracking
  remindersSent: {
    type: Number,
    default: 0
  },
  
  lastReminderSentAt: {
    type: Date,
    default: null
  },
  
  // Admin notes for disputes or manual handling
  adminNotes: {
    type: String,
    default: ''
  },
  
  // Audit trail
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'remitted', 'overdue', 'waived', 'disputed']
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  }],
  
  // Metadata
  metadata: {
    orderNumber: String,
    customerName: String,
    deliveredAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
commissionSchema.index({ vendor: 1, status: 1 });
commissionSchema.index({ shop: 1, status: 1 });
commissionSchema.index({ status: 1, dueDate: 1 });
commissionSchema.index({ createdAt: -1 });
commissionSchema.index({ vendor: 1, createdAt: -1 });

// Virtual for days overdue
commissionSchema.virtual('daysOverdue').get(function() {
  if (this.status !== 'pending' && this.status !== 'overdue') return 0;
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = now - due;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Virtual for if reminder is due (every 3 days)
commissionSchema.virtual('isReminderDue').get(function() {
  if (this.status !== 'pending' && this.status !== 'overdue') return false;
  if (!this.lastReminderSentAt) return true;
  
  const now = new Date();
  const lastReminder = new Date(this.lastReminderSentAt);
  const daysSinceLastReminder = Math.floor((now - lastReminder) / (1000 * 60 * 60 * 24));
  return daysSinceLastReminder >= 3;
});

// Pre-save middleware to update status to overdue
commissionSchema.pre('save', function(next) {
  if (this.status === 'pending' && this.dueDate < new Date()) {
    this.status = 'overdue';
    this.statusHistory.push({
      status: 'overdue',
      changedAt: new Date(),
      reason: 'Automatically marked overdue - past due date'
    });
  }
  next();
});

// Static method to get pending commissions for a vendor
commissionSchema.statics.getPendingForVendor = async function(vendorId) {
  return this.find({
    vendor: vendorId,
    status: { $in: ['pending', 'overdue'] }
  })
  .populate('order', 'orderNumber totalAmount status')
  .populate('shop', 'shopName')
  .sort({ dueDate: 1 });
};

// Static method to get total pending commission amount for a vendor
commissionSchema.statics.getTotalPendingAmount = async function(vendorId) {
  const result = await this.aggregate([
    {
      $match: {
        vendor: new mongoose.Types.ObjectId(vendorId),
        status: { $in: ['pending', 'overdue'] }
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$commissionAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return result.length > 0 ? result[0] : { totalAmount: 0, count: 0 };
};

// Static method to get commissions needing reminders
commissionSchema.statics.getCommissionsNeedingReminders = async function() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  
  return this.find({
    status: { $in: ['pending', 'overdue'] },
    $or: [
      { lastReminderSentAt: null },
      { lastReminderSentAt: { $lte: threeDaysAgo } }
    ]
  })
  .populate('vendor', 'name email')
  .populate('shop', 'shopName');
};

// Instance method to mark as remitted
commissionSchema.methods.markAsRemitted = async function(walletTransactionId, remittanceMethod, userId) {
  this.status = 'remitted';
  this.remittedAt = new Date();
  this.remittanceMethod = remittanceMethod;
  this.walletTransactionId = walletTransactionId;
  this.statusHistory.push({
    status: 'remitted',
    changedAt: new Date(),
    changedBy: userId,
    reason: `Remitted via ${remittanceMethod}`
  });
  return this.save();
};

const Commission = mongoose.model('Commission', commissionSchema);

module.exports = Commission;
