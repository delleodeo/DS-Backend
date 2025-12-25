const cartController = require('../modules/cart/cart.controller');
const cartService = require('../modules/cart/cart.service');

// Mock the service
jest.mock('../modules/cart/cart.service');

describe('Cart Controller Tests', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: { id: 'user123' },
      body: {}
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('addToCart', () => {
    test('should add item to cart successfully', async () => {
      const mockCart = { id: 'cart123', items: [] };
      mockReq.body = { item: { productId: 'prod123', quantity: 2 } };
      cartService.addToCartService.mockResolvedValue(mockCart);

      await cartController.addToCart(mockReq, mockRes);

      expect(cartService.addToCartService).toHaveBeenCalledWith('user123', mockReq.body.item);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: "Item added to cart successfully"
      });
    });

    test('should handle service errors', async () => {
      const error = new Error('Service error');
      cartService.addToCartService.mockRejectedValue(error);

      await cartController.addToCart(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('getCart', () => {
    test('should get cart successfully', async () => {
      const mockCart = { id: 'cart123', items: [] };
      cartService.getCartService.mockResolvedValue(mockCart);

      await cartController.getCart(mockReq, mockRes);

      expect(cartService.getCartService).toHaveBeenCalledWith('user123');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: "Cart retrieved successfully"
      });
    });

    test('should handle service errors', async () => {
      const error = new Error('Service error');
      cartService.getCartService.mockRejectedValue(error);

      await cartController.getCart(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('updateCartItem', () => {
    test('should update cart item successfully', async () => {
      const mockCart = { id: 'cart123', items: [] };
      mockReq.body = { item: { productId: 'prod123', quantity: 3 } };
      cartService.updateCartItemService.mockResolvedValue(mockCart);

      await cartController.updateCartItem(mockReq, mockRes);

      expect(cartService.updateCartItemService).toHaveBeenCalledWith('user123', mockReq.body.item);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: "Cart item updated successfully"
      });
    });

    test('should handle service errors', async () => {
      const error = new Error('Service error');
      cartService.updateCartItemService.mockRejectedValue(error);

      await cartController.updateCartItem(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('removeCartItem', () => {
    test('should remove cart item successfully', async () => {
      const mockCart = { id: 'cart123', items: [] };
      mockReq.body = { productId: 'prod123', optionId: 'opt123' };
      cartService.removeCartItemService.mockResolvedValue(mockCart);

      await cartController.removeCartItem(mockReq, mockRes);

      expect(cartService.removeCartItemService).toHaveBeenCalledWith('user123', 'prod123', 'opt123');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: "Item removed from cart successfully"
      });
    });

    test('should handle service errors', async () => {
      const error = new Error('Service error');
      cartService.removeCartItemService.mockRejectedValue(error);

      await cartController.removeCartItem(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('clearCart', () => {
    test('should clear cart successfully', async () => {
      const mockCart = { id: 'cart123', items: [] };
      cartService.clearCartService.mockResolvedValue(mockCart);

      await cartController.clearCart(mockReq, mockRes);

      expect(cartService.clearCartService).toHaveBeenCalledWith('user123');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCart,
        message: "Cart cleared successfully"
      });
    });

    test('should handle service errors', async () => {
      const error = new Error('Service error');
      cartService.clearCartService.mockRejectedValue(error);

      await cartController.clearCart(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Object));
    });
  });
});