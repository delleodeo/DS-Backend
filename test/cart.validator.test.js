const {
  validateAddToCart,
  validateUpdateCartItem,
  validateRemoveCartItem
} = require('../validators/cart.validator');

describe('Cart Validator Tests', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = { body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  describe('validateAddToCart', () => {
    test('should pass valid add to cart request', () => {
      mockReq.body = {
        item: {
          productId: '507f1f77bcf86cd799439011',
          quantity: 2
        }
      };

      validateAddToCart(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should pass with optionId', () => {
      mockReq.body = {
        item: {
          productId: '507f1f77bcf86cd799439011',
          optionId: '507f1f77bcf86cd799439012',
          quantity: 1
        }
      };

      validateAddToCart(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject invalid productId', () => {
      mockReq.body = {
        item: {
          productId: 'invalid-id',
          quantity: 2
        }
      };

      validateAddToCart(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'item.productId',
            message: 'Invalid productId format'
          })
        ])
      });
    });

    test('should reject quantity below minimum', () => {
      mockReq.body = {
        item: {
          productId: '507f1f77bcf86cd799439011',
          quantity: 0
        }
      };

      validateAddToCart(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'item.quantity',
            message: 'Quantity must be at least 1'
          })
        ])
      });
    });

    test('should reject quantity above maximum', () => {
      mockReq.body = {
        item: {
          productId: '507f1f77bcf86cd799439011',
          quantity: 100
        }
      };

      validateAddToCart(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'item.quantity',
            message: 'Quantity cannot exceed 50'
          })
        ])
      });
    });

    test('should reject missing required fields', () => {
      mockReq.body = {};

      validateAddToCart(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Validation failed',
        errors: expect.any(Array)
      });
    });
  });

  describe('validateUpdateCartItem', () => {
    test('should pass valid update request', () => {
      mockReq.body = {
        item: {
          productId: '507f1f77bcf86cd799439011',
          quantity: 5
        }
      };

      validateUpdateCartItem(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should allow negative quantity changes', () => {
      mockReq.body = {
        item: {
          productId: '507f1f77bcf86cd799439011',
          quantity: -2
        }
      };

      validateUpdateCartItem(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject invalid productId', () => {
      mockReq.body = {
        item: {
          productId: 'invalid',
          quantity: 1
        }
      };

      validateUpdateCartItem(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateRemoveCartItem', () => {
    test('should pass valid remove request', () => {
      mockReq.body = {
        productId: '507f1f77bcf86cd799439011'
      };

      validateRemoveCartItem(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should pass with optionId', () => {
      mockReq.body = {
        productId: '507f1f77bcf86cd799439011',
        optionId: '507f1f77bcf86cd799439012'
      };

      validateRemoveCartItem(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject invalid productId', () => {
      mockReq.body = {
        productId: 'invalid'
      };

      validateRemoveCartItem(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});