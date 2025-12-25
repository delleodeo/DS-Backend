// Mock auth middleware for integration tests - MUST be hoisted before requiring `app`
const mongoose = require('mongoose');
const testUserId = new mongoose.Types.ObjectId().toString();

jest.mock('../../auth/auth.controller', () => ({
  protect: jest.fn((req, res, next) => {
    req.user = { id: testUserId };
    next();
  }),
  optionalProtect: jest.fn((req, res, next) => {
    req.user = { id: testUserId };
    next();
  }),
  restrictTo: jest.fn(() => (req, res, next) => next())
}));

// Mock Redis to prevent connection issues
jest.mock('../../config/redis', () => ({
  isRedisAvailable: jest.fn(() => false),
  safeSet: jest.fn(),
  safeGet: jest.fn(),
  getRedisClient: jest.fn(() => ({})),
  safeDel: jest.fn(),
  safeDelPattern: jest.fn(),
  zAddSafe: jest.fn(),
  zCardSafe: jest.fn(),
  zRemRangeByScoreSafe: jest.fn(),
  connectRedis: jest.fn()
}));

// Mock token blacklist
jest.mock('../../auth/tokenBlacklist', () => ({
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
  blacklistToken: jest.fn(),
  clearBlacklist: jest.fn()
}));

const request = require('supertest');
const app = require('../../app');
const Cart = require('../../modules/cart/cart.model');

// Mock Redis to prevent connection issues
jest.mock('../../config/redis', () => ({
  isRedisAvailable: jest.fn(() => false),
  safeSet: jest.fn(),
  safeGet: jest.fn(),
  getRedisClient: jest.fn(() => ({})),
  safeDel: jest.fn(),
  safeDelPattern: jest.fn(),
  zAddSafe: jest.fn(),
  zCardSafe: jest.fn(),
  zRemRangeByScoreSafe: jest.fn(),
  connectRedis: jest.fn()
}));

// Mock token blacklist
jest.mock('../../auth/tokenBlacklist', () => ({
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
  blacklistToken: jest.fn(),
  clearBlacklist: jest.fn()
}));

// const { connectDB, disconnectDB } = require('../../config/db');

describe('Cart API Integration Tests', () => {
  let authToken;

  beforeAll(async () => {
    // Database connection is handled by test setup
    // await connectDB();
    // Assume we have a test user and token setup
    authToken = 'test-jwt-token';
  });

  afterAll(async () => {
    // await disconnectDB();
  });

  beforeEach(async () => {
    // Clear cart collection
    await Cart.deleteMany({});
  });

  describe('POST /v1/cart/add', () => {
    it('should add item to cart with valid auth', async () => {
      const response = await request(app)
        .post('/v1/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          item: {
            productId: '507f1f77bcf86cd799439011',
            quantity: 1
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId');
      expect(response.body.items).toHaveLength(1);
    });

    it('should fail without auth', async () => {
      const response = await request(app)
        .post('/v1/cart/add')
        .send({
          item: {
            productId: '507f1f77bcf86cd799439011',
            quantity: 1
          }
        });

      expect(response.status).toBe(401);
    });

    it('should fail with invalid data', async () => {
      const response = await request(app)
        .post('/v1/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          item: {
            productId: 'invalid-id',
            quantity: 100
          }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Validation failed');
    });
  });

  describe('GET /v1/cart', () => {
    it('should return user cart', async () => {
      const response = await request(app)
        .get('/v1/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('items');
    });
  });

  describe('DELETE /v1/cart/remove', () => {
    it('should remove item from cart', async () => {
      // First add an item
      await request(app)
        .post('/v1/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          item: {
            productId: '507f1f77bcf86cd799439011',
            quantity: 1
          }
        });

      const response = await request(app)
        .delete('/v1/cart/remove')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: '507f1f77bcf86cd799439011'
        });

      expect(response.status).toBe(200);
    });
  });
});