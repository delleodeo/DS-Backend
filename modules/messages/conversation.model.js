const mongoose = require("mongoose");

const ConversationSchema = new mongoose.Schema({
	customerId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true
	},
	vendorId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true
	},
	// Last message preview
	lastMessage: {
		content: String,
		senderId: mongoose.Schema.Types.ObjectId,
		senderType: {
			type: String,
			enum: ["customer", "vendor"]
		},
		createdAt: Date
	},
	// Unread counts
	unreadCountCustomer: {
		type: Number,
		default: 0
	},
	unreadCountVendor: {
		type: Number,
		default: 0
	},
	// Product/Order context (optional)
	contextType: {
		type: String,
		enum: ["general", "product", "order"]
	},
	contextId: {
		type: mongoose.Schema.Types.ObjectId
	},
	// Participants status
	isActiveCustomer: {
		type: Boolean,
		default: true
	},
	isActiveVendor: {
		type: Boolean,
		default: true
	},
	// Block/Archive status
	isBlockedByCustomer: {
		type: Boolean,
		default: false
	},
	isBlockedByVendor: {
		type: Boolean,
		default: false
	},
	isArchivedByCustomer: {
		type: Boolean,
		default: false
	},
	isArchivedByVendor: {
		type: Boolean,
		default: false
	},
	// Timestamps
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: {
		type: Date,
		default: Date.now
	}
});

// Compound index to ensure one conversation per customer-vendor pair
ConversationSchema.index({ customerId: 1, vendorId: 1 }, { unique: true });
ConversationSchema.index({ customerId: 1, updatedAt: -1 });
ConversationSchema.index({ vendorId: 1, updatedAt: -1 });

ConversationSchema.pre("save", function (next) {
	this.updatedAt = new Date();
	next();
});

module.exports = mongoose.model("Conversation", ConversationSchema);
