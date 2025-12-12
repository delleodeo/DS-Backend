/**
 * Test script to verify extractPublicIdFromUrl function
 * Run with: node test-cloudinary-url-extraction.js
 */

const { extractPublicIdFromUrl } = require('./modules/upload/upload.service.js');

// Test cases with various Cloudinary URL formats
const testCases = [
  {
    url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    expected: 'sample',
    description: 'Simple URL without version'
  },
  {
    url: 'https://res.cloudinary.com/demo/image/upload/v1234567890/sample.jpg',
    expected: 'sample',
    description: 'URL with version number'
  },
  {
    url: 'https://res.cloudinary.com/demo/image/upload/products/sample.jpg',
    expected: 'products/sample',
    description: 'URL with folder path'
  },
  {
    url: 'https://res.cloudinary.com/demo/image/upload/v1234567890/products/temp/image.jpg',
    expected: 'products/temp/image',
    description: 'URL with version and nested folders'
  },
  {
    url: 'https://res.cloudinary.com/demo/image/upload/w_500,h_300,c_fill/sample.jpg',
    expected: 'sample',
    description: 'URL with transformation parameters (comma-separated)'
  },
  {
    url: 'https://res.cloudinary.com/demo/image/upload/w_500/h_300/sample.jpg',
    expected: 'sample',
    description: 'URL with transformation parameters (slash-separated)'
  },
  {
    url: 'https://res.cloudinary.com/demo/image/upload/v1234567890/w_500,h_300/products/sample.jpg',
    expected: 'products/sample',
    description: 'URL with version, transformations, and folders'
  },
  {
    url: 'https://res.cloudinary.com/demo/image/upload/products/my-product-image_abc123.png',
    expected: 'products/my-product-image_abc123',
    description: 'URL with complex filename'
  },
  {
    url: null,
    expected: null,
    description: 'Null URL'
  },
  {
    url: '',
    expected: null,
    description: 'Empty string'
  },
  {
    url: 'https://example.com/not-a-cloudinary-url.jpg',
    expected: null,
    description: 'Non-Cloudinary URL'
  }
];

console.log('Testing extractPublicIdFromUrl function...\n');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = extractPublicIdFromUrl(testCase.url);
  const success = result === testCase.expected;
  
  if (success) {
    passed++;
    console.log(`✓ Test ${index + 1}: PASSED - ${testCase.description}`);
  } else {
    failed++;
    console.log(`✗ Test ${index + 1}: FAILED - ${testCase.description}`);
    console.log(`  URL: ${testCase.url}`);
    console.log(`  Expected: ${testCase.expected}`);
    console.log(`  Got: ${result}`);
  }
});

console.log('='.repeat(80));
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n✗ ${failed} test(s) failed`);
  process.exit(1);
}
