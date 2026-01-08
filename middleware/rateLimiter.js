/**
 * Rate Limiter Middleware
 * Provides flexible rate limiting for API endpoints
 */
const rateLimit = require('express-rate-limit');
const { getRedisClient, isRedisAvailable } = require('../config/redis');

/**
 * Create a custom rate limiter with Redis store support
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // Max 100 requests per window
    message = 'Too many requests, please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = null,
    handler = null
  } = options;

  const limiterOptions = {
    windowMs,
    max,
    message: {
      success: false,
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator: keyGenerator || ((req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?._id?.toString() || req.ip;
    }),
    handler: handler || ((req, res) => {
      res.status(429).json({
        success: false,
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    })
  };

  // Use Redis store if available for distributed rate limiting
  if (isRedisAvailable()) {
    try {
      const RedisStore = require('rate-limit-redis').default;
      const client = getRedisClient();
      
      limiterOptions.store = new RedisStore({
        sendCommand: (...args) => client.call(...args),
        prefix: 'rl:'
      });
    } catch (e) {
      console.warn('[RateLimiter] Redis store not available, using memory store');
    }
  }

  return rateLimit(limiterOptions);
};

/**
 * Pre-configured rate limiters for common use cases
 */

// Strict limiter for sensitive operations (login, payments)
const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many attempts. Please try again in 15 minutes.'
});

// Financial operations limiter
const financialLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: 'Too many financial operations. Please try again later.'
});

// Standard API limiter
const standardLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// Lenient limiter for read operations
const lenientLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 500
});

// Auth-specific limiter
const authLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many login attempts. Please try again in an hour.',
  skipSuccessfulRequests: true
});

module.exports = {
  createRateLimiter,
  strictLimiter,
  financialLimiter,
  standardLimiter,
  lenientLimiter,
  authLimiter
};
