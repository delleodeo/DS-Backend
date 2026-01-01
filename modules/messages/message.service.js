const Message = require("./message.model");
const Conversation = require("./conversation.model");
const User = require("../users/users.model");
const Vendor = require("../vendors/vendors.model");
const Product = require("../products/products.model");

const { ValidationError, AuthorizationError, NotFoundError } = require("../../utils/errorHandler");
const sanitizeMongoInput = require("../../utils/sanitizeMongoInput");
const { getRedisClient, isRedisAvailable, safeDel } = require("../../config/redis");


// GET OR CREATE CONVERSATION
exports.getOrCreateConversationService = async (customerId, vendorId, contextType = "general", contextId = null) => {
	try {
		console.log(`💬 [MESSAGE] Getting/creating conversation: customer ${customerId} <-> vendor ${vendorId}`);

		// Prevent users from messaging themselves
		if (customerId.toString() === vendorId.toString()) {
			throw new ValidationError("You cannot create a conversation with yourself");
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
			throw new NotFoundError("Customer not found");
		}

		if (!vendor) {
			throw new NotFoundError("Vendor not found");
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
		// Sanitize input to prevent NoSQL injection & XSS
		const data = sanitizeMongoInput(messageData);
		const { conversationId, senderId, senderType: clientSenderType, content, messageType, imageUrl, referenceId, referenceType } = data;

		console.log(`💬 [MESSAGE] Sending message in conversation ${conversationId}`);

		// Verify conversation exists
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			throw new NotFoundError("Conversation not found");
		}

		// Verify sender is part of the conversation
		const isCustomer = conversation.customerId.toString() === senderId.toString();
		const isVendor = conversation.vendorId.toString() === senderId.toString();

		if (!isCustomer && !isVendor) {
			throw new AuthorizationError("You are not part of this conversation");
		}

		// Determine actual sender type based on conversation role (ignore client-supplied senderType)
		let actualSenderType;
		if (isCustomer && !isVendor) {
			actualSenderType = "customer";
		} else if (isVendor && !isCustomer) {
			actualSenderType = "vendor";
		} else {
			// If user is both (unlikely), fall back to client value or default
			actualSenderType = clientSenderType || "customer";
		}

		console.log(`📝 [MESSAGE] Sender type: ${actualSenderType} (isCustomer: ${isCustomer}, isVendor: ${isVendor})`);

		// Sanitize content and enforce length caps
		const sanitizedContent = typeof content === "string" ? sanitizeMongoInput(content).substring(0, 2000) : content;

		// Validate referenced resources when necessary
		if (messageType === "product" && referenceId) {
			const product = await Product.findById(referenceId);
			if (!product) {
				throw new ValidationError("Referenced product not found");
			}
		}

		// Create message (trust server-derived senderType)
		const message = new Message({
			conversationId,
			senderId,
			senderType: actualSenderType,
			content: sanitizedContent,
			messageType: messageType || "text",
			imageUrl,
			referenceId,
			referenceType
		});

		await message.save();

		// Prepare lastMessage preview
		const preview = sanitizedContent ? sanitizedContent.substring(0, 100) : "";

		// Atomically update conversation: lastMessage + unread counter + updatedAt
		const incObj = actualSenderType === "customer" ? { unreadCountVendor: 1 } : { unreadCountCustomer: 1 };

		await Conversation.updateOne(
			{ _id: conversation._id },
			{
				$set: {
					lastMessage: {
						content: preview,
						senderId,
						senderType: actualSenderType,
						createdAt: message.createdAt
					},
					updatedAt: new Date()
				},
				$inc: incObj
			}
		);

		// Update cached total (if Redis available)
		if (isRedisAvailable()) {
			try {
				const rclient = getRedisClient();
				const key = `conversation:${conversation._id}:message_count`;
				await rclient.incr(key);
				// Ensure TTL to avoid unbounded keys
				await rclient.expire(key, 3600);
			} catch (err) {
				console.warn('Redis incr message count failed:', err.message);
			}
		}


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
		page = Math.max(1, Number(page) || 1);
		limit = Math.min(100, Math.max(1, Number(limit) || 50)); // cap to 100
		const skip = (page - 1) * limit;

		// Verify user is part of conversation
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			throw new NotFoundError("Conversation not found");
		}

		const isParticipant = 
			conversation.customerId.toString() === userId.toString() ||
			conversation.vendorId.toString() === userId.toString();

		if (!isParticipant) {
			throw new AuthorizationError("You are not part of this conversation");
		}

		// Get messages (most recent first)
		const messages = await Message.find({ 
			conversationId,
			isDeleted: false
		})
			.populate("senderId", "name imageUrl email")
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean();

		let total;
		const cacheKey = `conversation:${conversationId}:message_count`;
		if (isRedisAvailable()) {
			try {
				const rclient = getRedisClient();
				const cached = await rclient.get(cacheKey);
				if (cached !== null) {
					total = Number(cached);
				} else {
					total = await Message.countDocuments({ conversationId, isDeleted: false });
					// cache for 60 seconds
					await rclient.setEx(cacheKey, 60, String(total));
				}
			} catch (err) {
				console.warn('Redis message count get/set failed:', err.message);
				total = await Message.countDocuments({ conversationId, isDeleted: false });
			}
		} else {
			total = await Message.countDocuments({ conversationId, isDeleted: false });
		}


		// Reverse to show oldest first in page
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
		page = Math.max(1, Number(page) || 1);
		limit = Math.min(100, Math.max(1, Number(limit) || 20));
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
			throw new NotFoundError("Conversation not found");
		}

		// Verify user is part of conversation
		const isCustomer = conversation.customerId.toString() === userId.toString();
		const isVendor = conversation.vendorId.toString() === userId.toString();

		if (!isCustomer && !isVendor) {
			throw new AuthorizationError("You are not part of this conversation");
		}

		// Derive userType server-side and mark unread messages as read
		const role = isCustomer ? "customer" : "vendor";
		const senderTypeToMark = role === "customer" ? "vendor" : "customer";

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

		// Reset unread count for this participant (derive server-side)
		if (role === "customer") {
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
			throw new NotFoundError("Message not found");
		}

		// Only sender can delete
		if (message.senderId.toString() !== userId.toString()) {
			throw new AuthorizationError("You can only delete your own messages");
		}

		message.isDeleted = true;
		message.deletedAt = new Date();
		await message.save();

		// Invalidate cached message count for this conversation
		try {
			if (isRedisAvailable()) {
				const key = `conversation:${message.conversationId.toString()}:message_count`;
				await safeDel(key);
			}
		} catch (err) {
			console.warn('Redis safeDel failed for message deletion cache:', err.message);
		}

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

		// Sanitize and cap search query
		const q = typeof searchQuery === "string" ? sanitizeMongoInput(searchQuery).substring(0, 200) : "";

		if (!q) return [];

		// Fetch a reasonable subset and filter server-side to avoid huge memory usage
		const conversations = await Conversation.find(baseQuery)
			.populate("customerId", "name imageUrl email")
			.populate("vendorId", "name imageUrl email")
			.sort({ updatedAt: -1 })
			.limit(200)
			.lean();

		const filtered = conversations.filter(conv => {
			const otherUser = isCustomer ? conv.vendorId : conv.customerId;
			const nameMatch = otherUser?.name?.toLowerCase().includes(q.toLowerCase());
			const messageMatch = conv.lastMessage?.content?.toLowerCase().includes(q.toLowerCase());
			return Boolean(nameMatch) || Boolean(messageMatch);
		});

		// Return up to 50 results
		return filtered.slice(0, 50);
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
			throw new NotFoundError("Conversation not found");
		}

		// Verify user is part of conversation
		const isCustomer = conversation.customerId.toString() === userId.toString();
		const isVendor = conversation.vendorId.toString() === userId.toString();

		if (!isCustomer && !isVendor) {
			throw new AuthorizationError("You are not part of this conversation");
		}

		// Archive for the user (derive role server-side)
		if (isCustomer) {
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
			throw new NotFoundError("Conversation not found");
		}

		// Verify user is part of conversation
		const isCustomer = conversation.customerId.toString() === userId.toString();
		const isVendor = conversation.vendorId.toString() === userId.toString();

		if (!isCustomer && !isVendor) {
			throw new AuthorizationError("You are not part of this conversation");
		}

		// Block for the user (derive role server-side)
		if (isCustomer) {
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
