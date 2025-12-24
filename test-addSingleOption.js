const mongoose = require('mongoose');
const { addSingleOption } = require('./modules/products/products.service');
const Product = require('./modules/products/products.model');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const vendorId = new mongoose.Types.ObjectId();

    // Create a product with no options
    const product = new Product({
      vendorId,
      name: 'Option Concurrency Test',
      description: 'Product for concurrency test',
      price: 100,
      stock: 0,
      sold: 0,
      municipality: 'Test City',
      categories: ['test'],
      status: 'approved',
      option: [],
    });

    await product.save();
    console.log('Created product', product._id.toString());

    const payload = {
      label: 'SAME_LABEL',
      price: 20,
      stock: 1,
    };

    // Attempt two concurrent adds with the same label
    const p1 = addSingleOption(product._id.toString(), payload).then((r) => ({ ok: true, res: r })).catch((e) => ({ ok: false, err: e }));
    const p2 = addSingleOption(product._id.toString(), payload).then((r) => ({ ok: true, res: r })).catch((e) => ({ ok: false, err: e }));

    const results = await Promise.all([p1, p2]);
    console.log('Concurrent results:', results.map(r => ({ ok: r.ok, message: r.ok ? 'succeeded' : r.err.message })));

    const succeeded = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);

    if (succeeded.length !== 1 || failed.length !== 1) {
      console.error('Concurrency test did not behave as expected. Expected one success and one conflict.');
    } else {
      console.log('Concurrency test passed: one success and one conflict as expected.');
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
