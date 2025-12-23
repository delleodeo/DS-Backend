const mongoose = require('mongoose');
const { addProductStock } = require('./modules/products/products.service');
const Product = require('./modules/products/products.model');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const vendorId = new mongoose.Types.ObjectId();

    // Create product with two options
    const product = new Product({
      vendorId,
      name: 'Stock Test Product',
      description: 'Product for stock test',
      price: 100,
      stock: 5,
      sold: 0,
      municipality: 'Test City',
      categories: ['test'],
      status: 'approved',
      option: [
        { label: 'A', price: 50, stock: 2, sold: 0 },
        { label: 'B', price: 60, stock: 3, sold: 0 },
      ],
    });

    await product.save();
    console.log('Created product', product._id.toString());

    // Test option stock decrease
    const optionId = product.option[0]._id;
    const res1 = await addProductStock(product._id.toString(), optionId.toString(), -1);
    console.log('After decreasing option A by 1, option stock:', res1.option.find(o=>o._id.toString()===optionId.toString()).stock);

    // Test option stock increase
    const res2 = await addProductStock(product._id.toString(), optionId.toString(), 2);
    console.log('After increasing option A by 2, option stock:', res2.option.find(o=>o._id.toString()===optionId.toString()).stock);

    // Test main stock increase
    const res3 = await addProductStock(product._id.toString(), null, 5);
    console.log('After increasing main stock by 5, main stock:', res3.stock);

    // Test main stock decrease with insufficient stock (should throw)
    try {
      await addProductStock(product._id.toString(), null, -1000);
      console.error('ERROR: Decreasing main stock below zero did not throw');
    } catch (err) {
      console.log('Expected error on excessive decrease:', err.message);
    }

    // Cleanup
    await Product.findByIdAndDelete(product._id);
    console.log('Cleaned up');

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run();