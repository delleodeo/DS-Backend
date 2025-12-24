const Product = require("../products.model.js");
const { createError, isValidObjectId } = require("./productUtils.js");
const TagBasedCacheService = require("./tagBasedCache.js");
const logger = require("../../../utils/logger");
const mongoose = require("mongoose");

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
 * Add stock to a specific product option
 */
async function addProductStock(productId, optionId, addition) {
  if (!isValidObjectId(productId) || !isValidObjectId(optionId)) {
    throw createError('Invalid product or option ID', 400);
  }

  if (!Number.isInteger(addition) || addition <= 0) {
    throw createError('Addition must be a positive integer', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw createError('Product not found', 404);
    }

    // Verify ownership or admin access
    if (product.vendorId.toString() !== req.user.id && req.user.role !== 'admin') {
      throw createError('Unauthorized to modify this product', 403);
    }

    const option = product.option.id(optionId);
    if (!option) {
      throw createError('Product option not found', 404);
    }

    // Update stock
    option.stock += addition;
    option.sold = Math.max(0, option.sold); // Ensure sold is not negative

    await product.save({ session });
    await session.commitTransaction();

    // Invalidate related caches
    await cache.invalidateByTags([`product:${productId}`]);

    logger.info(`Added ${addition} stock to product ${productId}, option ${optionId}`);

    return {
      productId,
      optionId,
      newStock: option.stock,
      addition
    };

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Add stock to main product (non-option products)
 */
async function addProductStockMain(productId, addition) {
  if (!isValidObjectId(productId)) {
    throw createError('Invalid product ID', 400);
  }

  if (!Number.isInteger(addition) || addition <= 0) {
    throw createError('Addition must be a positive integer', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw createError('Product not found', 404);
    }

    // Verify ownership or admin access
    if (product.vendorId.toString() !== req.user.id && req.user.role !== 'admin') {
      throw createError('Unauthorized to modify this product', 403);
    }

    // Update main product stock
    product.stock += addition;

    await product.save({ session });
    await session.commitTransaction();

    // Invalidate related caches
    await cache.invalidateByTags([`product:${productId}`]);

    logger.info(`Added ${addition} stock to main product ${productId}`);

    return {
      productId,
      newStock: product.stock,
      addition
    };

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Update product stock (for stock adjustments)
 */
async function updateProductStock(productId, newStock, optionId = null) {
  if (!isValidObjectId(productId)) {
    throw createError('Invalid product ID', 400);
  }

  if (optionId && !isValidObjectId(optionId)) {
    throw createError('Invalid option ID', 400);
  }

  if (!Number.isInteger(newStock) || newStock < 0) {
    throw createError('Stock must be a non-negative integer', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw createError('Product not found', 404);
    }

    // Verify ownership or admin access
    if (product.vendorId.toString() !== req.user.id && req.user.role !== 'admin') {
      throw createError('Unauthorized to modify this product', 403);
    }

    if (optionId) {
      // Update option stock
      const option = product.option.id(optionId);
      if (!option) {
        throw createError('Product option not found', 404);
      }
      option.stock = newStock;
    } else {
      // Update main product stock
      product.stock = newStock;
    }

    await product.save({ session });
    await session.commitTransaction();

    // Invalidate related caches
    await cache.invalidateByTags([`product:${productId}`]);

    logger.info(`Updated stock for product ${productId}${optionId ? `, option ${optionId}` : ''} to ${newStock}`);

    return {
      productId,
      optionId,
      newStock
    };

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Get stock levels for a product
 */
async function getProductStock(productId) {
  if (!isValidObjectId(productId)) {
    throw createError('Invalid product ID', 400);
  }

  const product = await Product.findById(productId)
    .select('stock option.stock option._id')
    .lean();

  if (!product) {
    throw createError('Product not found', 404);
  }

  return {
    productId,
    mainStock: product.stock,
    options: product.option.map(opt => ({
      optionId: opt._id,
      stock: opt.stock
    }))
  };
}

module.exports = {
  addProductStock,
  addProductStockMain,
  updateProductStock,
  getProductStock
};