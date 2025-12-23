const jwt = require("jsonwebtoken");

// Try to import Redis, but handle gracefully if it fails
let redisClient;
try {
  redisClient = require("../config/redis");
} catch (error) {
  console.warn("Redis not available for token blacklist:", error.message);
  redisClient = null;
}

class TokenBlacklist {
  // Blacklist a token
  static async blacklistToken(token) {
    try {
      if (!redisClient) {
        console.warn("Redis not available, skipping token blacklist");
        return;
      }

      // Decode token to get expiration time
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        throw new Error("Invalid token");
      }

      // Calculate TTL (time to live) - how long until token expires
      const now = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp - now;

      if (ttl > 0) {
        // Store token in blacklist with TTL
        await redisClient.set(`blacklist:${token}`, "true", { EX: ttl });
        console.log(`Token blacklisted for ${ttl} seconds`);
      }
    } catch (error) {
      console.error("Error blacklisting token:", error);
      // Don't throw error, just log it
    }
  }

  // Check if token is blacklisted
  static async isTokenBlacklisted(token) {
    try {
      if (!redisClient) {
        // If Redis is not available, assume token is not blacklisted
        return false;
      }
      
      const result = await redisClient.get(`blacklist:${token}`);
      return result === "true";
    } catch (error) {
      console.error("Error checking token blacklist:", error);
      return false; // If Redis fails, allow the token (fail open)
    }
  }

  // Clear all blacklisted tokens (admin function)
  static async clearBlacklist() {
    try {
      if (!redisClient) {
        console.warn("Redis not available, cannot clear blacklist");
        return;
      }
      
      const keys = await redisClient.keys("blacklist:*");
      if (keys.length > 0) {
        const { safeDel } = require('../config/redis');
        await safeDel(keys);
        console.log(`Cleared ${keys.length} blacklisted tokens`);
      }
    } catch (error) {
      console.error("Error clearing blacklist:", error);
      throw error;
    }
  }

  // Get blacklist stats
  static async getBlacklistStats() {
    try {
      if (!redisClient) {
        return { 
          totalBlacklistedTokens: 0, 
          keys: [], 
          message: "Redis not available" 
        };
      }
      
      const keys = await redisClient.keys("blacklist:*");
      return {
        totalBlacklistedTokens: keys.length,
        keys: keys.slice(0, 10) // Show first 10 keys for debugging
      };
    } catch (error) {
      console.error("Error getting blacklist stats:", error);
      return { totalBlacklistedTokens: 0, keys: [] };
    }
  }
}

module.exports = TokenBlacklist;