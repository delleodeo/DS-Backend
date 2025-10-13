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

module.exports = {
  initSocket,
  getIO,
  emitAgreementMessage,
  broadcastToAll
};