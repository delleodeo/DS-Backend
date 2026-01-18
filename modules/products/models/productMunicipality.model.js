const mongoose = require('mongoose');

const ProductMunicipalitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    normalized: { type: String, required: true, unique: true, lowercase: true, trim: true },
    productCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ProductMunicipalitySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.normalized = this.name.toLowerCase().trim();
  }
  next();
});

ProductMunicipalitySchema.index({ normalized: 1 }, { unique: true });
ProductMunicipalitySchema.index({ productCount: -1 });

module.exports = mongoose.model('ProductMunicipality', ProductMunicipalitySchema);
