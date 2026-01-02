const { addToCartService } = require('../modules/cart/cart.service');
const Cart = require('../modules/cart/cart.model');
const ProductStockService = require('../modules/products/product-utils/ProductStockService');

jest.mock('../modules/cart/cart.model');

describe('addToCartService concurrency', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('prevents oversell when two concurrent adds exceed stock', async () => {
    // Product has stock 1
    const STOCK = 1;
    let reserved = 0;

    // Mock reserveStock to act atomically (success for first, fail for second)
    // Simulate atomic reserveStock by queuing per-resource operations to avoid TOCTOU in test
    const resourceQueues = {};

    // Mock Product availability to avoid DB access
    const Product = require('../modules/products/products.model');
    Product.findOne = jest.fn().mockResolvedValue({ stock: STOCK, option: [] });
    Product.findById = jest.fn().mockResolvedValue({ stock: STOCK, option: [] });

    jest.spyOn(ProductStockService.prototype, 'reserveStock').mockImplementation(async (productId, optionId, qty) => {
      const key = `${productId}:${optionId || 'main'}`;
      const prev = resourceQueues[key] || Promise.resolve();
      resourceQueues[key] = prev.then(async () => {
        if (reserved + qty > STOCK) {
          throw new Error('Insufficient stock for option');
        }
        reserved += qty;
        return {};
      });
      return resourceQueues[key];
    });

    // Ensure cart operations are serialized using the same resource key (simulate Redis lock)
    const lockQueues = {};
    const distLock = require('../utils/distributedLock');
    jest.spyOn(distLock, 'withLock').mockImplementation(async (resource, operation) => {
      const prev = lockQueues[resource] || Promise.resolve();
      lockQueues[resource] = prev.then(() => operation());
      return lockQueues[resource];
    });

    // Cart.findOne returns an empty cart (same snapshot for callers)
    Cart.findOne.mockResolvedValue({ items: [], save: jest.fn().mockResolvedValue(true) });

    const productId = '507f1f77bcf86cd799439011';
    const optionId = '507f1f77bcf86cd799439012';

    const p1 = addToCartService('user1', { productId, optionId, quantity: 1 });
    const p2 = addToCartService('user1', { productId, optionId, quantity: 1 });

    const results = await Promise.allSettled([p1, p2]);
    console.log('concurrency results:', results);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    console.log('reserved:', reserved);

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason.message.toLowerCase()).toMatch(/insufficient/i);
  });
});