const Product = require('../products.model.js');
const logger = require('../../../utils/logger');
const { withDatabaseRetry, executeBatchOperation } = require('../../../utils/reliability.js');
const { DatabaseError, NotFoundError } = require('../../../utils/errorHandler');

/**
 * Product Query Service - Handles all database read operations
 */
class ProductQueryService {
  /**
   * Get paginated approved products
   */
  async getApprovedProducts(skip = 0, limit = 20) {
    return withDatabaseRetry(async () => {
      const products = await Product.find({
        status: 'approved',
        isDisabled: { $ne: true }
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true });

      return products;
    });
  }

  /**
   * Get product by ID with validation
   */
  async getProductById(productId) {
    if (!productId) {
      throw new DatabaseError('Product ID is required');
    }

    return withDatabaseRetry(async () => {
      const product = await Product.findById(productId)
        .lean({ virtuals: true });

      if (!product) {
        throw new NotFoundError('Product');
      }

      return product;
    });
  }

  /**
   * Get products by vendor
   */
  async getProductsByVendor(vendorId, skip = 0, limit = 0, includeUnapproved = false) {
    const query = { vendorId };

    if (!includeUnapproved) {
      query.status = 'approved';
      query.isDisabled = { $ne: true };
    }

    return withDatabaseRetry(async () => {
      let queryBuilder = Product.find(query).sort({ createdAt: -1 });

      if (limit > 0) {
        queryBuilder = queryBuilder.skip(skip).limit(limit);
      }

      return await queryBuilder.lean({ virtuals: true });
    });
  }

  /**
   * Search products
   */
  async searchProducts(query, skip = 0, limit = 20) {
    return withDatabaseRetry(async () => {
      const searchQuery = {
        $text: { $search: query },
        status: 'approved',
        isDisabled: { $ne: true }
      };

      const products = await Product.find(searchQuery, {
        score: { $meta: 'textScore' }
      })
        .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true });

      return products;
    });
  }

  /**
   * Get products by category
   */
  async getProductsByCategory(category, skip = 0, limit = 0) {
    return withDatabaseRetry(async () => {
      const query = {
        categories: { $regex: new RegExp(category, 'i') },
        status: 'approved',
        isDisabled: { $ne: true }
      };

      let queryBuilder = Product.find(query).sort({ createdAt: -1 });

      if (limit > 0) {
        queryBuilder = queryBuilder.skip(skip).limit(limit);
      }

      return await queryBuilder.lean({ virtuals: true });
    });
  }

  /**
   * Get products by municipality
   */
  async getProductsByMunicipality(municipality, category = 'all', skip = 0, limit = 0) {
    return withDatabaseRetry(async () => {
      const query = {
        municipality: { $regex: new RegExp(municipality, 'i') },
        status: 'approved',
        isDisabled: { $ne: true }
      };

      if (category !== 'all') {
        query.categories = { $regex: new RegExp(category, 'i') };
      }

      let queryBuilder = Product.find(query).sort({ createdAt: -1 });

      if (limit > 0) {
        queryBuilder = queryBuilder.skip(skip).limit(limit);
      }

      return await queryBuilder.lean({ virtuals: true });
    });
  }

  /**
   * Get related products (simplified algorithm)
   */
  async getRelatedProducts(productId, limit = 10) {
    const product = await this.getProductById(productId);

    return withDatabaseRetry(async () => {
      // Simple category-based recommendation
      const related = await Product.find({
        _id: { $ne: productId },
        categories: { $in: product.categories },
        status: 'approved',
        isDisabled: { $ne: true }
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean({ virtuals: true });

      return related;
    });
  }

  /**
   * Get product statistics
   */
  async getProductStats(vendorId = null) {
    return withDatabaseRetry(async () => {
      const matchStage = {
        status: 'approved',
        isDisabled: { $ne: true }
      };

      if (vendorId) {
        matchStage.vendorId = vendorId;
      }

      const stats = await Product.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalStock: { $sum: '$stock' },
            averagePrice: { $avg: '$price' },
            totalSold: { $sum: '$sold' },
            hotProducts: {
              $sum: { $cond: [{ $eq: ['$isHot', true] }, 1, 0] }
            }
          }
        }
      ]);

      return stats[0] || {
        totalProducts: 0,
        totalStock: 0,
        averagePrice: 0,
        totalSold: 0,
        hotProducts: 0
      };
    });
  }

  /**
   * Batch get products by IDs
   */
  async getProductsByIds(productIds) {
    if (!productIds || productIds.length === 0) {
      return [];
    }

    return withDatabaseRetry(async () => {
      const products = await Product.find({
        _id: { $in: productIds },
        status: 'approved',
        isDisabled: { $ne: true }
      }).lean({ virtuals: true });

      return products;
    });
  }

  /**
   * Validate product ownership
   */
  async validateOwnership(productId, vendorId) {
    const product = await this.getProductById(productId);

    if (product.vendorId.toString() !== vendorId.toString()) {
      throw new DatabaseError('Access denied: Product ownership validation failed');
    }

    return product;
  }
}

module.exports = ProductQueryService;