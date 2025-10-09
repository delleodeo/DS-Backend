const mongoose = require("mongoose");

const OptionSchema = new mongoose.Schema(
	{
		imageUrl: String,
		price: { type: Number, required: true },
		label: { type: String, required: false },
		isHot: { type: Boolean, default: false },
		stock: { type: Number, default: 0 },
		sold: { type: Number, default: 0 },
		createdAt: { type: Date, default: Date.now },
		updatedAt: { type: Date, default: Date.now },
	},
	{ _id: true }
);

// Review sub-schema
const ReviewSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		rating: { type: Number, min: 1, max: 5, required: true },
		comment: { type: String },
		createdAt: { type: Date, default: Date.now },
	},
	{ _id: false }
);

const ProductSchema = new mongoose.Schema({
	vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
	name: { type: String, required: true },
	description: String,
	price: { type: Number, required: true, min: 0 },
	stock: { type: Number, default: 0, min: 0 },
	sold: { type: Number, default: 0, min: 0 },
	option: { type: [OptionSchema], required: false },
	categories: [String],
	isOption: { type: Boolean, default: false },
	imageUrls: [String],
	isNew: { type: Boolean, default: true },
	isHot: { type: Boolean, default: false },
	isApproved: { type: Boolean, default: false },
	reviews: { type: [ReviewSchema], required: false },
	averageRating: { type: Number, default: 0, min: 0 },
	numReviews: { type: Number, default: 0, min: 0 },
	createdAt: { type: Date, default: Date.now },
	municipality: { type: String, required: true },
});

module.exports = mongoose.model("Product", ProductSchema);
