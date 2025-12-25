const Cart = require("./cart.model");
const Product = require("../products/products.model");
const Vendor = require("../vendors/vendors.model.js");
const logger = require("../../utils/logger");
const monitoring = require("../../utils/monitoringService");
const { withTransaction } = require("../../utils/transaction");
const { AppError, ERROR_TYPES, HTTP_STATUS } = require("../../utils/errorHandler");
const sanitizeMongoInput = require("../../utils/sanitizeMongoInput");

let redisClient;
try {
  const redisModule = require("../../config/redis");
  redisClient = typeof redisModule.getRedisClient === 'function' ? redisModule.getRedisClient() : redisModule;
} catch (e) {
  logger.warn("Redis client not available, falling back to MongoDB only.");
  redisClient = null;
}
const CacheUtils = require("../products/product-utils/cacheUtils.js");
const cache = new CacheUtils(redisClient);

// Cart configuration constants
const CART_CONFIG = {
  MAX_QUANTITY: parseInt(process.env.CART_MAX_QUANTITY) || 50,
  DEFAULT_SHIPPING_FEE: parseInt(process.env.CART_SHIPPING_FEE) || 50,
};

/**
 * Simple retry utility for cache operations
 */
const retryCacheOperation = async (operation, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      logger.warn(`Cache operation failed, retrying (${attempt}/${maxRetries}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // Exponential backoff
    }
  }
};

/**
 * Validate item input
 */
const validateItem = (item) => {
  if (!item || typeof item !== 'object') {
    throw new AppError("Invalid item data", ERROR_TYPES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
  }
  if (!item.productId || !require('mongoose').Types.ObjectId.isValid(item.productId)) {
    throw new AppError("Invalid productId", ERROR_TYPES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
  }
  if (item.optionId && !require('mongoose').Types.ObjectId.isValid(item.optionId)) {
    throw new AppError("Invalid optionId", ERROR_TYPES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
  }
  if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1 || item.quantity > CART_CONFIG.MAX_QUANTITY) {
    throw new AppError(`Quantity must be a number between 1 and ${CART_CONFIG.MAX_QUANTITY}`, ERROR_TYPES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
  }
};

/**
 * Validate ObjectId format
 */
const validateObjectId = (id, fieldName = 'ID') => {
  if (!id || !require('mongoose').Types.ObjectId.isValid(id)) {
    throw new AppError(
      `Invalid ${fieldName} format`,
      ERROR_TYPES.VALIDATION_ERROR,
      HTTP_STATUS.BAD_REQUEST
    );
  }
};

/**
 * Generate cache key for cart
 */
const getCacheKey = (userId) => `cart:${userId}`;

/**
 * Get available stock for a product/option
 */
const getAvailableStock = async (productId, optionId) => {
  const startTime = Date.now();

  try {
    validateObjectId(productId, 'productId');

    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError("Product not found", ERROR_TYPES.NOT_FOUND_ERROR, HTTP_STATUS.NOT_FOUND);
    }

    // Record database query time
    monitoring.recordDatabaseQuery(Date.now() - startTime);

    // If optionId is provided, get stock from the specific option
    if (optionId) {
      validateObjectId(optionId, 'optionId');

      const option = product.option && product.option.find(opt =>
        String(opt._id) === String(optionId)
      );
      if (option) {
        return option.stock || 0;
      }
      // If option not found, fall back to product stock
      console.warn(`Option ${optionId} not found for product ${productId}, falling back to product stock`);
      return product.stock || 0;
    }

    // Otherwise return product-level stock
    return product.stock || 0;
  } catch (error) {
    monitoring.recordDatabaseError();
    throw error;
  }
};

/**
 * Validate stock for item addition/update
 */
const validateStockForItem = async (productId, optionId, requestedQuantity, existingQuantity = 0) => {
  const availableStock = await getAvailableStock(productId, optionId);
  const totalQuantity = existingQuantity + requestedQuantity;
  if (totalQuantity > availableStock) {
    throw new AppError(
      `Only ${availableStock} items available in stock. You already have ${existingQuantity} in cart.`,
      ERROR_TYPES.CONFLICT_ERROR,
      HTTP_STATUS.CONFLICT
    );
  }
};

/**
 * Find existing item in cart items array
 */
const findExistingItem = (items, productId, optionId) => {
  return items.find(
    (i) =>
      i.productId.equals(productId) &&
      (i.optionId ? String(i.optionId) : '') === (optionId ? String(optionId) : '')
  );
};

/**
 * Add item to cart with transaction safety
 */
exports.addToCartService = async (userId, item) => {
  const startTime = Date.now();

  try {
    // Validate inputs
    validateObjectId(userId, 'userId');
    validateItem(item);

    // Sanitize input
    const sanitizedItem = sanitizeMongoInput(item);

    const result = await withTransaction(async (session) => {
      return await addItemToCart(session, userId, sanitizedItem);
    });

    // Cache the result with retry
    await retryCacheOperation(() => cache.set(getCacheKey(userId), result));

    // Record performance metrics
    monitoring.recordResponseTime(Date.now() - startTime);

    logger.info(`Item added to cart for user ${userId}`, {
      productId: sanitizedItem.productId,
      quantity: sanitizedItem.quantity,
      totalItems: result.items.length
    });

    return result;
  } catch (error) {
    monitoring.recordDatabaseError();
    logger.error("Error adding item to cart", {
      error: error.message,
      userId,
      item
    });
    throw error;
  }
};

/**
 * Helper function to add item within transaction
 */
const addItemToCart = async (session, userId, sanitizedItem) => {
  let cart = await Cart.findOne({ userId }).session(session);
  let existingQuantity = 0;

  if (cart) {
    const existingItem = findExistingItem(cart.items, sanitizedItem.productId, sanitizedItem.optionId);
    if (existingItem) {
      existingQuantity = existingItem.quantity;
    }
  }

  // Validate stock
  await validateStockForItem(sanitizedItem.productId, sanitizedItem.optionId, sanitizedItem.quantity, existingQuantity);

  if (!cart) {
    cart = new Cart({
      userId,
      items: [sanitizedItem]
    });
  } else {
    const existingItem = findExistingItem(cart.items, sanitizedItem.productId, sanitizedItem.optionId);

    if (existingItem) {
      existingItem.quantity += sanitizedItem.quantity;
    } else {
      cart.items.push(sanitizedItem);
    }
  }

  cart.updatedAt = new Date();
  await cart.save({ session });

  return cart;
};

/**
 * Get cart with caching
 */
exports.getCartService = async (userId) => {
  const startTime = Date.now();

  try {
    validateObjectId(userId, 'userId');

    // Try cache first with retry
    const cached = await retryCacheOperation(() => cache.get(getCacheKey(userId)));
    if (cached) {
      monitoring.recordCacheHit();
      return cached;
    }

    monitoring.recordCacheMiss();

    // Fetch from database
    const cart = await Cart.findOne({ userId });

    // Record database query time
    monitoring.recordDatabaseQuery(Date.now() - startTime);

    const result = cart ? { ...cart.toObject(), items: cart.items || [] } : { userId, items: [] };

    // Cache the result with retry
    if (cart) {
      await retryCacheOperation(() => cache.set(getCacheKey(userId), result));
    }

    // Record performance metrics
    monitoring.recordResponseTime(Date.now() - startTime);

    return result;
  } catch (error) {
    monitoring.recordDatabaseError();
    logger.error("Error retrieving cart", {
      error: error.message,
      userId
    });
    throw error;
  }
};

/**
 * Update cart item with transaction safety
 */
exports.updateCartItemService = async (userId, item) => {
  const startTime = Date.now();

  try {
    validateObjectId(userId, 'userId');
    validateItem(item);

    const sanitizedItem = sanitizeMongoInput(item);

    const result = await withTransaction(async (session) => {
      return await updateItemInCart(session, userId, sanitizedItem);
    });

    // Update cache with retry
    await retryCacheOperation(() => cache.set(getCacheKey(userId), result));

    // Record performance metrics
    monitoring.recordResponseTime(Date.now() - startTime);

    logger.info(`Cart item updated for user ${userId}`, {
      productId: sanitizedItem.productId,
      quantity: sanitizedItem.quantity
    });

    return result;
  } catch (error) {
    monitoring.recordDatabaseError();
    logger.error("Error updating cart item", {
      error: error.message,
      userId,
      item
    });
    throw error;
  }
};

/**
 * Helper function to update item within transaction
 */
const updateItemInCart = async (session, userId, sanitizedItem) => {
  const cart = await Cart.findOne({ userId }).session(session);
  if (!cart) {
    throw new AppError("Cart not found", ERROR_TYPES.NOT_FOUND_ERROR, HTTP_STATUS.NOT_FOUND);
  }

  const existingItem = findExistingItem(cart.items, sanitizedItem.productId, sanitizedItem.optionId);

  if (existingItem) {
    // Validate stock for the new quantity
    await validateStockForItem(sanitizedItem.productId, sanitizedItem.optionId, sanitizedItem.quantity);
    existingItem.quantity = sanitizedItem.quantity;
  } else {
    // Adding new item - check stock
    await validateStockForItem(sanitizedItem.productId, sanitizedItem.optionId, sanitizedItem.quantity);
    cart.items.push(sanitizedItem);
  }

  cart.updatedAt = new Date();
  await cart.save({ session });

  return cart;
};

/**
 * Remove item from cart
 */
exports.removeCartItemService = async (userId, productId, optionId) => {
  const startTime = Date.now();

  try {
    validateObjectId(userId, 'userId');
    validateObjectId(productId, 'productId');
    if (optionId) validateObjectId(optionId, 'optionId');

    logger.info("Removing item from cart", { userId, productId, optionId });

    // Build the filter for the item to remove
    const itemFilter = { productId };
    if (optionId) {
      itemFilter.optionId = optionId;
    } else {
      itemFilter.optionId = { $exists: false };
    }

    // Use atomic update to remove the item
    const cart = await Cart.findOneAndUpdate(
      { userId },
      {
        $pull: { items: itemFilter },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );

    if (!cart) {
      throw new AppError("Cart not found", ERROR_TYPES.NOT_FOUND_ERROR, HTTP_STATUS.NOT_FOUND);
    }

    // Update cache with retry
    await retryCacheOperation(() => cache.set(getCacheKey(userId), cart.toObject()));

    // Record performance metrics
    monitoring.recordResponseTime(Date.now() - startTime);
    monitoring.recordDatabaseQuery(Date.now() - startTime);

    logger.info("Item removed from cart", { userId, productId, optionId });

    return cart.toObject();
  } catch (error) {
    monitoring.recordDatabaseError();
    logger.error("Error removing cart item", {
      error: error.message,
      userId,
      productId,
      optionId
    });
    throw error;
  }
};

/**
 * Clear cart
 */
exports.clearCartService = async (userId) => {
  const startTime = Date.now();

  try {
    validateObjectId(userId, 'userId');

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { items: [], updatedAt: new Date() },
      { new: true }
    );

    // Update cache with retry
    await retryCacheOperation(() => cache.set(getCacheKey(userId), cart));

    // Record performance metrics
    monitoring.recordResponseTime(Date.now() - startTime);
    monitoring.recordDatabaseQuery(Date.now() - startTime);

    logger.info(`Cart cleared for user ${userId}`);

    return cart;
  } catch (error) {
    monitoring.recordDatabaseError();
    logger.error("Error clearing cart", {
      error: error.message,
      userId
    });
    throw error;
  }
};

/**
 * Invalidate all cart caches to force fresh data fetch
 * Should be called when promotions are changed/ended
 */
exports.invalidateAllCartCaches = async () => {
  const startTime = Date.now();

  try {
    logger.info("Starting cart cache invalidation...");

    await cache.deletePattern("cart:*");

    // Record performance metrics
    monitoring.recordResponseTime(Date.now() - startTime);

    logger.info("Cart cache invalidation completed");
  } catch (error) {
    monitoring.recordCacheError();
    logger.error("Error invalidating cart caches:", error);
    // Don't throw - cache invalidation failures shouldn't break business logic
  }
};
