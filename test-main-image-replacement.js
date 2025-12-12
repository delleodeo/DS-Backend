/**
 * Test script to verify main image auto-replacement from option images
 * Run with: node backend/test-main-image-replacement.js
 */

const { ensureMainImage } = require('./modules/products/products.service.js');

console.log('Testing ensureMainImage function...\n');
console.log('='.repeat(80));

// Test Case 1: Product with no main images but has option images
console.log('\n📋 Test 1: Product with no main images but has option images');
const product1 = {
  _id: 'test123',
  name: 'Test Product',
  imageUrls: [],
  option: [
    { _id: 'opt1', label: 'Red', imageUrl: 'https://res.cloudinary.com/demo/image/upload/red.jpg', price: 100 },
    { _id: 'opt2', label: 'Blue', imageUrl: 'https://res.cloudinary.com/demo/image/upload/blue.jpg', price: 100 }
  ]
};

const wasModified1 = ensureMainImage(product1);
console.log('  Modified:', wasModified1);
console.log('  Main images after:', product1.imageUrls);
console.log('  Expected: ["https://res.cloudinary.com/demo/image/upload/red.jpg"]');
console.log('  ✓ PASS:', wasModified1 && product1.imageUrls.length === 1 && product1.imageUrls[0] === 'https://res.cloudinary.com/demo/image/upload/red.jpg');

// Test Case 2: Product with main images (should not modify)
console.log('\n📋 Test 2: Product already has main images');
const product2 = {
  _id: 'test456',
  name: 'Test Product 2',
  imageUrls: ['https://res.cloudinary.com/demo/image/upload/main.jpg'],
  option: [
    { _id: 'opt1', label: 'Red', imageUrl: 'https://res.cloudinary.com/demo/image/upload/red.jpg', price: 100 }
  ]
};

const wasModified2 = ensureMainImage(product2);
console.log('  Modified:', wasModified2);
console.log('  Main images after:', product2.imageUrls);
console.log('  Expected: ["https://res.cloudinary.com/demo/image/upload/main.jpg"]');
console.log('  ✓ PASS:', !wasModified2 && product2.imageUrls.length === 1 && product2.imageUrls[0] === 'https://res.cloudinary.com/demo/image/upload/main.jpg');

// Test Case 3: Product with no main images and no option images
console.log('\n📋 Test 3: Product with no main images and no option images');
const product3 = {
  _id: 'test789',
  name: 'Test Product 3',
  imageUrls: [],
  option: []
};

const wasModified3 = ensureMainImage(product3);
console.log('  Modified:', wasModified3);
console.log('  Main images after:', product3.imageUrls);
console.log('  Expected: []');
console.log('  ✓ PASS:', !wasModified3 && product3.imageUrls.length === 0);

// Test Case 4: Product with no main images but options without images
console.log('\n📋 Test 4: Product with no main images but options without images');
const product4 = {
  _id: 'test101',
  name: 'Test Product 4',
  imageUrls: [],
  option: [
    { _id: 'opt1', label: 'Small', price: 50 },
    { _id: 'opt2', label: 'Large', price: 100 }
  ]
};

const wasModified4 = ensureMainImage(product4);
console.log('  Modified:', wasModified4);
console.log('  Main images after:', product4.imageUrls);
console.log('  Expected: []');
console.log('  ✓ PASS:', !wasModified4 && product4.imageUrls.length === 0);

// Test Case 5: Product with null imageUrls
console.log('\n📋 Test 5: Product with null imageUrls');
const product5 = {
  _id: 'test102',
  name: 'Test Product 5',
  imageUrls: null,
  option: [
    { _id: 'opt1', label: 'Red', imageUrl: 'https://res.cloudinary.com/demo/image/upload/red.jpg', price: 100 }
  ]
};

const wasModified5 = ensureMainImage(product5);
console.log('  Modified:', wasModified5);
console.log('  Main images after:', product5.imageUrls);
console.log('  Expected: ["https://res.cloudinary.com/demo/image/upload/red.jpg"]');
console.log('  ✓ PASS:', wasModified5 && product5.imageUrls && product5.imageUrls.length === 1);

// Test Case 6: Product with mixed options (some with images, some without)
console.log('\n📋 Test 6: Product with mixed options');
const product6 = {
  _id: 'test103',
  name: 'Test Product 6',
  imageUrls: [],
  option: [
    { _id: 'opt1', label: 'Small', price: 50 },
    { _id: 'opt2', label: 'Medium', imageUrl: 'https://res.cloudinary.com/demo/image/upload/medium.jpg', price: 75 },
    { _id: 'opt3', label: 'Large', price: 100 }
  ]
};

const wasModified6 = ensureMainImage(product6);
console.log('  Modified:', wasModified6);
console.log('  Main images after:', product6.imageUrls);
console.log('  Expected: ["https://res.cloudinary.com/demo/image/upload/medium.jpg"]');
console.log('  ✓ PASS:', wasModified6 && product6.imageUrls.length === 1 && product6.imageUrls[0] === 'https://res.cloudinary.com/demo/image/upload/medium.jpg');

console.log('\n' + '='.repeat(80));
console.log('✓ All test cases completed!\n');
