const express = require('express');

// Test script to verify the promotion routes work correctly
const app = express();
app.use(express.json());

// Import just the promotion routes for testing
const promotionRoutes = require('./modules/products/promotion.routes');

// Mount the routes directly
app.use('/api/products', promotionRoutes);

// Test route to verify server is working
app.get('/test', (req, res) => {
  res.json({ message: 'Test server is working' });
});

// Start test server
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`🧪 Test server running on http://localhost:${PORT}`);
  console.log('📍 Available routes:');
  console.log(`   POST   http://localhost:${PORT}/api/products/:productId/promotion`);
  console.log(`   POST   http://localhost:${PORT}/api/products/:productId/options/:optionId/promotion`);
  console.log(`   DELETE http://localhost:${PORT}/api/products/:productId/promotion`);
  console.log(`   DELETE http://localhost:${PORT}/api/products/:productId/options/:optionId/promotion`);
  console.log(`   GET    http://localhost:${PORT}/test (for testing)`);
  console.log('');
  console.log('🧪 Test with your IDs:');
  console.log(`   curl -X POST http://localhost:${PORT}/api/products/693c24d8fe2e32ce7a456e2f/options/693c24d8fe2e32ce7a456e32/promotion \\`);
  console.log(`        -H "Content-Type: application/json" \\`);
  console.log(`        -d '{"discountType":"percentage","discountValue":10,"freeShipping":false}'`);
});

module.exports = app;