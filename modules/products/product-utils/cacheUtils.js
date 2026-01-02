const mongoose = require("mongoose");

/**
 * Utility functions for caching operations
 */
class CacheUtils {
  constructor(redisClient) {
    this.redisClient = redisClient;
  }

  /**
   * Get cached data with error handling
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Parsed cached data or null
   */
  async get(key) {
    if (!this.redisClient || !this.redisClient.isOpen) return null;
    try {
      const cached = await this.redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached data with TTL
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttl - TTL in seconds
   */
  async set(key, data, ttl = 300) {
    if (!this.redisClient || !this.redisClient.isOpen) return;
    try {
      await this.redisClient.setEx(key, ttl, JSON.stringify(data));
    } catch (error) {
      console.warn(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete cache keys matching pattern
   * @param {string} pattern - Key pattern (e.g., "products:*")
   */
  async deletePattern(pattern) {
    if (!this.redisClient || !this.redisClient.isOpen) return;
    try {
      // Use the scanIterator helper to avoid low-level scan reply shape
      let totalDeleted = 0;
      const batch = [];
      for await (const key of this.redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        if (!key) continue;
        batch.push(key);
        // Batch deletes to avoid too long argument lists
        if (batch.length >= 100) {
          await this.redisClient.del(...batch);
          totalDeleted += batch.length;
          batch.length = 0;
        }
      }

      if (batch.length > 0) {
        // Ensure keys are strings to avoid Redis type errors
        const sane = batch.filter(k => typeof k === 'string' && k.length > 0);
        if (sane.length > 0) {
          await this.redisClient.del(...sane);
          totalDeleted += sane.length;
        }
      }

      if (totalDeleted > 0) {
        console.log(`Deleted ${totalDeleted} cache keys matching ${pattern}`);
      }
    } catch (error) {
      console.warn(`Cache delete pattern error for ${pattern}:`, error);
    }
  }

  /**
   * Delete specific keys
   * @param {string[]|string} keys - Keys to delete (single key or array)
   */
  async delete(keys) {
    if (!this.redisClient || !this.redisClient.isOpen) return;
    try {
      if (!keys) return;
      if (typeof keys === 'string') {
        await this.redisClient.del(keys);
        return;
      }

      if (Array.isArray(keys) && keys.length > 0) {
        // Filter out any non-string keys to avoid redis encoder errors
        const saneKeys = keys.filter(k => typeof k === 'string');
        if (saneKeys.length > 0) {
          await this.redisClient.del(...saneKeys);
        }
      }
    } catch (error) {
      console.warn(`Cache delete error:`, error);
    }
  }

  /**
   * Check if Redis is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.redisClient && this.redisClient.isOpen;
  }
}

module.exports = CacheUtils;