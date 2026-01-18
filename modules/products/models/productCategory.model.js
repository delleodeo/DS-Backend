const mongoose = require('mongoose');

const ProductCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    normalized: { type: String, required: true, unique: true, lowercase: true, trim: true },
    productCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Keep normalized value up to date
ProductCategorySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.normalized = this.name.toLowerCase().trim();
  }
  next();
});

ProductCategorySchema.index({ normalized: 1 }, { unique: true });
ProductCategorySchema.index({ productCount: -1 });

module.exports = mongoose.model('ProductCategory', ProductCategorySchema);
