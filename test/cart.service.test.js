const {
  addToCartService,
  getCartService,
  updateCartItemService,
  removeCartItemService,
  clearCartService,
  invalidateAllCartCaches
} = require('../modules/cart/cart.service');
const Cart = require('../modules/cart/cart.model');
const Product = require('../modules/products/products.model');
const mongoose = require('mongoose');

// Mock dependencies
jest.mock('../modules/cart/cart.model');
jest.mock('../modules/products/products.model');
jest.mock('../utils/logger');
jest.mock('../config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    ttl: jest.fn()
  }))
}));
jest.mock('../modules/products/product-utils/cacheUtils.js', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    deletePattern: jest.fn()
  }));
});

describe('Cart Service Tests', () => {
  let mockCacheUtils;
  let mockCart;
  let mockProduct;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mock cache instance
    const CacheUtilsMock = require('../modules/products/product-utils/cacheUtils.js');
    mockCacheUtils = CacheUtilsMock.mock.results[0]?.value || {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      deletePattern: jest.fn()
    };

    // Setup mock models
    mockCart = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      items: [],
      save: jest.fn(),
      updatedAt: new Date()
    };

    mockProduct = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test Product',
      stock: 10,
      option: []
    };

    Cart.findOne = jest.fn();
    Cart.findOneAndUpdate = jest.fn();
    Product.findById = jest.fn();
  });

  describe('addToCartService', () => {
    const userId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const item = {
      productId: productId,
      optionId: null,
      quantity: 2
    };

    test('should add new item to empty cart', async () => {
      Cart.findOne.mockResolvedValue(null);
      Cart.mockImplementation(() => mockCart);
      Product.findById.mockResolvedValue(mockProduct);
      mockCacheUtils.set.mockResolvedValue();

      const result = await addToCartService(userId, item);

      expect(Cart.findOne).toHaveBeenCalledWith({ userId });
      expect(Product.findById).toHaveBeenCalledWith(item.productId);
      expect(mockCart.save).toHaveBeenCalled();
      expect(mockCacheUtils.set).toHaveBeenCalled();
      expect(result).toBe(mockCart);
    });

    test('should add quantity to existing item', async () => {
      const existingCart = {
        ...mockCart,
        items: [{ productId: item.productId, optionId: item.optionId, quantity: 1 }]
      };
      Cart.findOne.mockResolvedValue(existingCart);
      Product.findById.mockResolvedValue(mockProduct);
      mockCacheUtils.set.mockResolvedValue();

      const result = await addToCartService(userId, item);

      expect(existingCart.items[0].quantity).toBe(3);
      expect(mockCacheUtils.set).toHaveBeenCalled();
    });

    test('should throw error when stock is insufficient', async () => {
      const itemWithHighQuantity = { ...item, quantity: 20 };
      Product.findById.mockResolvedValue(mockProduct);

      await expect(addToCartService(userId, itemWithHighQuantity))
        .rejects.toThrow('Only 10 items available in stock');
    });

    test('should throw error when product not found', async () => {
      Product.findById.mockResolvedValue(null);

      await expect(addToCartService(userId, item))
        .rejects.toThrow('Product not found');
    });
  });

  describe('getCartService', () => {
    const userId = new mongoose.Types.ObjectId();

    test('should return cached cart', async () => {
      const cachedCart = { userId, items: [] };
      mockCacheUtils.get.mockResolvedValue(cachedCart);

      const result = await getCartService(userId);

      expect(mockCacheUtils.get).toHaveBeenCalledWith(`cart:${userId}`);
      expect(result).toBe(cachedCart);
    });

    test('should fetch from database and cache when not cached', async () => {
      const dbCart = { userId, items: [] };
      mockCacheUtils.get.mockResolvedValue(null);
      Cart.findOne.mockResolvedValue(dbCart);
      mockCacheUtils.set.mockResolvedValue();

      const result = await getCartService(userId);

      expect(Cart.findOne).toHaveBeenCalledWith({ userId });
      expect(mockCacheUtils.set).toHaveBeenCalledWith(`cart:${userId}`, dbCart);
      expect(result).toBe(dbCart);
    });

    test('should return empty cart when no cart exists', async () => {
      mockCacheUtils.get.mockResolvedValue(null);
      Cart.findOne.mockResolvedValue(null);

      const result = await getCartService(userId);

      expect(result).toEqual({ userId, items: [] });
    });
  });

  describe('updateCartItemService', () => {
    const userId = new mongoose.Types.ObjectId();
    const item = {
      productId: new mongoose.Types.ObjectId(),
      optionId: null,
      quantity: 3
    };

    test('should update existing item quantity', async () => {
      const cart = {
        ...mockCart,
        items: [{ productId: item.productId, optionId: item.optionId, quantity: 1 }]
      };
      Cart.findOne.mockResolvedValue(cart);
      Product.findById.mockResolvedValue(mockProduct);
      mockCacheUtils.set.mockResolvedValue();

      const result = await updateCartItemService(userId, item);

      expect(cart.items[0].quantity).toBe(4);
      expect(mockCacheUtils.set).toHaveBeenCalled();
    });

    test('should add new item when not exists', async () => {
      const cart = { ...mockCart, items: [] };
      Cart.findOne.mockResolvedValue(cart);
      Product.findById.mockResolvedValue(mockProduct);
      mockCacheUtils.set.mockResolvedValue();

      const result = await updateCartItemService(userId, item);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(3);
    });

    test('should throw error when cart not found', async () => {
      Cart.findOne.mockResolvedValue(null);

      await expect(updateCartItemService(userId, item))
        .rejects.toThrow('Cart not found');
    });

    test('should throw error when quantity becomes negative', async () => {
      const cart = {
        ...mockCart,
        items: [{ productId: item.productId, optionId: item.optionId, quantity: 2 }]
      };
      const negativeItem = { ...item, quantity: -5 };
      Cart.findOne.mockResolvedValue(cart);

      await expect(updateCartItemService(userId, negativeItem))
        .rejects.toThrow('Quantity cannot be less than 1');
    });
  });

  describe('removeCartItemService', () => {
    const userId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const optionId = new mongoose.Types.ObjectId();

    test('should remove item from cart', async () => {
      const cart = {
        ...mockCart,
        items: [
          { productId, optionId, quantity: 2 },
          { productId: new mongoose.Types.ObjectId(), quantity: 1 }
        ]
      };
      Cart.findOne.mockResolvedValue(cart);
      mockCacheUtils.delete.mockResolvedValue();

      const result = await removeCartItemService(userId, productId, optionId);

      expect(cart.items).toHaveLength(1);
      expect(mockCacheUtils.delete).toHaveBeenCalledWith(`cart:${userId}`);
    });

    test('should throw error when cart not found', async () => {
      Cart.findOne.mockResolvedValue(null);

      await expect(removeCartItemService(userId, productId, optionId))
        .rejects.toThrow('Cart not found');
    });
  });

  describe('clearCartService', () => {
    const userId = new mongoose.Types.ObjectId();

    test('should clear all items from cart', async () => {
      const cart = { ...mockCart, items: [{ productId: new mongoose.Types.ObjectId(), quantity: 2 }] };
      Cart.findOneAndUpdate.mockResolvedValue(cart);
      mockCacheUtils.set.mockResolvedValue();

      const result = await clearCartService(userId);

      expect(Cart.findOneAndUpdate).toHaveBeenCalledWith(
        { userId },
        { items: [], updatedAt: expect.any(Date) },
        { new: true }
      );
      expect(mockCacheUtils.set).toHaveBeenCalledWith(`cart:${userId}`, cart);
    });
  });

  describe('invalidateAllCartCaches', () => {
    test('should delete all cart cache patterns', async () => {
      mockCacheUtils.deletePattern.mockResolvedValue();

      await invalidateAllCartCaches();

      expect(mockCacheUtils.deletePattern).toHaveBeenCalledWith('cart:*');
    });

    test('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCacheUtils.deletePattern.mockRejectedValue(new Error('Cache error'));

      await invalidateAllCartCaches();

      expect(consoleSpy).toHaveBeenCalledWith('Error invalidating cart caches:', expect.any(Error));
    });
  });
});