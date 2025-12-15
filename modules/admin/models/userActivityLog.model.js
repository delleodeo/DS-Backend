const mongoose = require('mongoose');

const UserActivityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Activity type
  activityType: {
    type: String,
    required: true,
    enum: [
      'LOGIN',
      'LOGOUT',
      'LOGIN_FAILED',
      'PASSWORD_CHANGE',
      'PROFILE_UPDATE',
      'ORDER_PLACED',
      'ORDER_CANCELLED',
      'PRODUCT_VIEWED',
      'PRODUCT_ADDED_TO_CART',
      'REVIEW_SUBMITTED',
      'MESSAGE_SENT',
      'SELLER_APPLICATION_SUBMITTED',
      'WITHDRAWAL_REQUESTED',
      'SUSPICIOUS_ACTIVITY'
    ]
  },
  
  // Activity details
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Session info
  ipAddress: String,
  userAgent: String,
  deviceType: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'unknown'],
    default: 'unknown'
  },
  browser: String,
  os: String,
  
  // Location (if available)
  location: {
    country: String,
    city: String,
    region: String
  },
  
  // Risk assessment
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  isFlagged: {
    type: Boolean,
    default: false
  },
  flagReason: String,
  
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: false
});

// Indexes for efficient querying
UserActivityLogSchema.index({ userId: 1, timestamp: -1 });
UserActivityLogSchema.index({ activityType: 1, timestamp: -1 });
UserActivityLogSchema.index({ ipAddress: 1 });
UserActivityLogSchema.index({ isFlagged: 1 });
UserActivityLogSchema.index({ riskLevel: 1 });

// TTL index to automatically delete old logs after 90 days (optional)
// UserActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('UserActivityLog', UserActivityLogSchema);
