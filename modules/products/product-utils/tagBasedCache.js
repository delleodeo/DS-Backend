const logger = require('../../../utils/logger');
const { CacheError } = require('../../../utils/errorHandler');

/**
 * Tag-based cache service for intelligent cache invalidation
 */
class TagBasedCacheService {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.tagPrefix = 'tag:';
    this.keyPrefix = 'data:';
  }

  /**
   * Check if Redis is available
   */
  isAvailable() {
    return this.redisClient && this.redisClient.isOpen;
  }

  /**
   * Generate cache key
   */
  generateKey(type, ...params) {
    return `${this.keyPrefix}${type}:${params.join(':')}`;
  }

  /**
   * Generate tag key
   */
  generateTagKey(tag) {
    return `${this.tagPrefix}${tag}`;
  }

  /**
   * Set cache with tags
   */
  async set(key, data, ttl = 300, tags = []) {
    if (!this.isAvailable()) return;

    try {
      const serializedData = JSON.stringify(data);

      // Use multi command for atomic operation in Redis v5
      const multi = this.redisClient.multi();
      
      // Set the data
      multi.setEx(key, ttl, serializedData);

      // Add to tag sets
      tags.forEach(tag => {
        multi.sAdd(this.generateTagKey(tag), key);
      });

      await multi.exec();

      logger.debug(`Cached data with key: ${key}, tags: ${tags.join(', ')}`);
    } catch (error) {
      logger.warn(`Cache set error for key ${key}:`, error);
      throw new CacheError(`Failed to set cache: ${error.message}`, 'set');
    }
  }
  /**
   * Get cached data
   */
  async get(key) {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.redisClient.get(key);
      if (cached) {
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(cached);
      }
      logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      logger.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete specific keys
   */
  async delete(keys) {
    if (!this.isAvailable()) return;

    try {
      if (!keys) return;
      if (typeof keys === 'string') {
        keys = [keys];
      }

      if (Array.isArray(keys) && keys.length > 0) {
        const saneKeys = keys.filter(k => typeof k === 'string');
        if (saneKeys.length > 0) {
          await this.redisClient.del(...saneKeys);
          logger.debug(`Deleted cache keys: ${saneKeys.join(', ')}`);
        }
      }
    } catch (error) {
      logger.warn(`Cache delete error:`, error);
      throw new CacheError(`Failed to delete cache: ${error.message}`, 'delete');
    }
  }

  /**
   * Invalidate by tags - removes all keys associated with given tags
   */
  async invalidateByTags(tags) {
    if (!this.isAvailable() || !tags || tags.length === 0) return;

    try {
      const tagKeys = tags.map(tag => this.generateTagKey(tag));

      // Get all keys for these tags
      const keysArrays = await Promise.all(
        tagKeys.map(tagKey => this.redisClient.sMembers(tagKey))
      );

      // Flatten and deduplicate keys
      const allKeys = [...new Set(keysArrays.flat())];

      if (allKeys.length === 0) return;

      // Use multi command to delete keys and clean up tag sets
      const multi = this.redisClient.multi();

      // Delete the actual data keys
      if (allKeys.length > 0) {
        multi.del(...allKeys);
      }

      // Clean up tag sets (remove references to deleted keys)
      tagKeys.forEach(tagKey => {
        multi.del(tagKey);
      });

      await multi.exec();

      logger.info(`Invalidated ${allKeys.length} cache entries for tags: ${tags.join(', ')}`);
    } catch (error) {
      logger.warn(`Cache invalidation error for tags ${tags.join(', ')}:`, error);
      throw new CacheError(`Failed to invalidate cache by tags: ${error.message}`, 'invalidate');
    }
  }

  /**
   * Invalidate by pattern (fallback for complex patterns)
   */
  async invalidateByPattern(pattern) {
    if (!this.isAvailable()) return;

    try {
      let totalDeleted = 0;
      const batchSize = 100;
      let cursor = 0;
      let keys = [];

      do {
        const result = await this.redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: batchSize
        });
        cursor = result.cursor;
        keys = result.keys;

        if (keys.length > 0) {
          await this.redisClient.del(...keys);
          totalDeleted += keys.length;
        }
      } while (cursor !== 0);

      if (totalDeleted > 0) {
        logger.info(`Deleted ${totalDeleted} cache keys matching ${pattern}`);
      }
    } catch (error) {
      logger.warn(`Cache pattern invalidation error for ${pattern}:`, error);
      throw new CacheError(`Failed to invalidate cache by pattern: ${error.message}`, 'invalidate');
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isAvailable()) return null;

    try {
      const info = await this.redisClient.info('stats');
      const lines = info.split('\n');
      const stats = {};

      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key.trim()] = value.trim();
        }
      });

      return {
        hits: parseInt(stats.keyspace_hits) || 0,
        misses: parseInt(stats.keyspace_misses) || 0,
        total: (parseInt(stats.keyspace_hits) || 0) + (parseInt(stats.keyspace_misses) || 0),
        hitRate: stats.keyspace_hits && stats.keyspace_misses ?
          (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses))) : 0
      };
    } catch (error) {
      logger.warn('Cache stats error:', error);
      return null;
    }
  }
}

module.exports = TagBasedCacheService;