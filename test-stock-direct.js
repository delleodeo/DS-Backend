const mongoose = require('mongoose');
const { updateProductStockOnDelivery } = require('./modules/products/products.service');
const Product = require('./modules/products/products.model');

// Test configuration  
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/doroshop-test';

async function runDirectTest() {
  try {
    console.log('🚀 Starting direct stock update test...');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create a test product
    const testProduct = new Product({
      vendorId: new mongoose.Types.ObjectId(),
      name: 'Direct Test Product',
      description: 'Test product for direct stock update',
      price: 50,
      stock: 100,
      sold: 10,
      municipality: 'Test City',
      categories: ['test'],
      isApproved: true,
      option: [
        {
          imageUrl: 'direct1.jpg',
          price: 50,
          label: 'Small',
          stock: 40,
          sold: 5
        },
        {
          imageUrl: 'direct2.jpg',
          price: 60,
          label: 'Large',
          stock: 60,
          sold: 5
        }
      ]
    });

    // Calculate totals from options
    testProduct.stock = testProduct.option.reduce((sum, opt) => sum + opt.stock, 0);
    testProduct.sold = testProduct.option.reduce((sum, opt) => sum + opt.sold, 0);
    testProduct.isOption = true;

    await testProduct.save();
    console.log('✅ Test product created:', testProduct._id);

    // Mock order items
    const mockOrderItems = [
      {
        productId: testProduct._id,
        optionId: testProduct.option[0]._id, // Small
        quantity: 5,
        price: 50,
        name: 'Direct Test Product',
        label: 'Small'
      },
      {
        productId: testProduct._id,
        optionId: testProduct.option[1]._id, // Large
        quantity: 3,
        price: 60,
        name: 'Direct Test Product',
        label: 'Large'
      }
    ];

    // Print before state
    console.log('\n📊 BEFORE stock update:');
    const before = await Product.findById(testProduct._id);
    console.log('Main Product - Stock:', before.stock, 'Sold:', before.sold);
    console.log('Small Option - Stock:', before.option[0].stock, 'Sold:', before.option[0].sold);
    console.log('Large Option - Stock:', before.option[1].stock, 'Sold:', before.option[1].sold);

    // Call the stock update function directly
    console.log('\n🔄 Calling updateProductStockOnDelivery...');
    await updateProductStockOnDelivery(mockOrderItems);

    // Print after state
    console.log('\n📊 AFTER stock update:');
    const after = await Product.findById(testProduct._id);
    console.log('Main Product - Stock:', after.stock, 'Sold:', after.sold);
    console.log('Small Option - Stock:', after.option[0].stock, 'Sold:', after.option[0].sold);
    console.log('Large Option - Stock:', after.option[1].stock, 'Sold:', after.option[1].sold);

    // Verify results
    console.log('\n✅ VERIFICATION:');
    const expectedSmallStock = 40 - 5; // 35
    const expectedSmallSold = 5 + 5; // 10
    const expectedLargeStock = 60 - 3; // 57  
    const expectedLargeSold = 5 + 3; // 8
    const expectedMainStock = expectedSmallStock + expectedLargeStock; // 92
    const expectedMainSold = expectedSmallSold + expectedLargeSold; // 18

    console.log('Small Option Stock:', expectedSmallStock, '=', after.option[0].stock, after.option[0].stock === expectedSmallStock ? '✅' : '❌');
    console.log('Small Option Sold:', expectedSmallSold, '=', after.option[0].sold, after.option[0].sold === expectedSmallSold ? '✅' : '❌');
    console.log('Large Option Stock:', expectedLargeStock, '=', after.option[1].stock, after.option[1].stock === expectedLargeStock ? '✅' : '❌');
    console.log('Large Option Sold:', expectedLargeSold, '=', after.option[1].sold, after.option[1].sold === expectedLargeSold ? '✅' : '❌');
    console.log('Main Product Stock:', expectedMainStock, '=', after.stock, after.stock === expectedMainStock ? '✅' : '❌');
    console.log('Main Product Sold:', expectedMainSold, '=', after.sold, after.sold === expectedMainSold ? '✅' : '❌');

    // Test edge case: product without options
    const simpleProduct = new Product({
      vendorId: new mongoose.Types.ObjectId(),
      name: 'Simple Product',
      price: 25,
      stock: 50,
      sold: 5,
      municipality: 'Test City',
      categories: ['simple'],
      isApproved: true,
      option: [] // No options
    });
    await simpleProduct.save();

    const simpleOrderItems = [
      {
        productId: simpleProduct._id,
        quantity: 10,
        price: 25,
        name: 'Simple Product'
      }
    ];

    console.log('\n📦 Testing simple product (no options):');
    console.log('BEFORE - Stock:', simpleProduct.stock, 'Sold:', simpleProduct.sold);
    
    await updateProductStockOnDelivery(simpleOrderItems);
    
    const simpleAfter = await Product.findById(simpleProduct._id);
    console.log('AFTER - Stock:', simpleAfter.stock, 'Sold:', simpleAfter.sold);
    console.log('Simple Product Stock:', 40, '=', simpleAfter.stock, simpleAfter.stock === 40 ? '✅' : '❌');
    console.log('Simple Product Sold:', 15, '=', simpleAfter.sold, simpleAfter.sold === 15 ? '✅' : '❌');

    // Cleanup
    await Product.findByIdAndDelete(testProduct._id);
    await Product.findByIdAndDelete(simpleProduct._id);
    console.log('\n🧹 Test data cleaned up');

    console.log('\n🎉 Direct test completed successfully!');

  } catch (error) {
    console.error('❌ Direct test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
  }
}

// Run the direct test
runDirectTest();