const mongoose = require("mongoose");

const MontlyRevenueComparison = new mongoose.Schema({
	month: String,
	currentValue: { type: Number, default: 0 },
	previousValue: { type: Number, default: 0 },
});

const AddressSchema = new mongoose.Schema(
	{
		street: String,
		barangay: String,
		city: String,
		province: String,
		zipCode: String,
	},
	{ _id: false }
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

	// Verification
	isApproved: { type: Boolean, default: false },
	documentsSubmitted: { type: Boolean, default: false },
	documents: [String],

	// Engagement
	followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
	rating: { type: Number, default: 0 },
	numRatings: { type: Number, default: 0 },

	// Financials
	accountBalance: {
		cash: { type: Number, default: 0 },
		usdt: { type: Number, default: 0 },
	},

	// Dashboard Stats
	totalProducts: { type: Number, default: 0 },
	totalOrders: { type: Number, default: 0 },
	totalRevenue: { type: Number, default: 0 },
	topBuyer: { type: [String], required: false },

	gcashNumber: String,

	// Analytics`
	profileViews: { type: Number, default: 0 },
	productClicks: { type: Number, default: 0 },
	currentMonthlyRevenue: { type: Number, default: 0 },
	monthlyRevenueComparison: [MontlyRevenueComparison],

	// Timestamps
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

VendorSchema.pre("save", function (next) {
	this.updatedAt = new Date();
	next();
});

module.exports = mongoose.model("Vendor", VendorSchema);
