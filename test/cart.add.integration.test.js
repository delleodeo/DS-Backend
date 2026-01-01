const request = require('supertest');
const app = require('../app');
const Cart = require('../modules/cart/cart.model');
const Product = require('../modules/products/products.model');
const ProductStockService = require('../modules/products/product-utils/ProductStockService');

jest.mock('../modules/cart/cart.model');

describe('Cart add API', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when product option not found', async () => {
    // simulate product exists but option missing
    Product.findOne = jest.fn().mockResolvedValue({ _id: 'p1', option: [] });
    Product.findById = jest.fn().mockResolvedValue({ _id: 'p1', option: [] });

    const res = await request(app)
      .post('/v1/cart/add')
      .set('Authorization', 'Bearer faketoken')
      .send({ item: { productId: '507f1f77bcf86cd799439011', optionId: '507f1f77bcf86cd799439012', quantity: 1 } });

    expect(res.status).toBe(404);
    expect(res.body.error.message.toLowerCase()).toContain('product option not found');
  });
});