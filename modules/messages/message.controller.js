const messageService = require("./message.service");

// GET OR CREATE CONVERSATION
exports.getOrCreateConversation = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { vendorId, contextType, contextId } = req.body;

		if (!vendorId) {
			return res.status(400).json({
				success: false,
				message: "Vendor ID is required"
			});
		}

		const conversation = await messageService.getOrCreateConversationService(
			userId, // customerId
			vendorId,
			contextType,
			contextId
		);

		res.status(200).json({
			success: true,
			data: conversation
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error getting/creating conversation:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to get conversation"
		});
	}
};

// SEND MESSAGE (REST API - also handled by Socket.IO)
exports.sendMessage = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { conversationId, content, messageType, imageUrl, referenceId, referenceType } = req.body;

		if (!conversationId || !content) {
			return res.status(400).json({
				success: false,
				message: "Conversation ID and content are required"
			});
		}

		// Determine sender type (customer or vendor)
		const Conversation = require("./conversation.model");
		const conversation = await Conversation.findById(conversationId);
		
		if (!conversation) {
			return res.status(404).json({
				success: false,
				message: "Conversation not found"
			});
		}

		const isCustomer = conversation.customerId.toString() === userId.toString();
		const senderType = isCustomer ? "customer" : "vendor";

		const message = await messageService.sendMessageService({
			conversationId,
			senderId: userId,
			senderType,
			content,
			messageType,
			imageUrl,
			referenceId,
			referenceType
		});

		res.status(201).json({
			success: true,
			data: message
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error sending message:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to send message"
		});
	}
};

// GET CONVERSATION MESSAGES
exports.getConversationMessages = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { conversationId } = req.params;
		const { page = 1, limit = 50 } = req.query;

		const result = await messageService.getConversationMessagesService(
			conversationId,
			userId,
			parseInt(page),
			parseInt(limit)
		);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error getting messages:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to get messages"
		});
	}
};

// GET USER CONVERSATIONS
exports.getUserConversations = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { userType = "customer", page = 1, limit = 20 } = req.query;

		const result = await messageService.getUserConversationsService(
			userId,
			userType,
			parseInt(page),
			parseInt(limit)
		);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error getting conversations:", error);
		res.status(500).json({
			success: false,
			message: "Failed to get conversations"
		});
	}
};

// MARK MESSAGES AS READ
exports.markMessagesAsRead = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { conversationId } = req.params;
		const { userType } = req.body;

		if (!userType) {
			return res.status(400).json({
				success: false,
				message: "User type is required"
			});
		}

		const result = await messageService.markMessagesAsReadService(
			conversationId,
			userId,
			userType
		);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error marking messages as read:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to mark messages as read"
		});
	}
};

// DELETE MESSAGE
exports.deleteMessage = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { messageId } = req.params;

		const result = await messageService.deleteMessageService(messageId, userId);

		res.status(200).json({
			success: true,
			message: result.message
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error deleting message:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to delete message"
		});
	}
};

// GET UNREAD COUNT
exports.getUnreadCount = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { userType = "customer" } = req.query;

		const result = await messageService.getUnreadCountService(userId, userType);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error getting unread count:", error);
		res.status(500).json({
			success: false,
			message: "Failed to get unread count"
		});
	}
};

// SEARCH CONVERSATIONS
exports.searchConversations = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { userType = "customer", q } = req.query;

		if (!q) {
			return res.status(400).json({
				success: false,
				message: "Search query is required"
			});
		}

		const result = await messageService.searchConversationsService(
			userId,
			userType,
			q
		);

		res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error searching conversations:", error);
		res.status(500).json({
			success: false,
			message: "Failed to search conversations"
		});
	}
};

// ARCHIVE CONVERSATION
exports.archiveConversation = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { conversationId } = req.params;
		const { userType } = req.body;

		if (!userType) {
			return res.status(400).json({
				success: false,
				message: "User type is required"
			});
		}

		const result = await messageService.archiveConversationService(
			conversationId,
			userId,
			userType
		);

		res.status(200).json({
			success: true,
			message: result.message
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error archiving conversation:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to archive conversation"
		});
	}
};

// BLOCK CONVERSATION
exports.blockConversation = async (req, res) => {
	try {
		const userId = req.user.id || req.user._id;
		const { conversationId } = req.params;
		const { userType } = req.body;

		if (!userType) {
			return res.status(400).json({
				success: false,
				message: "User type is required"
			});
		}

		const result = await messageService.blockConversationService(
			conversationId,
			userId,
			userType
		);

		res.status(200).json({
			success: true,
			message: result.message
		});
	} catch (error) {
		console.error("❌ [MESSAGE CONTROLLER] Error blocking conversation:", error);
		res.status(400).json({
			success: false,
			message: error.message || "Failed to block conversation"
		});
	}
};
