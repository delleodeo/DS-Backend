const express = require('express');
const router = express.Router();
const { emitAgreementMessage, broadcastToAll } = require('../config/socket');

// Test endpoint to verify Socket.IO is working
router.post('/test-socket', (req, res) => {
  try {
    const { orderId, message } = req.body;
    
    if (orderId && message) {
      // Test order-specific message
      emitAgreementMessage(orderId, {
        id: Date.now(),
        sender: 'system',
        message: `Test message: ${message}`,
        timestamp: new Date()
      });
      
      res.json({ 
        success: true, 
        message: `Test message sent to order ${orderId}`,
        timestamp: new Date().toISOString()
      });
    } else {
      // Test broadcast to all
      broadcastToAll('test_broadcast', {
        message: 'Test broadcast message',
        timestamp: new Date().toISOString()
      });
      
      res.json({ 
        success: true, 
        message: 'Test broadcast sent to all connected clients',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Test socket endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Socket.IO test endpoints are working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;