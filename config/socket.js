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

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

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
    
    // Join conversation room
    socket.on('join_conversation', (conversationId) => {
      console.log(`💬 [SOCKET] Socket ${socket.id} joined conversation: ${conversationId}`);
      socket.join(`conversation_${conversationId}`);
      socket.emit('joined_conversation', { conversationId });
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
        const messageService = require('../modules/messages/message.service');
        
        console.log(`💬 [SOCKET] Sending message in conversation ${data.conversationId}`);
        
        // Send message through service
        const message = await messageService.sendMessageService({
          conversationId: data.conversationId,
          senderId: data.senderId,
          senderType: data.senderType,
          content: data.content,
          messageType: data.messageType || 'text',
          imageUrl: data.imageUrl,
          referenceId: data.referenceId,
          referenceType: data.referenceType
        });

        // Emit to all users in conversation room
        io.to(`conversation_${data.conversationId}`).emit('new_message', message);
        
        // Emit to sender confirmation
        socket.emit('message_sent', { success: true, message });

        console.log(`✅ [SOCKET] Message sent successfully: ${message._id}`);
      } catch (error) {
        console.error(`❌ [SOCKET] Error sending message:`, error);
        socket.emit('message_error', { error: error.message });
      }
    });

    // Typing indicator
    socket.on('typing_start', (data) => {
      console.log(`💬 [SOCKET] User typing in conversation ${data.conversationId}`);
      socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
        conversationId: data.conversationId,
        userId: data.userId,
        userName: data.userName
      });
    });

    socket.on('typing_stop', (data) => {
      console.log(`💬 [SOCKET] User stopped typing in conversation ${data.conversationId}`);
      socket.to(`conversation_${data.conversationId}`).emit('user_stopped_typing', {
        conversationId: data.conversationId,
        userId: data.userId
      });
    });

    // Mark messages as read (real-time notification)
    socket.on('mark_read', async (data) => {
      try {
        const messageService = require('../modules/messages/message.service');
        
        await messageService.markMessagesAsReadService(
          data.conversationId,
          data.userId,
          data.userType
        );

        // Notify other user that messages were read
        socket.to(`conversation_${data.conversationId}`).emit('messages_read', {
          conversationId: data.conversationId,
          readBy: data.userId
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