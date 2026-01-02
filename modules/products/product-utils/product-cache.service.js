const TagBasedCacheService = require("./tagBasedCache.js");
const logger = require("../../../utils/logger");

let redisClient;
try {
  const redisModule = require("../../../config/redis");
  redisClient = typeof redisModule.getRedisClient === 'function' ? redisModule.getRedisClient() : redisModule;
} catch (e) {
  logger.warn("Redis client not available, falling back to MongoDB only.");
  redisClient = null;
}

const cache = new TagBasedCacheService(redisClient);

/**
 * Invalidate all product-related caches
 */
async function invalidateAllProductCaches(productId, vendorId = null, categories = [], municipality = null) {
  const tags = ['products'];

  if (productId) {
    tags.push(`product:${productId}`);
  }

  if (vendorId) {
    tags.push(`vendor:${vendorId}`);
  }

  if (categories && categories.length > 0) {
    categories.forEach(category => tags.push(`category:${category}`));
  }

  if (municipality) {
    tags.push(`municipality:${municipality}`);
  }

  await cache.invalidateByTags(tags);
  logger.debug(`Invalidated cache tags: ${tags.join(', ')}`);
}

/**
 * Invalidate product-specific caches
 */
async function invalidateProductCache(productId) {
  if (!productId) return;
  await cache.invalidateByTags([`product:${productId}`]);
  logger.debug(`Invalidated product cache for: ${productId}`);
}

/**
 * Invalidate vendor-specific caches
 */
async function invalidateVendorCache(vendorId) {
  if (!vendorId) return;
  await cache.invalidateByTags([`vendor:${vendorId}`]);
  logger.debug(`Invalidated vendor cache for: ${vendorId}`);
}

/**
 * Invalidate category-specific caches
 */
async function invalidateCategoryCache(categories) {
  if (!categories || categories.length === 0) return;
  const tags = categories.map(category => `category:${category}`);
  await cache.invalidateByTags(tags);
  logger.debug(`Invalidated category caches for: ${categories.join(', ')}`);
}

/**
 * Warm up common caches (can be called on startup)
 */
async function warmupCommonCaches() {
  try {
    logger.info('Starting cache warmup...');

    // This could be expanded to pre-load commonly accessed data
    // For now, just log that warmup was attempted
    logger.info('Cache warmup completed');

  } catch (error) {
    logger.warn('Cache warmup failed:', error);
  }
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    isAvailable: cache.isAvailable(),
    // Additional stats could be added here if the cache service exposes them
  };
}

module.exports = {
  invalidateAllProductCaches,
  invalidateProductCache,
  invalidateVendorCache,
  invalidateCategoryCache,
  warmupCommonCaches,
  getCacheStats,
  cache // Export the cache instance for direct access if needed
};