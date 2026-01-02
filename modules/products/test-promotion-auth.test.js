const request = require('supertest');
const express = require('express');
const jwt = require('../../auth/token.js');

// JSDOM/Node environment: set up an express app mounting promotion routes
const promotionRoutes = require('./product-promotions/promotion.routes.js');

jest.mock('./promotion.service.js', () => ({
  applyPromotionToProduct: jest.fn(),
  applyPromotionToOption: jest.fn(),
  removePromotionFromProduct: jest.fn(),
  removePromotionFromOption: jest.fn(),
  getActivePromotionsByVendor: jest.fn().mockResolvedValue([]),
  getPromotionStatus: jest.fn().mockResolvedValue({}),
}));

// Mock Product model used by verifyOwnership middleware
jest.mock('./products.model.js', () => {
  return {
    findById: jest.fn(),
  };
});

const Product = require('./products.model.js');
const { createToken } = require('../../auth/token.js');

let app;
beforeEach(() => {
  app = express();
  app.use(express.json());
  app.use('/api/products', promotionRoutes);
});

describe('Promotion routes auth & ownership', () => {
  test('POST /:productId/promotion returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/products/507f191e810c19729de860ea/promotion')
      .send({ discountType: 'percentage', discountValue: 10 });

    expect(res.status).toBe(401);
  });

  test('POST /:productId/promotion returns 403 if authenticated but not owner', async () => {
    // Mock product owner to be a different user
    Product.findById.mockResolvedValue({ vendorId: '603f5312b1f2c12a7c7f0001' });

    const token = createToken({ _id: '603f5312b1f2c12a7c7f0002', role: 'vendor' });

    const res = await request(app)
      .post('/api/products/507f191e810c19729de860ea/promotion')
      .set('Authorization', `Bearer ${token}`)
      .send({ discountType: 'percentage', discountValue: 10 });

    expect(res.status).toBe(403);
  });

  test('POST /:productId/promotion succeeds for owner', async () => {
    const ownerId = '603f5312b1f2c12a7c7f0003';
    Product.findById.mockResolvedValue({ vendorId: ownerId });

    const { applyPromotionToProduct } = require('./product-promotions/promotion.service.js');
    applyPromotionToProduct.mockResolvedValue({ _id: '507f191e810c19729de860ea', vendorId: ownerId });

    const token = createToken({ _id: ownerId, role: 'vendor' });

    const res = await request(app)
      .post('/api/products/507f191e810c19729de860ea/promotion')
      .set('Authorization', `Bearer ${token}`)
      .send({ discountType: 'percentage', discountValue: 10 });

    expect(res.status).toBe(200);
    expect(res.body.product).toBeDefined();
  });
});
