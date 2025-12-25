const express = require("express");
const router = express.Router();
const cartController = require("./cart.controller");
const { protect } = require("../../auth/auth.controller.js");
const verifyCartOwnership = require("../../middleware/verifyCartOwnership");
const rateLimiter = require("../../utils/rateLimiter");
const { healthCheck } = require("./cart.service");
const crypto = require('crypto');

// Redis client for CSRF tokens
let redisClient;
try {
  const redisModule = require("../../config/redis");
  redisClient = typeof redisModule.getRedisClient === 'function' ? redisModule.getRedisClient() : redisModule;
} catch (e) {
  console.warn("Redis client not available for CSRF tokens, falling back to in-memory.");
  redisClient = null;
}

// In-memory store for CSRF tokens (fallback if Redis unavailable)
const csrfTokens = new Map();

// Generate CSRF token
const generateCsrfToken = async (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.setEx(`csrf:${userId}`, 3600, token); // 1 hour TTL
    } catch (error) {
      console.warn('Failed to store CSRF token in Redis, using in-memory fallback:', error);
      csrfTokens.set(userId, token);
    }
  } else {
    csrfTokens.set(userId, token);
  }
  return token;
};

// Get CSRF token
const getCsrfToken = async (userId) => {
  if (redisClient && redisClient.isOpen) {
    try {
      return await redisClient.get(`csrf:${userId}`);
    } catch (error) {
      console.warn('Failed to get CSRF token from Redis, checking in-memory:', error);
    }
  }
  return csrfTokens.get(userId);
};

// CSRF protection middleware for state-changing operations
const csrfProtection = async (req, res, next) => {
  const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;
  const userId = req.user?.id;

  if (!csrfToken) {
    // Generate new token and send in response
    const newToken = await generateCsrfToken(userId);
    res.set('X-CSRF-Token', newToken);
    console.warn('CSRF token generated and sent. Include it in future requests.');
    return next();
  }

  // Validate token
  const storedToken = await getCsrfToken(userId);
  if (!storedToken || storedToken !== csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  // Token is valid, proceed
  next();
};

// Health check route (no auth required)
router.get("/health", async (req, res) => {
  try {
    const health = await healthCheck();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// Get CSRF token route
router.get("/csrf-token", protect, async (req, res) => {
  const userId = req.user.id;
  let token = await getCsrfToken(userId);
  if (!token) {
    token = await generateCsrfToken(userId);
  }
  res.json({ csrfToken: token });
});

// Apply authentication to all cart routes
router.use(protect);

// Apply rate limiting to cart operations (more restrictive than general API)
const cartRateLimiter = rateLimiter({
  windowSec: 60, // 1 minute
  maxRequests: 30, // 30 requests per minute for cart operations
  keyPrefix: "cart_rl"
});

// Apply cart ownership verification
router.use(verifyCartOwnership);

// Cart routes with validation and rate limiting
router.get("/", cartController.getCart);
router.post("/add", cartRateLimiter, csrfProtection, cartController.addToCart);
router.put("/update", cartRateLimiter, csrfProtection, cartController.updateCartItem);
router.delete("/remove", cartRateLimiter, csrfProtection, cartController.removeCartItem);
router.delete("/clear", cartRateLimiter, csrfProtection, cartController.clearCart);

module.exports = router;
