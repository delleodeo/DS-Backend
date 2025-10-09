const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
	{
		imgUrl: String,
		label: String,
		quantity: { type: Number, default: 1, min: 1 },
		productId: { type: mongoose.Schema.Types.ObjectId, ref: "Products" },
		optionId: { type: mongoose.Schema.Types.ObjectId},
		price: { type: Number, default: 0 },
		name: String
	},
	{
		_id: true,
	}
);

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

const OrderSchema = new mongoose.Schema({
	customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	items: [OrderItemSchema],
	name: String,
	subTotal: Number,
	paymentStatus: { type: String, default: "Pending" },
	shippingAddress: AddressSchema,
	shippingFee: {type: Number, default: 0},
	trackingNumber: String,
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
	paymentMethod: {
		type: String,
		enum: ["wallet", "gcash", "cod"],
		required: true,
	},
	status: {
		type: String,
		enum: ["pending", "paid", "shipped", "delivered", "cancelled"],
		default: "pending",
	},
});

module.exports = mongoose.model("Order", OrderSchema);
