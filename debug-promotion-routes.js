/**
 * Debug specific promotion routes
 * Test script to verify promotion routes work correctly
 */

const express = require('express');

// Create test app
const app = express();
app.use(express.json());

console.log('🔗 Testing promotion routes...');

// Import the promotion routes
const promotionRoutes = require('./modules/products/promotion.routes');

// Mount routes with debugging middleware
app.use('/api/products', (req, res, next) => {
  console.log(`📋 [Route Debug] ${req.method} ${req.originalUrl}`);
  console.log(`📋 [Params] ${JSON.stringify(req.params)}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📋 [Body] ${JSON.stringify(req.body)}`);
  }
  next();
}, promotionRoutes);
    if (layer.route) {
      // This is a route
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      routes.push(`${methods} ${basePath}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle.stack) {
      // This is a router, dive into it
      const path = layer.regexp.source
        .replace('\\/?', '')
        .replace('(?=\\/|$)', '$')
        .replace(/\\\//g, '/')
        .replace('$', '')
        .replace('^', '');
      
      layer.handle.stack.forEach(nestedLayer => {
        extractRoutes(nestedLayer, basePath + path);
      });
    }
  }
  
  if (app._router && app._router.stack) {
    app._router.stack.forEach(layer => {
      extractRoutes(layer);
    });
  }
  
  return routes;
}

// List all registered routes
const routes = listRoutes(testApp);
console.log("\n=== REGISTERED ROUTES ===");
routes.forEach(route => {
  console.log(route);
});

console.log("\n=== EXPECTED vs ACTUAL ===");
console.log("Frontend URL: POST /api/products/{productId}/option/{optionId}/promotion");
console.log("Expected Route: POST /products/{productId}/options/{optionId}/promotion");
console.log("\nDifference: Frontend uses 'option' (singular) but backend expects 'options' (plural)");

module.exports = { listRoutes };