const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({
  // Singleton identifier
  key: {
    type: String,
    default: 'platform_settings',
    unique: true
  },
  
  // Commission & Revenue Settings
  commissionRate: {
    type: Number,
    default: 7, // 7% platform commission
    min: 0,
    max: 100
  },
  minimumOrderValue: {
    type: Number,
    default: 100 // Minimum order amount in currency
  },
  minimumWithdrawalAmount: {
    type: Number,
    default: 500
  },
  maximumWithdrawalAmount: {
    type: Number,
    default: 50000
  },
  
  // Seller Settings
  sellerUploadLimitPerDay: {
    type: Number,
    default: 20
  },
  maxProductsPerSeller: {
    type: Number,
    default: 500
  },
  maxImagesPerProduct: {
    type: Number,
    default: 10
  },
  productApprovalRequired: {
    type: Boolean,
    default: true
  },
  
  // Platform Settings
  platformName: {
    type: String,
    default: 'DoroShop'
  },
  platformEmail: {
    type: String,
    default: ''
  },
  platformPhone: String,
  platformAddress: String,
  
  // Maintenance Mode
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'We are currently under maintenance. Please check back later.'
  },
  maintenanceStartTime: Date,
  maintenanceEndTime: Date,
  
  // Security Settings
  maxLoginAttempts: {
    type: Number,
    default: 5
  },
  lockoutDuration: {
    type: Number,
    default: 30 // minutes
  },
  sessionTimeout: {
    type: Number,
    default: 60 // minutes
  },
  
  // Notification Settings
  emailNotificationsEnabled: {
    type: Boolean,
    default: true
  },
  smsNotificationsEnabled: {
    type: Boolean,
    default: false
  },
  
  // Order Settings
  autoConfirmDeliveryDays: {
    type: Number,
    default: 7 // Auto-confirm delivery after X days
  },
  refundWindowDays: {
    type: Number,
    default: 7 // Days within which refund can be requested
  },
  
  // Feature Flags
  features: {
    sellerApplicationsEnabled: { type: Boolean, default: true },
    reviewsEnabled: { type: Boolean, default: true },
    promotionsEnabled: { type: Boolean, default: true },
    customerAgreementShippingEnabled: { type: Boolean, default: true },
    walletEnabled: { type: Boolean, default: true },
    gcashEnabled: { type: Boolean, default: false },
    codEnabled: { type: Boolean, default: true }
  },
  
  // Updated tracking
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
SystemSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ key: 'platform_settings' });
  if (!settings) {
    settings = await this.create({ key: 'platform_settings' });
  }
  return settings;
};

SystemSettingsSchema.statics.updateSettings = async function(updates, adminId) {
  const settings = await this.findOneAndUpdate(
    { key: 'platform_settings' },
    { ...updates, lastUpdatedBy: adminId },
    { new: true, upsert: true, runValidators: true }
  );
  return settings;
};

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema);
