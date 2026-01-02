const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema(
  {
    street: { type: String, default: "" },
    region: { type: String, default: "" },
    regionCode: { type: String, default: "" },
    province: { type: String, default: "" },
    provinceCode: { type: String, default: "" },
    city: { type: String, default: "" },
    cityCode: { type: String, default: "" },
    barangay: { type: String, default: "" },
    barangayCode: { type: String, default: "" },
    zipCode: { type: String, default: "" },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String }, 
  provider: {
    type: String,
    enum: ["local", "google", "facebook"],
    default: "local",
  },
  providerId: String, 
  phone: String,
  address: {type: AddressSchema},
  wallet: {
    cash: { type: Number, default: 0 },
    usdt: { type: Number, default: 0 },
  },
  role: {
    type: String,
    enum: ["user", "vendor", "admin", 'rider'],
    default: "user",
  },
  isVerified: { type: Boolean, default: false },
  totalOrders: { type: Number, default: 0 },
  avatar: {type: String, defaul: "sasa"},
  
  // User Restriction (Admin Feature)
  isRestricted: { type: Boolean, default: false },
  restrictionReason: { type: String },
  restrictedAt: { type: Date },
  restrictedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  
  // User Flagging (Admin Feature)
  isFlagged: { type: Boolean, default: false },
  flagReason: { type: String },
  flaggedAt: { type: Date },
  flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  
  // Seller Application Data
  sellerApplication: {
    type: {
      shopName: { type: String },
      shopAddress: { type: String },
      address: {
        region: { type: String },
        province: { type: String },
        municipality: { type: String },
        barangay: { type: String },
        zipCode: { type: String },
        street: { type: String },
        additionalInfo: { type: String },
        // Store location codes for reference
        regionCode: { type: String },
        provinceCode: { type: String },
        municipalityCode: { type: String },
        barangayCode: { type: String }
      },
      governmentIdUrl: { type: String },
      governmentIdPublicId: { type: String },
      birTinUrl: { type: String },
      birTinPublicId: { type: String },
      dtiOrSecUrl: { type: String },
      dtiOrSecPublicId: { type: String },
      fdaCertificateUrl: { type: String },
      fdaCertificatePublicId: { type: String },
      // Shop profile image (required)
      shopProfileUrl: { type: String },
      shopProfilePublicId: { type: String },
      // Shop location coordinates (optional)
      shopLocation: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          default: undefined
        }
      },
      status: {
        type: String,
        enum: ["not_applied", "pending", "approved", "rejected"],
        default: "not_applied"
      },
      rejectionReason: { type: String },
      submittedAt: { type: Date },
      reviewedAt: { type: Date },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    },
    default: function() {
      return {
        status: "not_applied"
      };
    }
  },
  createdAt: { type: Date, default: Date.now },
  acceptTos: {type: Boolean, default: false}
});

// Indexes for efficient querying
UserSchema.index({ role: 1 });
UserSchema.index({ isRestricted: 1 });
UserSchema.index({ isFlagged: 1 });
UserSchema.index({ 'sellerApplication.status': 1 });

module.exports = mongoose.model("User", UserSchema);
