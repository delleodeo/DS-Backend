const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  // Admin who performed the action
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminEmail: {
    type: String,
    required: true
  },
  
  // Action details
  action: {
    type: String,
    required: true,
    enum: [
      // User management
      'USER_RESTRICTED',
      'USER_UNRESTRICTED',
      'USER_ROLE_CHANGED',
      'USER_FLAGGED',
      'USER_UNFLAGGED',
      'USER_DELETED',
      
      // Seller application
      'SELLER_APPLICATION_APPROVED',
      'SELLER_APPLICATION_REJECTED',
      
      // Product management
      'PRODUCT_APPROVED',
      'PRODUCT_REJECTED',
      'PRODUCT_DISABLED',
      'PRODUCT_ENABLED',
      'PRODUCT_DELETED',
      'PRODUCT_EDITED',
      
      // Order management
      'ORDER_UPDATED',
      'ORDER_CANCELLED',
      'ORDER_REFUNDED',
      
      // Commission & Revenue
      'COMMISSION_ADJUSTED',
      'SELLER_PAYOUT_PROCESSED',
      
      // Categories
      'CATEGORY_CREATED',
      'CATEGORY_UPDATED',
      'CATEGORY_DELETED',
      'CATEGORY_DISABLED',
      
      // Banners & Content
      'BANNER_CREATED',
      'BANNER_UPDATED',
      'BANNER_DELETED',
      'BANNER_ACTIVATED',
      'BANNER_DEACTIVATED',
      
      // Announcements
      'ANNOUNCEMENT_SENT',
      
      // System settings
      'SETTINGS_UPDATED',
      'MAINTENANCE_MODE_TOGGLED',
      'COMMISSION_RATE_CHANGED',
      
      // Refunds
      'REFUND_APPROVED',
      'REFUND_REJECTED',
      
      // Other
      'OTHER'
    ]
  },
  
  // Target entity
  targetType: {
    type: String,
    required: true,
    enum: ['User', 'Product', 'Order', 'Category', 'Banner', 'Settings', 'Refund', 'SellerApplication', 'Other']
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId
  },
  
  // Additional context
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Previous values for tracking changes
  previousValues: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // New values after change
  newValues: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // IP address and user agent for security
  ipAddress: String,
  userAgent: String,
  
  // Notes from admin
  notes: String,
  
  // Timestamp (immutable)
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: false // We manually handle createdAt as immutable
});

// Indexes for efficient querying
AuditLogSchema.index({ adminId: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
