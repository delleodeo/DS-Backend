/**
 * Notification Model
 * Stores notifications for users (vendors and admins)
 */
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Recipient of the notification
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Notification type for filtering and styling
  type: {
    type: String,
    enum: [
      'commission_pending',
      'commission_reminder',
      'commission_overdue',
      'commission_remitted',
      'order_received',
      'order_delivered',
      'payment_received',
      'wallet_credit',
      'wallet_debit',
      'seller_application_approved',
      'seller_application_rejected',
      'system_announcement',
      'admin_alert'
    ],
    required: true,
    index: true
  },
  
  // Notification title
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  
  // Notification message/body
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  
  // Read status
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Reference to related entity
  referenceType: {
    type: String,
    enum: ['commission', 'order', 'payment', 'wallet', 'application', 'system', null],
    default: null
  },
  
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  
  // Action URL for click navigation
  actionUrl: {
    type: String,
    default: null
  },
  
  // Expiry date (auto-delete old notifications)
  expiresAt: {
    type: Date,
    default: () => {
      const date = new Date();
      date.setDate(date.getDate() + 30); // 30 days default
      return date;
    },
    index: { expires: 0 } // TTL index
  },
  
  // Metadata for additional context
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound indexes
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

// Static: Get unread count for user
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ user: userId, isRead: false });
};

// Static: Get notifications for user with pagination
notificationSchema.statics.getForUser = async function(userId, options = {}) {
  const { page = 1, limit = 20, type, unreadOnly = false } = options;
  const skip = (page - 1) * limit;
  
  const query = { user: userId };
  if (type) query.type = type;
  if (unreadOnly) query.isRead = false;
  
  const [notifications, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);
  
  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Mark all as read for user
notificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { user: userId, isRead: false },
    { $set: { isRead: true } }
  );
};

// Static: Bulk create notifications for multiple users
notificationSchema.statics.bulkCreate = async function(notifications) {
  return this.insertMany(notifications, { ordered: false });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
