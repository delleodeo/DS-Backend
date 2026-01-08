const Product = require("../products.model.js");
const { buildSearchQuery, buildCategoryQuery, buildMunicipalityQuery, sanitizePagination } = require("../product-utils/productUtils.js");
const TagBasedCacheService = require("../product-utils/tagBasedCache.js");
const { createError } = require("../product-utils/productUtils.js");
const mongoose = require("mongoose");
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

// Product status constants
const PRODUCT_STATUS = {
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// Cache TTL constants
const CACHE_TTL = Object.freeze({
  PRODUCT_LIST: 300,      // 5 minutes
  INDIVIDUAL_PRODUCT: 600, // 10 minutes
  SEARCH_RESULTS: 180,     // 3 minutes
  CATEGORY_LIST: 300,      // 5 minutes
  MUNICIPALITY_LIST: 300,  // 5 minutes
  VENDOR_PRODUCTS: 180     // 3 minutes
});

/**
 * Get paginated approved products for public listing
 */
async function getPaginatedProducts(skip, limit) {
  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const cacheKey = cache.generateKey('products:approved', `skip:${skipNum}`, `limit:${limitNum}`);

  let paginatedProducts = await cache.get(cacheKey);
  if (paginatedProducts) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
  } else {
    paginatedProducts = await Product.find({
      status: PRODUCT_STATUS.APPROVED,
      isDisabled: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean({ virtuals: true });

    if (cache.isAvailable()) {
      await cache.set(cacheKey, paginatedProducts, CACHE_TTL.PRODUCT_LIST, ['products', 'products:approved']);
      logger.info(`Cached approved products page skip=${skipNum}, limit=${limitNum}`);
    }
  }

  return paginatedProducts;
}

/**
 * Get products by category with caching
 */
async function getProductsByCategoryService(category, limit, skip) {
  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);

  if (typeof category !== 'string' || category.trim().length === 0) {
    throw createError('Invalid category', 400);
  }
  if (category.length > 128) {
    throw createError('Category too long', 400);
  }

  const normalizeCategory = category.toLowerCase().trim();
  const cacheKey = `products:approved:category:${normalizeCategory}:limit:${limitNum}:skip:${skipNum}`;

  let paginated = await cache.get(cacheKey);
  if (paginated) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
    return paginated;
  }

  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  const categoryQuery = buildCategoryQuery(normalizeCategory);
  const query = { ...baseQuery, ...categoryQuery };

  paginated = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skipNum)
    .limit(limitNum)
    .lean({ virtuals: true });

  if (cache.isAvailable()) {
    await cache.set(cacheKey, paginated, CACHE_TTL.CATEGORY_LIST, ['products', 'products:approved', `category:${normalizeCategory}`]);
  }

  return paginated;
}

/**
 * Get products by municipality with optional category filter
 */
async function getProductByMunicipality(municipality, category, limit, skip) {
  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);

  if (typeof municipality !== 'string' || municipality.trim().length === 0) {
    throw createError('Invalid municipality', 400);
  }

  const normalizedMunicipality = municipality.toLowerCase().trim();
  let cacheKey = `products:approved:municipality:${normalizedMunicipality}:limit:${limitNum}:skip:${skipNum}`;

  if (category && typeof category === 'string' && category.trim().length > 0) {
    const normalizedCategory = category.toLowerCase().trim();
    cacheKey += `:category:${normalizedCategory}`;
  }

  let products = await cache.get(cacheKey);
  if (products) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
    return products;
  }

  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  const municipalityQuery = buildMunicipalityQuery(normalizedMunicipality);
  let query = { ...baseQuery, ...municipalityQuery };

  if (category && typeof category === 'string' && category.trim().length > 0) {
    const categoryQuery = buildCategoryQuery(category.toLowerCase().trim());
    query = { ...query, ...categoryQuery };
  }

  products = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skipNum)
    .limit(limitNum)
    .lean({ virtuals: true });

  if (cache.isAvailable()) {
    const tags = ['products', 'products:approved', `municipality:${normalizedMunicipality}`];
    if (category) {
      tags.push(`category:${category.toLowerCase().trim()}`);
    }
    await cache.set(cacheKey, products, CACHE_TTL.MUNICIPALITY_LIST, tags);
  }

  return products;
}

/**
 * Search products with full-text search
 */
async function searchProductsService(query, limit = 0, skip = 0) {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw createError('Search query must be a non-empty string', 400);
  }

  const { limit: limitNum, skip: skipNum } = sanitizePagination(limit, skip);
  const searchTerms = query.trim().split(/\s+/).filter(term => term.length > 0);

  if (searchTerms.length === 0) {
    throw createError('Search query must contain valid terms', 400);
  }

  const cacheKey = `products:search:${searchTerms.join('_')}:limit:${limitNum}:skip:${skipNum}`;

  let results = await cache.get(cacheKey);
  if (results) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
    return results;
  }

  const searchQuery = buildSearchQuery(searchTerms);
  const baseQuery = {
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true },
  };

  const queryObj = { ...baseQuery, ...searchQuery };

  results = await Product.find(queryObj)
    .sort({ score: { $meta: "textScore" }, averageRating: -1, sold: -1 })
    .skip(skipNum)
    .limit(limitNum)
    .lean({ virtuals: true });

  if (cache.isAvailable()) {
    await cache.set(cacheKey, results, CACHE_TTL.SEARCH_RESULTS, ['products', 'products:approved']);
  }

  return results;
}

/**
 * Get related products using score-based ranking
 */
async function getRelatedProducts(productId, limit = 6) {
  if (!mongoose.isValidObjectId(productId)) {
    throw createError('Invalid product ID', 400);
  }

  const currentProduct = await Product.findById(productId).lean();
  if (!currentProduct) throw createError('Product not found', 404);

  const categories = Array.isArray(currentProduct.categories)
    ? currentProduct.categories
    : [];

  if (categories.length === 0) return [];

  const topCategories = categories.slice(0, 3);

  const related = await Product.aggregate([
    {
      $match: {
        _id: { $ne: mongoose.Types.ObjectId(productId) },
        stock: { $gt: 0 },
        status: PRODUCT_STATUS.APPROVED,
        isDisabled: { $ne: true },
        categories: { $in: topCategories }
      }
    },
    {
      $addFields: {
        relevanceScore: {
          $add: [
            { $size: { $setIntersection: ['$categories', topCategories] } },
            { $multiply: ['$averageRating', 0.5] },
            { $multiply: [{ $log10: { $add: ['$sold', 1] } }, 0.3] },
            { $multiply: [{ $log10: { $add: ['$stock', 1] } }, 0.2] }
          ]
        }
      }
    },
    {
      $sort: {
        relevanceScore: -1,
        averageRating: -1,
        sold: -1,
        createdAt: -1
      }
    },
    {
      $limit: limit
    }
  ]);

  return related;
}

/**
 * Get single product by ID with caching
 */
async function getProductByIdService(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw createError('Invalid product ID', 400);
  }

  const cacheKey = `product:${id}`;

  let product = await cache.get(cacheKey);
  if (product) {
    logger.debug(`Redis cache hit: ${cacheKey}`);
    return product;
  }

  product = await Product.findOne({
    _id: id,
    status: PRODUCT_STATUS.APPROVED,
    isDisabled: { $ne: true }
  }).lean({ virtuals: true });

  if (!product) {
    throw createError('Product not found', 404);
  }

  if (cache.isAvailable()) {
    await cache.set(cacheKey, product, CACHE_TTL.INDIVIDUAL_PRODUCT, ['products', `product:${id}`]);
  }

  return product;
}

module.exports = {
  getPaginatedProducts,
  getProductsByCategoryService,
  getProductByMunicipality,
  searchProductsService,
  getRelatedProducts,
  getProductByIdService,
  PRODUCT_STATUS,
  CACHE_TTL
};