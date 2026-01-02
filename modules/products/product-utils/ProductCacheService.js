const TagBasedCacheService = require('./tagBasedCache.js');
const logger = require('../../utils/logger');
const { executeBatchOperation } = require('../../utils/reliability.js');

/**
 * Product Cache Service - Handles all caching operations for products
 */
class ProductCacheService {
  constructor(redisClient) {
    this.cache = new TagBasedCacheService(redisClient);
  }

  /**
   * Check if cache is available
   */
  isAvailable() {
    return this.cache.isAvailable();
  }

  /**
   * Cache product list with pagination
   */
  async cacheProductList(key, products, ttl = 300, tags = []) {
    if (!this.isAvailable()) return;

    try {
      await this.cache.set(key, products, ttl, ['products', ...tags]);
      logger.debug(`Cached product list: ${key}`);
    } catch (error) {
      logger.warn(`Failed to cache product list ${key}:`, error);
    }
  }

  /**
   * Get cached product list
   */
  async getProductList(key) {
    if (!this.isAvailable()) return null;

    try {
      return await this.cache.get(key);
    } catch (error) {
      logger.warn(`Failed to get cached product list ${key}:`, error);
      return null;
    }
  }

  /**
   * Cache individual product
   */
  async cacheProduct(productId, product, ttl = 600) {
    if (!this.isAvailable()) return;

    const key = this.cache.generateKey('product', productId);
    const tags = [
      `product:${productId}`,
      `vendor:${product.vendorId}`,
      `municipality:${product.municipality}`,
      ...product.categories.map(cat => `category:${cat}`)
    ];

    try {
      await this.cache.set(key, product, ttl, tags);
      logger.debug(`Cached product: ${productId}`);
    } catch (error) {
      logger.warn(`Failed to cache product ${productId}:`, error);
    }
  }

  /**
   * Get cached product
   */
  async getProduct(productId) {
    if (!this.isAvailable()) return null;

    const key = this.cache.generateKey('product', productId);

    try {
      return await this.cache.get(key);
    } catch (error) {
      logger.warn(`Failed to get cached product ${productId}:`, error);
      return null;
    }
  }

  /**
   * Invalidate product caches
   */
  async invalidateProduct(productId, vendorId = null, categories = [], municipality = null) {
    const tags = [`product:${productId}`];

    if (vendorId) {
      tags.push(`vendor:${vendorId}`);
    }

    if (categories && categories.length > 0) {
      categories.forEach(category => tags.push(`category:${category}`));
    }

    if (municipality) {
      tags.push(`municipality:${municipality}`);
    }

    try {
      await this.cache.invalidateByTags(tags);
      logger.debug(`Invalidated caches for product: ${productId}`);
    } catch (error) {
      logger.warn(`Failed to invalidate caches for product ${productId}:`, error);
    }
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(query, results, ttl = 180) {
    if (!this.isAvailable()) return;

    const key = this.cache.generateKey('search', query);
    const tags = ['search'];

    try {
      await this.cache.set(key, results, ttl, tags);
      logger.debug(`Cached search results for: ${query}`);
    } catch (error) {
      logger.warn(`Failed to cache search results for ${query}:`, error);
    }
  }

  /**
   * Get cached search results
   */
  async getSearchResults(query) {
    if (!this.isAvailable()) return null;

    const key = this.cache.generateKey('search', query);

    try {
      return await this.cache.get(key);
    } catch (error) {
      logger.warn(`Failed to get cached search results for ${query}:`, error);
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    return await this.cache.getStats();
  }

  /**
   * Batch invalidate multiple products
   */
  async batchInvalidate(products) {
    if (!products || products.length === 0) return;

    const operations = products.map(product =>
      this.invalidateProduct(
        product._id,
        product.vendorId,
        product.categories,
        product.municipality
      )
    );

    const { successful, failed } = await executeBatchOperation(operations);

    if (failed.length > 0) {
      logger.warn(`Batch cache invalidation failed for ${failed.length} products`);
    }

    logger.info(`Successfully invalidated cache for ${successful.length} products`);
  }
}

module.exports = ProductCacheService;