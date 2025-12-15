const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: String,
  
  // Hierarchy
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  level: {
    type: Number,
    default: 0 // 0 = root, 1 = subcategory, etc.
  },
  
  // Image
  imageUrl: String,
  imagePublicId: String,
  iconName: String, // For icon-based display
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Display
  displayOrder: {
    type: Number,
    default: 0
  },
  featuredOnHome: {
    type: Boolean,
    default: false
  },
  
  // Tags for promotions
  tags: [{
    name: String,
    color: String // hex color for badge
  }],
  
  // Product count (cached for performance)
  productCount: {
    type: Number,
    default: 0
  },
  
  // SEO
  metaTitle: String,
  metaDescription: String,
  
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

// Auto-generate slug from name
CategorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

// Indexes
CategorySchema.index({ slug: 1 });
CategorySchema.index({ parentCategory: 1 });
CategorySchema.index({ isActive: 1, displayOrder: 1 });

module.exports = mongoose.model('Category', CategorySchema);
