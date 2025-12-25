const { addToCartService, getCartService, removeCartItemService } = require('../../modules/cart/cart.service');

// Mock dependencies
jest.mock('../../modules/cart/cart.model');
jest.mock('../../modules/products/products.model');
jest.mock('../../config/redis', () => ({
  isRedisAvailable: jest.fn(() => false),
  safeSet: jest.fn(),
  safeGet: jest.fn(),
  getRedisClient: jest.fn(() => ({}))
}));
jest.mock('../../utils/distributedLock', () => ({
  withLock: jest.fn((key, fn) => fn())
}));
jest.mock('../../utils/transaction', () => ({
  withTransaction: jest.fn((fn) => fn(null)), // pass null for session
  withRetry: jest.fn((fn) => fn())
}));
jest.mock('../../utils/sanitizeMongoInput', () => jest.fn((input) => input));

const Cart = require('../../modules/cart/cart.model');
const Product = require('../../modules/products/products.model');

describe('Cart Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Cart methods
    Cart.findOne = jest.fn();
    Cart.findOneAndUpdate = jest.fn();
    Cart.findByIdAndUpdate = jest.fn();
    Cart.prototype.save = jest.fn();

    // Mock Product methods
    Product.findById = jest.fn();
  });

  describe('addToCartService', () => {
    it('should add item to new cart', async () => {
        const mockProduct = { _id: 'prod1', stock: 10 };
      const mockCart = { userId: 'user1', items: [{ productId: 'prod1', quantity: 1 }] };
      
      Product.findById.mockResolvedValue(mockProduct);
      Cart.findOne.mockResolvedValue(null); // No existing cart

      // Make the mocked Cart constructor return an instance that matches the saved cart
      Cart.mockImplementation(() => ({
        ...mockCart,
        save: jest.fn().mockResolvedValue(mockCart)
      }));

      const result = await addToCartService('user1', { productId: 'prod1', quantity: 1 });

      expect(result).toMatchObject(mockCart);
      expect(Cart).toHaveBeenCalledWith({ userId: 'user1', items: [{ productId: 'prod1', quantity: 1 }] });
    });

    it('should throw error when stock insufficient', async () => {
      Product.findById.mockResolvedValue(null);

      await expect(addToCartService('user1', { productId: 'invalid', quantity: 1 }))
        .rejects.toThrow('Product not found');
    });
  });

  describe('getCartService', () => {
    it('should return cart from database', async () => {
      const mockCart = { userId: 'user1', items: [] };
      const mockQuery = {
        lean: jest.fn().mockResolvedValue(mockCart)
      };
      Cart.findOne.mockReturnValue(mockQuery);

      const result = await getCartService('user1');

      expect(result).toEqual(mockCart);
    });

    it('should return empty cart when not found', async () => {
      const mockQuery = {
        lean: jest.fn().mockResolvedValue(null)
      };
      Cart.findOne.mockReturnValue(mockQuery);

      const result = await getCartService('user1');

      expect(result).toEqual({ userId: 'user1', items: [] });
    });
  });

  describe('removeCartItemService', () => {
    it('should remove item from cart', async () => {
      const mockCart = {
        userId: 'user1',
        items: [{ productId: { equals: jest.fn(() => true) }, quantity: 1 }],
        save: jest.fn().mockResolvedValue({ userId: 'user1', items: [] })
      };
      Cart.findOne.mockResolvedValue(mockCart);

      const result = await removeCartItemService('user1', 'prod1');

      expect(mockCart.save).toHaveBeenCalled();
      expect(result.items).toEqual([]);
    });

    it('should throw error when cart not found', async () => {
      Cart.findOne.mockResolvedValue(null);

      await expect(removeCartItemService('user1', 'prod1'))
        .rejects.toThrow('Cart not found');
    });
  });
});