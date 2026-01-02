const mongoose = require('mongoose');
const { addToCartService } = require('./modules/cart/cart.service');
require('dotenv').config();

async function testCartAdd() {
  try {
    // Connect to MongoDB if not connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dshop');
    }

    // Mock user ID
    const userId = '6947d1a053d789bcbc52692c'; // From previous logs

    // Mock item
    const item = {
      productId: '694befd9def3bfc16805daf6',
      optionId: '694befd9def3bfc16805daf7',
      quantity: 1
    };

    console.log('Testing cart add...');
    const result = await addToCartService(userId, item);
    console.log('Cart add successful:', result);
  } catch (error) {
    console.error('Cart add failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testCartAdd();