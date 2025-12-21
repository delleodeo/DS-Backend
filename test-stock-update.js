const mongoose = require('mongoose');
const { updateProductStockOnDelivery } = require('./modules/products/products.service');
const { updateOrderStatusService } = require('./modules/orders/orders.service');
const Product = require('./modules/products/products.model');
const Order = require('./modules/orders/orders.model');
require('dotenv').config();

// Test configuration - update with your actual MongoDB connection
const MONGODB_URI = process.env.MONGO_URI

async function setupTestData() {
  console.log('🔧 Setting up test data...');
  
  // Use existing vendor ID instead of creating a new one
  const vendorId = '6947d2c353d789bcbc5269a9';
  
  // Create a test product with options
  const testProduct = new Product({
    vendorId: vendorId,
    name: 'Test Product',
    description: 'Test product for stock update',
    price: 100,
    stock: 50, // Main stock will be calculated from options
    sold: 5,
    municipality: 'Test City',
    categories: ['test'],
    isApproved: true,
    option: [
      {
        imageUrl: 'test1.jpg',
        price: 100,
        label: 'Red',
        stock: 20,
        sold: 2
      },
      {
        imageUrl: 'test2.jpg', 
        price: 110,
        label: 'Blue',
        stock: 30,
        sold: 3
      }
    ]
  });

  // Recalculate main product totals from options
  testProduct.stock = testProduct.option.reduce((sum, opt) => sum + opt.stock, 0);
  testProduct.sold = testProduct.option.reduce((sum, opt) => sum + opt.sold, 0);
  testProduct.isOption = testProduct.option.length > 0;

  await testProduct.save();
  console.log('✅ Test product created:', testProduct._id);

  // Create a test order
  const testOrder = new Order({
    customerId: new mongoose.Types.ObjectId(),
    vendorId: vendorId,
    items: [
      {
        productId: testProduct._id,
        optionId: testProduct.option[0]._id, // Red option
        quantity: 3,
        price: 100,
        name: 'Test Product',
        label: 'Red'
      },
      {
        productId: testProduct._id,
        optionId: testProduct.option[1]._id, // Blue option  
        quantity: 2,
        price: 110,
        name: 'Test Product',
        label: 'Blue'
      }
    ],
    subTotal: 520,
    paymentMethod: 'cod',
    status: 'shipped',
    shippingAddress: {
      street: 'Test Street',
      city: 'Test City'
    }
  });

  await testOrder.save();
  console.log('✅ Test order created:', testOrder._id);

  return { testProduct, testOrder };
}

async function runTest() {
  try {
    console.log('🚀 Starting stock update test...');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Setup test data
    const { testProduct, testOrder } = await setupTestData();

    // Print initial stock levels
    console.log('\n📊 BEFORE delivery:');
    const productBefore = await Product.findById(testProduct._id);
    console.log('Main Product Stock:', productBefore.stock, 'Sold:', productBefore.sold);
    console.log('Red Option Stock:', productBefore.option[0].stock, 'Sold:', productBefore.option[0].sold);
    console.log('Blue Option Stock:', productBefore.option[1].stock, 'Sold:', productBefore.option[1].sold);

    // Test updating order status to delivered
    console.log('\n🚚 Updating order status to delivered...');
    await updateOrderStatusService(testOrder._id.toString(), 'delivered');

    // Check updated stock levels
    console.log('\n📊 AFTER delivery:');
    const productAfter = await Product.findById(testProduct._id);
    console.log('Main Product Stock:', productAfter.stock, 'Sold:', productAfter.sold);
    console.log('Red Option Stock:', productAfter.option[0].stock, 'Sold:', productAfter.option[0].sold);
    console.log('Blue Option Stock:', productAfter.option[1].stock, 'Sold:', productAfter.option[1].sold);

    // Verify the changes
    console.log('\n✅ VERIFICATION:');
    console.log('Red Option: Stock should be', 20 - 3, '=', productAfter.option[0].stock, productAfter.option[0].stock === 17 ? '✅' : '❌');
    console.log('Red Option: Sold should be', 2 + 3, '=', productAfter.option[0].sold, productAfter.option[0].sold === 5 ? '✅' : '❌');
    console.log('Blue Option: Stock should be', 30 - 2, '=', productAfter.option[1].stock, productAfter.option[1].stock === 28 ? '✅' : '❌');
    console.log('Blue Option: Sold should be', 3 + 2, '=', productAfter.option[1].sold, productAfter.option[1].sold === 5 ? '✅' : '❌');
    console.log('Main Product: Stock should be', 17 + 28, '=', productAfter.stock, productAfter.stock === 45 ? '✅' : '❌');
    console.log('Main Product: Sold should be', 5 + 5, '=', productAfter.sold, productAfter.sold === 10 ? '✅' : '❌');

    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    await Product.findByIdAndDelete(testProduct._id);
    await Order.findByIdAndDelete(testOrder._id);
    console.log('✅ Test data cleaned up (vendor preserved)');

    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
  }
}

// Run the test
runTest();