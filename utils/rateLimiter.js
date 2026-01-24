const { getRedisClient, zAddSafe, zCardSafe, zRemRangeByScoreSafe, isRedisAvailable } = require("../config/redis");
const client = getRedisClient(); // now you can use client.ttl()

/**
 * Rate limiter middleware for Express
 * @param {object} options
 * @param {number} options.windowSec - Time window in seconds
 * @param {number} options.maxRequests - Max requests allowed in the window
 * @param {string} options.keyPrefix - Prefix for Redis key
 */
const rateLimiter = ({ windowSec = 60, maxRequests = 10, keyPrefix = "rl" }) => {
  return async (req, res, next) => {
    if (!isRedisAvailable()) return next();


    try {
      const identifier = req.user?.id || req.user?.vendorId || req.ip ; // per-user if logged in, else per-IP
      const key = `${keyPrefix}:${identifier}`;
      const now = Date.now();
      const windowStart = now - windowSec * 1000;

      // Remove old timestamps
      await zRemRangeByScoreSafe(key, 0, windowStart);

      // Get current request count
      const count = await zCardSafe(key);

      if (count >= maxRequests) {
        const ttl = await client.ttl(key); // optional: show retry time
        return res.status(429).json({
          message: `Too many requests. Try again in ${ttl || windowSec} seconds.`,
        });
      }

      // Add current request timestamp
      await zAddSafe(key, now, now.toString(), windowSec);

      // Optional headers
      res.set("X-RateLimit-Limit", maxRequests);
      res.set("X-RateLimit-Remaining", maxRequests - count - 1);

      next();
    } catch (err) {
      console.error("Rate limiter error:", err);
      next(); // fail open
    }
  };
};

module.exports = rateLimiter;
