/**
 * Notification Model
 * Handles all notification types for sellers, admins, and users
 * 
 * @module notifications/notifications.model
 */
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  // Recipient Information
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recipientRole: {
    type: String,
    enum: ['user', 'vendor', 'admin'],
    required: true,
    index: true
  },

  // Notification Type & Category
  type: {
    type: String,
    enum: [
      // Commission Related
      'PENDING_COMMISSION_REMINDER',
      'COMMISSION_REMITTED',
      'COMMISSION_OVERDUE',
      'COMMISSION_WAIVED',
      
      // Order Related
      'NEW_ORDER',
      'ORDER_SHIPPED',
      'ORDER_DELIVERED',
      'ORDER_CANCELLED',
      
      // Payment Related
      'PAYMENT_RECEIVED',
      'PAYMENT_RELEASED',
      'WITHDRAWAL_APPROVED',
      'WITHDRAWAL_REJECTED',
      
      // Admin Actions
      'PRODUCT_APPROVED',
      'PRODUCT_REJECTED',
      'SELLER_APPLICATION_APPROVED',
      'SELLER_APPLICATION_REJECTED',
      'ACCOUNT_FLAGGED',
      'ACCOUNT_RESTRICTED',
      
      // System
      'SYSTEM_ANNOUNCEMENT',
      'MAINTENANCE_NOTICE'
    ],
    required: true,
    index: true
  },

  category: {
    type: String,
    enum: ['commission', 'order', 'payment', 'admin', 'system'],
    required: true
  },

  // Notification Content
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },

  // Related Data
  metadata: {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Products' },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    commissionAmount: Number,
    totalPendingCommission: Number,
    pendingOrdersCount: Number,
    actionUrl: String,
    additionalData: mongoose.Schema.Types.Mixed
  },

  // Status Tracking
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: Date,

  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Delivery Tracking
  deliveryChannels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },
  deliveryStatus: {
    inApp: { sent: Boolean, sentAt: Date },
    email: { sent: Boolean, sentAt: Date, messageId: String },
    sms: { sent: Boolean, sentAt: Date },
    push: { sent: Boolean, sentAt: Date }
  },

  // Expiration
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiration: 30 days from creation
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    },
    index: { expireAfterSeconds: 0 }  // TTL index
  },

  // Action Required
  requiresAction: {
    type: Boolean,
    default: false
  },
  actionTaken: {
    type: Boolean,
    default: false
  },
  actionTakenAt: Date,

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ recipientRole: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ 'metadata.vendorId': 1, type: 1 });

// Virtual for time since creation
NotificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
});

// Static method to create commission reminder notification
NotificationSchema.statics.createCommissionReminder = async function(vendorUserId, totalPending, pendingCount) {
  return this.create({
    recipientId: vendorUserId,
    recipientRole: 'vendor',
    type: 'PENDING_COMMISSION_REMINDER',
    category: 'commission',
    title: 'Pending Commission Reminder',
    message: `You have ₱${totalPending.toLocaleString('en-PH', { minimumFractionDigits: 2 })} in pending commissions from ${pendingCount} COD order${pendingCount > 1 ? 's' : ''}. Please remit to avoid account restrictions.`,
    metadata: {
      totalPendingCommission: totalPending,
      pendingOrdersCount: pendingCount,
      actionUrl: '/vendor/dashboard/commissions'
    },
    priority: totalPending > 5000 ? 'high' : 'medium',
    requiresAction: true,
    deliveryChannels: {
      inApp: true,
      email: totalPending > 5000 // Email for high amounts
    }
  });
};

// Static method to create commission overdue notification
NotificationSchema.statics.createCommissionOverdue = async function(vendorUserId, totalPending, pendingCount, daysPastDue) {
  return this.create({
    recipientId: vendorUserId,
    recipientRole: 'vendor',
    type: 'COMMISSION_OVERDUE',
    category: 'commission',
    title: 'Commission Overdue - Action Required',
    message: `URGENT: You have ₱${totalPending.toLocaleString('en-PH', { minimumFractionDigits: 2 })} in overdue commissions (${daysPastDue} days). Please remit immediately to avoid account suspension.`,
    metadata: {
      totalPendingCommission: totalPending,
      pendingOrdersCount: pendingCount,
      daysPastDue,
      actionUrl: '/vendor/dashboard/commissions'
    },
    priority: 'urgent',
    requiresAction: true,
    deliveryChannels: {
      inApp: true,
      email: true
    }
  });
};

module.exports = mongoose.model('Notification', NotificationSchema);
