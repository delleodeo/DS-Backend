const express = require("express");
const router = express.Router();
const messageController = require("./message.controller");
const { protect } = require("../../auth/auth.controller");
const rateLimiter = require("../../utils/rateLimiter");
const bodyParser = require('express').json({ limit: '5kb' });


// All routes require authentication
router.use(protect);

// Conversation routes
router.post(
  "/conversation",
  rateLimiter({ windowSec: 60, maxRequests: 10, keyPrefix: 'conversation-create' }),
  messageController.getOrCreateConversation
);
router.get(
  "/conversations",
  rateLimiter({ windowSec: 60, maxRequests: 30, keyPrefix: 'conversations-list' }),
  messageController.getUserConversations
);
router.get(
  "/conversations/search",
  rateLimiter({ windowSec: 60, maxRequests: 20, keyPrefix: 'conversations-search' }),
  messageController.searchConversations
);
router.post(
  "/conversation/:conversationId/archive",
  rateLimiter({ windowSec: 60, maxRequests: 10, keyPrefix: 'conversation-archive' }),
  messageController.archiveConversation
);
router.post(
  "/conversation/:conversationId/block",
  rateLimiter({ windowSec: 60, maxRequests: 10, keyPrefix: 'conversation-block' }),
  messageController.blockConversation
);

// Message routes
router.post(
  "/send",
  rateLimiter({ windowSec: 60, maxRequests: 20, keyPrefix: 'message-send' }),
  bodyParser,
  messageController.sendMessage
);
router.get(
  "/conversation/:conversationId/messages",
  rateLimiter({ windowSec: 60, maxRequests: 60, keyPrefix: 'messages-list' }),
  messageController.getConversationMessages
);
router.post(
  "/conversation/:conversationId/read",
  rateLimiter({ windowSec: 60, maxRequests: 30, keyPrefix: 'messages-read' }),
  messageController.markMessagesAsRead
);
router.delete(
  "/message/:messageId",
  rateLimiter({ windowSec: 60, maxRequests: 10, keyPrefix: 'message-delete' }),
  messageController.deleteMessage
);

// Utility routes
router.get(
  "/unread-count",
  rateLimiter({ windowSec: 60, maxRequests: 20, keyPrefix: 'unread-count' }),
  messageController.getUnreadCount
);

module.exports = router;
