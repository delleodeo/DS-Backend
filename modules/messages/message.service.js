const Message = require("./message.model");
const Conversation = require("./conversation.model");
const User = require("../users/users.model");
const Vendor = require("../vendors/vendors.model");
const Product = require("../products/products.model");

// GET OR CREATE CONVERSATION
exports.getOrCreateConversationService = async (customerId, vendorId, contextType = "general", contextId = null) => {
	try {
		console.log(`💬 [MESSAGE] Getting/creating conversation: customer ${customerId} <-> vendor ${vendorId}`);

		// Prevent users from messaging themselves
		if (customerId.toString() === vendorId.toString()) {
			throw new Error("You cannot create a conversation with yourself");
		}

		// Check if conversation already exists
		let conversation = await Conversation.findOne({ customerId, vendorId });

		if (conversation) {
			console.log(`✅ [MESSAGE] Conversation found: ${conversation._id}`);
			return conversation.toObject();
		}

		// Verify customer and vendor exist
		const customer = await User.findById(customerId);
		const vendor = await User.findById(vendorId);

		if (!customer) {
			throw new Error("Customer not found");
		}

		if (!vendor) {
			throw new Error("Vendor not found");
		}

		// Create new conversation
		conversation = new Conversation({
			customerId,
			vendorId,
			contextType,
			contextId
		});

		await conversation.save();

		console.log(`✅ [MESSAGE] New conversation created: ${conversation._id}`);
		return conversation.toObject();
	} catch (error) {
		console.error("❌ [MESSAGE] Error getting/creating conversation:", error);
		throw error;
	}
};

// SEND MESSAGE
exports.sendMessageService = async (messageData) => {
	try {
		const { conversationId, senderId, senderType, content, messageType, imageUrl, referenceId, referenceType } = messageData;

		console.log(`💬 [MESSAGE] Sending message in conversation ${conversationId}`);

		// Verify conversation exists
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			throw new Error("Conversation not found");
		}

		// Verify sender is part of the conversation
		const isCustomer = conversation.customerId.toString() === senderId.toString();
		const isVendor = conversation.vendorId.toString() === senderId.toString();

		if (!isCustomer && !isVendor) {
			throw new Error("You are not part of this conversation");
		}

		// Determine actual sender type based on conversation role
		let actualSenderType;
		if (isCustomer && !isVendor) {
			actualSenderType = "customer";
		} else if (isVendor && !isCustomer) {
			actualSenderType = "vendor";
		} else if (isCustomer && isVendor) {
			// If user is both (shouldn't happen due to validation above), use provided senderType
			actualSenderType = senderType;
		}

		console.log(`📝 [MESSAGE] Sender type: ${actualSenderType} (isCustomer: ${isCustomer}, isVendor: ${isVendor})`);

		// Create message
		const message = new Message({
			conversationId,
			senderId,
			senderType: actualSenderType,
			content,
			messageType: messageType || "text",
			imageUrl,
			referenceId,
			referenceType
		});

		await message.save();

		// Update conversation with last message and unread count
		conversation.lastMessage = {
			content: content.substring(0, 100), // Preview only
			senderId,
			senderType: actualSenderType,
			createdAt: message.createdAt
		};

		// Increment unread count for recipient
		if (actualSenderType === "customer") {
			conversation.unreadCountVendor += 1;
		} else {
			conversation.unreadCountCustomer += 1;
		}

		conversation.updatedAt = new Date();
		await conversation.save();

		// Populate sender info
		const populatedMessage = await Message.findById(message._id)
			.populate("senderId", "name imageUrl email")
			.lean();

		console.log(`✅ [MESSAGE] Message sent: ${message._id}`);

		return populatedMessage;
	} catch (error) {
		console.error("❌ [MESSAGE] Error sending message:", error);
		throw error;
	}
};

// GET CONVERSATION MESSAGES
exports.getConversationMessagesService = async (conversationId, userId, page = 1, limit = 50) => {
	try {
		const skip = (page - 1) * limit;

		// Verify user is part of conversation
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			throw new Error("Conversation not found");
		}

		const isParticipant = 
			conversation.customerId.toString() === userId.toString() ||
			conversation.vendorId.toString() === userId.toString();

		if (!isParticipant) {
			throw new Error("You are not part of this conversation");
		}

		// Get messages
		const messages = await Message.find({ 
			conversationId,
			isDeleted: false
		})
			.populate("senderId", "name imageUrl email")
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean();

		const total = await Message.countDocuments({ 
			conversationId,
			isDeleted: false
		});

		// Reverse to show oldest first
		messages.reverse();

		return {
			messages,
			total,
			page,
			totalPages: Math.ceil(total / limit),
			hasMore: skip + messages.length < total
		};
	} catch (error) {
		console.error("❌ [MESSAGE] Error getting messages:", error);
		throw error;
	}
};

// GET USER CONVERSATIONS
exports.getUserConversationsService = async (userId, userType = "customer", page = 1, limit = 20) => {
	try {
		const skip = (page - 1) * limit;

		const query = userType === "customer" 
			? { customerId: userId, isActiveCustomer: true }
			: { vendorId: userId, isActiveVendor: true };

		const conversations = await Conversation.find(query)
			.populate("customerId", "name imageUrl email")
			.populate("vendorId", "name imageUrl email")
			.sort({ updatedAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean();

		const total = await Conversation.countDocuments(query);

		return {
			conversations,
			total,
			page,
			totalPages: Math.ceil(total / limit),
			hasMore: skip + conversations.length < total
		};
	} catch (error) {
		console.error("❌ [MESSAGE] Error getting conversations:", error);
		throw error;
	}
};

// MARK MESSAGES AS READ
exports.markMessagesAsReadService = async (conversationId, userId, userType) => {
	try {
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			throw new Error("Conversation not found");
		}

		// Verify user is part of conversation
		const isCustomer = conversation.customerId.toString() === userId.toString();
		const isVendor = conversation.vendorId.toString() === userId.toString();

		if (!isCustomer && !isVendor) {
			throw new Error("You are not part of this conversation");
		}

		// Mark unread messages as read
		const senderTypeToMark = userType === "customer" ? "vendor" : "customer";

		const result = await Message.updateMany(
			{
				conversationId,
				senderType: senderTypeToMark,
				isRead: false
			},
			{
				$set: {
					isRead: true,
					readAt: new Date()
				}
			}
		);

		// Reset unread count
		if (userType === "customer") {
			conversation.unreadCountCustomer = 0;
		} else {
			conversation.unreadCountVendor = 0;
		}

		await conversation.save();

		console.log(`✅ [MESSAGE] Marked ${result.modifiedCount} messages as read`);

		return {
			markedCount: result.modifiedCount,
			conversationId
		};
	} catch (error) {
		console.error("❌ [MESSAGE] Error marking messages as read:", error);
		throw error;
	}
};

// DELETE MESSAGE
exports.deleteMessageService = async (messageId, userId) => {
	try {
		const message = await Message.findById(messageId);
		if (!message) {
			throw new Error("Message not found");
		}

		// Only sender can delete
		if (message.senderId.toString() !== userId.toString()) {
			throw new Error("You can only delete your own messages");
		}

		message.isDeleted = true;
		message.deletedAt = new Date();
		await message.save();

		console.log(`✅ [MESSAGE] Message deleted: ${messageId}`);

		return { message: "Message deleted successfully" };
	} catch (error) {
		console.error("❌ [MESSAGE] Error deleting message:", error);
		throw error;
	}
};

// GET UNREAD COUNT
exports.getUnreadCountService = async (userId, userType) => {
	try {
		const query = userType === "customer"
			? { customerId: userId, isActiveCustomer: true }
			: { vendorId: userId, isActiveVendor: true };

		const conversations = await Conversation.find(query);

		const totalUnread = conversations.reduce((sum, conv) => {
			return sum + (userType === "customer" ? conv.unreadCountCustomer : conv.unreadCountVendor);
		}, 0);

		return {
			totalUnread,
			conversationsWithUnread: conversations.filter(conv => 
				userType === "customer" ? conv.unreadCountCustomer > 0 : conv.unreadCountVendor > 0
			).length
		};
	} catch (error) {
		console.error("❌ [MESSAGE] Error getting unread count:", error);
		throw error;
	}
};

// SEARCH CONVERSATIONS
exports.searchConversationsService = async (userId, userType, searchQuery) => {
	try {
		const isCustomer = userType === "customer";
		const baseQuery = isCustomer
			? { customerId: userId, isActiveCustomer: true }
			: { vendorId: userId, isActiveVendor: true };

		// Get conversations with populated user data
		const conversations = await Conversation.find(baseQuery)
			.populate("customerId", "name imageUrl email")
			.populate("vendorId", "name imageUrl email")
			.sort({ updatedAt: -1 })
			.lean();

		// Filter by search query (search in other participant's name or last message)
		const filtered = conversations.filter(conv => {
			const otherUser = isCustomer ? conv.vendorId : conv.customerId;
			const nameMatch = otherUser.name.toLowerCase().includes(searchQuery.toLowerCase());
			const messageMatch = conv.lastMessage?.content?.toLowerCase().includes(searchQuery.toLowerCase());
			return nameMatch || messageMatch;
		});

		return filtered;
	} catch (error) {
		console.error("❌ [MESSAGE] Error searching conversations:", error);
		throw error;
	}
};

// ARCHIVE CONVERSATION
exports.archiveConversationService = async (conversationId, userId, userType) => {
	try {
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			throw new Error("Conversation not found");
		}

		// Verify user is part of conversation
		const isCustomer = conversation.customerId.toString() === userId.toString();
		const isVendor = conversation.vendorId.toString() === userId.toString();

		if (!isCustomer && !isVendor) {
			throw new Error("You are not part of this conversation");
		}

		// Archive for the user
		if (userType === "customer") {
			conversation.isArchivedByCustomer = true;
		} else {
			conversation.isArchivedByVendor = true;
		}

		await conversation.save();

		console.log(`✅ [MESSAGE] Conversation archived: ${conversationId}`);

		return { message: "Conversation archived successfully" };
	} catch (error) {
		console.error("❌ [MESSAGE] Error archiving conversation:", error);
		throw error;
	}
};

// BLOCK CONVERSATION
exports.blockConversationService = async (conversationId, userId, userType) => {
	try {
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			throw new Error("Conversation not found");
		}

		// Verify user is part of conversation
		const isCustomer = conversation.customerId.toString() === userId.toString();
		const isVendor = conversation.vendorId.toString() === userId.toString();

		if (!isCustomer && !isVendor) {
			throw new Error("You are not part of this conversation");
		}

		// Block for the user
		if (userType === "customer") {
			conversation.isBlockedByCustomer = true;
		} else {
			conversation.isBlockedByVendor = true;
		}

		await conversation.save();

		console.log(`✅ [MESSAGE] Conversation blocked: ${conversationId}`);

		return { message: "Conversation blocked successfully" };
	} catch (error) {
		console.error("❌ [MESSAGE] Error blocking conversation:", error);
		throw error;
	}
};
