const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  subtitle: String,
  
  // Image
  imageUrl: {
    type: String,
    required: true
  },
  imagePublicId: String,
  
  // Mobile-specific image (optional)
  mobileImageUrl: String,
  mobileImagePublicId: String,
  
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
