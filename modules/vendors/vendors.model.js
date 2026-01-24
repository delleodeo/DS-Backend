const mongoose = require("mongoose");

const MonthlyRevenueData = new mongoose.Schema(
  {
    year: { type: Number, required: true },
    revenues: {
      January: { type: Number, default: 0 },
      February: { type: Number, default: 0 },
      March: { type: Number, default: 0 },
      April: { type: Number, default: 0 },
      May: { type: Number, default: 0 },
      June: { type: Number, default: 0 },
      July: { type: Number, default: 0 },
      August: { type: Number, default: 0 },
      September: { type: Number, default: 0 },
      October: { type: Number, default: 0 },
      November: { type: Number, default: 0 },
      December: { type: Number, default: 0 },
    },
  },
  { _id: false },
);

const AddressSchema = new mongoose.Schema(
  {
    street: String,
    barangay: String,
    city: String,
    province: String,
    zipCode: String,
    region: String,
    additionalInfo: String,
  },
  { _id: false },
);

// GeoJSON Point schema for shop location
const LocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  { _id: false },
);

const VendorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  phoneNumber: String,
  // Store Info
  storeName: { type: String, required: true },
  description: { type: String },
  address: AddressSchema,
  imageUrl: String, // Logo or profile image
  bannerUrl: String, // Optional banner

  // Shop location for map display
  location: LocationSchema,

  // Verification
  isApproved: { type: Boolean, default: false },
  documentsSubmitted: { type: Boolean, default: false },
  documents: [String],

  // Engagement
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  rating: { type: Number, default: 0 },
  numRatings: { type: Number, default: 0 },

  // Financials
  commissionRate: { type: Number, default: 0.07 },

  // Dashboard Stats
  totalProducts: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  topBuyer: { type: [String], required: false },

  gcashNumber: String,

  uniqueViews: { type: Number, default: 0 },
  views: { type: Number, default: 0 },

  profileViews: { type: Number, default: 0 },
  uniqueProfileViews: { type: Number, default: 0 },

  // Analytics
  productClicks: { type: Number, default: 0 },
  currentMonthlyRevenue: { type: Number, default: 0 },
  monthlyRevenueComparison: [MonthlyRevenueData],

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

VendorSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// 2dsphere index for geospatial queries (find nearby shops)
VendorSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Vendor", VendorSchema);
