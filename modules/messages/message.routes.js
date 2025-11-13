const express = require("express");
const router = express.Router();
const messageController = require("./message.controller");
const { protect } = require("../../auth/auth.controller");

// All routes require authentication
router.use(protect);

// Conversation routes
router.post("/conversation", messageController.getOrCreateConversation);
router.get("/conversations", messageController.getUserConversations);
router.get("/conversations/search", messageController.searchConversations);
router.post("/conversation/:conversationId/archive", messageController.archiveConversation);
router.post("/conversation/:conversationId/block", messageController.blockConversation);

// Message routes
router.post("/send", messageController.sendMessage);
router.get("/conversation/:conversationId/messages", messageController.getConversationMessages);
router.post("/conversation/:conversationId/read", messageController.markMessagesAsRead);
router.delete("/message/:messageId", messageController.deleteMessage);

// Utility routes
router.get("/unread-count", messageController.getUnreadCount);

module.exports = router;
