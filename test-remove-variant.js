const mongoose = require('mongoose');
const Product = require('./modules/products/products.model');
const {
  removeVariantData,
  reassignMainImageIfNeeded,
  removeVariant
} = require('./modules/products/products.service');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

async function run() {
  if (!MONGODB_URI) {
    console.log('Skipping DB tests: MONGO_URI not set');
    return;
  }
  await mongoose.connect(MONGODB_URI);

  // Create product with two variants
  const product = new Product({
    vendorId: new mongoose.Types.ObjectId(),
    name: 'Variant Refactor Test',
    imageUrls: ['a.jpg'],
    option: [
      { label: 'A', price: 10, stock: 5, imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/products/a.jpg' },
      { label: 'B', price: 12, stock: 3, imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/products/b.jpg' }
    ],
  });
  await product.save();

  // Remove variant B
  const variantId = product.option[1]._id.toString();
  const res = await removeVariant(product._id.toString(), variantId);
  console.log('removeVariant res:', res);

  // Cleanup
  await Product.findByIdAndDelete(product._id);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});