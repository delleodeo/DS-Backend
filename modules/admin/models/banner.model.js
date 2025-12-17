const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  subtitle: String,
  
  // Background Type - gradient, image, or glassmorphism
  backgroundType: {
    type: String,
    enum: ['gradient', 'image', 'glassmorphism'],
    default: 'gradient'
  },
  
  // Gradient color (used when backgroundType is 'gradient' or 'glassmorphism')
  gradientColor: {
    type: String,
    default: 'linear-gradient(135deg, #cfee7a 0%, #f8cf2a 50%, #ffa726 100%)'
  },
  
  // Background Image (used when backgroundType is 'image')
  imageUrl: {
    type: String,
    required: false  // Not required since we can use gradient
  },
  imagePublicId: String,
  
  // Product/decorative image (optional, shown on banner)
  productImageUrl: String,
  productImagePublicId: String,
  
  // Mobile-specific image (optional)
  mobileImageUrl: String,
  mobileImagePublicId: String,
  
  // Button Settings
  hasButton: {
    type: Boolean,
    default: true
  },
  buttonText: {
    type: String,
    default: 'Shop Now'
  },
  
  // Background Only Mode - shows just the background with no content overlay
  backgroundOnly: {
    type: Boolean,
    default: false
  },
  
  // Link/Action
  linkUrl: String,
  linkType: {
    type: String,
    enum: ['external', 'product', 'category', 'vendor', 'promotion', 'none'],
    default: 'none'
  },
  linkedProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  linkedCategoryId: String,
  linkedVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  
  // Placement
  placement: {
    type: String,
    enum: ['hero', 'sidebar', 'footer', 'popup', 'category_top'],
    default: 'hero'
  },
  
  // Ordering
  displayOrder: {
    type: Number,
    default: 0
  },
  
  // Visibility
  isActive: {
    type: Boolean,
    default: false
  },
  
  // Scheduling
  startDate: Date,
  endDate: Date,
  
  // Campaign info
  campaignName: String,
  campaignType: {
    type: String,
    enum: ['seasonal', 'promotion', 'new_arrival', 'clearance', 'holiday', 'regular'],
    default: 'regular'
  },
  
  // Statistics
  clickCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  
  // Admin tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
BannerSchema.index({ placement: 1, isActive: 1, displayOrder: 1 });
BannerSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Banner', BannerSchema);
