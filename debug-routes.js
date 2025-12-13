/**
 * Route debugging utility
 * Run with: node debug-routes.js
 */

const express = require('express');
const app = express();

// Import route modules
const routes = require('./routes');

// Create a simple middleware to log all routes
function logRoutes(router, prefix = '') {
  const routes = [];
  
  router.stack.forEach(function(middleware) {
    if (middleware.route) {
      // Route middleware
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      routes.push(`${methods.padEnd(10)} ${prefix}${middleware.route.path}`);
    } else if (middleware.name === 'router' && middleware.regexp) {
      // Router middleware
      const routerPath = extractRouterPath(middleware.regexp);
      const subRoutes = logRoutes(middleware.handle, `${prefix}${routerPath}`);
      routes.push(...subRoutes);
    }
  });
  
  return routes;
}

function extractRouterPath(regexp) {
  const source = regexp.source;
  
  // Try to extract path from regexp
  if (source.includes('/products')) {
    return '/products';
  } else if (source.includes('/cart')) {
    return '/cart';
  } else if (source.includes('/order')) {
    return '/order';
  } else if (source.includes('/user')) {
    return '/user';
  } else if (source.includes('/admin')) {
    return '/admin';
  } else if (source.includes('/vendor')) {
    return '/vendor';
  } else if (source.includes('/upload')) {
    return '/upload';
  } else if (source.includes('/reviews')) {
    return '/reviews';
  } else if (source.includes('/messages')) {
    return '/messages';
  }
  
  return '';
}

console.log('🔍 DoroShop API Routes Debug');
console.log('=' .repeat(60));

try {
  const allRoutes = logRoutes(routes, '/v1/api');
  
  console.log(`Found ${allRoutes.length} routes:\n`);
  
  allRoutes.forEach(route => {
    if (route.includes('promotion')) {
      console.log(`🎯 ${route}`); // Highlight promotion routes
    } else {
      console.log(`   ${route}`);
    }
  });
  
  console.log('\n📍 Promotion Routes Summary:');
  const promotionRoutes = allRoutes.filter(route => route.includes('promotion'));
  
  if (promotionRoutes.length === 0) {
    console.log('❌ No promotion routes found!');
    console.log('   Check if promotion.routes.js is properly imported and mounted.');
  } else {
    promotionRoutes.forEach(route => {
      console.log(`✅ ${route}`);
    });
  }
  
  console.log('\n🧪 Test these URLs:');
  console.log('   POST   http://localhost:3001/v1/api/products/:productId/promotion');
  console.log('   POST   http://localhost:3001/v1/api/products/:productId/options/:optionId/promotion');
  console.log('   DELETE http://localhost:3001/v1/api/products/:productId/promotion');
  console.log('   DELETE http://localhost:3001/v1/api/products/:productId/options/:optionId/promotion');
  
} catch (error) {
  console.error('❌ Error analyzing routes:', error.message);
  console.error('Make sure all route files exist and are properly exported.');
}

console.log('\n💡 Tips for debugging 404 errors:');
console.log('   1. Ensure server is running on port 3001');
console.log('   2. Check network tab in browser dev tools');
console.log('   3. Verify productId and optionId are valid MongoDB ObjectIds');
console.log('   4. Test with curl or Postman first');
console.log('   5. Check server logs for any middleware errors');