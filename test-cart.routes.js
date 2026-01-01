const express = require('express');
const request = require('supertest');
const cartRoutes = require('../cart.routes');

// Mock dependencies
jest.mock('../cart.controller');
jest.mock('../../auth/auth.controller.js');
jest.mock('../../middleware/verifyCartOwnership');
jest.mock('../../utils/rateLimiter');
jest.mock('../cart.service');
jest.mock('../../config/redis');

const cartController = require('../cart.controller');
const { protect } = require('../../auth/auth.controller.js');
const verifyCartOwnership = require('../../middleware/verifyCartOwnership');
const rateLimiter = require('../../utils/rateLimiter');
const { healthCheck } = require('../cart.service');

describe('Cart Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Express app
    app = express();
    app.use(express.json());

    // Mock middleware
    protect.mockImplementation((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011' };
      next();
    });

    verifyCartOwnership.mockImplementation((req, res, next) => next());

    rateLimiter.mockReturnValue((req, res, next) => next());

    healthCheck.mockResolvedValue({ status: 'healthy' });

    // Use the routes
    app.use('/cart', cartRoutes);
  });

  describe('Health check route', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/cart/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
    });

    it('should return unhealthy status on error', async () => {
      healthCheck.mockRejectedValue(new Error('Health check failed'));

      const response = await request(app).get('/cart/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
    });
  });

  describe('CSRF token route', () => {
    it('should return CSRF token when authenticated', async () => {
      const response = await request(app).get('/cart/csrf-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('csrfToken');
    });
  });

  describe('Cart routes with authentication', () => {
    it('should call getCart controller for GET /', async () => {
      cartController.getCart.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/cart/');

      expect(response.status).toBe(200);
      expect(cartController.getCart).toHaveBeenCalled();
    });

    it('should call addToCart controller for POST /add', async () => {
      cartController.addToCart.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/cart/add')
        .send({ item: { productId: 'test', quantity: 1 } });

      expect(response.status).toBe(200);
      expect(cartController.addToCart).toHaveBeenCalled();
    });

    it('should call updateCartItem controller for PUT /update', async () => {
      cartController.updateCartItem.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .put('/cart/update')
        .send({ item: { productId: 'test', quantity: 2 } });

      expect(response.status).toBe(200);
      expect(cartController.updateCartItem).toHaveBeenCalled();
    });

    it('should call removeCartItem controller for DELETE /remove', async () => {
      cartController.removeCartItem.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .delete('/cart/remove')
        .send({ productId: 'test' });

      expect(response.status).toBe(200);
      expect(cartController.removeCartItem).toHaveBeenCalled();
    });

    it('should call clearCart controller for DELETE /clear', async () => {
      cartController.clearCart.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).delete('/cart/clear');

      expect(response.status).toBe(200);
      expect(cartController.clearCart).toHaveBeenCalled();
    });
  });

  describe('Middleware application', () => {
    it('should apply protect middleware to cart routes', async () => {
      // Routes should require authentication
      const response = await request(app).get('/cart/');

      expect(protect).toHaveBeenCalled();
    });

    it('should apply rate limiting to state-changing operations', async () => {
      const response = await request(app)
        .post('/cart/add')
        .send({ item: { productId: 'test', quantity: 1 } });

      expect(rateLimiter).toHaveBeenCalled();
    });

    it('should apply cart ownership verification', async () => {
      const response = await request(app).get('/cart/');

      expect(verifyCartOwnership).toHaveBeenCalled();
    });
  });
});