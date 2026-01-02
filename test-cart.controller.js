const {
  addToCart,
  getCart,
  updateCartItem,
  removeCartItem,
  clearCart
} = require('../cart.controller');

// Mock the service
jest.mock('../cart.service');

const {
  addToCartService,
  getCartService,
  updateCartItemService,
  removeCartItemService,
  clearCartService
} = require('../cart.service');

describe('Cart Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: { id: '507f1f77bcf86cd799439011' },
      body: {}
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('addToCart', () => {
    it('should add item to cart and return success response', async () => {
      const mockCart = { userId: mockReq.user.id, items: [] };
      const item = { productId: '507f1f77bcf86cd799439012', quantity: 1 };

      mockReq.body = { item };
      addToCartService.mockResolvedValue(mockCart);

      await addToCart(mockReq, mockRes);

      expect(addToCartService).toHaveBeenCalledWith(mockReq.user.id, item);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: 'Item added to cart successfully'
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockReq.body = { item: { productId: 'test', quantity: 1 } };
      addToCartService.mockRejectedValue(error);

      await addToCart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: error.message });
    });
  });

  describe('getCart', () => {
    it('should get cart and return success response', async () => {
      const mockCart = { userId: mockReq.user.id, items: [] };
      getCartService.mockResolvedValue(mockCart);

      await getCart(mockReq, mockRes);

      expect(getCartService).toHaveBeenCalledWith(mockReq.user.id);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: 'Cart retrieved successfully'
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      getCartService.mockRejectedValue(error);

      await getCart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: error.message });
    });
  });

  describe('updateCartItem', () => {
    it('should update cart item and return success response', async () => {
      const mockCart = { userId: mockReq.user.id, items: [] };
      const item = { productId: '507f1f77bcf86cd799439012', quantity: 2 };

      mockReq.body = { item };
      updateCartItemService.mockResolvedValue(mockCart);

      await updateCartItem(mockReq, mockRes);

      expect(updateCartItemService).toHaveBeenCalledWith(mockReq.user.id, item);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: 'Cart item updated successfully'
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockReq.body = { item: { productId: 'test', quantity: 1 } };
      updateCartItemService.mockRejectedValue(error);

      await updateCartItem(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: error.message });
    });
  });

  describe('removeCartItem', () => {
    it('should remove cart item and return success response', async () => {
      const mockCart = { userId: mockReq.user.id, items: [] };
      const productId = '507f1f77bcf86cd799439012';
      const optionId = '507f1f77bcf86cd799439013';

      mockReq.body = { productId, optionId };
      removeCartItemService.mockResolvedValue(mockCart);

      await removeCartItem(mockReq, mockRes);

      expect(removeCartItemService).toHaveBeenCalledWith(mockReq.user.id, productId, optionId);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: 'Item removed from cart successfully'
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockReq.body = { productId: 'test' };
      removeCartItemService.mockRejectedValue(error);

      await removeCartItem(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: error.message });
    });
  });

  describe('clearCart', () => {
    it('should clear cart and return success response', async () => {
      const mockCart = { userId: mockReq.user.id, items: [] };
      clearCartService.mockResolvedValue(mockCart);

      await clearCart(mockReq, mockRes);

      expect(clearCartService).toHaveBeenCalledWith(mockReq.user.id);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: 'Cart cleared successfully'
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      clearCartService.mockRejectedValue(error);

      await clearCart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: error.message });
    });
  });
});