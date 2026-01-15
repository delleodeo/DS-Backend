const Product = require('../products.model.js');
const { invalidateAllProductCaches } = require('../products.service.js');
const { invalidateAllCartCaches } = require('../../cart/cart.service.js');
const logger = require('../../../utils/logger.js');

/**
 * Calculate discounted price based on promotion
 * @param {Number} originalPrice - Original price
 * @param {Object} promotion - Promotion object
 * @returns {Number} - Discounted price
 */
function calculateDiscountedPrice(originalPrice, promotion) {
  if (!promotion || !promotion.isActive) return originalPrice;
  
  // Check if promotion is within valid date range
  if (!isPromotionValid(promotion)) return originalPrice;
  
  if (promotion.discountType === 'percentage') {
    const discount = (originalPrice * promotion.discountValue) / 100;
    return Math.max(0, originalPrice - discount);
  } else if (promotion.discountType === 'fixed') {
    return Math.max(0, originalPrice - promotion.discountValue);
  }
  
  return originalPrice;
}

/**
 * Check if promotion is currently valid
 * @param {Object} promotion - Promotion object
 * @returns {Boolean}
 */
function isPromotionValid(promotion) {
  if (!promotion || !promotion.isActive) return false;
  
  const now = new Date();
  
  // Check start date
  if (promotion.startDate && new Date(promotion.startDate) > now) {
    return false;
  }
  
  // Check end date
  if (promotion.endDate && new Date(promotion.endDate) < now) {
    return false;
  }
  
  return true;
}

/**
 * Calculate savings amount and percentage
 * @param {Number} originalPrice - Original price
 * @param {Number} discountedPrice - Discounted price
 * @returns {Object} - { amount, percentage }
 */
function calculateSavings(originalPrice, discountedPrice) {
  const amount = originalPrice - discountedPrice;
  const percentage = originalPrice > 0 ? ((amount / originalPrice) * 100).toFixed(0) : 0;
  
  return {
    amount: parseFloat(amount.toFixed(2)),
    percentage: parseInt(percentage)
  };
}

/**
 * Apply promotion to product
 * @param {String} productId - Product ID
 * @param {Object} promotionData - Promotion data
 * @returns {Promise<Object>} - Updated product
 */
async function applyPromotionToProduct(productId, promotionData) {
  const { discountType, discountValue, startDate, endDate, freeShipping } = promotionData;
  
  // Validate promotion data
  if (discountType === 'percentage' && (discountValue < 0 || discountValue > 100)) {
    throw new Error('Percentage discount must be between 0 and 100');
  }
  
  if (discountType === 'fixed' && discountValue < 0) {
    throw new Error('Fixed discount cannot be negative');
  }
  
  if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
    throw new Error('Start date must be before end date');
  }
  
  const product = await Product.findByIdAndUpdate(
    productId,
    {
      $set: {
        'promotion.isActive': true,
        'promotion.discountType': discountType || 'none',
        'promotion.discountValue': discountValue || 0,
        'promotion.startDate': startDate || null,
        'promotion.endDate': endDate || null,
        'promotion.freeShipping': freeShipping || false,
      }
    },
    { new: true, runValidators: true }
  );
  
  // Invalidate caches to ensure buyer-side sees updated promotion
  if (product) {
    await invalidateAllProductCaches(product._id, product.vendorId);
    await invalidateAllCartCaches();
    logger.info(`[Cache] Invalidated product and cart caches for product ${product._id} after applying product promotion`);
  }
  
  return product;
}

/**
 * Apply promotion to product option
 * @param {String} productId - Product ID
 * @param {String} optionId - Option ID
 * @param {Object} promotionData - Promotion data
 * @returns {Promise<Object>} - Updated product
 */
async function applyPromotionToOption(productId, optionId, promotionData) {
  const { discountType, discountValue, startDate, endDate, freeShipping } = promotionData;
  
  // Validate promotion data
  if (discountType === 'percentage' && (discountValue < 0 || discountValue > 100)) {
    throw new Error('Percentage discount must be between 0 and 100');
  }
  
  if (discountType === 'fixed' && discountValue < 0) {
    throw new Error('Fixed discount cannot be negative');
  }
  
  if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
    throw new Error('Start date must be before end date');
  }
  
  const product = await Product.findOneAndUpdate(
    { _id: productId, 'option._id': optionId },
    {
      $set: {
        'option.$.promotion.isActive': true,
        'option.$.promotion.discountType': discountType || 'none',
        'option.$.promotion.discountValue': discountValue || 0,
        'option.$.promotion.startDate': startDate || null,
        'option.$.promotion.endDate': endDate || null,
        'option.$.promotion.freeShipping': freeShipping || false,
      }
    },
    { new: true, runValidators: true }
  );
  
  // Invalidate caches to ensure buyer-side sees updated promotion
  if (product) {
    await invalidateAllProductCaches(product._id, product.vendorId);
    await invalidateAllCartCaches();
    logger.info(`[Cache] Invalidated product and cart caches for product ${product._id} after applying option promotion`);
  }
  
  return product;
}

/**
 * Remove promotion from product
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} - Updated product
 */
async function removePromotionFromProduct(productId) {
  const product = await Product.findByIdAndUpdate(
    productId,
    {
      $set: {
        'promotion.isActive': false,
        'promotion.discountType': 'none',
        'promotion.discountValue': 0,
        'promotion.freeShipping': false,
        'promotion.startDate': null,
        'promotion.endDate': null
      }
    },
    { new: true }
  );
  
  // Invalidate caches to ensure buyer-side sees removed promotion immediately
  if (product) {
    await invalidateAllProductCaches(product._id, product.vendorId);
    await invalidateAllCartCaches();
    logger.info(`[Cache] Invalidated product and cart caches for product ${product._id} after removing promotion`);
  }
  
  // Log promotion removal for tracking
  logger.info(`[Promotion] Removed promotion from product ${productId}`);
  
  return product;
}

/**
 * Remove promotion from product option
 * @param {String} productId - Product ID
 * @param {String} optionId - Option ID
 * @returns {Promise<Object>} - Updated product
 */
async function removePromotionFromOption(productId, optionId) {
  const product = await Product.findOneAndUpdate(
    { _id: productId, 'option._id': optionId },
    {
      $set: {
        'option.$.promotion.isActive': false,
        'option.$.promotion.discountType': 'none',
        'option.$.promotion.discountValue': 0,
        'option.$.promotion.freeShipping': false,
        'option.$.promotion.startDate': null,
        'option.$.promotion.endDate': null
      }
    },
    { new: true }
  );
  
  // Invalidate caches to ensure buyer-side sees removed promotion immediately
  if (product) {
    await invalidateAllProductCaches(product._id, product.vendorId);
    await invalidateAllCartCaches();
    logger.info(`[Cache] Invalidated product and cart caches for product ${product._id} after removing option promotion`);
  }
  
  // Log promotion removal for tracking
  logger.info(`[Promotion] Removed promotion from option ${optionId} of product ${productId}`);
  
  return product;
}

/**
 * Check and deactivate expired promotions
 * @returns {Promise<Object>} - Result with count of deactivated promotions
 */
async function deactivateExpiredPromotions() {
  const now = new Date();
  
  // Deactivate expired product-level promotions
  const productResult = await Product.updateMany(
    {
      'promotion.isActive': true,
      'promotion.endDate': { $lt: now }
    },
    {
      $set: {
        'promotion.isActive': false
      }
    }
  );
  
  // Deactivate expired option-level promotions
  const products = await Product.find({
    'option.promotion.isActive': true,
    'option.promotion.endDate': { $lt: now }
  });
  
  let optionCount = 0;
  for (const product of products) {
    let modified = false;
    
    for (const option of product.option) {
      if (option.promotion?.isActive && option.promotion.endDate && new Date(option.promotion.endDate) < now) {
        option.promotion.isActive = false;
        modified = true;
        optionCount++;
      }
    }
    
    if (modified) {
      await product.save();
      // Invalidate caches for this specific product
      try {
        await invalidateAllProductCaches(product._id, product.vendorId);
        await invalidateAllCartCaches();
        logger.info(`[Cache] Invalidated caches for product ${product._id} after expired option promotion cleanup`);
      } catch (err) {
        logger.warn('[deactivateExpiredPromotions] Cache invalidation error for product:', product._id, err);
      }
    }
  }
  
  // Invalidate cache if any promotions were deactivated
  const totalDeactivated = productResult.modifiedCount + optionCount;
  if (totalDeactivated > 0) {
    // Invalidate all product caches including individual product caches
    await invalidateAllProductCaches();
    await invalidateAllCartCaches();
    logger.info(`[Cache] Invalidated product and cart caches after expired promotion cleanup`);
    logger.info(`[Cache] This includes individual product caches to ensure cart items show correct prices`);
  }
  
  logger.info(`[Promotion Expiration] Deactivated ${productResult.modifiedCount} product promotions and ${optionCount} option promotions`);
  
  return {
    productPromotions: productResult.modifiedCount,
    optionPromotions: optionCount,
    total: totalDeactivated
  };
}

/**
 * Get active promotions for vendor
 * @param {String} vendorId - Vendor ID
 * @returns {Promise<Array>} - Active promotions
 */
async function getActivePromotionsByVendor(vendorId) {
  logger.info(`[Promotion Service] Fetching promotions for vendor: ${vendorId}`);
  
  // Convert to ObjectId if it's a string
  const mongoose = require('mongoose');
  const vendorObjectId = mongoose.isValidObjectId(vendorId) 
    ? new mongoose.Types.ObjectId(vendorId) 
    : vendorId;
  
  logger.debug(`[Promotion Service] Converted vendorId to ObjectId: ${vendorObjectId}`);
  
  const products = await Product.find({
    vendorId: vendorObjectId,
    $or: [
      { 'promotion.isActive': true },
      { 'option.promotion.isActive': true }
    ]
  }).select('name price promotion option');
  
  logger.info(`[Promotion Service] Found ${products.length} products with active promotions`);
  
  const activePromotions = [];
  
  products.forEach(product => {
    logger.debug(`[Promotion Service] Checking product: ${product.name} (${product._id})`);
    
    // Check product-level promotion
    if (product.promotion?.isActive && isPromotionValid(product.promotion)) {
      logger.debug(`[Promotion Service] Adding product-level promotion for: ${product.name}`);
      activePromotions.push({
        productId: product._id,
        productName: product.name,
        type: 'product',
        status: getPromotionStatusString(product.promotion),
        originalPrice: product.price,
        discountedPrice: calculateDiscountedPrice(product.price, product.promotion),
        promotion: product.promotion
      });
    }
    
    // Check option-level promotions
    if (product.option) {
      product.option.forEach(option => {
        if (option.promotion?.isActive && isPromotionValid(option.promotion)) {
          logger.debug(`[Promotion Service] Adding option-level promotion for: ${product.name} - ${option.label}`);
          activePromotions.push({
            productId: product._id,
            productName: product.name,
            optionId: option._id,
            optionLabel: option.label,
            type: 'option',
            status: getPromotionStatusString(option.promotion),
            originalPrice: option.price,
            discountedPrice: calculateDiscountedPrice(option.price, option.promotion),
            promotion: option.promotion
          });
        }
      });
    }
  });
  
  logger.info(`[Promotion Service] Returning ${activePromotions.length} active promotions`);
  return activePromotions;
}

/**
 * Get promotion status for a product or specific option
 * @param {String} productId - Product ID
 * @param {String} optionId - Optional option ID
 * @returns {Promise<Object>} - Promotion status information
 */
async function getPromotionStatus(productId, optionId = null) {
  const product = await Product.findById(productId).select('promotion option');
  
  if (!product) {
    throw new Error('Product not found');
  }
  
  const result = {
    productId,
    hasProductPromotion: false,
    hasOptionPromotion: false,
    promotions: []
  };
  
  // Check product-level promotion
  if (product.promotion?.isActive && isPromotionValid(product.promotion)) {
    result.hasProductPromotion = true;
    result.promotions.push({
      type: 'product',
      status: getPromotionStatusString(product.promotion),
      promotion: product.promotion,
      discountedPrice: calculateDiscountedPrice(product.price, product.promotion)
    });
  }
  
  // Check option-level promotions
  if (optionId) {
    // Specific option
    const option = product.option?.find(opt => opt._id.toString() === optionId);
    if (option && option.promotion?.isActive && isPromotionValid(option.promotion)) {
      result.hasOptionPromotion = true;
      result.optionId = optionId;
      result.promotions.push({
        type: 'option',
        optionId: option._id,
        optionLabel: option.label,
        status: getPromotionStatusString(option.promotion),
        promotion: option.promotion,
        discountedPrice: calculateDiscountedPrice(option.price, option.promotion)
      });
    }
  } else if (product.option) {
    // All options
    product.option.forEach(option => {
      if (option.promotion?.isActive && isPromotionValid(option.promotion)) {
        result.hasOptionPromotion = true;
        result.promotions.push({
          type: 'option',
          optionId: option._id,
          optionLabel: option.label,
          status: getPromotionStatusString(option.promotion),
          promotion: option.promotion,
          discountedPrice: calculateDiscountedPrice(option.price, option.promotion)
        });
      }
    });
  }
  
  return result;
}

/**
 * Get promotion status string
 * @param {Object} promotion - Promotion object
 * @returns {String} - Status string
 */
function getPromotionStatusString(promotion) {
  if (!promotion || !promotion.isActive) return 'inactive';
  
  const now = new Date();
  
  if (promotion.startDate && new Date(promotion.startDate) > now) {
    return 'scheduled';
  }
  
  if (promotion.endDate && new Date(promotion.endDate) < now) {
    return 'expired';
  }
  
  return 'active';
}

module.exports = {
  calculateDiscountedPrice,
  isPromotionValid,
  calculateSavings,
  applyPromotionToProduct,
  applyPromotionToOption,
  removePromotionFromProduct,
  removePromotionFromOption,
  deactivateExpiredPromotions,
  getActivePromotionsByVendor,
  getPromotionStatus,
};
