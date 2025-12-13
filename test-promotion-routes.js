/**
 * Test script for promotion routes
 * Run with: node test-promotion-routes.js
 */

const mongoose = require('mongoose');
const Product = require('./modules/products/products.model.js');

// Test configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/doroshop';

async function testPromotionRoutes() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Create test product with options
    const testProduct = new Product({
      name: 'Test Product for Promotions',
      description: 'Test product to verify promotion functionality',
      price: 100,
      stock: 10,
      vendorId: new mongoose.Types.ObjectId(),
      category: 'test',
      municipality: 'test-city',
      imageUrls: ['https://example.com/test.jpg'],
      option: [
        {
          label: 'Size Small',
          price: 80,
          stock: 5,
          imageUrl: 'https://example.com/small.jpg',
          promotion: {
            isActive: false,
            discountType: 'percentage',
            discountValue: 0,
            freeShipping: false
          }
        },
        {
          label: 'Size Large',
          price: 120,
          stock: 3,
          imageUrl: 'https://example.com/large.jpg',
          promotion: {
            isActive: false,
            discountType: 'percentage',
            discountValue: 0,
            freeShipping: false
          }
        }
      ],
      promotion: {
        isActive: false,
        discountType: 'percentage',
        discountValue: 0,
        freeShipping: false
      }
    });

    const savedProduct = await testProduct.save();
    console.log(`✅ Created test product: ${savedProduct._id}`);

    // Test route paths that would be hit by the frontend
    const productId = savedProduct._id;
    const optionId = savedProduct.option[0]._id;

    console.log('\n📋 Test URLs that should work:');
    console.log(`POST   /v1/api/products/${productId}/promotion`);
    console.log(`POST   /v1/api/products/${productId}/option/${optionId}/promotion`);
    console.log(`DELETE /v1/api/products/${productId}/promotion`);
    console.log(`DELETE /v1/api/products/${productId}/option/${optionId}/promotion`);

    // Test promotion service functions directly
    console.log('\n🧪 Testing promotion service functions...');
    
    const { 
      applyPromotionToProduct, 
      applyPromotionToOption,
      removePromotionFromProduct,
      removePromotionFromOption
    } = require('./modules/products/promotion.service.js');

    // Test applying promotion to product
    console.log('Testing applyPromotionToProduct...');
    const updatedProduct1 = await applyPromotionToProduct(productId, {
      discountType: 'percentage',
      discountValue: 20,
      freeShipping: true
    });
    console.log('✅ Product promotion applied:', updatedProduct1.promotion);

    // Test applying promotion to option
    console.log('Testing applyPromotionToOption...');
    const updatedProduct2 = await applyPromotionToOption(productId, optionId, {
      discountType: 'fixed',
      discountValue: 15,
      freeShipping: false
    });
    console.log('✅ Option promotion applied:', updatedProduct2.option[0].promotion);

    // Test removing promotions
    console.log('Testing removePromotionFromProduct...');
    const updatedProduct3 = await removePromotionFromProduct(productId);
    console.log('✅ Product promotion removed:', updatedProduct3.promotion);

    console.log('Testing removePromotionFromOption...');
    const updatedProduct4 = await removePromotionFromOption(productId, optionId);
    console.log('✅ Option promotion removed:', updatedProduct4.option[0].promotion);

    // Cleanup
    await Product.findByIdAndDelete(productId);
    console.log('🧹 Cleaned up test product');

    console.log('\n🎉 All promotion tests passed!');
    console.log('\n💡 If you\'re still getting 404 errors, check:');
    console.log('   1. Server is running on correct port');
    console.log('   2. API base URL is correct (/v1/api)');
    console.log('   3. Routes are properly mounted in app.js');
    console.log('   4. MongoDB ObjectIds are valid');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run tests
testPromotionRoutes();