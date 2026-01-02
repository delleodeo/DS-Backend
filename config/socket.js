const { Server } = require('socket.io');

let io;

function initSocket(server) {
  // Use environment variables for CORS origins
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? [
        "https://darylbacongco.me",
        process.env.FRONTEND_URL // Add your production frontend URL
      ]
    : [
        "https://darylbacongco.me",
        "http://localhost:3000",
        "http://localhost:5173", // Vite dev server
        "http://localhost:4173"  // Vite preview
      ];

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    // Add production optimizations
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6 // 1MB limit for security
  });

  // Simple in-memory rate limiter map for socket events (per-user)
  const socketRateMap = new Map();

  // Authenticate sockets via JWT sent in handshake (auth: { token })
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || (socket.handshake.headers && socket.handshake.headers.authorization && socket.handshake.headers.authorization.split(' ')[1]);
      if (!token) return next(new Error('Authentication required'));

      const { verifyToken } = require('../auth/token');
      const TokenBlacklist = require('../auth/tokenBlacklist');
      const User = require('../modules/users/users.model');

      const isBlacklisted = await TokenBlacklist.isTokenBlacklisted(token);
      if (isBlacklisted) return next(new Error('Invalid token'));

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('name imageUrl role');
      if (!user) return next(new Error('User not found'));

      // Attach minimal user info to socket
      socket.user = { id: decoded.id, role: decoded.role, name: user.name, imageUrl: user.imageUrl };
      socket.token = token;

      // Join personal room for targeted events
      socket.join(`user_${decoded.id}`);

      return next();
    } catch (err) {
      console.error('Socket auth error:', err);
      return next(new Error('Invalid token'));
    }
  });

  // Cleanup socketRateMap on disconnect
  io.on('connection', (socket) => {
    socket.on('disconnect', () => {
      if (socket?.user?.id) socketRateMap.delete(socket.user.id);
    });
  });


  io.on('connection', (socket) => {
    console.log('User connected:', socket.id, 'user:', socket.user?.id || 'unauthenticated');

    // Handle joining order rooms
    socket.on('join_order', (orderId) => {
      console.log(`Socket ${socket.id} joined order room: order_${orderId}`);
      socket.join(`order_${orderId}`);
      
      // Confirm room join
      socket.emit('joined_order', { orderId, message: 'Successfully joined order chat' });
    });

    // Handle leaving order rooms
    socket.on('leave_order', (orderId) => {
      console.log(`Socket ${socket.id} left order room: order_${orderId}`);
      socket.leave(`order_${orderId}`);
      
      // Confirm room leave
      socket.emit('left_order', { orderId, message: 'Left order chat' });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log('User disconnected:', socket.id, 'Reason:', reason);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Handle custom events for testing
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // ==================== MESSAGING EVENTS ====================
    
    // Join conversation room (only participants)
    socket.on('join_conversation', async (conversationId) => {
      try {
        const Conversation = require('../modules/messages/conversation.model');
        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          socket.emit('message_error', { error: 'Conversation not found' });
          return;
        }

        const isParticipant = conv.customerId.toString() === socket.user.id.toString() || conv.vendorId.toString() === socket.user.id.toString();
        if (!isParticipant) {
          socket.emit('message_error', { error: 'You are not part of this conversation' });
          return;
        }

        socket.join(`conversation_${conversationId}`);
        socket.emit('joined_conversation', { conversationId });
      } catch (err) {
        console.error('❌ [SOCKET] join_conversation error:', err);
        socket.emit('message_error', { error: 'Failed to join conversation' });
      }
    });

    // Leave conversation room
    socket.on('leave_conversation', (conversationId) => {
      console.log(`💬 [SOCKET] Socket ${socket.id} left conversation: ${conversationId}`);
      socket.leave(`conversation_${conversationId}`);
      socket.emit('left_conversation', { conversationId });
    });

    // Send message via Socket.IO (real-time)
    socket.on('send_message', async (data) => {
      try {
        // Simple per-user rate limit (5 messages per second)
        const now = Date.now();
        const windowMs = 1000; // 1 second
        const maxMessages = 5;
        const userKey = socket.user.id;
        const entry = socketRateMap.get(userKey) || { start: now, count: 0 };
        if (now - entry.start > windowMs) {
          entry.start = now;
          entry.count = 0;
        }
        entry.count += 1;
        if (entry.count > maxMessages) {
          socket.emit('message_error', { error: 'Rate limit exceeded' });
          return;
        }
        socketRateMap.set(userKey, entry);

        const messageService = require('../modules/messages/message.service');
        
        console.log(`💬 [SOCKET] Sending message in conversation ${data.conversationId} by user ${socket.user?.id}`);
        
        // Build message payload using authenticated user (ignore client-supplied senderId/senderType)
        const messagePayload = {
          conversationId: data.conversationId,
          senderId: socket.user.id,
          content: data.content,
          messageType: data.messageType || 'text',
          imageUrl: data.imageUrl,
          referenceId: data.referenceId,
          referenceType: data.referenceType
        };

        const message = await messageService.sendMessageService(messagePayload);

        // Emit to all users in conversation room
        io.to(`conversation_${data.conversationId}`).emit('new_message', message);
        
        // Emit to sender confirmation
        socket.emit('message_sent', { success: true, message });

        console.log(`✅ [SOCKET] Message sent successfully: ${message._id}`);
      } catch (error) {
        console.error(`❌ [SOCKET] Error sending message:`, error);
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    // Typing indicator - use authenticated user info and verify membership
    socket.on('typing_start', async (data) => {
      try {
        const Conversation = require('../modules/messages/conversation.model');
        const conv = await Conversation.findById(data.conversationId);
        if (!conv) return;
        const isParticipant = conv.customerId.toString() === socket.user.id.toString() || conv.vendorId.toString() === socket.user.id.toString();
        if (!isParticipant) return;
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
          conversationId: data.conversationId,
          userId: socket.user.id,
          userName: socket.user.name
        });
      } catch (err) {
        console.error('❌ [SOCKET] typing_start error:', err);
      }
    });

    socket.on('typing_stop', async (data) => {
      try {
        const Conversation = require('../modules/messages/conversation.model');
        const conv = await Conversation.findById(data.conversationId);
        if (!conv) return;
        const isParticipant = conv.customerId.toString() === socket.user.id.toString() || conv.vendorId.toString() === socket.user.id.toString();
        if (!isParticipant) return;
        socket.to(`conversation_${data.conversationId}`).emit('user_stopped_typing', {
          conversationId: data.conversationId,
          userId: socket.user.id
        });
      } catch (err) {
        console.error('❌ [SOCKET] typing_stop error:', err);
      }
    });

    // Mark messages as read (real-time notification)
    socket.on('mark_read', async (data) => {
      try {
        const messageService = require('../modules/messages/message.service');
        
        // Derive user from socket (do not trust client-supplied userId/userType)
        await messageService.markMessagesAsReadService(
          data.conversationId,
          socket.user.id
        );

        // Notify other user that messages were read
        socket.to(`conversation_${data.conversationId}`).emit('messages_read', {
          conversationId: data.conversationId,
          readBy: socket.user.id
        });

        console.log(`✅ [SOCKET] Messages marked as read in conversation ${data.conversationId}`);
      } catch (error) {
        console.error(`❌ [SOCKET] Error marking messages as read:`, error);
      }
    });
  });

  console.log('Socket.IO server initialized successfully');
  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocket first.');
  }
  return io;
}

function emitAgreementMessage(orderId, messageData) {
  try {
    if (io) {
      const roomName = `order_${orderId}`;
      console.log(`Broadcasting message to room: ${roomName}`);
      console.log('Message data:', messageData);
      
      // Get number of clients in room for debugging
      const room = io.sockets.adapter.rooms.get(roomName);
      const clientCount = room ? room.size : 0;
      console.log(`Room ${roomName} has ${clientCount} connected clients`);
      
      // Emit the message
      io.to(roomName).emit('new_agreement_message', {
        orderId,
        message: messageData,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✅ Successfully broadcasted message for order ${orderId}`);
    } else {
      console.warn('Socket.IO not initialized, cannot emit message');
    }
  } catch (error) {
    console.error('❌ Error emitting agreement message:', error);
  }
}

// Function to broadcast to all connected clients
function broadcastToAll(eventName, data) {
  try {
    if (io) {
      io.emit(eventName, data);
      console.log(`Broadcasted ${eventName} to all connected clients`);
    }
  } catch (error) {
    console.error('Error broadcasting to all clients:', error);
  }
}

// Function to emit new message to conversation
function emitNewMessage(conversationId, messageData) {
  try {
    if (io) {
      const roomName = `conversation_${conversationId}`;
      io.to(roomName).emit('new_message', messageData);
      console.log(`💬 Emitted new message to conversation ${conversationId}`);
    }
  } catch (error) {
    console.error('❌ Error emitting new message:', error);
  }
}

// Function to emit unread count update to user
function emitUnreadCountUpdate(userId, unreadData) {
  try {
    if (io) {
      io.to(`user_${userId}`).emit('unread_count_update', unreadData);
      console.log(`📬 Emitted unread count update to user ${userId}`);
    }
  } catch (error) {
    console.error('❌ Error emitting unread count:', error);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitAgreementMessage,
  broadcastToAll,
  emitNewMessage,
  emitUnreadCountUpdate
};