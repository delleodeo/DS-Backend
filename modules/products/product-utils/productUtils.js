const mongoose = require("mongoose");
const logger = require("../../../utils/logger");
const { validateOptionPayload } = require('../../../utils/validateOption');

/**
 * Validate and clean expired promotions from product data
 * This ensures that even cached products return accurate promotion status
 * Also manually attaches virtual fields (hasPromotion, promotionStatus) for lean queries
 * @param {Object} product - Product object (will be modified in place)
 */
function validateAndCleanPromotions(product) {
  if (!product) return;

  const now = new Date();

  const getStatus = (promo) => {
    if (!promo || !promo.isActive) return 'inactive';
    if (promo.startDate && new Date(promo.startDate) > now) return 'scheduled';
    if (promo.endDate && new Date(promo.endDate) < now) return 'expired';
    return 'active';
  };

  // Check and clean product-level promotion
  if (product.promotion) {
    if (product.promotion.isActive) {
      const isExpired = product.promotion.endDate && new Date(product.promotion.endDate) < now;
      const hasNotStarted = product.promotion.startDate && new Date(product.promotion.startDate) > now;

      if (isExpired || hasNotStarted) {
        product.promotion.isActive = false;
        logger.debug(`[Real-time Validation] Deactivated ${isExpired ? 'expired' : 'not-started'} product-level promotion for product ${product._id}`);
      }
    }
    // Attach virtuals
    product.promotionStatus = getStatus(product.promotion);
    product.hasPromotion = product.promotionStatus === 'active';
  } else {
    product.promotionStatus = 'inactive';
    product.hasPromotion = false;
  }

  // Check and clean option-level promotions
  if (product.option && Array.isArray(product.option)) {
    product.option.forEach(option => {
      if (option.promotion) {
        if (option.promotion.isActive) {
          const isExpired = option.promotion.endDate && new Date(option.promotion.endDate) < now;
          const hasNotStarted = option.promotion.startDate && new Date(option.promotion.startDate) > now;

          if (isExpired || hasNotStarted) {
            option.promotion.isActive = false;
            logger.debug(`[Real-time Validation] Deactivated ${isExpired ? 'expired' : 'not-started'} option-level promotion for option ${option._id}`);
          }
        }
        // Attach virtuals
        option.promotionStatus = getStatus(option.promotion);
        option.hasPromotion = option.promotionStatus === 'active';
      } else {
        option.promotionStatus = 'inactive';
        option.hasPromotion = false;
      }
    });
  }
}

/**
 * Ensure product has at least one main image.
 * If imageUrls is empty but product has options with images,
 * use the first option's image as the main image.
 * @param {Object} product - Product document
 * @returns {boolean} - Whether the product was modified
 */
function ensureMainImage(product) {
  // Check if product has no main images
  if (!product.imageUrls || product.imageUrls.length === 0) {
    // Check if product has options with images
    if (product.option && product.option.length > 0) {
      // Find first option with an image
      const optionWithImage = product.option.find(opt => opt.imageUrl);

      if (optionWithImage) {
        logger.info(`[Product Image Auto-Replace] No main images found for product ${product._id}, using option image: ${optionWithImage.imageUrl}`);
        product.imageUrls = [optionWithImage.imageUrl];
        return true;
      }
    }
  }
  return false;
}

/**
 * Validate ObjectId
 * @param {string} id - ID to validate
 * @returns {boolean}
 */
function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}

/**
 * Create standardized error
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Error}
 */
function createError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Sanitize pagination parameters
 * @param {number} limit - Limit value
 * @param {number} skip - Skip value
 * @returns {Object} - Sanitized {limit, skip}
 */
function sanitizePagination(limit, skip) {
  const limitNum = Math.min(parseInt(limit) || 20, 100); // Max 100
  const skipNum = Math.max(parseInt(skip) || 0, 0);
  return { limit: limitNum, skip: skipNum };
}

/**
 * Build search query for products
 * @param {string[]} terms - Search terms
 * @returns {Object} - MongoDB query object
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchQuery(terms) {
  if (!terms || terms.length === 0) return {};

  // Limit number of terms and length to prevent DoS and injection attacks
  const maxTerms = 6;
  const maxTermLength = 64;
  const safeTerms = terms
    .slice(0, maxTerms)
    .map(t => (typeof t === 'string' ? t.trim().slice(0, maxTermLength) : ''))
    .filter(t => t.length > 0);

  if (safeTerms.length === 0) return {};

  // Escape user input before building regexes (prevents ReDoS and injection)
  const escapedTerms = safeTerms.map(term => escapeRegex(term));

  // Use text search for better performance and security
  return {
    $text: {
      $search: escapedTerms.join(' '),
      $caseSensitive: false,
      $diacriticSensitive: false
    }
  };
}

/**
 * Build category filter query
 * @param {string} category - Category to filter
 * @returns {Object} - MongoDB query object
 */
function buildCategoryQuery(category) {
  if (!category || category === 'all') return {};
  const normalized = category.toLowerCase().trim();
  const escaped = escapeRegex(normalized);
  return {
    $or: [
      { categories: new RegExp(`^${escaped}$`, 'i') },
      { name: new RegExp(escaped, 'i') },
      { description: new RegExp(escaped, 'i') }
    ]
  };
}

/**
 * Build municipality filter query
 * @param {string} municipality - Municipality to filter
 * @returns {Object} - MongoDB query object
 */
function buildMunicipalityQuery(municipality) {
  if (!municipality || municipality === 'all') return {};
  const escaped = escapeRegex(municipality.toLowerCase().trim());
  return { municipality: new RegExp(`^${escaped}$`, 'i') };
}

module.exports = {
  validateAndCleanPromotions,
  ensureMainImage,
  isValidObjectId,
  createError,
  sanitizePagination,
  buildSearchQuery,
  buildCategoryQuery,
  buildMunicipalityQuery,
  // Re-export for easier mocking in unit tests
  validateOptionPayload
};