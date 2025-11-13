const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
	conversationId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Conversation",
		required: true,
		index: true
	},
	senderId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true
	},
	senderType: {
		type: String,
		enum: ["customer", "vendor"],
		required: true
	},
	content: {
		type: String,
		required: true,
		trim: true,
		maxlength: 2000
	},
	messageType: {
		type: String,
		enum: ["text", "image", "product", "order"],
		default: "text"
	},
	// For image messages
	imageUrl: {
		type: String,
		trim: true
	},
	// For product/order references
	referenceId: {
		type: mongoose.Schema.Types.ObjectId
	},
	referenceType: {
		type: String,
		enum: ["product", "order"]
	},
	// Message status
	isRead: {
		type: Boolean,
		default: false
	},
	readAt: {
		type: Date
	},
	isDeleted: {
		type: Boolean,
		default: false
	},
	deletedAt: {
		type: Date
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

// Indexes for efficient queries
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, isRead: 1 });

MessageSchema.pre("save", function (next) {
	this.updatedAt = new Date();
	next();
});

module.exports = mongoose.model("Message", MessageSchema);
