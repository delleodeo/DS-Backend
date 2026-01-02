const {
  addToCartService,
  getCartService,
  updateCartItemService,
  removeCartItemService,
  clearCartService,
  invalidateAllCartCaches
} = require('../cart.service');

// Mock dependencies
jest.mock('../cart.model');
jest.mock('../products/products.model');
jest.mock('../vendors/vendors.model.js');
jest.mock('../../utils/logger');
jest.mock('../../utils/monitoringService');
jest.mock('../../utils/transaction');
jest.mock('../../utils/errorHandler');
jest.mock('../../utils/sanitizeMongoInput');
jest.mock('../../config/redis');
jest.mock('../products/product-utils/cacheUtils.js');

const Cart = require('../cart.model');
const Product = require('../products/products.model');
const logger = require('../../utils/logger');
const monitoring = require('../../utils/monitoringService');
const { withTransaction } = require('../../utils/transaction');
const { AppError, ERROR_TYPES, HTTP_STATUS } = require('../../utils/errorHandler');
const sanitizeMongoInput = require('../../utils/sanitizeMongoInput');
const CacheUtils = require('../products/product-utils/cacheUtils.js');

describe('Cart Service', () => {
  let mockCache;
  let mockRedisClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      deletePattern: jest.fn()
    };
    CacheUtils.mockImplementation(() => mockCache);

    mockRedisClient = {
      isOpen: true,
      get: jest.fn(),
      setEx: jest.fn()
    };

    // Mock mongoose Types
    require('mongoose').Types.ObjectId.isValid = jest.fn().mockReturnValue(true);

    // Mock AppError
    AppError.mockImplementation((message, type, status) => {
      const error = new Error(message);
      error.type = type;
      error.status = status;
      return error;
    });

    // Mock sanitizeMongoInput
    sanitizeMongoInput.mockImplementation((input) => input);

    // Mock withTransaction
    withTransaction.mockImplementation((fn) => fn({}));
  });

  describe('validateItem', () => {
    // Note: validateItem is internal, but we can test it indirectly through service functions
    // or extract it if needed. For now, test through addToCartService
  });

  describe('validateObjectId', () => {
    // Internal function, tested indirectly
  });

  describe('getAvailableStock', () => {
    // getAvailableStock is internal, tested indirectly through addToCartService
  });

  describe('addToCartService', () => {
    const userId = '507f1f77bcf86cd799439011';
    const validItem = {
      productId: '507f1f77bcf86cd799439012',
      quantity: 2
    };

    it('should add item to new cart successfully', async () => {
      const mockCart = {
        userId,
        items: [validItem],
        save: jest.fn().mockResolvedValue({
          userId,
          items: [validItem]
        })
      };

      Cart.findOne.mockResolvedValue(null);
      Cart.mockImplementation(() => mockCart);
      Product.findById.mockResolvedValue({ stock: 10 });

      const result = await addToCartService(userId, validItem);

      expect(result).toEqual({ userId, items: [validItem] });
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should add item to existing cart', async () => {
      const existingCart = {
        userId,
        items: [{ productId: 'different', quantity: 1 }],
        save: jest.fn().mockResolvedValue({
          userId,
          items: [{ productId: 'different', quantity: 1 }, validItem]
        })
      };

      Cart.findOne.mockResolvedValue(existingCart);
      Product.findById.mockResolvedValue({ stock: 10 });

      const result = await addToCartService(userId, validItem);

      expect(existingCart.items).toContain(validItem);
    });

    it('should update quantity for existing item', async () => {
      const existingItem = { productId: validItem.productId, quantity: 1 };
      const existingCart = {
        userId,
        items: [existingItem],
        save: jest.fn().mockResolvedValue({
          userId,
          items: [{ ...existingItem, quantity: 3 }]
        })
      };

      Cart.findOne.mockResolvedValue(existingCart);
      Product.findById.mockResolvedValue({ stock: 10 });

      const result = await addToCartService(userId, validItem);

      expect(existingItem.quantity).toBe(3);
    });

    it('should throw error for invalid userId', async () => {
      require('mongoose').Types.ObjectId.isValid.mockReturnValue(false);

      await expect(addToCartService('invalid', validItem))
        .rejects.toThrow('Invalid userId format');
    });

    it('should throw error for invalid item', async () => {
      await expect(addToCartService(userId, {}))
        .rejects.toThrow('Invalid item data');
    });

    it('should throw error for invalid productId', async () => {
      require('mongoose').Types.ObjectId.isValid
        .mockReturnValueOnce(true) // userId valid
        .mockReturnValueOnce(false); // productId invalid

      await expect(addToCartService(userId, { productId: 'invalid', quantity: 1 }))
        .rejects.toThrow('Invalid productId');
    });

    it('should throw error for invalid quantity', async () => {
      await expect(addToCartService(userId, { productId: validItem.productId, quantity: 0 }))
        .rejects.toThrow('Quantity must be a number between 1 and 50');
    });

    it('should throw error when insufficient stock', async () => {
      Cart.findOne.mockResolvedValue(null);
      Product.findById.mockResolvedValue({ stock: 1 });

      await expect(addToCartService(userId, { productId: validItem.productId, quantity: 5 }))
        .rejects.toThrow('Only 1 items available in stock');
    });
  });

  describe('getCartService', () => {
    const userId = '507f1f77bcf86cd799439011';

    it('should return cached cart if available', async () => {
      const cachedCart = { userId, items: [] };
      mockCache.get.mockResolvedValue(cachedCart);

      const result = await getCartService(userId);

      expect(result).toBe(cachedCart);
      expect(Cart.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from database if not cached', async () => {
      const dbCart = {
        userId,
        items: [{ productId: 'test', quantity: 1 }],
        toObject: jest.fn().mockReturnValue({ userId, items: [{ productId: 'test', quantity: 1 }] })
      };

      mockCache.get.mockResolvedValue(null);
      Cart.findOne.mockResolvedValue(dbCart);

      const result = await getCartService(userId);

      expect(Cart.findOne).toHaveBeenCalledWith({ userId });
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return empty cart for non-existent cart', async () => {
      mockCache.get.mockResolvedValue(null);
      Cart.findOne.mockResolvedValue(null);

      const result = await getCartService(userId);

      expect(result).toEqual({ userId, items: [] });
    });

    it('should throw error for invalid userId', async () => {
      require('mongoose').Types.ObjectId.isValid.mockReturnValue(false);

      await expect(getCartService('invalid'))
        .rejects.toThrow('Invalid userId format');
    });
  });

  describe('updateCartItemService', () => {
    const userId = '507f1f77bcf86cd799439011';
    const validItem = {
      productId: '507f1f77bcf86cd799439012',
      quantity: 3
    };

    it('should update existing item quantity', async () => {
      const existingCart = {
        userId,
        items: [{ productId: validItem.productId, quantity: 1 }],
        save: jest.fn().mockResolvedValue({
          userId,
          items: [{ productId: validItem.productId, quantity: 3 }]
        })
      };

      Cart.findOne.mockResolvedValue(existingCart);
      Product.findById.mockResolvedValue({ stock: 10 });

      const result = await updateCartItemService(userId, validItem);

      expect(existingCart.items[0].quantity).toBe(3);
    });

    it('should add new item if not exists', async () => {
      const existingCart = {
        userId,
        items: [],
        save: jest.fn().mockResolvedValue({
          userId,
          items: [validItem]
        })
      };

      Cart.findOne.mockResolvedValue(existingCart);
      Product.findById.mockResolvedValue({ stock: 10 });

      const result = await updateCartItemService(userId, validItem);

      expect(existingCart.items).toContain(validItem);
    });

    it('should throw error when cart not found', async () => {
      Cart.findOne.mockResolvedValue(null);

      await expect(updateCartItemService(userId, validItem))
        .rejects.toThrow('Cart not found');
    });

    it('should throw error when insufficient stock', async () => {
      const existingCart = {
        userId,
        items: [{ productId: validItem.productId, quantity: 1 }]
      };

      Cart.findOne.mockResolvedValue(existingCart);
      Product.findById.mockResolvedValue({ stock: 2 });

      await expect(updateCartItemService(userId, { productId: validItem.productId, quantity: 5 }))
        .rejects.toThrow('Only 2 items available in stock');
    });
  });

  describe('removeCartItemService', () => {
    const userId = '507f1f77bcf86cd799439011';
    const productId = '507f1f77bcf86cd799439012';

    it('should remove item from cart', async () => {
      const mockCart = {
        userId,
        items: [{ productId, quantity: 1 }],
        toObject: jest.fn().mockReturnValue({ userId, items: [] })
      };

      Cart.findOneAndUpdate.mockResolvedValue(mockCart);

      const result = await removeCartItemService(userId, productId);

      expect(Cart.findOneAndUpdate).toHaveBeenCalledWith(
        { userId },
        expect.objectContaining({
          $pull: { items: { productId } },
          $set: { updatedAt: expect.any(Date) }
        }),
        { new: true }
      );
    });

    it('should throw error when cart not found', async () => {
      Cart.findOneAndUpdate.mockResolvedValue(null);

      await expect(removeCartItemService(userId, productId))
        .rejects.toThrow('Cart not found');
    });
  });

  describe('clearCartService', () => {
    const userId = '507f1f77bcf86cd799439011';

    it('should clear all items from cart', async () => {
      const mockCart = { userId, items: [] };

      Cart.findOneAndUpdate.mockResolvedValue(mockCart);

      const result = await clearCartService(userId);

      expect(Cart.findOneAndUpdate).toHaveBeenCalledWith(
        { userId },
        { items: [], updatedAt: expect.any(Date) },
        { new: true }
      );
    });
  });

  describe('invalidateAllCartCaches', () => {
    it('should delete cart cache pattern', async () => {
      await invalidateAllCartCaches();

      expect(mockCache.deletePattern).toHaveBeenCalledWith('cart:*');
    });

    it('should not throw error on cache failure', async () => {
      mockCache.deletePattern.mockRejectedValue(new Error('Cache error'));

      await expect(invalidateAllCartCaches()).resolves.not.toThrow();
    });
  });
});