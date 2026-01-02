const mongoose = require('mongoose');
const { searchProductsService } = require('./modules/products/products.service');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    try {
      await searchProductsService('');
      console.error('Empty query should have thrown but did not');
    } catch (err) {
      console.log('Empty query correctly threw:', err.message);
    }

    try {
      const long = 'a'.repeat(300);
      await searchProductsService(long);
      console.error('Long query should have thrown but did not');
    } catch (err) {
      console.log('Long query correctly threw:', err.message);
    }

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run();
