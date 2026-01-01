const { addToCartService, updateCartItemService } = require('../modules/cart/cart.service');
const Cart = require('../modules/cart/cart.model');
const Product = require('../modules/products/products.model');
const { ValidationError } = require('../utils/validation');

jest.mock('../modules/cart/cart.model');
jest.mock('../modules/products/products.model');

describe('Cart input sanitization & validation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('addToCartService rejects NoSQL-style productId payloads', async () => {
    const maliciousItem = { productId: { "$ne": "" }, optionId: null, quantity: 1 };

    await expect(addToCartService('user1', maliciousItem)).rejects.toThrow('Invalid or missing `productId`');
  });

  test('updateCartItemService rejects NoSQL-style productId payloads', async () => {
    // Prepare a cart with an existing item so update path hits validation early
    const fakeCart = {
      items: [
        { productId: { equals: (id) => true }, optionId: 'opt1', quantity: 10 },
      ],
      save: jest.fn(),
    };

    Cart.findOne.mockResolvedValue(fakeCart);

    const maliciousItem = { productId: { "$gt": "" }, optionId: 'opt1', quantity: 5 };

    await expect(updateCartItemService('user1', maliciousItem)).rejects.toThrow('Invalid or missing `productId`');
  });

  test('addToCart controller rejects malicious payload without calling service', async () => {
    const controller = require('../modules/cart/cart.controller');
    const cartService = require('../modules/cart/cart.service');
    const spy = jest.spyOn(cartService, 'addToCartService');

    // Build fake req/res/next
    const req = { body: { item: { productId: { "$ne": "" }, optionId: null, quantity: 1 } }, user: { id: 'user1' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await controller.addToCart(req, res, next);

    expect(spy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(require('../utils/validation').ValidationError));
  });
});