const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
	// References
	productId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Product",
		required: true,
		index: true
	},
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true
	},
	orderId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Order",
		required: true,
		index: true
	},
	vendorId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true
	},

	// Review Content
	rating: {
		type: Number,
		required: true,
		min: 1,
		max: 5
	},
	comment: {
		type: String,
		required: true,
		trim: true,
		maxlength: 1000
	},
	images: [{
		type: String,
		trim: true
	}],

	// Vendor Response
	vendorResponse: {
		comment: {
			type: String,
			trim: true,
			maxlength: 500
		},
		respondedAt: {
			type: Date
		}
	},

	// Helpful votes
	helpfulCount: {
		type: Number,
		default: 0
	},
	helpfulBy: [{
		type: mongoose.Schema.Types.ObjectId,
		ref: "User"
	}],

	// Status
	isVerifiedPurchase: {
		type: Boolean,
		default: true
	},
	isVisible: {
		type: Boolean,
		default: true
	},

	// Timestamps
	createdAt: {
		type: Date,
		default: Date.now,
		index: true
	},
	updatedAt: {
		type: Date,
		default: Date.now
	}
});

// Compound indexes for common queries
ReviewSchema.index({ productId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, createdAt: -1 });
ReviewSchema.index({ vendorId: 1, createdAt: -1 });
ReviewSchema.index({ productId: 1, rating: -1 });

// Prevent duplicate reviews for same product in same order
ReviewSchema.index({ orderId: 1, productId: 1, userId: 1 }, { unique: true });

ReviewSchema.pre("save", function (next) {
	this.updatedAt = new Date();
	next();
});

module.exports = mongoose.model("Review", ReviewSchema);
