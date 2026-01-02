const promClient = require('prom-client');

// Create a Registry which registers the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'doro-shop-cart'
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const cartOperationDuration = new promClient.Histogram({
  name: 'cart_operation_duration_seconds',
  help: 'Duration of cart operations in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const cartItemsTotal = new promClient.Gauge({
  name: 'cart_items_total',
  help: 'Total number of items in all carts',
  labelNames: ['user_id']
});

const stockValidationTotal = new promClient.Counter({
  name: 'stock_validation_total',
  help: 'Total number of stock validations',
  labelNames: ['result']
});

const cacheHitsTotal = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits and misses',
  labelNames: ['type']
});

// Register metrics
register.registerMetric(cartOperationDuration);
register.registerMetric(cartItemsTotal);
register.registerMetric(stockValidationTotal);
register.registerMetric(cacheHitsTotal);

// Middleware to measure operation duration
const measureCartOperation = (operation) => {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      cartOperationDuration
        .labels(operation, res.statusCode.toString())
        .observe(duration);
    });
    next();
  };
};

// Functions to update metrics
const updateCartItems = (userId, itemCount) => {
  cartItemsTotal.labels(userId).set(itemCount);
};

const incrementStockValidation = (result) => {
  stockValidationTotal.labels(result).inc();
};

const incrementCacheHit = (type) => {
  cacheHitsTotal.labels(type).inc();
};

module.exports = {
  register,
  measureCartOperation,
  updateCartItems,
  incrementStockValidation,
  incrementCacheHit
};